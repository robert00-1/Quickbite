"""Migration regression checks use a disposable SQLite database exclusively."""
from pathlib import Path
from tempfile import TemporaryDirectory
from flask_migrate import upgrade, downgrade
from sqlalchemy import text
from alembic.migration import MigrationContext
from alembic.autogenerate import compare_metadata
from app import create_app
from app.extensions import db


def test_old_schema_returns_actionable_error_and_upgrade_preserves_orders():
    with TemporaryDirectory(prefix='quickbite-migration-test-') as folder:
        app=create_app({'TESTING':True,'MEALDB_ENABLED':False,'SECRET_KEY':'migration-test-secret-at-least-32-characters','JWT_SECRET_KEY':'migration-jwt-test-secret-at-least-32-characters','SQLALCHEMY_DATABASE_URI':f'sqlite:///{folder}/test.sqlite','WHATSAPP_ACCESS_TOKEN':None,'WHATSAPP_ORDER_TEMPLATE_NAME':None})
        migrations=str(Path(__file__).resolve().parents[1]/'migrations')
        with app.app_context():
            upgrade(directory=migrations,revision='a1b2c3d4e5f6')
            db.session.execute(text("INSERT INTO menu_items (id,name,price,category,ingredients,availability,stock_quantity) VALUES (1,'Test Dish',500,'Main','[]',1,10)"))
            db.session.execute(text("INSERT INTO orders (id,customer_name,phone,table_number,total,payment_method,payment_status,order_status,created_at) VALUES (1,'Historical Guest','254712345678','A1',500,'Cash','Pending','Pending','2026-01-01 12:00:00')"))
            db.session.execute(text("INSERT INTO order_items (order_id,menu_item_id,item_name,quantity,unit_price) VALUES (1,1,'Test Dish',1,500)"))
            db.session.commit()
            old=db.session.execute(text('SELECT id,customer_name,phone,table_number,total FROM orders')).all()
            response=app.test_client().post('/api/orders',json={})
            assert response.status_code==503
            assert response.json['code']=='database_migration_required'
            assert db.session.execute(text('SELECT count(*) FROM orders')).scalar()==1
            db.session.remove()
            upgrade(directory=migrations)
            assert db.session.execute(text('SELECT id,customer_name,phone,table_number,total FROM orders')).all()==old
            assert db.session.execute(text('SELECT count(*) FROM order_items')).scalar()==1
            db.session.remove()
            with db.engine.connect() as connection:
                assert compare_metadata(MigrationContext.configure(connection),db.metadata)==[]
            client=app.test_client()
            for method in ['Cash','Card','M-Pesa']:
                response=client.post('/api/orders',json={'customerName':'Guest','phone':'0712345678','tableNumber':'B2','paymentMethod':method,'items':[{'id':1,'quantity':1,'price':1}]})
                assert response.status_code==201,response.json
                assert response.json['order']['total']==500
                assert response.json['order']['paymentStatus']=='Pending'
            db.session.remove()
            # Only the new feature revision is rolled back, on this disposable database.
            downgrade(directory=migrations,revision='b2c3d4e5f6a7')
            upgrade(directory=migrations)
            assert db.session.execute(text('SELECT count(*) FROM orders')).scalar()==4
            db.session.remove()
            db.engine.dispose()
