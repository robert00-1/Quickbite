from ..extensions import db

class MealDBLink(db.Model):
    __tablename__ = "mealdb_menu_links"
    mealdb_id = db.Column(db.String(20), primary_key=True)
    menu_item_id = db.Column(db.Integer, db.ForeignKey("menu_items.id"), nullable=False, unique=True)
    menu_item = db.relationship("MenuItem")
