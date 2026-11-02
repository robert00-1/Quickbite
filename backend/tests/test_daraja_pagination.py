"""Isolated regression coverage for payment validation and menu pagination."""
import unittest
from decimal import Decimal
from tests import test_features as fixtures
from app.services.mpesa import normalize_phone, payment_amount, DarajaError, callback_url


class DarajaPaginationTests(unittest.TestCase):
    setUp = fixtures.FeatureTests.setUp
    tearDown = fixtures.FeatureTests.tearDown

    def test_phone_formats_and_rejections(self):
        for value in ['0712345678', '+254712345678', '712345678', '254712345678']:
            self.assertEqual(normalize_phone(value), '254712345678')
        self.assertEqual(normalize_phone('0112345678'), '254112345678')
        for value in ['123', '254999999999', '07123456789']:
            with self.assertRaises(ValueError):
                normalize_phone(value)

    def test_amount_and_callback_validation(self):
        with self.app.app_context():
            self.assertEqual(payment_amount(Decimal('500')), 500)
            for value in ['0', '-1', 'NaN', '1.50']:
                with self.assertRaises(DarajaError):
                    payment_amount(value)
            with self.assertRaises(DarajaError):
                callback_url({'callback': 'http://localhost/callback', 'callback_secret': 'test'})

    def test_optional_menu_pagination_preserves_legacy(self):
        legacy = self.client.get('/api/menu-items').json
        page = self.client.get('/api/menu-items?page=1&per_page=10')
        self.assertEqual(page.status_code, 200)
        self.assertEqual(page.json['items'], legacy)
        self.assertEqual(page.json['pagination']['total'], len(legacy))
        self.assertEqual(self.client.get('/api/menu-items?page=0').status_code, 400)
        self.assertEqual(self.client.get('/api/menu-items?per_page=101').status_code, 400)
        self.assertEqual(self.client.get('/api/menu-items?page=999').json['items'], [])

    payload = fixtures.FeatureTests.payload
    order = fixtures.FeatureTests.order

    def test_timeout_blocks_duplicate_push(self):
        from unittest.mock import patch
        import requests
        self.app.config.update(DARAJA_ENV='sandbox', DARAJA_CONSUMER_KEY='test-key',
            DARAJA_CONSUMER_SECRET='test-secret', DARAJA_SHORTCODE='174379',
            DARAJA_PASSKEY='test-passkey', DARAJA_CALLBACK_SECRET='callback-secret',
            DARAJA_CALLBACK_URL='https://example.test/api/mpesa/callback')
        order = self.order('M-Pesa')
        with patch('app.routes.payments.get_access_token', return_value='test-token'), patch('app.routes.payments.requests.post', side_effect=requests.Timeout()) as post:
            first = self.client.post('/api/mpesa/stk-push', json={'order_id': order['id']})
            self.assertEqual(first.status_code, 502)
            self.assertEqual(first.json['code'], 'payment_outcome_unknown')
            self.assertEqual(self.client.post('/api/mpesa/stk-push', json={'order_id': order['id']}).status_code, 409)
            self.assertEqual(post.call_count, 1)
        final = self.client.get(f"/api/orders/{order['id']}").json['order']
        self.assertEqual(final['paymentStatus'], 'Pending')
