"""Read-only compatibility checks: never migrate a database during a request."""
from sqlalchemy import inspect
from ..extensions import db

def missing_order_schema():
    inspector = inspect(db.engine)
    missing = []
    for name in ("orders", "order_items", "menu_items", "receipts", "payments", "order_notifications", "mealdb_menu_links"):
        if not inspector.has_table(name):
            missing.append(name)
            continue
        actual = {column["name"] for column in inspector.get_columns(name)}
        missing.extend(f"{name}.{column.name}" for column in db.metadata.tables[name].columns if column.name not in actual)
    return missing
