
import math
import os

import cloudinary
import cloudinary.uploader

from flask import Blueprint, current_app, jsonify, request
from werkzeug.utils import secure_filename

from ..extensions import db
from ..models.menu_item import MenuItem
from ..utils.auth import staff_required


menu_items_bp = Blueprint(
    "menu_items",
    __name__,
    url_prefix="/api/menu-items",
)


ALLOWED_IMAGE_TYPES = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
}

MAX_IMAGE_SIZE = 5 * 1024 * 1024  # 5 MB


def configure_cloudinary():
    """Configure Cloudinary using credentials from the application config."""
    cloud_name = current_app.config.get("CLOUDINARY_CLOUD_NAME")
    api_key = current_app.config.get("CLOUDINARY_API_KEY")
    api_secret = current_app.config.get("CLOUDINARY_API_SECRET")

    if not cloud_name or not api_key or not api_secret:
        raise RuntimeError(
            "Cloudinary is not configured. Check your environment variables."
        )

    cloudinary.config(
        cloud_name=cloud_name,
        api_key=api_key,
        api_secret=api_secret,
        secure=True,
    )


def serialize_item(item):
    """Convert a menu item into a JSON-friendly dictionary."""
    return {
        "id": item.id,
        "name": item.name,
        "description": item.description,
        "price": float(item.price) if item.price is not None else 0,
        "image": item.image,
        "category": item.category,
        "ingredients": item.ingredients or [],
        "availability": bool(item.availability),
        "stock_quantity": item.stock_quantity,
    }


def validate_availability(data):
    """Validate the availability field when it is included in a request."""
    if "availability" in data and not isinstance(
        data["availability"], bool
    ):
        return jsonify(
            {"error": "Availability must be true or false"}
        ), 400

    return None


@menu_items_bp.route("", methods=["GET"])
@menu_items_bp.route("/", methods=["GET"])
def get_menu_items():
    """Return all menu items."""
    items = MenuItem.query.order_by(MenuItem.id.asc()).all()

    return jsonify([serialize_item(item) for item in items]), 200


@menu_items_bp.route("", methods=["POST"])
@menu_items_bp.route("/", methods=["POST"])
@staff_required("manager")
def create_menu_item():
    """Create a menu item. Only managers may create menu items."""
    data = request.get_json(silent=True)

    if not isinstance(data, dict):
        return jsonify({"error": "A valid JSON request body is required"}), 400

    name = data.get("name")
    price = data.get("price")
    category = data.get("category")

    if not isinstance(name, str) or not name.strip():
        return jsonify({"error": "Menu item name is required"}), 400

    if price is None or isinstance(price, bool):
        return jsonify({"error": "A valid price is required"}), 400

    try:
        price = float(price)
    except (TypeError, ValueError):
        return jsonify({"error": "Price must be a valid number"}), 400

    if not math.isfinite(price) or price < 0:
        return jsonify({"error": "Price must be a non-negative number"}), 400

    if not isinstance(category, str) or not category.strip():
        return jsonify({"error": "Menu item category is required"}), 400

    availability_error = validate_availability(data)
    if availability_error:
        return availability_error

    description = data.get("description", "")
    image = data.get("image", "")
    ingredients = data.get("ingredients", [])
    stock_quantity = data.get("stock_quantity", 0)
    availability = data.get("availability", True)

    if not isinstance(description, str):
        return jsonify({"error": "Description must be text"}), 400

    if not isinstance(image, str):
        return jsonify({"error": "Image must be a URL string"}), 400

    if not isinstance(ingredients, list) or not all(
        isinstance(ingredient, str) for ingredient in ingredients
    ):
        return jsonify({"error": "Ingredients must be a list of text values"}), 400

    if (
        isinstance(stock_quantity, bool)
        or not isinstance(stock_quantity, int)
        or stock_quantity < 0
    ):
        return jsonify(
            {"error": "Stock quantity must be a non-negative integer"}
        ), 400

    item = MenuItem(
        name=name.strip(),
        description=description.strip(),
        price=price,
        image=image.strip(),
        category=category.strip(),
        ingredients=ingredients,
        availability=availability,
        stock_quantity=stock_quantity,
    )

    try:
        db.session.add(item)
        db.session.commit()
    except Exception:
        db.session.rollback()
        current_app.logger.exception("Failed to create menu item")
        return jsonify({"error": "Could not create menu item"}), 500

    return jsonify(serialize_item(item)), 201


