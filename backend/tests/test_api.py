import json
import os
import unittest
from decimal import Decimal
from werkzeug.security import generate_password_hash

from app import create_app
from app.extensions import db
from app.models.menu_item import MenuItem
from app.models.order import Order
from app.models.receipt import Receipt
from app.models.user import User
from app.models.waiter_profile import WaiterProfile
from app.models.weekly_shift import WeeklyShift


class QuickBiteApiTestCase(unittest.TestCase):
    def setUp(self):
        test_url = os.getenv("QUICKBITE_TEST_DATABASE_URL", "")
        from sqlalchemy.engine import make_url
        if test_url and make_url(test_url).database != "quickbite_test":
            raise RuntimeError("Tests require a dedicated database named quickbite_test")
        self.app = create_app({
            "TESTING": True,
            "MEALDB_ENABLED": False,
            "MPESA_CONSUMER_KEY": None,
            "MPESA_CONSUMER_SECRET": None,
            "MPESA_SHORTCODE": None,
            "MPESA_PASSKEY": None,
            "MPESA_CALLBACK_URL": None,
            "MPESA_CALLBACK_SECRET": None,
            "WHATSAPP_ACCESS_TOKEN": None,
            "WHATSAPP_PHONE_NUMBER_ID": None,
            "WHATSAPP_TEMPLATE_NAME": None,
            "WHATSAPP_ORDER_TEMPLATE_NAME": None,
            "SQLALCHEMY_DATABASE_URI": os.getenv("QUICKBITE_TEST_DATABASE_URL", "sqlite:///:memory:"),
            "SECRET_KEY": "test-secret-key-32-characters-long-enough",
            "JWT_SECRET_KEY": "test-jwt-secret-key-32-characters-long-enough",
            "SESSION_COOKIE_SECURE": False,
            "WTF_CSRF_ENABLED": False,
        })
        self.client = self.app.test_client()

        with self.app.app_context():
            db.create_all()

            # Seed a sample menu item
            self.menu_item = MenuItem(
                name="Spicy Burger",
                description="Delicious beef burger",
                price=500.0,
                category="Main Course",
                ingredients=["Beef", "Bun", "Sauce"],
                availability=True,
                stock_quantity=10,
                preparation_time=15,
                serving_time=5,
            )
            db.session.add(self.menu_item)

            # Seed a waiter staff user
            self.waiter_user = User(
                full_name="John Waiter",
                username="johnwaiter",
                password_hash=generate_password_hash("password123"),
                role="waiter",
                is_active=True,
            )
            db.session.add(self.waiter_user)

            self.waiter_profile = WaiterProfile(
                full_name="John Waiter",
                is_active=True,
            )
            db.session.add(self.waiter_profile)

            db.session.flush()
            self.waiter_profile.user_id = self.waiter_user.id
            db.session.commit()
            self.menu_item_id = self.menu_item.id

    def tearDown(self):
        with self.app.app_context():
            db.session.remove()
            db.drop_all()
            db.engine.dispose()

    def test_get_menu_items(self):
        response = self.client.get("/api/menu-items")
        self.assertEqual(response.status_code, 200)
        data = response.get_json()
        self.assertIsInstance(data, list)
        self.assertGreaterEqual(len(data), 1)
        self.assertEqual(data[0]["name"], "Spicy Burger")
        self.assertEqual(data[0]["preparation_time"], 15)
        self.assertEqual(data[0]["serving_time"], 5)

    def test_create_order_and_digital_receipt(self):
        payload = {
            "customerName": "Alice Johnson",
            "phone": "0712345678",
            "tableNumber": "A12",
            "paymentMethod": "Cash",
            "paymentStatus": "Paid",
            "items": [{"id": self.menu_item_id, "quantity": 2}],
        }
        response = self.client.post("/api/orders", json=payload)
        self.assertEqual(response.status_code, 201)
        data = response.get_json()
        order = data["order"]

        self.assertEqual(order["customerName"], "Alice Johnson")
        self.assertEqual(order["tableNumber"], "A12")
        self.assertEqual(order["paymentStatus"], "Pending")
        self.assertEqual(order["total"], 1000.0)
        self.assertIsNotNone(order.get("receiptUrl"))

        # Verify stock was decremented from 10 to 8
        with self.app.app_context():
            item = db.session.get(MenuItem, self.menu_item_id)
            self.assertEqual(item.stock_quantity, 8)

        # Verify digital receipt URL retrieval
        receipt_url = order["receiptUrl"]
        receipt_res = self.client.get(receipt_url)
        self.assertEqual(receipt_res.status_code, 200)
        receipt_data = receipt_res.get_json()
        self.assertEqual(receipt_data["order"]["customerName"], "Alice Johnson")
        self.assertEqual(receipt_data["order"]["tableNumber"], "A12")
        self.assertEqual(len(receipt_data["order"]["items"]), 1)
        self.assertEqual(receipt_data["order"]["items"][0]["quantity"], 2)

    def test_insufficient_stock_rejection(self):
        payload = {
            "customerName": "Bob",
            "phone": "0712345678",
            "tableNumber": "A5",
            "paymentMethod": "Cash",
            "items": [{"id": self.menu_item_id, "quantity": 20}],
        }
        response = self.client.post("/api/orders", json=payload)
        self.assertEqual(response.status_code, 400)
        data = response.get_json()
        self.assertIn("Not enough stock", data.get("error", ""))

    def test_table_number_validation(self):
        # Valid table numbers
        for valid_table in ["A1", "B12", "C7", "D10"]:
            payload = {
                "customerName": "Test Customer",
                "phone": "0712345678",
                "tableNumber": valid_table,
                "paymentMethod": "Cash",
                "items": [{"id": self.menu_item_id, "quantity": 1}],
            }
            res = self.client.post("/api/orders", json=payload)
            self.assertEqual(res.status_code, 201, f"Failed for valid table: {valid_table}")

        # Invalid table numbers
        for invalid_table in ["INVALID", "A1000", "#1", "", "7", "100", "A0"]:
            payload = {
                "customerName": "Test Customer",
                "phone": "0712345678",
                "tableNumber": invalid_table,
                "paymentMethod": "Cash",
                "items": [{"id": self.menu_item_id, "quantity": 1}],
            }
            res = self.client.post("/api/orders", json=payload)
            self.assertEqual(res.status_code, 400, f"Expected 400 for table: {invalid_table}")

    def test_staff_login_and_waiter_shifts(self):
        # Login
        login_res = self.client.post(
            "/api/auth/login",
            json={"username": "johnwaiter", "password": "password123"},
            headers={"Origin": "http://localhost:5173"},
        )
        self.assertEqual(login_res.status_code, 200)
        login_data = login_res.get_json()
        self.assertEqual(login_data["user"]["role"], "waiter")
        csrf_token = login_data["csrf_token"]

        headers = {
            "Origin": "http://localhost:5173",
            "X-CSRF-Token": csrf_token,
        }

        # Start Shift
        start_res = self.client.post("/api/waiter/shifts/start", json={}, headers=headers)
        self.assertEqual(start_res.status_code, 201)

        # Get Waiter Record
        record_res = self.client.get("/api/waiter/record", headers=headers)
        self.assertEqual(record_res.status_code, 200)
        record_data = record_res.get_json()
        self.assertEqual(record_data["waiter_name"], "John Waiter")
        self.assertEqual(len(record_data["shifts"]), 1)
        self.assertTrue(record_data["shifts"][0]["is_active"])

        # End Shift
        end_res = self.client.post("/api/waiter/shifts/end", json={}, headers=headers)
        self.assertEqual(end_res.status_code, 200)

        # Get Roster
        roster_res = self.client.get("/api/waiter/roster", headers=headers)
        self.assertEqual(roster_res.status_code, 200)


if __name__ == "__main__":
    unittest.main()

