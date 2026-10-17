import os
import uuid

from flask import (
    Blueprint,
    current_app,
    jsonify,
    request,
    url_for,
)
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


def serialize_item(item):
    """Return menu information without exposing stock quantities."""
    return {
        "id": item.id,
        "name": item.name,
        "description": item.description,
        "price": item.price,
        "image": item.image,
        "category": item.category,
        "ingredients": item.ingredients or [],
        "availability": bool(item.availability),
    }


def validate_availability(data):
    """Accept only actual JSON booleans for availability."""
    if "availability" in data and not isinstance(
        data["availability"], bool
    ):
        return jsonify({
            "error": "Availability must be true or false"
        }), 400

    return None


@menu_items_bp.route("", methods=["GET"])
def get_menu_items():
    """Public endpoint: customers can view every meal."""
    items = MenuItem.query.order_by(MenuItem.id).all()

    return jsonify([
        serialize_item(item) for item in items
    ]), 200


@menu_items_bp.route("", methods=["POST"])
@staff_required("manager")
def create_menu_item():
    """Only an authenticated manager can create a meal."""
    data = request.get_json(silent=True) or {}

    if not isinstance(data, dict):
        return jsonify({"error": "Invalid request body"}), 400

    name = data.get("name")
    if (
        not isinstance(name, str)
        or not name.strip()
        or data.get("price") is None
    ):
        return jsonify({
            "error": "Name and price are required"
        }), 400

    availability_error = validate_availability(data)
    if availability_error:
        return availability_error

    try:
        price = float(data["price"])

        if price < 0 or not __import__("math").isfinite(price):
            raise ValueError

    except (TypeError, ValueError):
        return jsonify({
            "error": "Price must be a valid non-negative number"
        }), 400

    ingredients = data.get("ingredients", [])

    if (
        not isinstance(ingredients, list)
        or not all(isinstance(value, str) for value in ingredients)
    ):
        return jsonify({
            "error": "Ingredients must be a list of text values"
        }), 400

    raw_stock = data.get("stock_quantity", 10)

    if isinstance(raw_stock, bool):
        return jsonify({
            "error": "Stock quantity must be a non-negative integer"
        }), 400

    try:
        stock_quantity = int(raw_stock)

        if (
            stock_quantity < 0
            or str(raw_stock).strip() != str(stock_quantity)
        ):
            raise ValueError

    except (TypeError, ValueError, AttributeError):
        return jsonify({
            "error": "Stock quantity must be a non-negative integer"
        }), 400

    image = data.get("image", "")
    if not isinstance(image, str):
        return jsonify({"error": "Image must be a URL string"}), 400

    category = data.get("category") or "Miscellaneous"
    description = data.get("description", "")

    if not isinstance(category, str) or not isinstance(description, str):
        return jsonify({
            "error": "Category and description must be text values"
        }), 400

    item = MenuItem(
        name=name.strip(),
        description=description.strip(),
        price=price,
        image=image.strip(),
        category=category.strip(),
        ingredients=ingredients,
        availability=data.get("availability", True),
        stock_quantity=stock_quantity,
    )

    try:
        db.session.add(item)
        db.session.commit()

    except Exception:
        db.session.rollback()
        current_app.logger.exception("Could not create menu item")
        return jsonify({
            "error": "Could not create menu item"
        }), 500

    return jsonify(serialize_item(item)), 201


