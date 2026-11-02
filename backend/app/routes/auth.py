
from datetime import datetime, timedelta, timezone
from flask_jwt_extended import create_access_token

from flask import Blueprint, current_app, g, jsonify, request
from werkzeug.security import (
    check_password_hash,
    generate_password_hash,
)

from ..extensions import db
from ..utils.origins import origin_is_allowed
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


def clear_staff_cookies(response):
    """Clear both cookies using the same settings used to create them."""
    secure = current_app.config["SESSION_COOKIE_SECURE"]
    samesite = current_app.config.get("SESSION_COOKIE_SAMESITE", "Lax")

    response.delete_cookie(
        current_app.config["STAFF_SESSION_COOKIE"],
        path="/",
        secure=secure,
        httponly=True,
        samesite=samesite,
    )

    response.delete_cookie(
        current_app.config["STAFF_CSRF_COOKIE"],
        path="/",
        secure=secure,
        httponly=False,
        samesite=samesite,
    )

    return response


@auth_bp.route("/login", methods=["POST"])
def login():
    """Authenticate staff and create an eight-hour cookie session."""
    if not origin_is_allowed(request.headers.get("Origin")):
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
    token = create_access_token(identity=str(user.id), expires_delta=timedelta(hours=session_hours), additional_claims={"role": user.role})
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
    samesite = current_app.config.get("SESSION_COOKIE_SAMESITE", "Lax")

    response = jsonify({
        "message": "Login successful",
        "expires_at": expires_at.isoformat(),
        "csrf_token": csrf_token,
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
        samesite=samesite,
        path="/",
    )

    response.set_cookie(
        current_app.config["STAFF_CSRF_COOKIE"],
        csrf_token,
        max_age=session_hours * 60 * 60,
        httponly=False,
        secure=secure,
        samesite=samesite,
        path="/",
    )

    return response, 200


@auth_bp.route("/csrf", methods=["GET"])
@staff_required("waiter", "manager")
def get_csrf():
    """Return a fresh CSRF token for the authenticated staff session."""
    session_hash = g.staff_session.token_hash
    token = create_csrf_token(session_hash)
    return jsonify({"csrf_token": token}), 200


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
        db.session.flush()
        if role == "waiter":
            from ..models.waiter_profile import WaiterProfile
            profile = WaiterProfile.query.filter_by(full_name=full_name, user_id=None).first()
            if profile:
                profile.user_id = user.id
            else:
                db.session.add(WaiterProfile(full_name=full_name, user_id=user.id))
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
