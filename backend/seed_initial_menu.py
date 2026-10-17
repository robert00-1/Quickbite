from app import create_app
from app.extensions import db
from app.models.menu_item import MenuItem


DEFAULT_MENU = [
    {
        "name": "Chicken Burger",
        "description": "Juicy chicken burger served with fresh lettuce and bread.",
        "price": 450,
        "category": "Main Course",
        "ingredients": ["Chicken", "Bread", "Lettuce"],
        "availability": True,
        "stock_quantity": 10,
        "image": None,
    },
    {
        "name": "Beef Pilau",
        "description": "Flavourful rice cooked with beef and aromatic spices.",
        "price": 500,
        "category": "Main Course",
        "ingredients": ["Rice", "Beef", "Spices"],
        "availability": True,
        "stock_quantity": 10,
        "image": None,
    },
    {
        "name": "Grilled Chicken and Chips",
        "description": "Grilled chicken served with crispy chips.",
        "price": 650,
        "category": "Main Course",
        "ingredients": ["Chicken", "Potatoes"],
        "availability": True,
        "stock_quantity": 10,
        "image": None,
    },
    {
        "name": "Vegetable Samosas",
        "description": "Crispy pastry filled with seasoned vegetables.",
        "price": 150,
        "category": "Starters",
        "ingredients": ["Vegetables", "Pastry"],
        "availability": True,
        "stock_quantity": 10,
        "image": None,
    },
    {
        "name": "Fresh Passion Juice",
        "description": "Refreshing passion fruit juice.",
        "price": 180,
        "category": "Drinks",
        "ingredients": ["Passion Fruit", "Water"],
        "availability": True,
        "stock_quantity": 10,
        "image": None,
    },
]


def seed_menu():
    existing_names = {
        item.name.strip().casefold()
        for item in MenuItem.query.all()
    }

    added = 0

    try:
        for data in DEFAULT_MENU:
            name_key = data["name"].strip().casefold()

            if name_key in existing_names:
                print(f"Already exists; skipping: {data['name']}")
                continue

            db.session.add(MenuItem(**data))
            existing_names.add(name_key)
            added += 1

        db.session.commit()
        print(f"Menu seeding completed. Added {added} items.")

    except Exception:
        db.session.rollback()
        raise


if __name__ == "__main__":
    app = create_app()

    with app.app_context():
        seed_menu()
