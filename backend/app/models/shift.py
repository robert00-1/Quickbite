from datetime import datetime, timezone

from ..extensions import db


class Shift(db.Model):
    __tablename__ = "shifts"

    id = db.Column(db.Integer, primary_key=True)
    waiter_id = db.Column(db.Integer, db.ForeignKey("staff_users.id", ondelete="CASCADE"), nullable=False, index=True)
    __table_args__ = (db.Index("uq_shifts_active_waiter", "waiter_id", unique=True, sqlite_where=db.text("ended_at IS NULL"), postgresql_where=db.text("ended_at IS NULL")),)
    started_at = db.Column(
        db.DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )
    # Empty while the waiter is still on shift
    ended_at = db.Column(db.DateTime(timezone=True), nullable=True)

    @property
    def is_active(self):
        return self.ended_at is None

    @property
    def hours_worked(self):
        start = self.started_at
        if start is None:
            return 0.0

        end = self.ended_at or datetime.now(timezone.utc)

        # Normalize timezones to prevent offset-naive vs offset-aware TypeError
        if end.tzinfo is not None and start.tzinfo is None:
            start = start.replace(tzinfo=timezone.utc)
        elif end.tzinfo is None and start.tzinfo is not None:
            end = end.replace(tzinfo=timezone.utc)

        return round(max(0.0, (end - start).total_seconds() / 3600), 2)
