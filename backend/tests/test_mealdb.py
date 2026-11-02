"""MealDB integration checks use mocked upstream data and an isolated database."""
from unittest.mock import patch, Mock
from tests import test_features
from app.extensions import db
from app.models import MenuItem, Order
from app.models.mealdb_link import MealDBLink
from app.services.mealdb import MealDBUnavailable
import unittest


def recipe(ident, category='Chicken'):
    return {'idMeal':str(ident),'strMeal':f'Meal {ident}','strMealThumb':f'https://www.themealdb.com/images/media/meals/{ident}.jpg','strCategory':category,'strInstructions':'Test recipe','strIngredient1':'Rice'}


class MealDBTests(unittest.TestCase):
    setUp = test_features.FeatureTests.setUp
    tearDown = test_features.FeatureTests.tearDown
    login = test_features.FeatureTests.login

    @patch('app.services.mealdb._get')
    def test_every_category_and_more_than_five_meals_are_shown_with_original_images(self, get):
        self.app.config['MEALDB_ENABLED']=True
        def upstream(endpoint,params,key):
            if endpoint=='categories.php': return {'categories':[{'strCategory':'Chicken'},{'strCategory':'Vegan'}]}
            start=53000 if params['c']=='Chicken' else 54000
            return {'meals':[recipe(start+n,params['c']) for n in range(12)]}
        get.side_effect=upstream
        response=self.client.get('/api/menu-items')
        self.assertEqual(response.status_code,200)
        self.assertEqual(len(response.json),25)  # 24 MealDB meals plus the preserved restaurant meal.
        virtual=[m for m in response.json if m.get('source')=='mealdb']
        self.assertEqual(len(virtual),24)
        self.assertTrue(all(m['image'].startswith('https://www.themealdb.com/') for m in virtual))
        filtered=self.client.get('/api/menu-items?category=Vegan&search=Meal&min_price=350&max_price=450')
        self.assertEqual(len(filtered.json),12)
        self.assertEqual(get.call_count,3)  # Complete inventory cached; filtering makes no upstream calls.
        with self.app.app_context():self.assertEqual(MenuItem.query.count(),1)

    @patch('app.services.mealdb.lookup')
    def test_details_keep_external_id_image_ingredients_and_backend_price(self, lookup):
        lookup.return_value=recipe(52772,'Pasta')
        response=self.client.get('/api/menu-items/mealdb/52772')
        self.assertEqual(response.status_code,200)
        self.assertEqual(response.json['id'],'mealdb_52772')
        self.assertEqual(response.json['price'],400)
        self.assertEqual(response.json['ingredients'],['Rice'])
        with self.app.app_context():self.assertEqual(MenuItem.query.count(),1)

    @patch('app.services.mealdb.lookup')
    def test_mealdb_cart_item_materializes_atomically_and_remains_orderable(self, lookup):
        lookup.return_value=recipe(52772,'Pasta')
        payload={'customerName':'Guest','phone':'0712345678','tableNumber':'A1','paymentMethod':'Cash','items':[{'id':'mealdb_52772','quantity':2,'price':1}]}
        response=self.client.post('/api/orders',json=payload)
        self.assertEqual(response.status_code,201,response.json)
        self.assertEqual(response.json['order']['total'],800)
        with self.app.app_context():
            self.assertEqual(MealDBLink.query.count(),1)
            link=MealDBLink.query.first()
            self.assertEqual(link.menu_item.stock_quantity,8)
            self.assertEqual(Order.query.count(),1)
        response=self.client.post('/api/orders',json=payload)
        self.assertEqual(response.status_code,201)
        self.assertEqual(lookup.call_count,1)

    @patch('app.services.mealdb.lookup')
    def test_invalid_order_does_not_import_any_meals(self, lookup):
        lookup.return_value=recipe(52772)
        response=self.client.post('/api/orders',json={'customerName':'Guest','phone':'0712345678','tableNumber':'A1','paymentMethod':'Cash','items':[{'id':'mealdb_52772','quantity':1},{'id':999999,'quantity':1}]})
        self.assertEqual(response.status_code,404)
        with self.app.app_context():
            self.assertEqual(MealDBLink.query.count(),0)
            self.assertEqual(MenuItem.query.count(),1)
            self.assertEqual(Order.query.count(),0)

    @patch('app.services.mealdb.lookup')
    def test_manager_can_set_price_availability_and_daily_selection(self, lookup):
        lookup.return_value=recipe(52772)
        headers=self.login('manager')
        response=self.client.patch('/api/menu-items/mealdb_52772',json={'price':725,'is_food_of_day':True,'availability':False},headers=headers)
        self.assertEqual(response.status_code,200,response.json)
        self.assertEqual(response.json['price'],725)
        self.assertTrue(response.json['is_food_of_day'])
        with patch('app.services.mealdb.catalogue',return_value=([recipe(52772)],None)):
            self.app.config['MEALDB_ENABLED']=True
            menu=self.client.get('/api/menu-items').json
        managed=next(m for m in menu if m.get('mealdb_id')=='52772')
        self.assertEqual(managed['price'],725)
        self.assertFalse(managed['availability'])
        self.assertEqual(len([m for m in menu if m['name']=='Meal 52772']),1)

    @patch('app.services.mealdb._get',side_effect=MealDBUnavailable('MealDB unavailable'))
    def test_upstream_failure_is_visible_and_preserves_saved_menu(self,get):
        self.app.config['MEALDB_ENABLED']=True
        response=self.client.get('/api/menu-items')
        self.assertEqual(response.status_code,200)
        self.assertEqual(len(response.json),1)
        self.assertIn('MealDB unavailable',response.headers['X-Menu-Warning'])


    @patch('app.services.mealdb.lookup')
    def test_virtual_and_saved_aliases_share_inventory_validation(self, lookup):
        lookup.return_value=recipe(52772)
        payload={'customerName':'Guest','phone':'0712345678','tableNumber':'A1','paymentMethod':'Cash','items':[{'id':'mealdb_52772','quantity':1}]}
        self.assertEqual(self.client.post('/api/orders',json=payload).status_code,201)
        with self.app.app_context(): managed=MealDBLink.query.first().menu_item_id
        payload['items']=[{'id':managed,'quantity':5},{'id':'mealdb_52772','quantity':5}]
        self.assertEqual(self.client.post('/api/orders',json=payload).status_code,400)
        with self.app.app_context():
            self.assertEqual(db.session.get(MenuItem,managed).stock_quantity,9)
            self.assertEqual(Order.query.count(),1)
