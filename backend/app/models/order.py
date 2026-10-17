from datetime import datetime, timezone

from ..extensions import db


class Order(db.Model):
    __tablename__ = "orders"

    id = db.Column(db.Integer, primary_key=True)
    customer_name = db.Column(db.String(120), nullable=False)
    phone = db.Column(db.String(20), nullable=False)
    table_number = db.Column(db.Integer, nullable=False)

    total = db.Column(db.Numeric(10, 2), nullable=False)
    payment_method = db.Column(db.String(20), nullable=False)

    payment_status = db.Column(
        db.String(20),
        nullable=False,
        default="Pending",
    )

    order_status = db.Column(
        db.String(20),
        nullable=False,
        default="Pending",
    )

    # The waiter selected to handle this order.
    assigned_waiter_id = db.Column(
        db.Integer,
        db.ForeignKey("waiter_profiles.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    # Snapshot of the waiter who completed service.
    served_by_name = db.Column(
        db.String(120),
        nullable=True,
    )

    assigned_waiter = db.relationship(
        "WaiterProfile",
        foreign_keys=[assigned_waiter_id],
    )

    checkout_request_id = db.Column(
        db.String(100),
        unique=True,
        nullable=True,
    )

    mpesa_receipt_number = db.Column(
        db.String(50),
        unique=True,
        nullable=True,
    )

    created_at = db.Column(
        db.DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )

    items = db.relationship(
        "OrderItem",
        back_populates="order",
        cascade="all, delete-orphan",
    )