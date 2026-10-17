


from datetime import datetime, timezone

from ..extensions import db


def utc_now():
    return datetime.now(timezone.utc)


class User(db.Model):
    __tablename__ = "staff_users"

    __table_args__ = (
        db.CheckConstraint(
            "role IN ('waiter', 'manager')",
            name="ck_staff_users_role",
        ),
    )

    id = db.Column(db.Integer, primary_key=True)

    full_name = db.Column(
        db.String(120),
        nullable=True,
    )

    username = db.Column(
        db.String(80),
        unique=True,
        nullable=False,
        index=True,
    )

    password_hash = db.Column(db.String(255), nullable=False)

    role = db.Column(db.String(20), nullable=False)

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

    sessions = db.relationship(
        "StaffSession",
        back_populates="user",
        cascade="all, delete-orphan",
    )


class StaffSession(db.Model):
    __tablename__ = "staff_sessions"

    id = db.Column(db.Integer, primary_key=True)

    user_id = db.Column(
        db.Integer,
        db.ForeignKey("staff_users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    token_hash = db.Column(
        db.String(64),
        unique=True,
        nullable=False,
        index=True,
    )

    created_at = db.Column(
        db.DateTime(timezone=True),
        nullable=False,
        default=utc_now,
    )

    expires_at = db.Column(
        db.DateTime(timezone=True),
        nullable=False,
    )

    revoked_at = db.Column(
        db.DateTime(timezone=True),
        nullable=True,
    )

    user = db.relationship(
        "User",
        back_populates="sessions",
    )
