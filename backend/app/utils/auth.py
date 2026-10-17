
from datetime import datetime, timezone
from functools import wraps
import hashlib

from flask import g, jsonify, request

from ..extensions import db
from ..models.user import StaffSession, User


def hash_token(token):
    return hashlib.sha256(
        token.encode("utf-8")
    ).hexdigest()


def staff_required(*allowed_roles):
    allowed = {role.lower() for role in allowed_roles}

    def decorator(view_function):
        @wraps(view_function)
        def wrapped(*args, **kwargs):
            authorization = request.headers.get(
                "Authorization", ""
            )
            parts = authorization.split()

            if (
                len(parts) != 2
                or parts[0].lower() != "bearer"
            ):
                return jsonify({
                    "error": "Authentication required. Please log in."
                }), 401

            token = parts[1]

            staff_session = StaffSession.query.filter_by(
                token_hash=hash_token(token),
                revoked_at=None,
            ).first()

            if staff_session is None:
                return jsonify({
                    "error": "Invalid session. Please log in again."
                }), 401

            now = datetime.now(timezone.utc)
            expires_at = staff_session.expires_at

            if expires_at.tzinfo is None:
                expires_at = expires_at.replace(
                    tzinfo=timezone.utc
                )

            if expires_at <= now:
                staff_session.revoked_at = now
                db.session.commit()

                return jsonify({
                    "error": "Session expired. Please log in again."
                }), 401

            staff_user = db.session.get(
                User, staff_session.user_id
            )

            if staff_user is None or not staff_user.is_active:
                return jsonify({
                    "error": "Staff account is inactive."
                }), 401

            if allowed and staff_user.role not in allowed:
                return jsonify({
                    "error": "You do not have permission to access this resource."
                }), 403

            g.staff_user = staff_user
            g.staff_session = staff_session

            return view_function(*args, **kwargs)

        return wrapped

    return decorator
