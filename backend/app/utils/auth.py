
from datetime import datetime, timezone
from functools import wraps
import hashlib
import hmac

from flask import current_app, g, jsonify, request
from itsdangerous import BadSignature, URLSafeSerializer

from ..extensions import db
from ..models.user import StaffSession, User


def hash_token(token):
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def create_csrf_token(session_token_hash):
    serializer = URLSafeSerializer(
        current_app.config["SECRET_KEY"],
        salt="quickbite-staff-csrf",
    )
    return serializer.dumps({"session": session_token_hash})


def valid_csrf_token(token, session_token_hash):
    if not token or not session_token_hash:
        return False

    try:
        serializer = URLSafeSerializer(
            current_app.config["SECRET_KEY"],
            salt="quickbite-staff-csrf",
        )
        payload = serializer.loads(token)
    except BadSignature:
        return False

    return hmac.compare_digest(
        str(payload.get("session", "")),
        session_token_hash,
    )


def staff_required(*allowed_roles):
    allowed = {role.lower() for role in allowed_roles}

    def decorator(view_function):
        @wraps(view_function)
        def wrapped(*args, **kwargs):
            token = request.cookies.get(
                current_app.config["STAFF_SESSION_COOKIE"]
            )

            if not token:
                return jsonify({
                    "error": "Authentication required. Please log in."
                }), 401

            session_hash = hash_token(token)

            staff_session = StaffSession.query.filter_by(
                token_hash=session_hash,
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
                response = jsonify({
                    "error": "Session expired. Please log in again."
                })
                response.delete_cookie(
                    current_app.config["STAFF_SESSION_COOKIE"],
                    path="/",
                    secure=current_app.config["SESSION_COOKIE_SECURE"],
                    httponly=False,
                    samesite="Lax",
                )
                response.delete_cookie(
                    current_app.config["STAFF_CSRF_COOKIE"],
                    path="/",
                    secure=current_app.config["SESSION_COOKIE_SECURE"],
                    samesite="Lax",
                )
                return response, 401

            staff_user = db.session.get(User, staff_session.user_id)

            if staff_user is None or not staff_user.is_active:
                return jsonify({
                    "error": "Staff account is inactive."
                }), 401

            if allowed and staff_user.role.lower() not in allowed:
                return jsonify({
                    "error": "You do not have permission to access this resource."
                }), 403

            if request.method in {"POST", "PUT", "PATCH", "DELETE"}:
                csrf_cookie = request.cookies.get(
                    current_app.config["STAFF_CSRF_COOKIE"], ""
                )
                csrf_header = request.headers.get("X-CSRF-Token", "")

                if (
                    not csrf_cookie
                    or not csrf_header
                    or not hmac.compare_digest(csrf_cookie, csrf_header)
                    or not valid_csrf_token(csrf_header, session_hash)
                ):
                    return jsonify({
                        "error": "CSRF validation failed. Refresh and try again."
                    }), 403

            g.staff_user = staff_user
            g.staff_session = staff_session

            return view_function(*args, **kwargs)

        return wrapped

    return decorator