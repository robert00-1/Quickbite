import secrets
from datetime import datetime, timezone

from ..extensions import db


class Receipt(db.Model):
    __tablename__ = "receipts"

    id = db.Column(db.Integer, primary_key=True)
    notification_status = db.Column(db.String(20), nullable=False, default="pending", server_default="pending")
    notification_error = db.Column(db.String(200), nullable=True)
    notification_provider_id = db.Column(db.String(200), nullable=True)

    order_id = db.Column(
        db.Integer,
        db.ForeignKey("orders.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
    )

    receipt_token = db.Column(
        db.String(64),
        unique=True,
        nullable=False,
        default=lambda: secrets.token_urlsafe(32),
    )

    created_at = db.Column(
        db.DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )

    order = db.relationship("Order", back_populates="receipt")
