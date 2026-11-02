
from decimal import Decimal, InvalidOperation
import hashlib
import json
from sqlalchemy.exc import IntegrityError

from flask import Blueprint, current_app, jsonify, request

from ..extensions import db
from ..models.menu_item import MenuItem
from ..models.order import Order
from ..models.order_item import OrderItem
import re
from ..utils.auth import staff_required
from ..utils.customer import ensure_customer, owns_order
from ..utils.timing import estimates, utc
from ..services.notifications import confirm_receipt
from .payments import normalize_phone


orders_bp = Blueprint("orders", __name__, url_prefix="/api/orders")

ALLOWED_PAYMENT_METHODS = {"M-Pesa", "Cash", "Card"}


def serialize_order(order):
    return {
        **estimates(order),
        "id": order.id,
        "customerName": order.customer_name,
        "phone": order.phone,
        "tableNumber": order.table_number,
        "items": [
            {
                "id": item.menu_item_id,
                "name": item.item_name,
                "quantity": item.quantity,
                "price": float(item.unit_price),
                "preparationTime": item.preparation_time,
                "servingTime": item.serving_time,
            }
            for item in order.items
        ],
        "total": float(order.total),
        "paymentMethod": order.payment_method,
        "paymentStatus": order.payment_status,
        "paymentRequestPending": bool(order.checkout_request_id and order.payment_status == "Pending"),
        "orderStatus": order.order_status,
        "createdAt": utc(order.created_at).isoformat(),
        "mpesaReceiptNumber": order.mpesa_receipt_number,
        "receiptUrl": (
            f"/api/receipts/{order.receipt.receipt_token}"
            if order.receipt else None
        ),
    }


@orders_bp.post("/session")
def guest_session():
    response = jsonify({"message": "Guest checkout ready"})
    ensure_customer(response)
    return response


