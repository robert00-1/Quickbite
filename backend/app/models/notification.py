from datetime import datetime, timezone
from ..extensions import db

class OrderNotification(db.Model):
    __tablename__ = "order_notifications"
    __table_args__ = (db.UniqueConstraint("order_id", "event", name="uq_order_notifications_event"),)
    id = db.Column(db.Integer, primary_key=True)
    order_id = db.Column(db.Integer, db.ForeignKey("orders.id"), nullable=False)
    event = db.Column(db.String(32), nullable=False)
    status = db.Column(db.String(20), nullable=False, default="pending")
    provider_id = db.Column(db.String(200), nullable=True, unique=True)
    error_code = db.Column(db.String(80), nullable=True)
    created_at = db.Column(db.DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))
    order = db.relationship("Order")
