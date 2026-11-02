"""Browser-origin regression tests use only isolated databases."""
import os
from unittest.mock import patch
import unittest
from app import create_app
from tests import test_api


class OriginTests(unittest.TestCase):
    setUp = test_api.QuickBiteApiTestCase.setUp
    tearDown = test_api.QuickBiteApiTestCase.tearDown

    def test_all_payment_methods_accept_vite_alternate_ports(self):
        for origin in ['http://localhost:5174','http://127.0.0.1:5175','http://[::1]:5176']:
            response=self.client.post('/api/orders/session',headers={'Origin':origin})
            self.assertEqual(response.status_code,200,response.json)
            self.assertEqual(response.headers['Access-Control-Allow-Origin'],origin)
            for method in ['Cash','Card','M-Pesa']:
                payload={'customerName':'Origin Guest','phone':'0712345678','tableNumber':'A1','paymentMethod':method,'items':[{'id':self.menu_item_id,'quantity':1}]}
                response=self.client.post('/api/orders',json=payload,headers={'Origin':origin})
                self.assertEqual(response.status_code,201,response.json)
                self.assertEqual(response.json['order']['paymentMethod'],method)
                self.assertEqual(response.json['order']['paymentStatus'],'Pending')
                self.assertEqual(response.headers['Access-Control-Allow-Origin'],origin)

    def test_staff_login_and_csrf_work_on_alternate_port(self):
        origin='http://localhost:5174'
        response=self.client.post('/api/auth/login',json={'username':'johnwaiter','password':'password123'},headers={'Origin':origin})
        self.assertEqual(response.status_code,200,response.json)
        self.assertEqual(response.headers['Access-Control-Allow-Origin'],origin)
        headers={'Origin':origin,'X-CSRF-Token':response.json['csrf_token']}
        self.assertEqual(self.client.post('/api/waiter/shifts/start',headers=headers).status_code,201)
        self.assertEqual(self.client.post('/api/waiter/shifts/end',headers={'Origin':origin}).status_code,403)
        self.assertEqual(self.client.get('/api/manager/dashboard').status_code,403)

    def test_untrusted_and_spoofed_loopback_origins_stay_blocked(self):
        for origin in ['https://evil.example','http://localhost.evil.example:5174','http://localhost:99999','http://127.0.0.1.evil.example:5173','null']:
            response=self.client.post('/api/orders/session',headers={'Origin':origin})
            self.assertEqual(response.status_code,403,(origin,response.json))
            self.assertNotIn('Access-Control-Allow-Origin',response.headers)
            response=self.client.post('/api/auth/login',json={'username':'johnwaiter','password':'password123'},headers={'Origin':origin})
            self.assertEqual(response.status_code,403)

    def test_explicit_additional_origins_and_production_cors(self):
        overrides={'TESTING':True,'APP_ENV':'production','SECRET_KEY':'test-production-secret-at-least-32-characters','JWT_SECRET_KEY':'test-production-jwt-secret-at-least-32-characters','SESSION_COOKIE_SECURE':True,'SQLALCHEMY_DATABASE_URI':'sqlite:///:memory:','FRONTEND_ORIGIN':'https://restaurant.example','FRONTEND_ORIGINS':'https://staff.restaurant.example, https://preview.example/'}
        with patch.dict(os.environ,{'SECRET_KEY':overrides['SECRET_KEY']}):
            app=create_app(overrides)
        client=app.test_client()
        for origin in ['https://restaurant.example','https://staff.restaurant.example','https://preview.example']:
            response=client.options('/api/orders/session',headers={'Origin':origin,'Access-Control-Request-Method':'POST','Access-Control-Request-Headers':'Idempotency-Key'})
            self.assertEqual(response.headers['Access-Control-Allow-Origin'],origin)
            self.assertIn('Idempotency-Key',response.headers['Access-Control-Allow-Headers'])
        for origin in ['http://localhost:5174','http://127.0.0.1:5173','https://evil.example']:
            response=client.post('/api/orders/session',headers={'Origin':origin})
            self.assertEqual(response.status_code,403)
            self.assertNotIn('Access-Control-Allow-Origin',response.headers)

    def test_production_without_secure_cookie_override_does_not_enable_loopback(self):
        from app.utils.origins import origin_is_allowed
        config={**self.app.config,'APP_ENV':'production','SESSION_COOKIE_SECURE':False}
        self.assertFalse(origin_is_allowed('http://localhost:5174',config))
