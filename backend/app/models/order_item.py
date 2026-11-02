from ..extensions import db


class OrderItem(db.Model):
    __tablename__ = "order_items"

    id = db.Column(db.Integer, primary_key=True)

    order_id = db.Column(
        db.Integer,
        db.ForeignKey("orders.id"),
        nullable=False,
    )

    menu_item_id = db.Column(
        db.Integer,
        db.ForeignKey("menu_items.id"),
        nullable=False,
    )

    item_name = db.Column(db.String(100), nullable=False)
    quantity = db.Column(db.Integer, nullable=False)
    unit_price = db.Column(db.Numeric(10, 2), nullable=False)

    preparation_time = db.Column(
        db.Integer,
        nullable=False,
        default=15,
        server_default="15",
    )

    serving_time = db.Column(
        db.Integer,
        nullable=False,
        default=5,
        server_default="5",
    )

    order = db.relationship(
        "Order",
        back_populates="items",
    )