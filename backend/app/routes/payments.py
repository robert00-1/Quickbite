
import base64
from datetime import datetime
from decimal import Decimal, ROUND_HALF_UP

import requests
from flask import Blueprint, current_app, jsonify, request

from app.extensions import db
from app.models import Order
from app.services.mpesa import get_access_token

payments_bp = Blueprint("payments", __name__, url_prefix="/api/payments")


def normalize_phone(phone):
    """Convert Kenyan phone numbers to 2547XXXXXXXX format."""
    phone = "".join(char for char in str(phone) if char.isdigit())

    if phone.startswith("0") and len(phone) == 10:
        phone = "254" + phone[1:]
    elif phone.startswith("7") and len(phone) == 9:
        phone = "254" + phone
    elif phone.startswith("1") and len(phone) == 9:
        phone = "254" + phone

    if len(phone) != 12 or not phone.startswith("254"):
        raise ValueError(
            "Enter a valid Kenyan phone number, such as 0712345678"
        )

    return phone


@payments_bp.route("/stk-push", methods=["POST"])
def initiate_stk_push():
    data = request.get_json(silent=True) or {}
    order_id = data.get("order_id")

    if not order_id:
        return jsonify({"error": "order_id is required"}), 400

    order = db.session.get(Order, order_id)

    if not order:
        return jsonify({"error": "Order not found"}), 404

    if order.payment_method != "M-Pesa":
        return jsonify({
            "error": "This order was not placed using M-Pesa"
        }), 400

    if order.payment_status == "Paid":
        return jsonify({"error": "This order is already paid"}), 409

    if order.checkout_request_id:
        return jsonify({
            "error": "An M-Pesa payment request already exists for this order"
        }), 409

    shortcode = current_app.config.get("MPESA_SHORTCODE")
    passkey = current_app.config.get("MPESA_PASSKEY")
    callback_url = current_app.config.get("MPESA_CALLBACK_URL")

    if not shortcode or not passkey or not callback_url:
        return jsonify({
            "error": "M-Pesa shortcode, passkey, or callback URL is not configured"
        }), 500

    try:
        phone = normalize_phone(order.phone)

        amount = 1

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
            "CallBackURL": callback_url,
            "AccountReference": f"QuickBite{order.id}",
            "TransactionDesc": f"QuickBite order {order.id}",
        }

        response = requests.post(
            "https://sandbox.safaricom.co.ke/mpesa/stkpush/v1/processrequest",
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

        order.checkout_request_id = result.get("CheckoutRequestID")
        order.payment_status = "Pending"
        db.session.commit()

        current_app.logger.info(
    "STK Push accepted: order_id=%s checkout_request_id=%s callback_url=%s",
    order.id,
    order.checkout_request_id,
    callback_url,
)

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
    callback_data = request.get_json(silent=True) or {}
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

    if not checkout_request_id or result_code is None:
        return jsonify({"Result": "Invalid callback"}), 400

    order = Order.query.filter_by(
        checkout_request_id=checkout_request_id
    ).first()

    if not order:
        current_app.logger.warning(
            "M-Pesa callback did not match an order: %s",
            checkout_request_id,
        )
        # Acknowledge the callback without changing any order.
        return jsonify({"Result": "Callback received"}), 200

    if order.payment_status == "Paid":
        return jsonify({"Result": "Callback already processed"}), 200

    if str(result_code) == "0":
        metadata_items = (
            stk_callback.get("CallbackMetadata", {}).get("Item", [])
        )
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

        order.payment_status = "Paid"
        order.mpesa_receipt_number = receipt

        current_app.logger.info(
            "M-Pesa payment successful: order_id=%s receipt=%s",
            order.id,
            receipt,
        )
    else:
        order.payment_status = "Failed"

        current_app.logger.warning(
            "M-Pesa payment failed: order_id=%s result_code=%s",
            order.id,
            result_code,
        )

    db.session.commit()

    return jsonify({"Result": "Callback received"}), 200
