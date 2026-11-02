"""Test-only fixture server. Migrate /tmp/quickbite-verification.sqlite first; never uses production data."""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from app import create_app
from app.extensions import db
from app.models import MenuItem, User, WaiterProfile
from werkzeug.security import generate_password_hash
app=create_app({'TESTING':True,'WHATSAPP_ACCESS_TOKEN':None,'WHATSAPP_PHONE_NUMBER_ID':None,'WHATSAPP_TEMPLATE_NAME':None,'MPESA_CONSUMER_KEY':None,'MPESA_CONSUMER_SECRET':None,'SQLALCHEMY_DATABASE_URI':'sqlite:////tmp/quickbite-verification.sqlite','SECRET_KEY':'runtime-test-secret-key-at-least-32-chars','JWT_SECRET_KEY':'runtime-test-jwt-secret-key-at-least-32-chars','SESSION_COOKIE_SECURE':False,'PUBLIC_API_URL':'http://127.0.0.1:5000','FRONTEND_ORIGIN':'http://127.0.0.1:5174'})
with app.app_context():
    if not MenuItem.query.first():
        for name,category,price,daily in [('Test Burger','Main',500,True),('Test Kids Meal','Kids',200,True),('Test Juice','Drinks',100,False)]:
            db.session.add(MenuItem(name=name, category=category,price=price,availability=True,stock_quantity=50,is_food_of_day=daily, preparation_time=10,serving_time=3))
        for role in ['manager','waiter']:
            user=User(username=role, full_name='Test '+role.title(),password_hash=generate_password_hash('runtime-password'),role=role)
            db.session.add(user);db.session.flush()
            if role=='waiter':db.session.add(WaiterProfile(full_name=user.full_name,user_id=user.id))
        db.session.commit()
app.run(host='127.0.0.1',port=5000,debug=False)
