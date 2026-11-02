"""The existing QuickBite category pricing policy, shared by MealDB import/discovery."""
CATEGORY_PRICES = {
    "Chicken": 450, "Beef": 550, "Lamb": 600, "Pork": 500,
    "Seafood": 650, "Pasta": 400, "Vegetarian": 350,
    "Dessert": 300, "Breakfast": 300, "Miscellaneous": 400,
}

def category_price(category):
    return CATEGORY_PRICES.get(category, CATEGORY_PRICES["Miscellaneous"])
