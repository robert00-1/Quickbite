from datetime import datetime, timedelta, timezone
import hashlib
import secrets

from flask import Blueprint, g, jsonify, request
from werkzeug.security import (
    check_password_hash,
    generate_password_hash,
)

from ..extensions import db
from ..models.user import User, StaffSession
from ..utils.auth import staff_required


auth_bp = Blueprint(
    "auth",
    __name__,
    url_prefix="/api/auth",
)

SESSION_HOURS = 8


@auth_bp.route("/login", methods=["POST"])
def login():
    """Authenticate a staff member and create a session."""
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
        return jsonify({"error": "Invalid username or password"}), 401

    user = User.query.filter_by(username=username).first()

    if (
        user is None
        or not user.is_active
        or not check_password_hash(user.password_hash, password)
    ):
        return jsonify({
            "error": "Invalid username or password"
        }), 401

    # Generate a unique token for this browser session.
    token = secrets.token_urlsafe(48)

    # Store only the token hash in the database.
    token_hash = hashlib.sha256(
        token.encode("utf-8")
    ).hexdigest()

    now = datetime.now(timezone.utc)
    expires_at = now + timedelta(hours=SESSION_HOURS)

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

    return jsonify({
        "access_token": token,
        "token_type": "Bearer",
        "expires_at": expires_at.isoformat(),
        "user": {
            "id": user.id,
            "full_name": user.full_name or "",
            "username": user.username,
            "role": user.role,
        },
    }), 200


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
    """Revoke the current staff session."""
    staff_session = g.staff_session
    staff_session.revoked_at = datetime.now(timezone.utc)

    try:
        db.session.commit()
    except Exception:
        db.session.rollback()
        return jsonify({
            "error": "Could not log out"
        }), 500

    return jsonify({
        "message": "Logged out successfully"
    }), 200


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