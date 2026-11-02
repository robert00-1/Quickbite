
from datetime import datetime, timezone
from zoneinfo import ZoneInfo

from flask import Blueprint, g, jsonify, request
from sqlalchemy import or_

from ..extensions import db
from ..models.order import Order
from ..models.shift import Shift
from ..models.waiter_profile import WaiterProfile
from ..models.weekly_shift import WeeklyShift
from ..utils.auth import staff_required
from ..utils.timing import utc, estimates


waiter_bp = Blueprint(
    "waiter",
    __name__,
    url_prefix="/api/waiter",
)

ORDER_STATUSES = ["Pending", "Preparing", "Ready", "Served"]

ACTIVE_ORDER_STATUSES = ["Pending", "Preparing", "Ready"]


def is_waiter_on_shift(waiter_id):
    """Check whether a waiter is within their scheduled Nairobi shift."""

    profile = db.session.get(WaiterProfile, waiter_id)
    if profile and profile.user_id and Shift.query.filter_by(waiter_id=profile.user_id, ended_at=None).first():
        return True
    now = datetime.now(ZoneInfo("Africa/Nairobi"))
    current_day = now.weekday()
    current_time = now.time().replace(tzinfo=None)

    return WeeklyShift.query.filter(
        WeeklyShift.waiter_id == waiter_id,
        WeeklyShift.is_active.is_(True),
        WeeklyShift.day_of_week == current_day,
        WeeklyShift.start_time <= current_time,
        WeeklyShift.end_time > current_time,
    ).first() is not None


def waiter_has_active_order(waiter_id, exclude_order_id=None):
    """Check whether a waiter already has another unfinished order."""

    query = Order.query.filter(
        Order.assigned_waiter_id == waiter_id,
        Order.order_status.in_(ACTIVE_ORDER_STATUSES),
    )

    if exclude_order_id is not None:
        query = query.filter(Order.id != exclude_order_id)

    return query.first() is not None


def serialize_order(order):
    assigned_waiter = order.assigned_waiter

    return {
        **estimates(order),
        "receipt_url": f"/api/receipts/{order.receipt.receipt_token}/view" if order.receipt else None,
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
    query = Order.query.filter(
        or_(
            Order.payment_method != "M-Pesa",
            Order.payment_status == "Paid"
        )
    )

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
    """Assign an eligible waiter or unassign an existing waiter."""

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

        # Check whether the waiter is currently scheduled.
        if not is_waiter_on_shift(waiter.id):
            return jsonify({
                "error": "This waiter is not currently on their scheduled shift."
            }), 400

        # Exclude this order so a waiter can keep or receive
        # the same order without being counted as already busy.
        if waiter_has_active_order(
            waiter.id,
            exclude_order_id=order.id,
        ):
            return jsonify({
                "error": "This waiter is already handling another active order."
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
        order.served_at = datetime.now(timezone.utc)

    order.order_status = new_status

    try:
        db.session.commit()
    except Exception:
        db.session.rollback()
        return jsonify({
            "error": "Could not update order status"
        }), 500

    return jsonify(serialize_order(order)), 200


@waiter_bp.route("/record", methods=["GET"])
@staff_required("waiter", "manager")
def get_waiter_record():
    user = g.staff_user
    from ..services.activity import activity
    profile = WaiterProfile.query.filter_by(user_id=user.id).first()
    return jsonify({"waiter_id": user.id, "waiter_name": user.full_name or user.username, **activity(user.id, profile)}), 200


@waiter_bp.route("/shifts/start", methods=["POST"])
@staff_required("waiter", "manager")
def start_waiter_shift():
    user = g.staff_user
    active_shift = Shift.query.filter_by(waiter_id=user.id, ended_at=None).first()
    if active_shift:
        return jsonify({
            "message": "Shift already active",
            "shift": {
                "id": active_shift.id,
                "started_at": active_shift.started_at.isoformat(),
                "is_active": True,
            },
        }), 200

    new_shift = Shift(waiter_id=user.id)
    try:
        db.session.add(new_shift)
        db.session.commit()
    except Exception:
        db.session.rollback()
        return jsonify({"error": "Could not start shift"}), 500

    return jsonify({
        "message": "Shift started successfully",
        "shift": {
            "id": new_shift.id,
            "started_at": new_shift.started_at.isoformat(),
            "is_active": True,
        },
    }), 201


@waiter_bp.route("/shifts/end", methods=["POST"])
@staff_required("waiter", "manager")
def end_waiter_shift():
    user = g.staff_user
    active_shift = Shift.query.filter_by(waiter_id=user.id, ended_at=None).first()
    if not active_shift:
        return jsonify({"error": "No active shift found to end"}), 400

    active_shift.ended_at = datetime.now(timezone.utc)
    try:
        db.session.commit()
    except Exception:
        db.session.rollback()
        return jsonify({"error": "Could not end shift"}), 500

    return jsonify({
        "message": "Shift ended successfully",
        "shift": {
            "id": active_shift.id,
            "started_at": active_shift.started_at.isoformat(),
            "ended_at": active_shift.ended_at.isoformat(),
            "hours": active_shift.hours_worked,
            "is_active": False,
        },
    }), 200


@waiter_bp.route("/roster", methods=["GET"])
@staff_required("waiter", "manager")
def get_waiter_roster():
    from ..services.activity import activity
    roster = []
    for profile in WaiterProfile.query.filter_by(is_active=True).all():
        active = Shift.query.filter_by(waiter_id=profile.user_id, ended_at=None).first() if profile.user_id else None
        current = Order.query.filter(Order.assigned_waiter_id == profile.id, Order.order_status.in_(ACTIVE_ORDER_STATUSES)).all()
        record = activity(profile.user_id, profile)
        roster.append({"waiter_id": profile.id, "full_name": profile.full_name,
            "on_shift_since": utc(active.started_at).isoformat() if active else None,
            "hours_so_far": active.hours_worked if active else 0,
            "current_tables": sorted({o.table_number for o in current}), "tables_served": record["tables_served"],
            "status": "OFF_SHIFT" if not active else ("BUSY" if current else "AVAILABLE")})
    return jsonify(roster), 200
