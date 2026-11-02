from flask import Blueprint, jsonify, request

from ..extensions import db
from ..models.complaint import Complaint
from ..models.order import Order
from ..utils.auth import staff_required
from ..utils.customer import owns_order
from ..utils.timing import estimates


complaints_bp = Blueprint(
    "complaints",
    __name__,
    url_prefix="/api/complaints",
)


@complaints_bp.route("", methods=["POST"])
def create_complaint():
    """Allow a customer to submit a late-meal complaint."""
    data = request.get_json(silent=True) or {}

    if not isinstance(data, dict):
        return jsonify({"error": "JSON object required"}), 400
    order_id = data.get("orderId") or data.get("order_id")
    message = data.get("message", "")
    if not isinstance(message, str) or len(message) > 2000:
        return jsonify({"error": "Message must be text up to 2000 characters"}), 400
    message = message.strip()

    if not order_id or not message:
        return jsonify({"error": "orderId and message are required"}), 400

    if type(order_id) is not int:
        return jsonify({"error": "Invalid order ID"}), 400
    order = db.session.get(Order, order_id)
    if not order:
        return jsonify({"error": "Order not found"}), 404

    if not owns_order(order):
        return jsonify({"error": "Order not found"}), 404
    if not estimates(order)["isLate"]:
        return jsonify({"error": "This order is not late"}), 400

    complaint = Complaint(
        order_id=order.id,
        customer_name=order.customer_name,
        phone=order.phone,
        table_number=order.table_number,
        message=message,
        status="Open",
    )

    try:
        db.session.add(complaint)
        db.session.commit()
    except Exception:
        db.session.rollback()
        return jsonify({"error": "Could not save complaint"}), 500

    return jsonify({
        "message": "Complaint submitted successfully",
        "id": complaint.id,
    }), 201


@complaints_bp.route("", methods=["GET"])
@staff_required("manager")
def get_complaints():
    """Return all complaints (manager only)."""
    complaints = Complaint.query.order_by(
        Complaint.created_at.desc()
    ).all()

    return jsonify([
        {
            "id": c.id,
            "orderId": c.order_id,
            "customerName": c.customer_name,
            "phone": c.phone,
            "tableNumber": c.table_number,
            "message": c.message,
            "status": c.status,
            "createdAt": c.created_at.isoformat(),
        }
        for c in complaints
    ]), 200


@complaints_bp.route("/<int:complaint_id>", methods=["PATCH"])
@staff_required("manager")
def update_complaint(complaint_id):
    """Allow a manager to update complaint status."""
    complaint = db.session.get(Complaint, complaint_id)
    if not complaint:
        return jsonify({"error": "Complaint not found"}), 404

    data = request.get_json(silent=True) or {}
    new_status = data.get("status")

    if new_status not in ("Open", "In Progress", "Resolved"):
        return jsonify({
            "error": "Status must be Open, In Progress, or Resolved"
        }), 400

    complaint.status = new_status

    try:
        db.session.commit()
    except Exception:
        db.session.rollback()
        return jsonify({"error": "Could not update complaint"}), 500

    return jsonify({
        "message": "Complaint updated",
        "id": complaint.id,
        "status": complaint.status,
    }), 200

