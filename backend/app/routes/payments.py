
import base64
from datetime import datetime
from decimal import Decimal, ROUND_HALF_UP

import requests
from flask import Blueprint, current_app, jsonify, request
import hmac
from ..utils.customer import owns_order
from ..utils.auth import staff_required
from ..services.notifications import confirm_receipt, deliver_receipt

from ..extensions import db
from ..models import Order, Payment
from ..services.mpesa import get_access_token

payments_bp = Blueprint("payments", __name__, url_prefix="/api/payments")


def normalize_phone(phone):
    """Convert Kenyan phone numbers to 2547XXXXXXXX format."""
    import re
    if not re.fullmatch(r"[+0-9 ()-]+", str(phone)):
        raise ValueError("Enter a valid Kenyan phone number")
    phone = "".join(char for char in str(phone) if char.isdigit())

    if phone.startswith("0") and len(phone) == 10:
        phone = "254" + phone[1:]
    elif phone.startswith("7") and len(phone) == 9:
        phone = "254" + phone
    elif phone.startswith("1") and len(phone) == 9:
        phone = "254" + phone

    if len(phone) != 12 or not phone.startswith(("2547", "2541")):
        raise ValueError(
            "Enter a valid Kenyan phone number, such as 0712345678"
        )

    return phone


@payments_bp.route("/stk-push", methods=["POST"])
def initiate_stk_push():
    data = request.get_json(silent=True) or {}
    if not isinstance(data, dict):
        return jsonify({"error": "JSON object required"}), 400
    order_id = data.get("order_id")

    if type(order_id) is not int or order_id < 1:
        return jsonify({"error": "order_id is required"}), 400

    order = Order.query.filter_by(id=order_id).with_for_update().first()

    if not order:
        return jsonify({"error": "Order not found"}), 404

    if not owns_order(order):
        return jsonify({"error": "Order not found"}), 404

    if order.payment_method != "M-Pesa":
        return jsonify({
            "error": "This order was not placed using M-Pesa"
        }), 400

    if order.payment_status == "Paid":
        return jsonify({"error": "This order is already paid"}), 409

    # Only reject if an active pending request was created very recently (< 60s)
    # otherwise allow retry.
    if order.checkout_request_id and order.payment_status == "Pending":
        return jsonify({
            "error": "A payment request is pending. Check its status before retrying."
        }), 409

    shortcode = current_app.config.get("MPESA_SHORTCODE")
    passkey = current_app.config.get("MPESA_PASSKEY")
    callback_url = current_app.config.get("MPESA_CALLBACK_URL")

    if not all([shortcode, passkey, callback_url, current_app.config.get("MPESA_CALLBACK_SECRET"), current_app.config.get("MPESA_CONSUMER_KEY"), current_app.config.get("MPESA_CONSUMER_SECRET")]):
        return jsonify({
            "error": "M-Pesa requires MPESA_CONSUMER_KEY, MPESA_CONSUMER_SECRET, MPESA_SHORTCODE, MPESA_PASSKEY, MPESA_CALLBACK_URL and MPESA_CALLBACK_SECRET"
        }), 500

    try:
        if not callback_url.startswith("https://"):
            raise ValueError("MPESA_CALLBACK_URL must be a publicly reachable HTTPS URL")
        phone = normalize_phone(order.phone)

        # Allow forcing 1 KSh in sandbox testing via MPESA_FORCE_1_KSH (default: True in dev)
        force_one = str(current_app.config.get("MPESA_FORCE_1_KSH", "false")).lower() == "true"
        if force_one and current_app.config.get("MPESA_ENVIRONMENT") == "production":
            raise ValueError("MPESA_FORCE_1_KSH is only permitted in sandbox")
        amount = 1 if force_one else int(Decimal(order.total).quantize(Decimal("1"), rounding=ROUND_HALF_UP))

        if amount < 1:
            return jsonify({"error": "Order amount must be at least KSh 1"}), 400

        timestamp = datetime.now().strftime("%Y%m%d%H%M%S")
        password = base64.b64encode(
            f"{shortcode}{passkey}{timestamp}".encode()
        ).decode()

        access_token = get_access_token()

        payload = {
            "BusinessShortCode": shortcode,
            "Password": password,
            "Timestamp": timestamp,
            "TransactionType": current_app.config.get(
                "MPESA_TRANSACTION_TYPE", "CustomerPayBillOnline"
            ),
            "Amount": amount,
            "PartyA": phone,
            "PartyB": shortcode,
            "PhoneNumber": phone,
            "CallBackURL": callback_url + ("&" if "?" in callback_url else "?") + "secret=" + current_app.config["MPESA_CALLBACK_SECRET"],
            "AccountReference": f"QuickBite{order.id}",
            "TransactionDesc": f"QuickBite order {order.id}",
        }

        env = current_app.config.get("MPESA_ENVIRONMENT", "sandbox").lower()
        domain = (
            "https://api.safaricom.co.ke"
            if env == "production"
            else "https://sandbox.safaricom.co.ke"
        )
        stk_url = f"{domain}/mpesa/stkpush/v1/processrequest"

        response = requests.post(
            stk_url,
            json=payload,
            headers={"Authorization": f"Bearer {access_token}"},
            timeout=30,
        )
        response.raise_for_status()
        result = response.json()

        if str(result.get("ResponseCode")) != "0":
            return jsonify({
                "error": "Safaricom did not accept the STK Push request",
                "details": result.get("ResponseDescription")
                or result.get("errorMessage")
                or "Request rejected",
            }), 502

        if not isinstance(result.get("CheckoutRequestID"), str) or not result["CheckoutRequestID"]:
            return jsonify({"error": "Daraja returned no checkout identifier"}), 502
        order.checkout_request_id = result["CheckoutRequestID"]
        db.session.add(Payment(order_id=order.id, checkout_request_id=order.checkout_request_id, amount=amount, phone=phone, status="Pending"))
        order.payment_status = "Pending"
        db.session.commit()

        return jsonify({
            "message": "STK Push sent. Check the customer's phone.",
            "order_id": order.id,
            "checkout_request_id": order.checkout_request_id,
            "customer_message": result.get("CustomerMessage"),
            "payment_status": order.payment_status,
        }), 200

    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400
    except requests.RequestException:
        db.session.rollback()
        current_app.logger.exception("M-Pesa STK Push request failed")
        return jsonify({
            "error": "Could not reach Safaricom. Please try again."
        }), 502
    except Exception:
        db.session.rollback()
        current_app.logger.exception("Unexpected STK Push error")
        return jsonify({"error": "Could not initiate payment"}), 500


