"""Read-through MealDB catalogue; listing never imports or changes restaurant data."""
from concurrent.futures import ThreadPoolExecutor
import threading
import time
import requests
from flask import current_app
from sqlalchemy import inspect, func
from sqlalchemy.orm import joinedload
from ..extensions import db
from ..models.menu_item import MenuItem
from ..models.mealdb_link import MealDBLink
from .menu_pricing import category_price


class MealDBUnavailable(Exception):
    pass


def _get(endpoint, params, key):
    try:
        response = requests.get(f"https://www.themealdb.com/api/json/v1/{key}/{endpoint}", params=params, timeout=20)
        response.raise_for_status()
        data = response.json()
        if not isinstance(data, dict):
            raise ValueError('Invalid MealDB response')
        return data
    except (requests.RequestException, ValueError):
        raise MealDBUnavailable('TheMealDB is temporarily unavailable. Please try again shortly.') from None


def catalogue():
    """Enumerate every API category without the old five-meals-per-category cap."""
    cache = current_app.extensions.setdefault('mealdb_catalogue', {'lock': threading.Lock(), 'items': None, 'expires': 0})
    if cache['items'] is not None and time.monotonic() < cache['expires']:
        return cache['items'], None
    with cache['lock']:
        if cache['items'] is not None and time.monotonic() < cache['expires']:
            return cache['items'], None
        key = current_app.config['MEALDB_API_KEY']
        try:
            categories = _get('categories.php', {}, key).get('categories')
            if not isinstance(categories, list) or not categories:
                raise MealDBUnavailable('MealDB returned no categories.')
            names = [category['strCategory'] for category in categories if isinstance(category, dict) and category.get('strCategory')]
            if not names:
                raise MealDBUnavailable('MealDB returned no usable categories.')

            def fetch_category(name):
                meals = _get('filter.php', {'c': name}, key).get('meals')
                if meals is None:
                    return []
                if not isinstance(meals, list):
                    raise MealDBUnavailable('MealDB returned an invalid category.')
                return [{**meal, 'strCategory': name} for meal in meals if isinstance(meal, dict) and meal.get('idMeal') and meal.get('strMeal')]

            with ThreadPoolExecutor(max_workers=4) as executor:
                batches = list(executor.map(fetch_category, names))
            by_id = {str(meal['idMeal']): meal for batch in batches for meal in batch}
            if not by_id:
                raise MealDBUnavailable('MealDB returned no meals.')
            cache['items'] = list(by_id.values())
            cache['expires'] = time.monotonic() + current_app.config['MEALDB_CACHE_SECONDS']
            return cache['items'], None
        except MealDBUnavailable:
            if cache['items'] is not None:
                return cache['items'], 'MealDB could not refresh. Showing the last complete catalogue.'
            raise


def lookup(meal_id):
    if not str(meal_id).isdigit():
        return None
    meals = _get('lookup.php', {'i': str(meal_id)}, current_app.config['MEALDB_API_KEY']).get('meals')
    if not isinstance(meals, list):
        return None
    return next((meal for meal in meals if isinstance(meal, dict) and str(meal.get('idMeal')) == str(meal_id)), None)


def normalize(meal):
    category = meal.get('strCategory') or 'Miscellaneous'
    return {
        'id': 'mealdb_' + str(meal['idMeal']),
        'mealdb_id': str(meal['idMeal']),
        'source': 'mealdb',
        'name': meal['strMeal'],
        'description': meal.get('strInstructions') or category,
        'price': category_price(category),
        'image': meal.get('strMealThumb'),
        'category': category,
        'ingredients': [meal[f'strIngredient{n}'].strip() for n in range(1, 21) if isinstance(meal.get(f'strIngredient{n}'), str) and meal[f'strIngredient{n}'].strip()],
        'availability': True,
        'stock_quantity': MenuItem.stock_quantity.default.arg,
        'is_food_of_day': False,
        'is_meal_of_day': False,
        'preparation_time': MenuItem.preparation_time.default.arg,
        'serving_time': MenuItem.serving_time.default.arg,
    }


def merged_menu():
    from ..routes.menu_items import serialize_item
    warning = None
    try:
        meals, warning = catalogue()
    except MealDBUnavailable as exc:
        meals = []
        warning = str(exc) + ' Showing saved restaurant items only.'
    stored = MenuItem.query.order_by(MenuItem.id).all()
    if not meals and not stored:
        raise MealDBUnavailable('MealDB is unavailable and there are no saved restaurant meals.')
    links = MealDBLink.query.options(joinedload(MealDBLink.menu_item)).all() if inspect(db.engine).has_table('mealdb_menu_links') else []
    linked = {link.mealdb_id: link.menu_item for link in links}
    by_name = {item.name.casefold(): item for item in stored}
    used = set()
    result = []
    for meal in meals:
        item = linked.get(str(meal['idMeal'])) or by_name.get(meal['strMeal'].casefold())
        if item is not None and item.id not in used:
            value = serialize_item(item)
            value.update(mealdb_id=str(meal['idMeal']), source='mealdb')
            # Keep manager uploads; supply the original MealDB photo when no upload exists.
            if not item.image:
                value['image'] = meal.get('strMealThumb')
            used.add(item.id)
        else:
            value = normalize(meal)
        result.append(value)
    result.extend(serialize_item(item) for item in stored if item.id not in used)
    return sorted(result, key=lambda item: item['name'].casefold()), warning


def resolve_order_item(meal_id):
    """Materialize a selected recipe only within a customer's normal order transaction."""
    link = MealDBLink.query.filter_by(mealdb_id=str(meal_id)).first()
    if link:
        return MenuItem.query.filter_by(id=link.menu_item_id).with_for_update().first()
    meal = lookup(meal_id)
    if meal is None:
        return None
    data = normalize(meal)
    item = MenuItem.query.filter(func.lower(MenuItem.name) == data['name'].lower()).with_for_update().first()
    if item and MealDBLink.query.filter_by(menu_item_id=item.id).first():
        item = None
    if item is None:
        item = MenuItem(name=data['name'], description=data['description'], price=data['price'], image=data['image'], category=data['category'], ingredients=data['ingredients'], availability=True)
        db.session.add(item)
        db.session.flush()
    db.session.add(MealDBLink(mealdb_id=str(meal_id), menu_item_id=item.id))
    db.session.flush()
    return item
