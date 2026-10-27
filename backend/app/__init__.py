
from flask import Flask
from flask_cors import CORS

from . import models
from .config import Config
from .extensions import db, migrate

from .routes.auth import auth_bp
from .routes.menu_items import menu_items_bp
from .routes.orders import orders_bp
from .routes.payments import payments_bp
from .routes.waiter import waiter_bp
from .routes.manager import manager_bp
from .routes.waiter_profiles import waiter_profiles_bp


def create_app():
    app = Flask(__name__)
    app.config.from_object(Config)

    db.init_app(app)
    migrate.init_app(app, db)

    allowed_origins = [
        app.config["FRONTEND_ORIGIN"],
    ]

    # Allow local development when secure cookies are disabled.
    if not app.config["SESSION_COOKIE_SECURE"]:
        allowed_origins.extend([
            "http://localhost:5173",
            "http://127.0.0.1:5173",
        ])

    CORS(
        app,
        resources={r"/api/*": {"origins": allowed_origins}},
        supports_credentials=True,
        allow_headers=["Content-Type", "X-CSRF-Token"],
        methods=[
            "GET",
            "POST",
            "PUT",
            "PATCH",
            "DELETE",
            "OPTIONS",
        ],
    )

    app.register_blueprint(auth_bp)
    app.register_blueprint(menu_items_bp)
    app.register_blueprint(orders_bp)
    app.register_blueprint(payments_bp)
    app.register_blueprint(waiter_bp)
    app.register_blueprint(manager_bp)
    app.register_blueprint(waiter_profiles_bp)

    return app
