from datetime import datetime, timedelta, timezone
from unittest.mock import patch, Mock
import unittest
from tests import test_api
from app.extensions import db
from app.models import MenuItem, Order, User, WaiterProfile, Receipt
from werkzeug.security import generate_password_hash


class FeatureTests(unittest.TestCase):
    setUp = test_api.QuickBiteApiTestCase.setUp
    tearDown = test_api.QuickBiteApiTestCase.tearDown
    def payload(self, **values):
        return dict(customerName='Alice', phone='0712345678', tableNumber='A1', paymentMethod='Cash', items=[{'id': self.menu_item_id, 'quantity': 1}], **values)

    def order(self, method='Cash'):
        payload = self.payload()
        payload['paymentMethod'] = method
        res = self.client.post('/api/orders', json=payload)
        self.assertEqual(res.status_code, 201, res.json)
        return res.json['order']

    def login(self, role='waiter'):
        if role == 'manager':
            with self.app.app_context():
                if not User.query.filter_by(username='manager').first():
                    db.session.add(User(username='manager', password_hash=generate_password_hash('password123'), role='manager', full_name='Manager'))
                    db.session.commit()
        response = self.client.post('/api/auth/login', json={'username': 'manager' if role == 'manager' else 'johnwaiter', 'password': 'password123'}, headers={'Origin': 'http://localhost:5173'})
        self.assertEqual(response.status_code, 200, response.json)
        return {'X-CSRF-Token': response.json['csrf_token'], 'Origin': 'http://localhost:5173'}

    def test_customer_order_privacy(self):
        order = self.order()
        stranger = self.app.test_client()
        self.assertEqual(stranger.get('/api/orders').status_code, 401)
        self.assertEqual(stranger.get(f"/api/orders/{order['id']}").status_code, 404)
        self.assertEqual(self.client.get(f"/api/orders/{order['id']}").status_code, 200)
        cookie = self.client.get_cookie('quickbite_customer')
        self.assertTrue(cookie.http_only)

    def test_payment_status_is_server_authoritative(self):
        for method in ['Cash', 'Card', 'M-Pesa']:
            payload = self.payload(); payload.update(paymentMethod=method, paymentStatus='Paid')
            res = self.client.post('/api/orders', json=payload)
            self.assertEqual(res.json['order']['paymentStatus'], 'Pending')
            if method == 'M-Pesa': self.assertIsNone(res.json['order']['receiptUrl'])

    def test_duplicate_lines_cannot_bypass_stock(self):
        payload = self.payload(); payload['items'] *= 11
        self.assertEqual(self.client.post('/api/orders', json=payload).status_code, 400)
        with self.app.app_context(): self.assertEqual(db.session.get(MenuItem, self.menu_item_id).stock_quantity, 10)

    def test_bad_phone_and_json_rejected(self):
        for phone in ['123', '254999999999', 'abc']:
            payload = self.payload(); payload['phone'] = phone
            self.assertEqual(self.client.post('/api/orders', json=payload).status_code, 400)
        self.assertEqual(self.client.post('/api/orders', json=[1]).status_code, 400)

    def test_combined_search_category_and_prices(self):
        res = self.client.get('/api/menu-items?search=SPICY&category=Main%20Course&min_price=400&max_price=600')
        self.assertEqual(len(res.json), 1)
        self.assertEqual(self.client.get('/api/menu-items?search=SPICY&max_price=100').json, [])
        for value in ['nan', 'inf', 'abc', '-1']:
            self.assertEqual(self.client.get('/api/menu-items?min_price='+value).status_code, 400)

    def test_multiple_daily_meals_and_kids(self):
        headers = self.login('manager')
        with self.app.app_context():
            kid = MenuItem(name='Kids meal', price=100, category='Kids', availability=True, stock_quantity=5)
            db.session.add(kid); db.session.commit(); kid_id=kid.id
        for ident in [self.menu_item_id, kid_id]:
            res = self.client.patch(f'/api/menu-items/{ident}', json={'is_food_of_day': True}, headers=headers)
            self.assertTrue(res.json['is_food_of_day'])
        self.assertEqual(len(self.client.get('/api/menu-items?is_meal_of_day=true').json), 2)
        self.assertEqual(self.client.get('/api/menu-items?category=Kids').json[0]['id'], kid_id)
        self.client.patch(f'/api/menu-items/{kid_id}', json={'is_food_of_day': False}, headers=headers)
        self.assertEqual(len(self.client.get('/api/menu-items?is_meal_of_day=true').json), 1)

    def test_role_checks_csrf_logout_and_cookie(self):
        headers = self.login()
        self.assertTrue(self.client.get_cookie('quickbite_staff_session').http_only)
        self.assertEqual(self.client.get('/api/manager/dashboard').status_code, 403)
        self.assertEqual(self.client.post('/api/waiter/shifts/start', json={}).status_code, 403)
        self.assertEqual(self.client.post('/api/auth/logout', headers=headers).status_code, 200)
        self.assertEqual(self.client.get('/api/waiter/record').status_code, 401)

    def test_login_bad_password_origin_and_tamper(self):
        self.assertEqual(self.client.post('/api/auth/login', json={'username':'johnwaiter','password':'password123'}, headers={'Origin':'https://evil.example'}).status_code, 403)
        self.assertEqual(self.client.post('/api/auth/login', json={'username':'johnwaiter','password':'bad'}, headers={'Origin':'http://localhost:5173'}).status_code, 401)
        self.client.set_cookie('quickbite_staff_session','invalid')
        self.assertEqual(self.client.get('/api/auth/me').status_code, 401)

    def test_receipt_print_and_qr(self):
        order=self.order(); url=order['receiptUrl']
        self.assertEqual(self.client.get(url+'/view').status_code, 200)
        self.assertIn(b'QuickBite', self.client.get(url+'/view').data)
        qr=self.client.get(url+'/qr')
        self.assertEqual(qr.mimetype, 'image/png'); self.assertTrue(qr.data.startswith(b'\x89PNG'))
        self.assertEqual(self.client.get('/api/receipts/1').status_code, 404)
        self.assertEqual(self.client.get(url).json['notificationStatus'], 'not_configured')

    def test_late_complaint_ownership_and_resolution(self):
        order=self.order(); payload={'orderId':order['id'],'message':'My meal is late'}
        self.assertEqual(self.client.post('/api/complaints',json=payload).status_code,400)
        with self.app.app_context():
            db.session.get(Order,order['id']).created_at=datetime.now(timezone.utc)-timedelta(hours=1);db.session.commit()
        self.assertEqual(self.app.test_client().post('/api/complaints',json=payload).status_code,404)
        complaint=self.client.post('/api/complaints',json=payload)
        self.assertEqual(complaint.status_code,201)
        headers=self.login('manager')
        self.assertEqual(len(self.client.get('/api/manager/late-orders').json),1)
        self.assertEqual(len(self.client.get('/api/complaints').json),1)
        self.assertEqual(self.client.patch(f"/api/complaints/{complaint.json['id']}",json={'status':'Resolved'},headers=headers).status_code,200)

    def test_shift_roster_and_private_records(self):
        headers=self.login()
        self.assertEqual(self.client.post('/api/waiter/shifts/start',headers=headers).status_code,201)
        self.assertEqual(self.client.post('/api/waiter/shifts/start',headers=headers).status_code,200)
        self.assertEqual(len(self.client.get('/api/waiter/record').json['shifts']),1)
        roster=self.client.get('/api/waiter/roster').json
        self.assertEqual(roster[0]['status'],'AVAILABLE')
        self.assertEqual(self.client.get('/api/waiter/record?waiter_id=999').json['waiter_name'],'John Waiter')
        self.assertEqual(self.client.post('/api/waiter/shifts/end',headers=headers).status_code,200)
        self.assertEqual(self.client.get('/api/waiter/roster').json[0]['status'],'OFF_SHIFT')

    def test_staff_creation_adds_waiter_to_selection(self):
        headers=self.login('manager')
        res=self.client.post('/api/auth/staff',json={'full_name':'Second Waiter','username':'second','password':'password123','role':'waiter'},headers=headers)
        self.assertEqual(res.status_code,201)
        self.assertEqual(len(self.client.get('/api/waiter-profiles').json),2)
        self.assertEqual(self.client.get('/api/waiter-profiles/available').json['total'],2)
        self.assertEqual(len(self.client.get('/api/manager/waiter-activity').json),2)

    def test_counter_payment_idempotent(self):
        order=self.order('Card'); headers=self.login()
        for _ in range(2): self.assertEqual(self.client.post(f"/api/payments/orders/{order['id']}/confirm", headers=headers).status_code,200)
        with self.app.app_context(): self.assertEqual(Receipt.query.count(),1)

    def test_missing_mpesa_config_and_forgery(self):
        order=self.order('M-Pesa')
        self.assertEqual(self.client.post('/api/payments/stk-push',json={'order_id':order['id']}).status_code,503)
        self.assertEqual(self.client.post('/api/payments/callback',json={}).status_code,403)

    @patch('app.routes.payments.get_access_token',return_value='mock-token')
    @patch('app.routes.payments.requests.post')
    def test_mocked_daraja_complete_flow(self, post, token):
        self.app.config.update(MPESA_SHORTCODE='174379',MPESA_PASSKEY='test-passkey',MPESA_CALLBACK_URL='https://example.test/api/payments/callback', MPESA_CALLBACK_SECRET='callback-secret', MPESA_CONSUMER_KEY='test', MPESA_CONSUMER_SECRET='test', MPESA_FORCE_1_KSH='false')
        order=self.order('M-Pesa')
        response=Mock(); response.json.return_value={'ResponseCode':'0','CheckoutRequestID':'test-checkout'};post.return_value=response
        res=self.client.post('/api/payments/stk-push',json={'order_id':order['id']})
        self.assertEqual(res.status_code,200,res.json)
        self.assertEqual(post.call_args.kwargs['json']['Amount'],500)
        self.assertEqual(self.client.post('/api/payments/stk-push',json={'order_id':order['id']}).status_code,409)
        callback={'Body':{'stkCallback':{'CheckoutRequestID':'test-checkout','ResultCode':0,'CallbackMetadata':{'Item':[{'Name':'Amount','Value':500},{'Name':'PhoneNumber','Value':254712345678},{'Name':'MpesaReceiptNumber','Value':'TESTRECEIPT'}]}}}}
        response.json.return_value={'ResultCode':'0'}
        for _ in range(2):
            res=self.client.post('/api/payments/callback?secret=callback-secret',json=callback)
            self.assertEqual(res.status_code,200,res.json)
        final=self.client.get(f"/api/orders/{order['id']}").json['order']
        self.assertEqual(final['paymentStatus'],'Paid');self.assertIsNotNone(final['receiptUrl'])
        with self.app.app_context(): self.assertEqual(Receipt.query.count(),1)

    @patch('app.services.notifications.requests.post')
    def test_mocked_whatsapp_once_and_failure(self, post):
        self.app.config.update(WHATSAPP_ACCESS_TOKEN='test',WHATSAPP_PHONE_NUMBER_ID='test',WHATSAPP_TEMPLATE_NAME='receipt')
        response=Mock();response.json.return_value={'messages':[{'id':'provider-1'}]};post.return_value=response
        order=self.order()
        from app.services.notifications import deliver_receipt
        with self.app.app_context():
            receipt=Receipt.query.first();self.assertEqual(receipt.notification_status,'accepted');deliver_receipt(receipt)
        self.assertEqual(post.call_count,1)
        import requests
        post.side_effect=requests.RequestException()
        self.order()
        with self.app.app_context(): self.assertEqual(Receipt.query.order_by(Receipt.id.desc()).first().notification_status,'failed')

    def test_whatsapp_signed_delivery_status(self):
        import hashlib, hmac, json
        self.app.config.update(WHATSAPP_APP_SECRET='test-secret', WHATSAPP_VERIFY_TOKEN='verify-token')
        self.order()
        with self.app.app_context():
            receipt=Receipt.query.first();receipt.notification_provider_id='message-1';receipt.notification_status='accepted';db.session.commit()
        payload=json.dumps({'entry':[{'changes':[{'value':{'statuses':[{'id':'message-1','status':'delivered'}]}}]}]})
        path='/api/receipts/whatsapp/webhook'
        self.assertEqual(self.client.post(path,data=payload,content_type='application/json').status_code,403)
        signature='sha256='+hmac.new(b'test-secret',payload.encode(),hashlib.sha256).hexdigest()
        self.assertEqual(self.client.post(path,data=payload,content_type='application/json',headers={'X-Hub-Signature-256':signature}).status_code,200)
        with self.app.app_context(): self.assertEqual(Receipt.query.first().notification_status,'delivered')
        self.assertEqual(self.client.get(path+'?hub.mode=subscribe&hub.verify_token=verify-token&hub.challenge=hello').data,b'hello')

    def test_production_cookie_security_and_cors(self):
        self.app.config.update(SESSION_COOKIE_SECURE=True,SESSION_COOKIE_SAMESITE='None')
        res=self.client.post('/api/auth/login',json={'username':'johnwaiter','password':'password123'},headers={'Origin':self.app.config['FRONTEND_ORIGIN']})
        self.assertEqual(res.status_code,200)
        cookies=res.headers.getlist('Set-Cookie')
        self.assertTrue(any('HttpOnly' in c and 'Secure' in c and 'SameSite=None' in c for c in cookies))
        response=self.client.options('/api/menu-items',headers={'Origin':'https://evil.example','Access-Control-Request-Method':'GET'})
        self.assertNotIn('Access-Control-Allow-Origin',response.headers)

    def test_qr_encodes_unpredictable_receipt_view_url(self):
        import qrcode
        order=self.order()
        with patch('qrcode.make',wraps=qrcode.make) as make:
            self.client.get(order['receiptUrl']+'/qr')
            self.assertEqual(make.call_args.args[0],self.app.config['PUBLIC_API_URL']+order['receiptUrl']+'/view')

    def test_estimates_snapshot_menu_times(self):
        order=self.order()
        self.assertEqual(order['preparationMinutes'],15)
        self.assertEqual(order['servingMinutes'],5)
        headers=self.login('manager')
        self.client.patch(f'/api/menu-items/{self.menu_item_id}',json={'preparation_time':45,'serving_time':12},headers=headers)
        saved=self.client.get(f"/api/orders/{order['id']}").json['order']
        self.assertEqual(saved['preparationMinutes'],15)
        self.assertEqual(saved['servingMinutes'],5)

    def test_invalid_times_and_unauthorized_complaints(self):
        headers=self.login('manager')
        for bad in [True,-1,1.5,1441,'fifteen']:
            self.assertEqual(self.client.patch(f'/api/menu-items/{self.menu_item_id}',json={'preparation_time':bad},headers=headers).status_code,400)
        self.assertEqual(self.client.post('/api/complaints',json={'orderId':'invalid','message':'late'}).status_code,400)
        self.assertEqual(self.client.post('/api/orders',json=self.payload(),headers={'Origin':'https://evil.example'}).status_code,403)

    def test_cancelled_and_failed_payments_never_create_receipts(self):
        from app.models import Payment
        self.app.config['MPESA_CALLBACK_SECRET']='callback-secret'
        for code, status in [(1032,'Cancelled'),(1037,'Failed')]:
            order=self.order('M-Pesa')
            checkout='checkout-'+str(code)
            with self.app.app_context():
                record=db.session.get(Order,order['id']);record.checkout_request_id=checkout
                db.session.add(Payment(order_id=record.id,checkout_request_id=checkout,amount=record.total,phone=record.phone,status='Pending'));db.session.commit()
            res=self.client.post('/api/payments/callback?secret=callback-secret',json={'Body':{'stkCallback':{'CheckoutRequestID':checkout,'ResultCode':code}}})
            self.assertEqual(res.status_code,200)
            saved=self.client.get(f"/api/orders/{order['id']}").json['order']
            self.assertEqual(saved['paymentStatus'],status);self.assertIsNone(saved['receiptUrl'])

    def test_waiter_assignment_service_and_measured_activity(self):
        order=self.order();headers=self.login()
        self.client.post('/api/waiter/shifts/start',headers=headers)
        with self.app.app_context(): ident=WaiterProfile.query.first().id
        assignment=self.client.patch(f"/api/waiter/orders/{order['id']}/assignment",json={'waiter_id':ident},headers=headers)
        self.assertEqual(assignment.status_code,200,assignment.json)
        for status in ['Preparing','Ready','Served']:
            res=self.client.patch(f"/api/waiter/orders/{order['id']}/status",json={'status':status},headers=headers)
            self.assertEqual(res.status_code,200,res.json)
        record=self.client.get('/api/waiter/record').json
        self.assertEqual(record['orders_served'],1);self.assertEqual(record['tables_served'],1)
        self.assertIsNotNone(record['average_serving_minutes'])


    def test_sensitive_url_values_are_redacted_from_access_logs(self):
        import logging
        from app.utils.logging import RedactCallbackSecret
        record=logging.LogRecord('werkzeug',logging.INFO,'',0,'GET /api/payments/callback?secret=private-secret',(),None)
        RedactCallbackSecret().filter(record)
        self.assertNotIn('private-secret',record.getMessage())
        token='a'*43
        record=logging.LogRecord('werkzeug',logging.INFO,'',0,'GET /api/receipts/'+token+'/view',(),None)
        RedactCallbackSecret().filter(record)
        self.assertNotIn(token,record.getMessage())

    def test_order_retry_key_does_not_duplicate_order_or_inventory(self):
        self.client.post('/api/orders/session')
        headers={'Idempotency-Key':'checkout-retry-key-123456'}
        for expected in [201,200]:
            res=self.client.post('/api/orders',json=self.payload(),headers=headers)
            self.assertEqual(res.status_code,expected,res.json)
        with self.app.app_context():
            self.assertEqual(Order.query.count(),1)
            self.assertEqual(db.session.get(MenuItem,self.menu_item_id).stock_quantity,9)
        changed=self.payload();changed['tableNumber']='A2'
        self.assertEqual(self.client.post('/api/orders',json=changed,headers=headers).status_code,409)
        self.assertEqual(self.app.test_client().post('/api/orders',json=self.payload(),headers=headers).status_code,409)

    def test_notification_exceptions_do_not_fail_committed_orders_or_payments(self):
        with patch('app.services.notifications.deliver_receipt',side_effect=RuntimeError('provider error')):
            order=self.order('Cash')
            self.assertEqual(self.client.get(f"/api/orders/{order['id']}").status_code,200)
            headers=self.login()
            response=self.client.post(f"/api/payments/orders/{order['id']}/confirm",headers=headers)
            self.assertEqual(response.status_code,200,response.json)
        with self.app.app_context():
            self.assertEqual(Order.query.count(),1)
            self.assertEqual(db.session.get(Order,order['id']).payment_status,'Paid')

    def test_invalid_order_inputs_and_secure_totals(self):
        variants=[({'items':[{'id':9999,'quantity':1}]},404),({'items':[{'id':self.menu_item_id,'quantity':0}]},400),({'items':[{'id':self.menu_item_id,'quantity':True}]},400),({'customerName':''},400),({'phone':''},400),({'tableNumber':'12'},400)]
        for change,status in variants:
            payload=self.payload();payload.update(change)
            self.assertEqual(self.client.post('/api/orders',json=payload).status_code,status)
        payload=self.payload();payload['items'][0]['price']=1;payload['total']=1
        self.assertEqual(self.client.post('/api/orders',json=payload).json['order']['total'],500)
        with self.app.app_context():db.session.get(MenuItem,self.menu_item_id).availability=False;db.session.commit()
        self.assertEqual(self.client.post('/api/orders',json=self.payload()).status_code,400)

    @patch('app.services.notifications.requests.post')
    def test_whatsapp_order_events_once_and_monotonic_delivery(self,post):
        import json,hashlib,hmac
        from app.services.notifications import safely_notify
        from app.models.notification import OrderNotification
        self.app.config.update(WHATSAPP_ACCESS_TOKEN='test',WHATSAPP_PHONE_NUMBER_ID='sender',WHATSAPP_ORDER_TEMPLATE_NAME='order_event',WHATSAPP_TEMPLATE_NAME=None,WHATSAPP_APP_SECRET='app-secret')
        response=Mock();response.json.return_value={'messages':[{'id':'event-message'}]};post.return_value=response
        order=self.order()
        with self.app.app_context():
            saved=db.session.get(Order,order['id']);safely_notify(saved,'order_received')
            self.assertEqual(OrderNotification.query.count(),1)
        self.assertEqual(post.call_count,1)
        for status in ['read','sent','failed','read']:
            payload=json.dumps({'entry':[{'changes':[{'value':{'statuses':[{'id':'event-message','status':status}]}}]}]})
            signature='sha256='+hmac.new(b'app-secret',payload.encode(),hashlib.sha256).hexdigest()
            self.assertEqual(self.client.post('/api/receipts/whatsapp/webhook',data=payload,content_type='application/json',headers={'X-Hub-Signature-256':signature}).status_code,200)
        with self.app.app_context():self.assertEqual(OrderNotification.query.first().status,'read')

    def test_all_bundled_dish_photographs_and_credits(self):
        from app.services.menu_images import photo_catalog
        for photo in photo_catalog():
            res=self.client.get('/api/menu-items/photos/'+photo['filename'])
            self.assertEqual(res.status_code,200)
            self.assertEqual(res.mimetype,'image/jpeg')
            self.assertTrue(res.data.startswith(b'\xff\xd8'))
        self.assertEqual(self.client.get('/api/menu-items/photo-credits').status_code,200)
        self.assertEqual(self.client.get('/api/menu-items/photos/not-a-photo.jpg').status_code,404)
        with self.app.app_context():
            menu=db.session.get(MenuItem,self.menu_item_id);menu.name='Beef Pilau';menu.image=None;db.session.commit()
        res=self.client.get('/api/menu-items').json
        self.assertEqual(res[0]['image'],'/api/menu-items/photos/beef-pilau.jpg')

    def test_webhook_secrets_and_non_ascii_signatures_are_rejected_safely(self):
        import logging
        from app.utils.logging import RedactCallbackSecret
        record=logging.LogRecord('werkzeug',logging.INFO,'',0,'GET /api/receipts/whatsapp/webhook?hub.verify_token=private-token',(),None)
        RedactCallbackSecret().filter(record)
        self.assertNotIn('private-token',record.getMessage())
        self.app.config['WHATSAPP_APP_SECRET']='test-secret'
        response=self.client.post('/api/receipts/whatsapp/webhook',json={},headers={'X-Hub-Signature-256':'sha256=é'})
        self.assertEqual(response.status_code,403)

    @patch('app.services.notifications.requests.post')
    def test_all_five_order_events_are_sent_once(self, post):
        from app.models.notification import OrderNotification
        self.app.config.update(WHATSAPP_ACCESS_TOKEN='test',WHATSAPP_PHONE_NUMBER_ID='sender',WHATSAPP_ORDER_TEMPLATE_NAME='order_event',WHATSAPP_TEMPLATE_NAME=None)
        response=Mock();response.json.side_effect=[{'messages':[{'id':f'event-{n}'}]} for n in range(5)];post.return_value=response
        order=self.order();headers=self.login()
        for _ in range(2):
            self.assertEqual(self.client.post(f"/api/payments/orders/{order['id']}/confirm",headers=headers).status_code,200)
        self.client.post('/api/waiter/shifts/start',headers=headers)
        with self.app.app_context(): ident=WaiterProfile.query.first().id
        self.client.patch(f"/api/waiter/orders/{order['id']}/assignment",json={'waiter_id':ident},headers=headers)
        for status in ['Preparing','Ready','Served']:
            response=self.client.patch(f"/api/waiter/orders/{order['id']}/status",json={'status':status},headers=headers)
            self.assertEqual(response.status_code,200,response.json)
        self.assertEqual(post.call_count,5)
        with self.app.app_context():
            records=OrderNotification.query.all()
            self.assertEqual({n.event for n in records},{'order_received','payment_confirmed','preparing','ready','completed'})
            self.assertTrue(all(n.status=='accepted' for n in records))