@payments_bp.route("/callback", methods=["POST"])
def mpesa_callback():
    expected_secret = current_app.config.get("MPESA_CALLBACK_SECRET")
    if not expected_secret or not hmac.compare_digest(request.args.get("secret", ""), expected_secret):
        return jsonify({"error": "Invalid callback credential"}), 403
    callback_data = request.get_json(silent=True) or {}
    if not isinstance(callback_data, dict) or not isinstance(callback_data.get("Body"), dict) or not isinstance(callback_data["Body"].get("stkCallback"), dict):
        return jsonify({"error": "Invalid callback"}), 400
    stk_callback = (
        callback_data.get("Body", {}).get("stkCallback", {})
    )

    checkout_request_id = stk_callback.get("CheckoutRequestID")
    result_code = stk_callback.get("ResultCode")
    current_app.logger.info(
    "M-Pesa callback received: checkout_request_id=%s result_code=%s",
    checkout_request_id,
    result_code,
)

    if not isinstance(checkout_request_id, str) or not checkout_request_id or result_code is None or not str(result_code).isdigit():
        return jsonify({"Result": "Invalid callback"}), 400

    order = Order.query.filter_by(
        checkout_request_id=checkout_request_id
    ).with_for_update().first()

    if not order:
        current_app.logger.warning(
            "M-Pesa callback did not match an order: %s",
            checkout_request_id,
        )
        # Acknowledge the callback without changing any order.
        return jsonify({"Result": "Callback received"}), 200

    if order.payment_status == "Paid":
        return jsonify({"Result": "Callback already processed"}), 200
    payment = Payment.query.filter_by(checkout_request_id=checkout_request_id).first()
    if payment is None:
        return jsonify({"error": "No recorded payment attempt"}), 409

    if str(result_code) == "0":
        callback_metadata = stk_callback.get("CallbackMetadata")
        if not isinstance(callback_metadata, dict):
            return jsonify({"error": "Payment metadata missing"}), 400
        metadata_items = callback_metadata.get("Item", [])
        if not isinstance(metadata_items, list) or not all(isinstance(i, dict) for i in metadata_items):
            return jsonify({"error": "Invalid payment metadata"}), 400
        metadata = {
            item.get("Name"): item.get("Value")
            for item in metadata_items
            if item.get("Name")
        }

        receipt = metadata.get("MpesaReceiptNumber")
        if not receipt:
            current_app.logger.warning(
                "Successful callback has no receipt number for order %s",
                order.id,
            )
            return jsonify({"Result": "Receipt missing"}), 200

        try:
            expected_amount = Decimal(payment.amount)
            if Decimal(str(metadata.get("Amount"))) != expected_amount or normalize_phone(metadata.get("PhoneNumber")) != payment.phone:
                return jsonify({"error": "Payment amount or phone does not match"}), 400
            # Independently verify success with Daraja before accepting callback data.
            shortcode = current_app.config["MPESA_SHORTCODE"]
            timestamp = datetime.now().strftime("%Y%m%d%H%M%S")
            password = base64.b64encode(f"{shortcode}{current_app.config['MPESA_PASSKEY']}{timestamp}".encode()).decode()
            domain = "https://api.safaricom.co.ke" if current_app.config.get("MPESA_ENVIRONMENT") == "production" else "https://sandbox.safaricom.co.ke"
            verified = requests.post(domain + "/mpesa/stkpushquery/v1/query", headers={"Authorization": "Bearer " + get_access_token()}, json={"BusinessShortCode": shortcode, "Password": password, "Timestamp": timestamp, "CheckoutRequestID": checkout_request_id}, timeout=20)
            verified.raise_for_status()
            if str(verified.json().get("ResultCode")) != "0":
                return jsonify({"error": "Payment has not been verified by Daraja"}), 409
        except (ValueError, TypeError, ArithmeticError, requests.RequestException):
            return jsonify({"error": "Unable to verify payment"}), 502
        duplicate = Order.query.filter(Order.mpesa_receipt_number == receipt, Order.id != order.id).first()
        if duplicate:
            return jsonify({"error": "Receipt already used"}), 409
        order.payment_status = "Paid"
        confirm_receipt(order)
        order.mpesa_receipt_number = receipt

        current_app.logger.info(
            "M-Pesa payment successful: order_id=%s receipt=%s",
            order.id,
            receipt,
        )
    else:
        order.payment_status = "Cancelled" if str(result_code) == "1032" else "Failed"

        current_app.logger.warning(
            "M-Pesa payment failed: order_id=%s result_code=%s",
            order.id,
            result_code,
        )

    payment.status = order.payment_status
    db.session.commit()
    if order.receipt:
        deliver_receipt(order.receipt)

    return jsonify({"Result": "Callback received"}), 200


@payments_bp.post('/orders/<int:order_id>/confirm')
@staff_required('waiter', 'manager')
def confirm_counter_payment(order_id):
    order = db.get_or_404(Order, order_id)
    if order.payment_method not in ('Cash', 'Card'):
        return jsonify({'error': 'M-Pesa must be confirmed by Daraja'}), 400
    order.payment_status = 'Paid'
    receipt = confirm_receipt(order)
    db.session.commit()
    deliver_receipt(receipt)
    return jsonify({'message': 'Payment confirmed', 'payment_status': order.payment_status}), 200
