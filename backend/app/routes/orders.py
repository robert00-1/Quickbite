
from decimal import Decimal, InvalidOperation

from flask import Blueprint, jsonify, request

from ..extensions import db
from ..models.menu_item import MenuItem
from ..models.order import Order
from ..models.order_item import OrderItem


orders_bp = Blueprint("orders", __name__, url_prefix="/api/orders")

ALLOWED_PAYMENT_METHODS = {"M-Pesa", "Cash", "Card"}


def serialize_order(order):
    return {
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
            }
            for item in order.items
        ],
        "total": float(order.total),
        "paymentMethod": order.payment_method,
        "paymentStatus": order.payment_status,
        "orderStatus": order.order_status,
        "createdAt": order.created_at.isoformat(),
        "mpesaReceiptNumber": order.mpesa_receipt_number,
    }


@orders_bp.route("", methods=["POST"])
def create_order():
    data = request.get_json(silent=True) or {}

    customer_name = data.get("customerName")
    phone = data.get("phone")
    table_number = data.get("tableNumber")
    payment_method = data.get("paymentMethod")
    items = data.get("items")

    if not isinstance(customer_name, str) or not customer_name.strip():
        return jsonify({"error": "Customer name is required"}), 400

    if not isinstance(phone, str) or not phone.strip():
        return jsonify({"error": "Customer phone number is required"}), 400

    if isinstance(table_number, bool) or not isinstance(table_number, int) or table_number < 1:
        return jsonify({"error": "A valid table number is required"}), 400

    if payment_method not in ALLOWED_PAYMENT_METHODS:
        return jsonify({"error": "Choose a valid payment method"}), 400

    if not isinstance(items, list) or not items:
        return jsonify({"error": "Your order must contain at least one item"}), 400

    # Validate all items and calculate the total using database prices.
    order_lines = []
    total = Decimal("0.00")

    for requested_item in items:
        if not isinstance(requested_item, dict):
            return jsonify({"error": "Invalid order item"}), 400

        item_id = requested_item.get("id")
        quantity = requested_item.get("quantity")

        if isinstance(item_id, bool) or not isinstance(item_id, int):
            return jsonify({"error": "Invalid menu item ID"}), 400

        if isinstance(quantity, bool) or not isinstance(quantity, int) or quantity < 1:
            return jsonify({"error": "Each quantity must be a positive integer"}), 400

        menu_item = db.session.get(MenuItem, item_id)

        if menu_item is None or not menu_item.availability:
            return jsonify({
                "error": f"Menu item {item_id} is unavailable"
            }), 400

        try:
            unit_price = Decimal(str(menu_item.price)).quantize(Decimal("0.01"))
        except InvalidOperation:
            return jsonify({"error": "Invalid menu item price"}), 400

        total += unit_price * quantity

        order_lines.append({
            "menu_item_id": menu_item.id,
            "item_name": menu_item.name,
            "quantity": quantity,
            "unit_price": unit_price,
        })

    order = Order(
        customer_name=customer_name.strip(),
        phone=phone.strip(),
        table_number=table_number,
        total=total,
        payment_method=payment_method,
        payment_status="Pending",
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
                )
            )

        db.session.commit()

    except Exception:
        db.session.rollback()
        return jsonify({"error": "Could not create the order"}), 500

    return jsonify({
        "message": "Order created successfully",
        "order": serialize_order(order),
    }), 201

@orders_bp.route("", methods=["GET"])
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

    return jsonify({"order": serialize_order(order)}), 200