@orders_bp.route("", methods=["POST"])
def create_order():
    data = request.get_json(silent=True) or {}

    if not isinstance(data, dict):
        return jsonify({"error": "A JSON object is required"}), 400
    customer_name = data.get("customerName")
    phone = data.get("phone")
    table_number = data.get("tableNumber")
    payment_method = data.get("paymentMethod")
    items = data.get("items")

    if not isinstance(customer_name, str) or not customer_name.strip() or len(customer_name.strip()) > 120:
        return jsonify({"error": "Customer name must contain 1 to 120 characters"}), 400

    if not isinstance(phone, str) or not phone.strip():
        return jsonify({"error": "Customer phone number is required"}), 400

    try:
        phone = normalize_phone(phone)
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400

    if not isinstance(table_number, str):
        return jsonify({
            "error": "Table number must be a value such as A1 or B2"
        }), 400

    table_number = table_number.strip().upper()

    if not re.fullmatch(r"[A-Z][1-9][0-9]?", table_number):
        return jsonify({
            "error": "Invalid table number. Use formats such as A1 or B2"
        }), 400

    if not isinstance(payment_method, str) or payment_method not in ALLOWED_PAYMENT_METHODS:
        return jsonify({"error": "Choose a valid payment method"}), 400

    if not isinstance(items, list) or not items:
        return jsonify({"error": "Your order must contain at least one item"}), 400

    combined = {}
    for line in items:
        if not isinstance(line, dict) or not (type(line.get("id")) is int or (isinstance(line.get("id"), str) and re.fullmatch(r"mealdb_[0-9]+", line["id"]))) or type(line.get("quantity")) is not int or line["quantity"] < 1:
            return jsonify({"error": "Each item needs a valid menu ID and positive integer quantity"}), 400
        combined[line["id"]] = combined.get(line["id"], 0) + line["quantity"]
    items = [{"id": key, "quantity": value} for key, value in sorted(combined.items(), key=lambda pair: str(pair[0]))]
    key = request.headers.get("Idempotency-Key")
    if key and not re.fullmatch(r"[A-Za-z0-9_-]{16,64}", key):
        return jsonify({"error": "Invalid checkout request key", "code": "invalid_idempotency_key"}), 400
    fingerprint = hashlib.sha256(json.dumps({"customer": customer_name.strip(), "phone": phone, "table": table_number, "method": payment_method, "items": items}, sort_keys=True).encode()).hexdigest()
    if key:
        existing = Order.query.filter_by(idempotency_key=key).first()
        if existing:
            if not owns_order(existing):
                return jsonify({"error": "Checkout request belongs to another session", "code": "checkout_session_mismatch"}), 409
            if existing.request_fingerprint != fingerprint:
                return jsonify({"error": "Checkout details changed. Please review your cart.", "code": "checkout_conflict"}), 409
            return jsonify({"message": "Order already received", "order": serialize_order(existing)}), 200
    # Validate all items and calculate the total using database prices.
    order_lines = []
    total = Decimal("0.00")
    requested_quantities = {}

    for requested_item in items:
        if not isinstance(requested_item, dict):
            return jsonify({"error": "Invalid order item"}), 400

        item_id = requested_item.get("id")
        quantity = requested_item.get("quantity")

        if not (type(item_id) is int or (isinstance(item_id, str) and re.fullmatch(r"mealdb_[0-9]+", item_id))):
            return jsonify({"error": "Invalid menu item ID"}), 400

        if (
            isinstance(quantity, bool)
            or not isinstance(quantity, int)
            or quantity < 1
        ):
            return jsonify({
                "error": "Each quantity must be a positive integer"
            }), 400

        if isinstance(item_id, str):
            from ..services.mealdb import resolve_order_item, MealDBUnavailable
            try:
                menu_item = resolve_order_item(item_id[7:])
            except IntegrityError:
                db.session.rollback()
                return jsonify({"error": "This meal is being updated by another order. Please retry.", "code": "menu_conflict"}), 409
            except MealDBUnavailable as exc:
                db.session.rollback()
                return jsonify({"error": str(exc), "code": "mealdb_unavailable"}), 502
        else:
            menu_item = MenuItem.query.filter_by(id=item_id).with_for_update().first()

        if menu_item is None:
            return jsonify({
                "error": f"Menu item {item_id} was not found"
            }), 404

        # Prevent ordering meals that the manager marked unavailable.
        if menu_item.availability is not True:
            return jsonify({
                "error": (
                    f"{menu_item.name} is currently unavailable. "
                    "Please remove it from your order."
                )
            }), 400

        requested_quantities[menu_item.id] = requested_quantities.get(menu_item.id, 0) + quantity
        if menu_item.stock_quantity is not None and menu_item.stock_quantity < requested_quantities[menu_item.id]:
            return jsonify({
                "error": f"Not enough stock for {menu_item.name}. Only {menu_item.stock_quantity} available."
            }), 400

        try:
            unit_price = Decimal(
                str(menu_item.price)
            ).quantize(Decimal("0.01"))
        except (InvalidOperation, ValueError, TypeError):
            return jsonify({"error": "Invalid menu item price"}), 400

        if not unit_price.is_finite() or unit_price < 0:
            return jsonify({"error": "Menu item has an invalid price", "code": "invalid_menu_price"}), 400
        total += unit_price * quantity

        order_lines.append({
            "menu_item_id": menu_item.id,
            "item_name": menu_item.name,
            "quantity": quantity,
            "unit_price": unit_price,
            "preparation_time": menu_item.preparation_time,
            "serving_time": menu_item.serving_time,
        })

    # Virtual and stored IDs may refer to the same managed recipe.
    merged_lines = {}
    for line in order_lines:
        if line["menu_item_id"] in merged_lines:
            merged_lines[line["menu_item_id"]]["quantity"] += line["quantity"]
        else:
            merged_lines[line["menu_item_id"]] = line
    order_lines = list(merged_lines.values())

    payment_status = "Pending"

    order = Order(
        idempotency_key=key,
        request_fingerprint=fingerprint if key else None,
        customer_name=customer_name.strip(),
        phone=phone.strip(),
        table_number=table_number,
        total=total,
        payment_method=payment_method,
        payment_status=payment_status,
        order_status="Pending",
    )

    try:
        db.session.add(order)
        db.session.flush()

        for line in order_lines:
            db.session.add(
                OrderItem(
                    order_id=order.id,
                    menu_item_id=line["menu_item_id"],
                    item_name=line["item_name"],
                    quantity=line["quantity"],
                    unit_price=line["unit_price"],
                    preparation_time=line["preparation_time"],
                    serving_time=line["serving_time"],
                )
            )
            # Decrement inventory stock
            menu_rec = db.session.get(MenuItem, line["menu_item_id"])
            if menu_rec and menu_rec.stock_quantity is not None:
                menu_rec.stock_quantity = max(0, menu_rec.stock_quantity - line["quantity"])
                if menu_rec.stock_quantity == 0:
                    menu_rec.availability = False

        response = jsonify({})
        order.customer_id = ensure_customer(response)
        if payment_method in {"Cash", "Card"}:
            confirm_receipt(order)
        db.session.commit()

    except IntegrityError:
        db.session.rollback()
        existing = Order.query.filter_by(idempotency_key=key).first() if key else None
        if existing and owns_order(existing) and existing.request_fingerprint == fingerprint:
            return jsonify({"message": "Order already received", "order": serialize_order(existing)}), 200
        return jsonify({"error": "Checkout conflicted with another request. Please review your order.", "code": "order_conflict"}), 409
    except Exception as exc:
        db.session.rollback()
        current_app.logger.error("Order transaction failed (%s)", type(exc).__name__)
        return jsonify({"error": "The restaurant could not save your order. Your cart has been kept; please try again.", "code": "order_save_failed"}), 500

    # Freeze the response before optional delivery; a committed order must stay successful.
    result = {"message": "Order created successfully", "order": serialize_order(order)}
    from ..services.notifications import safely_notify
    safely_notify(order, "order_received", include_receipt=True)

    response.set_data(current_app.json.dumps(result))
    return response, 201


@orders_bp.route("", methods=["GET"])
@staff_required("manager", "waiter")
def get_orders():
    orders = Order.query.order_by(
        Order.created_at.desc(),
        Order.id.desc()
    ).all()

    return jsonify([serialize_order(order) for order in orders]), 200


@orders_bp.route("/<int:order_id>", methods=["GET"])
def get_order(order_id):
    order = db.session.get(Order, order_id)

    if order is None:
        return jsonify({"error": "Order not found"}), 404

    if not owns_order(order):
        return jsonify({"error": "Order not found"}), 404
    return jsonify({"order": serialize_order(order)}), 200
