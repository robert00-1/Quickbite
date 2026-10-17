from datetime import datetime, timezone

from ..extensions import db


def utc_now():
    return datetime.now(timezone.utc)


class WaiterProfile(db.Model):
    __tablename__ = "waiter_profiles"

    id = db.Column(db.Integer, primary_key=True)

    full_name = db.Column(
        db.String(120),
        unique=True,
        nullable=False,
    )

    is_active = db.Column(
        db.Boolean,
        nullable=False,
        default=True,
    )

    created_at = db.Column(
        db.DateTime(timezone=True),
        nullable=False,
        default=utc_now,
    )