from flask import Blueprint, jsonify, request
from ..extensions import db
from datetime import datetime
from ..models.shift import Shift

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

def serialize_shift(shift):
    return {
        "id": shift.id,
        "waiter_id": shift.waiter_id,
        "started_at": shift.started_at.isoformat(),
        "ended_at": shift.ended_at.isoformat() if shift.ended_at else None,
        "is_active": shift.is_active,
        "hours_worked": shift.hours_worked,
    }


@waiter_bp.route("/shifts/start", methods=["POST"])
def start_shift():
    data = request.get_json(silent=True) or {}
    # TODO: once login is merged, take the waiter id from the JWT instead
    waiter_id = data.get("waiter_id")
    if not isinstance(waiter_id, int):
        return jsonify({"error": "waiter_id is required"}), 400

    active = Shift.query.filter_by(waiter_id=waiter_id, ended_at=None).first()
    if active:
        return jsonify({"error": "Shift already started"}), 400

    shift = Shift(waiter_id=waiter_id)
    db.session.add(shift)
    db.session.commit()
    return jsonify(serialize_shift(shift)), 201


@waiter_bp.route("/shifts/end", methods=["POST"])
def end_shift():
    data = request.get_json(silent=True) or {}
    # TODO: once login is merged, take the waiter id from the JWT instead
    waiter_id = data.get("waiter_id")
    if not isinstance(waiter_id, int):
        return jsonify({"error": "waiter_id is required"}), 400

    shift = Shift.query.filter_by(waiter_id=waiter_id, ended_at=None).first()
    if not shift:
        return jsonify({"error": "No active shift to end"}), 400

    shift.ended_at = datetime.utcnow()
    db.session.commit()
    return jsonify(serialize_shift(shift)), 200


def waiter_orders(waiter_id):
    # Returns [] until the Order model exists and has a waiter_id column
    try:
        Order = get_order_model()
    except ImportError:
        return []
    if not hasattr(Order, "waiter_id"):
        return []
    return Order.query.filter_by(waiter_id=waiter_id).all()


def table_summary(waiter_id):
    orders = waiter_orders(waiter_id)
    served = {o.table_number for o in orders if o.status == "SERVED"}
    open_tables = {o.table_number for o in orders if o.status != "SERVED"}
    return sorted(served), sorted(open_tables)


@waiter_bp.route("/<int:waiter_id>/record", methods=["GET"])
def waiter_record(waiter_id):
    shifts = (
        Shift.query.filter_by(waiter_id=waiter_id)
        .order_by(Shift.started_at.desc())
        .all()
    )
    served, open_tables = table_summary(waiter_id)
    return jsonify({
        "waiter_id": waiter_id,
        "total_hours": round(sum(s.hours_worked for s in shifts), 2),
        "tables_served": len(served),
        "served_tables": served,
        "open_tables": open_tables,
        "shifts": [serialize_shift(s) for s in shifts],
    }), 200


@waiter_bp.route("/roster", methods=["GET"])
def roster():
    active = Shift.query.filter_by(ended_at=None).order_by(Shift.started_at).all()
    result = []
    for shift in active:
        served, open_tables = table_summary(shift.waiter_id)
        result.append({
            "waiter_id": shift.waiter_id,
            "on_shift_since": shift.started_at.isoformat(),
            "hours_so_far": shift.hours_worked,
            "current_tables": open_tables,
            "tables_served": len(served),
            "status": "BUSY" if open_tables else "AVAILABLE",
        })
    return jsonify(result), 200
