
from datetime import datetime, timedelta, timezone
import secrets

from flask import Blueprint, current_app, g, jsonify, request
from werkzeug.security import (
    check_password_hash,
    generate_password_hash,
)

from ..extensions import db
from ..models.user import User, StaffSession
from ..utils.auth import (
    create_csrf_token,
    hash_token,
    staff_required,
)


auth_bp = Blueprint(
    "auth",
    __name__,
    url_prefix="/api/auth",
)


def allowed_origins():
    """Return the browser origins allowed to use staff authentication."""
    origins = {
        current_app.config["FRONTEND_ORIGIN"].rstrip("/"),
    }

    if not current_app.config["SESSION_COOKIE_SECURE"]:
        origins.update({
            "http://localhost:5173",
            "http://127.0.0.1:5173",
        })

    return origins


def origin_is_allowed():
    """Validate the origin of a browser authentication request."""
    origin = request.headers.get("Origin", "").rstrip("/")
    return bool(origin) and origin in allowed_origins()


def clear_staff_cookies(response):
    """Clear both cookies using the same settings used to create them."""
    secure = current_app.config["SESSION_COOKIE_SECURE"]

    response.delete_cookie(
        current_app.config["STAFF_SESSION_COOKIE"],
        path="/",
        secure=secure,
        httponly=True,
        samesite="Lax",
    )

    response.delete_cookie(
        current_app.config["STAFF_CSRF_COOKIE"],
        path="/",
        secure=secure,
        httponly=False,
        samesite="Lax",
    )

    return response


@auth_bp.route("/login", methods=["POST"])
def login():
    """Authenticate staff and create an eight-hour cookie session."""
    if not origin_is_allowed():
        return jsonify({
            "error": "Login request origin is not allowed."
        }), 403

    data = request.get_json(silent=True)

    if not isinstance(data, dict):
        return jsonify({"error": "Invalid login request"}), 400

    username = data.get("username")
    password = data.get("password")

    if not isinstance(username, str) or not username.strip():
        return jsonify({"error": "Username is required"}), 400

    if not isinstance(password, str) or not password:
        return jsonify({"error": "Password is required"}), 400

    username = username.strip().lower()

    if len(username) > 80:
        return jsonify({
            "error": "Invalid username or password"
        }), 401

    user = User.query.filter_by(username=username).first()

    if (
        user is None
        or not user.is_active
        or not check_password_hash(user.password_hash, password)
    ):
        return jsonify({
            "error": "Invalid username or password"
        }), 401

    session_hours = current_app.config["STAFF_SESSION_HOURS"]
    token = secrets.token_urlsafe(48)
    token_hash = hash_token(token)

    now = datetime.now(timezone.utc)
    expires_at = now + timedelta(hours=session_hours)

    staff_session = StaffSession(
        user_id=user.id,
        token_hash=token_hash,
        created_at=now,
        expires_at=expires_at,
    )

    try:
        db.session.add(staff_session)
        db.session.commit()
    except Exception:
        db.session.rollback()
        return jsonify({
            "error": "Could not complete login"
        }), 500

    csrf_token = create_csrf_token(token_hash)
    secure = current_app.config["SESSION_COOKIE_SECURE"]

    response = jsonify({
        "message": "Login successful",
        "expires_at": expires_at.isoformat(),
        "user": {
            "id": user.id,
            "full_name": user.full_name or "",
            "username": user.username,
            "role": user.role,
        },
    })

    response.set_cookie(
        current_app.config["STAFF_SESSION_COOKIE"],
        token,
        max_age=session_hours * 60 * 60,
        httponly=True,
        secure=secure,
        samesite="Lax",
        path="/",
    )

    response.set_cookie(
        current_app.config["STAFF_CSRF_COOKIE"],
        csrf_token,
        max_age=session_hours * 60 * 60,
        httponly=False,
        secure=secure,
        samesite="Lax",
        path="/",
    )

    return response, 200


@auth_bp.route("/me", methods=["GET"])
@staff_required("waiter", "manager")
def current_staff():
    """Return the profile belonging to the authenticated session."""
    user = g.staff_user

    return jsonify({
        "id": user.id,
        "full_name": user.full_name or "",
        "username": user.username,
        "role": user.role,
    }), 200


@auth_bp.route("/logout", methods=["POST"])
@staff_required("waiter", "manager")
def logout():
    """Revoke the current session and clear its cookies."""
    staff_session = g.staff_session
    staff_session.revoked_at = datetime.now(timezone.utc)

    try:
        db.session.commit()
    except Exception:
        db.session.rollback()
        return jsonify({
            "error": "Could not log out"
        }), 500

    response = jsonify({
        "message": "Logged out successfully"
    })

    return clear_staff_cookies(response), 200


@auth_bp.route("/staff", methods=["POST"])
@staff_required("manager")
def create_staff():
    """Allow an authenticated manager to create staff accounts."""
    data = request.get_json(silent=True)

    if not isinstance(data, dict):
        return jsonify({"error": "Invalid request body"}), 400

    full_name = data.get("full_name")
    username = data.get("username")
    password = data.get("password")
    role = data.get("role")

    if not isinstance(full_name, str) or not full_name.strip():
        return jsonify({"error": "Full name is required"}), 400

    full_name = full_name.strip()

    if len(full_name) > 120:
        return jsonify({"error": "Full name is too long"}), 400

    if not isinstance(username, str) or not username.strip():
        return jsonify({"error": "Username is required"}), 400

    username = username.strip().lower()

    if len(username) > 80:
        return jsonify({"error": "Username is too long"}), 400

    if not isinstance(password, str) or len(password) < 8:
        return jsonify({
            "error": "Password must contain at least 8 characters"
        }), 400

    if not isinstance(role, str) or role.strip().lower() not in {
        "waiter",
        "manager",
    }:
        return jsonify({
            "error": "Role must be waiter or manager"
        }), 400

    role = role.strip().lower()

    existing_user = User.query.filter_by(
        username=username
    ).first()

    if existing_user:
        return jsonify({
            "error": "That username already exists"
        }), 409

    user = User(
        full_name=full_name,
        username=username,
        password_hash=generate_password_hash(password),
        role=role,
        is_active=True,
    )

    try:
        db.session.add(user)
        db.session.commit()
    except Exception:
        db.session.rollback()
        return jsonify({
            "error": "Could not create staff account"
        }), 500

    return jsonify({
        "message": "Staff account created successfully",
        "user": {
            "id": user.id,
            "full_name": user.full_name,
            "username": user.username,
            "role": user.role,
        },
    }), 201
