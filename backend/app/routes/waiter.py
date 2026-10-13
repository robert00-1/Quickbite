from flask import Blueprint, jsonify, request
from ..extensions import db

waiter_bp = Blueprint("waiter", __name__, url_prefix="/api/waiter")

# The four stages an order moves through, in order
ORDER_STATUSES = ["PENDING", "PREPARING", "READY", "SERVED"]


def get_order_model():
    # Imported here so this file still loads while order.py is empty
    from ..models.order import Order
    return Order


def serialize_order(order):
    items = []
    for line in getattr(order, "items", None) or []:
        menu_item = getattr(line, "menu_item", None)
        price = getattr(line, "price", None)
        if price is None and menu_item:
            price = menu_item.price
        items.append({
            "id": getattr(line, "id", None),
            "name": menu_item.name if menu_item else getattr(line, "name", None),
            "quantity": getattr(line, "quantity", 1),
            "price": price,
        })

    created_at = getattr(order, "created_at", None)

    return {
        "id": order.id,
        "customer": getattr(order, "customer_name", None),
        "table_number": getattr(order, "table_number", None),
        "total_amount": getattr(order, "total_amount", None),
        "payment_method": getattr(order, "payment_method", None),
        "payment_status": getattr(order, "payment_status", None),
        "created_at": created_at.isoformat() if created_at else None,
        "status": order.status,
        "items": items,
    }


@waiter_bp.route("/orders", methods=["GET"])
def get_orders():
    Order = get_order_model()
    query = Order.query

    status = request.args.get("status")
    if status:
        status = status.upper()
        if status not in ORDER_STATUSES:
            return jsonify({"error": "Invalid status"}), 400
        query = query.filter_by(status=status)

    orders = query.order_by(Order.id).all()
    return jsonify([serialize_order(order) for order in orders]), 200


@waiter_bp.route("/orders/<int:order_id>/status", methods=["PATCH"])
def update_order_status(order_id):
    Order = get_order_model()
    order = db.get_or_404(Order, order_id)
    data = request.get_json(silent=True) or {}

    new_status = str(data.get("status", "")).upper()
    if new_status not in ORDER_STATUSES:
        return jsonify({"error": "Invalid status"}), 400

    if order.status not in ORDER_STATUSES:
        return jsonify({"error": "Order has an unknown status"}), 400

    # An order can only move one stage forward at a time
    current = ORDER_STATUSES.index(order.status)
    if ORDER_STATUSES.index(new_status) != current + 1:
        return jsonify({"error": "Status must move to the next stage"}), 400

    order.status = new_status
    db.session.commit()
    return jsonify(serialize_order(order)), 200