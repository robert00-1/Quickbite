"""Curated dish photographs used only when a menu record has no uploaded image."""
import json
from pathlib import Path
from functools import lru_cache

PHOTO_DIR = Path(__file__).resolve().parents[1] / "static" / "menu"

@lru_cache(maxsize=1)
def photo_catalog():
    with (PHOTO_DIR / "catalog.json").open() as source:
        return json.load(source)

def menu_image(item):
    if item.image and item.image.strip():
        return item.image
    photo = next((photo for photo in photo_catalog() if photo["menu_name"].casefold() == item.name.strip().casefold()), None)
    return f"/api/menu-items/photos/{photo['filename']}" if photo else None
