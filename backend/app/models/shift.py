from datetime import datetime

from ..extensions import db


class Shift(db.Model):
    __tablename__ = "shifts"

    id = db.Column(db.Integer, primary_key=True)
    # Plain number for now; link to the users table once Person 1's user model is merged
    waiter_id = db.Column(db.Integer, nullable=False)
    started_at = db.Column(
        db.DateTime, nullable=False, default=datetime.utcnow
    )
    # Empty while the waiter is still on shift
    ended_at = db.Column(db.DateTime, nullable=True)

    @property
    def is_active(self):
        return self.ended_at is None

    @property
    def hours_worked(self):
        end = self.ended_at or datetime.utcnow()
        return round((end - self.started_at).total_seconds() / 3600, 2)
