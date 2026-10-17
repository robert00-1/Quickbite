
from ..extensions import db


class MenuItem(db.Model):
    __tablename__ = "menu_items"

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    description = db.Column(db.Text, nullable=True)
    price = db.Column(db.Float, nullable=False)
    image = db.Column(db.String(500), nullable=True)

    category = db.Column(
        db.String(100),
        nullable=False,
        default="Miscellaneous",
    )

    ingredients = db.Column(
        db.JSON,
        nullable=False,
        default=list,
    )

    availability = db.Column(
        db.Boolean,
        nullable=False,
        default=True,
    )

    stock_quantity = db.Column(
        db.Integer,
        nullable=False,
        default=10,
        server_default="10",
    )
