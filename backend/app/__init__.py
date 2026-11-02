
from flask import Flask, request
from flask_jwt_extended import JWTManager
from flask_cors import CORS

from . import models
from .config import Config
from .extensions import db, migrate
from .utils.origins import cors_origins, origin_is_allowed

from .routes.auth import auth_bp
from .routes.menu_items import menu_items_bp
from .routes.orders import orders_bp
from .routes.payments import payments_bp, mpesa_bp
from .routes.waiter import waiter_bp
from .routes.manager import manager_bp
from .routes.waiter_profiles import waiter_profiles_bp
from .routes.receipts import receipts_bp


def create_app(config_overrides=None):
    app = Flask(__name__)
    app.config.from_object(Config)
    if config_overrides:
        app.config.update(config_overrides)

    if app.config.get("APP_ENV") == "production":
        import os
        if not os.getenv("SECRET_KEY") or len(app.config["SECRET_KEY"]) < 32:
            raise RuntimeError("Production requires a SECRET_KEY of at least 32 characters")
        if len(app.config["JWT_SECRET_KEY"]) < 32:
            raise RuntimeError("Production requires a JWT_SECRET_KEY of at least 32 characters")
        if not app.config["SESSION_COOKIE_SECURE"]:
            raise RuntimeError("Production requires secure cookies")
    import logging
    from .utils.logging import RedactCallbackSecret
    for name in ("werkzeug", "gunicorn.access", "gunicorn.error"):
        logging.getLogger(name).addFilter(RedactCallbackSecret())
    JWTManager(app)
    db.init_app(app)
    migrate.init_app(app, db)

    allowed_origins = cors_origins(app.config)

    CORS(
        app,
        resources={r"/api/*": {"origins": allowed_origins}},
        supports_credentials=True,
        expose_headers=["X-Menu-Warning"],
        allow_headers=["Content-Type", "X-CSRF-Token", "Idempotency-Key"],
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
    app.register_blueprint(mpesa_bp)
    app.register_blueprint(waiter_bp)
    app.register_blueprint(manager_bp)
    app.register_blueprint(waiter_profiles_bp)
    app.register_blueprint(receipts_bp)
    from .routes.complaints import complaints_bp
    app.register_blueprint(complaints_bp)

    @app.before_request
    def customer_origin_check():
        if request.method in {"POST", "PATCH", "PUT", "DELETE"} and request.path.startswith(("/api/orders", "/api/complaints", "/api/payments/stk-push", "/api/mpesa/stk-push")):
            origin = request.headers.get("Origin")
            if origin and not origin_is_allowed(origin):
                return {"error": "Request origin is not allowed"}, 403

    @app.before_request
    def order_schema_check():
        if request.path.startswith(("/api/orders", "/api/payments", "/api/mpesa", "/api/waiter/orders", "/api/manager/orders")) and request.method != "OPTIONS":
            from .utils.schema import missing_order_schema
            missing = missing_order_schema()
            if missing:
                app.logger.error("Ordering schema update required: %s", ", ".join(missing))
                return {"error": "Ordering is temporarily unavailable. Restaurant staff must complete the database update.", "code": "database_migration_required"}, 503

    @app.after_request
    def private_response_headers(response):
        if request.path.startswith(("/api/orders", "/api/receipts", "/api/auth")):
            response.headers["Cache-Control"] = "no-store"
            response.headers["Referrer-Policy"] = "no-referrer"
        return response

    return app