@menu_items_bp.route("/upload-image", methods=["POST"])
@staff_required("manager")
def upload_menu_item_image():
    """Upload a meal photograph. Only managers may upload images."""
    image_file = request.files.get("image")

    if image_file is None or not image_file.filename:
        return jsonify({
            "error": "Please select a photo"
        }), 400

    safe_original_name = secure_filename(image_file.filename)
    _, extension = os.path.splitext(safe_original_name.lower())

    if extension not in ALLOWED_IMAGE_TYPES:
        return jsonify({
            "error": "Choose a JPG, PNG, or WebP image"
        }), 400

    if image_file.mimetype != ALLOWED_IMAGE_TYPES[extension]:
        return jsonify({
            "error": "The selected file does not match its image type"
        }), 400

    # Check size before saving the image.
    image_file.stream.seek(0, os.SEEK_END)
    file_size = image_file.stream.tell()
    image_file.stream.seek(0)

    if file_size == 0:
        return jsonify({
            "error": "The selected image is empty"
        }), 400

    if file_size > MAX_IMAGE_SIZE:
        return jsonify({
            "error": "Image must be 5 MB or smaller"
        }), 413

    static_folder = current_app.static_folder

    if not static_folder:
        return jsonify({
            "error": "Image storage is not configured"
        }), 500

    upload_folder = os.path.join(static_folder, "uploads")

    try:
        os.makedirs(upload_folder, exist_ok=True)

        # A random name prevents collisions and avoids using user filenames.
        filename = f"{uuid.uuid4().hex}{extension}"
        image_path = os.path.join(upload_folder, filename)

        image_file.save(image_path)

        image_url = url_for(
            "static",
            filename=f"uploads/{filename}",
            _external=True,
        )

    except OSError:
        current_app.logger.exception("Image upload failed")
        return jsonify({
            "error": "Could not save the uploaded image"
        }), 500

    return jsonify({"image": image_url}), 201


@menu_items_bp.route("/<int:item_id>", methods=["GET"])
def get_menu_item(item_id):
    """Public endpoint: customers can view meal details."""
    item = db.get_or_404(MenuItem, item_id)

    return jsonify(serialize_item(item)), 200


@menu_items_bp.route("/<int:item_id>", methods=["PATCH"])
@staff_required("manager")
def update_menu_item(item_id):
    """Only an authenticated manager can update a meal."""
    item = db.get_or_404(MenuItem, item_id)
    data = request.get_json(silent=True) or {}

    if not isinstance(data, dict):
        return jsonify({"error": "Invalid request body"}), 400

    availability_error = validate_availability(data)
    if availability_error:
        return availability_error

    if "price" in data:
        try:
            price = float(data["price"])

            if price < 0 or not __import__("math").isfinite(price):
                raise ValueError

            item.price = price

        except (TypeError, ValueError):
            return jsonify({
                "error": "Price must be a valid non-negative number"
            }), 400

    if "ingredients" in data:
        if (
            not isinstance(data["ingredients"], list)
            or not all(
                isinstance(value, str)
                for value in data["ingredients"]
            )
        ):
            return jsonify({
                "error": "Ingredients must be a list of text values"
            }), 400

        item.ingredients = data["ingredients"]

    if "stock_quantity" in data:
        raw_stock = data["stock_quantity"]

        if isinstance(raw_stock, bool):
            return jsonify({
                "error": "Stock quantity must be a non-negative integer"
            }), 400

        try:
            stock_quantity = int(raw_stock)

            if (
                stock_quantity < 0
                or str(raw_stock).strip() != str(stock_quantity)
            ):
                raise ValueError

        except (TypeError, ValueError, AttributeError):
            return jsonify({
                "error": "Stock quantity must be a non-negative integer"
            }), 400

        item.stock_quantity = stock_quantity

    for field in (
        "name",
        "description",
        "image",
        "category",
        "availability",
    ):
        if field in data:
            setattr(item, field, data[field])

    try:
        db.session.commit()

    except Exception:
        db.session.rollback()
        current_app.logger.exception("Could not update menu item")
        return jsonify({
            "error": "Could not update menu item"
        }), 500

    return jsonify(serialize_item(item)), 200


@menu_items_bp.route("/<int:item_id>", methods=["DELETE"])
@staff_required("manager")
def delete_menu_item(item_id):
    """Only an authenticated manager can delete a meal."""
    item = db.get_or_404(MenuItem, item_id)

    try:
        db.session.delete(item)
        db.session.commit()

    except Exception:
        db.session.rollback()
        current_app.logger.exception("Could not delete menu item")
        return jsonify({
            "error": "Could not delete menu item"
        }), 500

    return jsonify({
        "message": "Menu item deleted successfully"
    }), 200