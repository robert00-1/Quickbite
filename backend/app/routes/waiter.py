from flask import Blueprint, jsonify, request

from ..extensions import db
from ..models.order import Order
from ..models.waiter_profile import WaiterProfile
from ..utils.auth import staff_required


waiter_bp = Blueprint(
    "waiter",
    __name__,
    url_prefix="/api/waiter",
)

ORDER_STATUSES = ["Pending", "Preparing", "Ready", "Served"]


def serialize_order(order):
    assigned_waiter = order.assigned_waiter

    return {
        "id": order.id,
        "customer": order.customer_name,
        "phone": order.phone,
        "table_number": order.table_number,
        "total_amount": float(order.total),
        "payment_method": order.payment_method,
        "payment_status": order.payment_status,
        "status": order.order_status,
        "created_at": (
            order.created_at.isoformat()
            if order.created_at
            else None
        ),
        "items": [
            {
                "id": item.menu_item_id,
                "name": item.item_name,
                "quantity": item.quantity,
                "price": float(item.unit_price),
            }
            for item in order.items
        ],
        "assigned_waiter_id": order.assigned_waiter_id,
        "assigned_waiter_name": (
            assigned_waiter.full_name
            if assigned_waiter
            else None
        ),
        "served_by_name": order.served_by_name,
        "mpesa_receipt_number": order.mpesa_receipt_number,
    }


@waiter_bp.route("/orders", methods=["GET"])
@staff_required("waiter")
def get_orders():
    query = Order.query

    status = request.args.get("status")

    if status:
        normalized_status = next(
            (
                allowed
                for allowed in ORDER_STATUSES
                if allowed.lower() == status.strip().lower()
            ),
            None,
        )

        if normalized_status is None:
            return jsonify({"error": "Invalid status"}), 400

        query = query.filter_by(order_status=normalized_status)

    orders = query.order_by(Order.id.desc()).all()

    return jsonify([
        serialize_order(order) for order in orders
    ]), 200


@waiter_bp.route(
    "/orders/<int:order_id>/assignment",
    methods=["PATCH"],
)
@staff_required("waiter")
def assign_order_waiter(order_id):
    """Assign or unassign an active waiter before service is completed."""
    order = db.session.get(Order, order_id)

    if order is None:
        return jsonify({"error": "Order not found"}), 404

    if order.order_status == "Served":
        return jsonify({
            "error": "A served order cannot be reassigned."
        }), 400

    data = request.get_json(silent=True)

    if not isinstance(data, dict) or "waiter_id" not in data:
        return jsonify({"error": "A waiter ID is required"}), 400

    waiter_id = data["waiter_id"]

    if waiter_id is None:
        order.assigned_waiter = None
        order.served_by_name = None
    else:
        if (
            isinstance(waiter_id, bool)
            or not isinstance(waiter_id, int)
            or waiter_id < 1
        ):
            return jsonify({"error": "Invalid waiter ID"}), 400

        waiter = db.session.get(WaiterProfile, waiter_id)

        if waiter is None or not waiter.is_active:
            return jsonify({
                "error": "The selected waiter is not active."
            }), 400

        order.assigned_waiter = waiter
        order.served_by_name = None

    try:
        db.session.commit()
    except Exception:
        db.session.rollback()
        return jsonify({
            "error": "Could not assign waiter to order"
        }), 500

    return jsonify(serialize_order(order)), 200


@waiter_bp.route(
    "/orders/<int:order_id>/status",
    methods=["PATCH"],
)
@staff_required("waiter")
def update_order_status(order_id):
    order = db.session.get(Order, order_id)

    if order is None:
        return jsonify({"error": "Order not found"}), 404

    data = request.get_json(silent=True) or {}
    requested_status = data.get("status")

    if not isinstance(requested_status, str):
        return jsonify({"error": "A valid status is required"}), 400

    new_status = next(
        (
            allowed
            for allowed in ORDER_STATUSES
            if allowed.lower() == requested_status.strip().lower()
        ),
        None,
    )

    if new_status is None:
        return jsonify({"error": "Invalid status"}), 400

    if order.order_status not in ORDER_STATUSES:
        return jsonify({"error": "Order has an unknown status"}), 400

    current_index = ORDER_STATUSES.index(order.order_status)
    new_index = ORDER_STATUSES.index(new_status)

    if new_index != current_index + 1:
        return jsonify({
            "error": "Status must move to the next stage"
        }), 400

    # A waiter must be assigned before an order can be marked Served.
    if new_status == "Served":
        waiter = order.assigned_waiter

        if waiter is None or not waiter.is_active:
            return jsonify({
                "error": "Assign an active waiter before serving this order."
            }), 400

        # Save a permanent name snapshot for the receipt.
        order.served_by_name = waiter.full_name

    order.order_status = new_status

    try:
        db.session.commit()
    except Exception:
        db.session.rollback()
        return jsonify({
            "error": "Could not update order status"
        }), 500

    return jsonify(serialize_order(order)), 200