
import json
import urllib.request

from app import create_app
from app.extensions import db
from app.models.menu_item import MenuItem


API_URL = "https://www.themealdb.com/api/json/v1/1"

from app.services.menu_pricing import CATEGORY_PRICES

CATEGORIES = list(CATEGORY_PRICES.keys())


def fetch_json(url):
    request = urllib.request.Request(
        url, headers={"User-Agent": "QUICKBITE/1.0"}
    )
    with urllib.request.urlopen(request, timeout=20) as response:
        return json.loads(response.read().decode("utf-8"))


def seed_menu():
    added = 0
    skipped = 0

    for category in CATEGORIES:
        try:
            result = fetch_json(
                f"{API_URL}/filter.php?c={category}"
            )
            meals = (result.get("meals") or [])

            for meal in meals:
                try:
                    details = fetch_json(
                        f"{API_URL}/lookup.php?i={meal['idMeal']}"
                    )
                    full_meal = (details.get("meals") or [None])[0]

                    if not full_meal:
                        continue

                    name = full_meal["strMeal"]

                    if MenuItem.query.filter_by(name=name).first():
                        skipped += 1
                        continue

                    ingredients = []
                    for number in range(1, 21):
                        ingredient = full_meal.get(
                            f"strIngredient{number}"
                        )
                        if ingredient and ingredient.strip():
                            ingredients.append(ingredient.strip())

                    description = (
                        f"A delicious {category.lower()} dish"
                        + (
                            f" featuring {', '.join(ingredients[:3])}"
                            if ingredients else ""
                        )
                        + "."
                    )

                    item = MenuItem(
                        name=name,
                        description=description,
                        price=CATEGORY_PRICES[category],
                        image=full_meal.get("strMealThumb", ""),
                        category=category,
                        ingredients=ingredients,
                        availability=True,
                    )

                    db.session.add(item)
                    db.session.commit()
                    added += 1
                    print(f"Added: {name}")

                except Exception as error:
                    db.session.rollback()
                    print(f"Could not import {meal['strMeal']}: {error}")

        except Exception as error:
            print(f"Could not load category {category}: {error}")

    print(f"\nFinished! Added: {added}; skipped existing: {skipped}")


if __name__ == "__main__":
    app = create_app()
    with app.app_context():
        seed_menu()
