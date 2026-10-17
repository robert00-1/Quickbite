from flask import Blueprint, jsonify, request
from sqlalchemy import func

from ..extensions import db
from ..models.waiter_profile import WaiterProfile
from ..utils.auth import staff_required


waiter_profiles_bp = Blueprint(
    "waiter_profiles",
    __name__,
    url_prefix="/api/waiter-profiles",
)


def serialize_waiter(waiter):
    return {
        "id": waiter.id,
        "full_name": waiter.full_name,
        "is_active": waiter.is_active,
        "created_at": (
            waiter.created_at.isoformat()
            if waiter.created_at
            else None
        ),
    }


@waiter_profiles_bp.route("", methods=["GET"])
@staff_required("manager", "waiter")
def get_waiters():
    """Allow authenticated staff to see active waiter profiles."""
    waiters = (
        WaiterProfile.query
        .filter_by(is_active=True)
        .order_by(WaiterProfile.full_name.asc())
        .all()
    )

    return jsonify([
        serialize_waiter(waiter) for waiter in waiters
    ]), 200


@waiter_profiles_bp.route("", methods=["POST"])
@staff_required("manager")
def create_waiter():
    """Only a manager can add a waiter profile."""
    data = request.get_json(silent=True)

    if not isinstance(data, dict):
        return jsonify({"error": "Invalid request body"}), 400

    full_name = data.get("full_name")

    if not isinstance(full_name, str) or not full_name.strip():
        return jsonify({"error": "Waiter name is required"}), 400

    full_name = full_name.strip()

    if len(full_name) > 120:
        return jsonify({"error": "Waiter name is too long"}), 400

    existing = WaiterProfile.query.filter(
        func.lower(WaiterProfile.full_name) == full_name.lower()
    ).first()

    if existing:
        return jsonify({
            "error": "A waiter with this name already exists"
        }), 409

    waiter = WaiterProfile(
        full_name=full_name,
        is_active=True,
    )

    try:
        db.session.add(waiter)
        db.session.commit()
    except Exception:
        db.session.rollback()
        return jsonify({
            "error": "Could not create waiter profile"
        }), 500

    return jsonify({
        "message": "Waiter added successfully",
        "waiter": serialize_waiter(waiter),
    }), 201


@waiter_profiles_bp.route("/<int:waiter_id>", methods=["PATCH"])
@staff_required("manager")
def update_waiter(waiter_id):
    """Allow managers to activate or deactivate a waiter."""
    waiter = db.session.get(WaiterProfile, waiter_id)

    if waiter is None:
        return jsonify({"error": "Waiter not found"}), 404

    data = request.get_json(silent=True) or {}
    is_active = data.get("is_active")

    if not isinstance(is_active, bool):
        return jsonify({
            "error": "is_active must be true or false"
        }), 400

    waiter.is_active = is_active

    try:
        db.session.commit()
    except Exception:
        db.session.rollback()
        return jsonify({
            "error": "Could not update waiter profile"
        }), 500

    return jsonify({
        "message": "Waiter updated successfully",
        "waiter": serialize_waiter(waiter),
    }), 200