@menu_items_bp.route("/upload-image", methods=["POST"])
@staff_required("manager")
def upload_menu_item_image():
    """Upload a menu item photo to Cloudinary. Managers only."""
    image_file = request.files.get("image")

    if image_file is None or not image_file.filename:
        return jsonify({"error": "Please select a photo"}), 400

    # Check the filename extension.
    safe_original_name = secure_filename(image_file.filename)
    _, extension = os.path.splitext(safe_original_name.lower())

    if extension not in ALLOWED_IMAGE_TYPES:
        return jsonify(
            {"error": "Choose a JPG, PNG, or WebP image"}
        ), 400

    # Check the reported MIME type.
    if image_file.mimetype != ALLOWED_IMAGE_TYPES[extension]:
        return jsonify(
            {"error": "The selected file does not match its image type"}
        ), 400

    # Check the file size.
    image_file.stream.seek(0, os.SEEK_END)
    file_size = image_file.stream.tell()
    image_file.stream.seek(0)

    if file_size == 0:
        return jsonify({"error": "The selected image is empty"}), 400

    if file_size > MAX_IMAGE_SIZE:
        return jsonify({"error": "Image must be 5 MB or smaller"}), 413

    try:
        configure_cloudinary()

        result = cloudinary.uploader.upload(
            image_file,
            folder="quickbite/menu-items",
            resource_type="image",
            allowed_formats=["jpg", "jpeg", "png", "webp"],
            unique_filename=True,
        )

        image_url = result.get("secure_url")

        if not image_url:
            raise RuntimeError("Cloudinary did not return an image URL")

        return jsonify({"image": image_url}), 201

    except Exception:
        current_app.logger.exception("Cloudinary image upload failed")
        return jsonify(
            {"error": "Image upload failed. Check the server configuration and try again."}
        ), 502


@menu_items_bp.route("/<int:item_id>", methods=["GET"])
def get_menu_item(item_id):
    """Return one menu item."""
    item = db.get_or_404(MenuItem, item_id)

    return jsonify(serialize_item(item)), 200


@menu_items_bp.route("/<int:item_id>", methods=["PATCH"])
@staff_required("manager")
def update_menu_item(item_id):
    """Update a menu item. Only managers may update menu items."""
    item = db.get_or_404(MenuItem, item_id)
    data = request.get_json(silent=True)

    if not isinstance(data, dict):
        return jsonify({"error": "A valid JSON request body is required"}), 400

    availability_error = validate_availability(data)
    if availability_error:
        return availability_error

    if "price" in data:
        price = data["price"]

        if price is None or isinstance(price, bool):
            return jsonify({"error": "Price must be a valid number"}), 400

        try:
            price = float(price)
        except (TypeError, ValueError):
            return jsonify({"error": "Price must be a valid number"}), 400

        if not math.isfinite(price) or price < 0:
            return jsonify(
                {"error": "Price must be a non-negative number"}
            ), 400

        item.price = price

    if "ingredients" in data:
        ingredients = data["ingredients"]

        if not isinstance(ingredients, list) or not all(
            isinstance(ingredient, str) for ingredient in ingredients
        ):
            return jsonify(
                {"error": "Ingredients must be a list of text values"}
            ), 400

        item.ingredients = ingredients

    if "stock_quantity" in data:
        stock_quantity = data["stock_quantity"]

        if (
            isinstance(stock_quantity, bool)
            or not isinstance(stock_quantity, int)
            or stock_quantity < 0
        ):
            return jsonify(
                {"error": "Stock quantity must be a non-negative integer"}
            ), 400

        item.stock_quantity = stock_quantity

    for field in ("name", "description", "image", "category"):
        if field in data:
            value = data[field]

            if not isinstance(value, str):
                return jsonify(
                    {"error": f"{field.replace('_', ' ').capitalize()} must be text"}
                ), 400

            if field == "name" and not value.strip():
                return jsonify({"error": "Menu item name cannot be empty"}), 400

            if field == "category" and not value.strip():
                return jsonify({"error": "Category cannot be empty"}), 400

            setattr(item, field, value.strip())

    if "availability" in data:
        item.availability = data["availability"]

    try:
        db.session.commit()
    except Exception:
        db.session.rollback()
        current_app.logger.exception("Failed to update menu item")
        return jsonify({"error": "Could not update menu item"}), 500

    return jsonify(serialize_item(item)), 200


@menu_items_bp.route("/<int:item_id>", methods=["DELETE"])
@staff_required("manager")
def delete_menu_item(item_id):
    """Delete a menu item. Only managers may delete menu items."""
    item = db.get_or_404(MenuItem, item_id)

    try:
        db.session.delete(item)
        db.session.commit()
    except Exception:
        db.session.rollback()
        current_app.logger.exception("Failed to delete menu item")
        return jsonify({"error": "Could not delete menu item"}), 500

    return jsonify({"message": "Menu item deleted successfully"}), 200
