import hmac
import re
import secrets
from decimal import Decimal, InvalidOperation
import requests
from flask import Blueprint, current_app, jsonify, request
from sqlalchemy.exc import SQLAlchemyError
from ..utils.customer import owns_order
from ..utils.auth import staff_required
from ..services.notifications import confirm_receipt, safely_notify
from ..extensions import db
from ..models import Order, Payment
from ..services.mpesa import get_access_token, normalize_phone, configuration, stk_payload, password_fields, DarajaError

payments_bp = Blueprint('payments', __name__, url_prefix='/api/payments')
mpesa_bp = Blueprint('mpesa', __name__, url_prefix='/api/mpesa')
ACTIVE = ('Initiating', 'Pending', 'Unknown')
TERMINAL = ('Paid', 'Failed', 'Cancelled')


def error(message, code, status):
    return jsonify({'error': message, 'code': code}), status


def mark_attempt(payment_id, status):
    payment = db.session.get(Payment, payment_id)
    if payment and payment.status in ACTIVE:
        payment.status = status
        order = db.session.get(Order, payment.order_id)
        if status == 'Failed' and order.checkout_request_id == payment.checkout_request_id and order.payment_status != 'Paid':
            order.payment_status = 'Failed'
        db.session.commit()


@payments_bp.post('/stk-push')
@mpesa_bp.post('/stk-push')
def initiate_stk_push():
    data = request.get_json(silent=True)
    if not isinstance(data, dict) or type(data.get('order_id')) is not int or data['order_id'] < 1:
        return error('A valid order_id is required.', 'invalid_order', 400)
    order = Order.query.filter_by(id=data['order_id']).with_for_update().first()
    if order is None or not owns_order(order):
        return error('Order not found.', 'order_not_found', 404)
    if order.payment_method != 'M-Pesa':
        return error('This order was not placed using M-Pesa.', 'invalid_payment_method', 400)
    if order.payment_status == 'Paid':
        return error('This order is already paid.', 'already_paid', 409)
    if Payment.query.filter(Payment.order_id == order.id, Payment.status.in_(ACTIVE)).first():
        return error('A payment request is pending or awaiting reconciliation. Check its status before retrying.', 'payment_pending', 409)
    try:
        payload = stk_payload(order, data.get('phone', order.phone))
    except DarajaError as exc:
        return error(str(exc), exc.code, exc.status)

    # Claim once in a short transaction, before any external STK call. A timeout
    # cannot turn into a blind retry that sends another prompt/charge.
    previous = order.checkout_request_id
    reservation = 'init_' + secrets.token_hex(20)
    order_id = order.id
    try:
        claimed = Order.query.filter(Order.id == order_id, Order.checkout_request_id == previous, Order.payment_status != 'Paid').update({'checkout_request_id': reservation, 'payment_status': 'Pending'}, synchronize_session=False)
        if not claimed:
            db.session.rollback()
            return error('Another payment request is in progress.', 'payment_pending', 409)
        payment = Payment(order_id=order_id, checkout_request_id=reservation, amount=payload['Amount'], phone=payload['PhoneNumber'], status='Initiating')
        db.session.add(payment)
        db.session.commit()
        payment_id = payment.id
    except SQLAlchemyError:
        db.session.rollback()
        return error('Unable to start the payment request. Please retry.', 'payment_start_failed', 503)
    try:
        token = get_access_token()
    except DarajaError as exc:
        mark_attempt(payment_id, 'Failed')
        return error(str(exc), exc.code, exc.status)
    try:
        response = requests.post(configuration()['domain'] + '/mpesa/stkpush/v1/processrequest', json=payload, headers={'Authorization': f'Bearer {token}'}, timeout=30)
        response.raise_for_status()
        result = response.json()
        if not isinstance(result, dict):
            raise ValueError()
        if str(result.get('ResponseCode')) != '0':
            mark_attempt(payment_id, 'Failed')
            return error('Daraja rejected the payment request. Please retry or ask restaurant staff for help.', 'stk_rejected', 502)
        checkout = result.get('CheckoutRequestID')
        if not isinstance(checkout, str) or not 1 <= len(checkout) <= 100:
            raise ValueError()
        # Re-read after the HTTP call; callback may already have completed it.
        order = Order.query.filter_by(id=order_id).with_for_update().one()
        payment = db.session.get(Payment, payment_id)
        order.checkout_request_id = checkout
        payment.checkout_request_id = checkout
        if payment.status == 'Initiating':
            payment.status = 'Pending'
        db.session.commit()
        return jsonify({'message': 'M-Pesa request accepted; payment is pending.', 'order_id': order_id, 'payment_status': order.payment_status}), 200
    except requests.HTTPError as exc:
        db.session.rollback()
        rejected = exc.response is not None and exc.response.status_code in (400, 401, 403, 404, 422)
        mark_attempt(payment_id, 'Failed' if rejected else 'Unknown')
        return error('Daraja rejected the request. Please check the phone number or ask restaurant staff to check payment configuration.' if rejected else 'Daraja outcome is unknown. Do not pay again until staff reconcile it.', 'stk_rejected' if rejected else 'payment_outcome_unknown', 502)
    except (requests.RequestException, ValueError, TypeError):
        db.session.rollback()
        mark_attempt(payment_id, 'Unknown')
        return error('Daraja did not return a confirmed response. Do not pay again yet; check the order status or ask staff to reconcile it.', 'payment_outcome_unknown', 502)
    except SQLAlchemyError:
        db.session.rollback()
        return error('The payment request needs reconciliation. Do not send another payment.', 'payment_outcome_unknown', 503)


def parse_callback(data):
    if not isinstance(data, dict) or not isinstance(data.get('Body'), dict) or not isinstance(data['Body'].get('stkCallback'), dict):
        raise ValueError()
    callback = data['Body']['stkCallback']
    checkout = callback.get('CheckoutRequestID')
    code = callback.get('ResultCode')
    if not isinstance(checkout, str) or not checkout or len(checkout) > 100 or type(code) not in (int, str) or not str(code).isdigit():
        raise ValueError()
    return callback, checkout, int(code)


@payments_bp.post('/callback')
@mpesa_bp.post('/callback')
def mpesa_callback():
    try:
        config = configuration()
    except DarajaError as exc:
        return error(str(exc), exc.code, 503)
    secret = config['callback_secret']
    if not secret or not hmac.compare_digest(request.args.get('secret', '').encode(), str(secret).encode()):
        return error('Invalid callback credential.', 'invalid_callback', 403)
    try:
        callback, checkout, code = parse_callback(request.get_json(silent=True))
    except ValueError:
        return error('Invalid callback.', 'invalid_callback', 400)
    payment = Payment.query.filter_by(checkout_request_id=checkout).first()
    if payment is None:
        # A callback can beat the initial response; retry after the request ID is saved.
        if Payment.query.filter_by(status='Initiating').first():
            return error('Payment request is still being recorded.', 'payment_recording', 503)
        return jsonify({'Result': 'Callback received'}), 200
    if payment.status in TERMINAL:
        return jsonify({'Result': 'Callback already processed'}), 200
    payment_id, order_id = payment.id, payment.order_id
    expected_amount, expected_phone = Decimal(payment.amount), payment.phone
    receipt = None
    if code == 0:
        metadata = callback.get('CallbackMetadata')
        values = metadata.get('Item') if isinstance(metadata, dict) else None
        if not isinstance(values, list) or not all(isinstance(value, dict) and isinstance(value.get('Name'), str) for value in values):
            return error('Payment metadata is missing or invalid.', 'invalid_callback', 400)
        fields = {value['Name']: value.get('Value') for value in values}
        if len(fields) != len(values):
            return error('Payment metadata is duplicated.', 'invalid_callback', 400)
        receipt = fields.get('MpesaReceiptNumber')
        try:
            amount = Decimal(str(fields.get('Amount')))
            phone = normalize_phone(fields.get('PhoneNumber'))
        except (InvalidOperation, ValueError):
            return error('Payment amount or phone is invalid.', 'invalid_callback', 400)
        if not amount.is_finite() or amount != expected_amount or phone != expected_phone or not isinstance(receipt, str) or not re.fullmatch(r'[A-Za-z0-9]{6,32}', receipt):
            return error('Payment details do not match the recorded request.', 'payment_mismatch', 400)
        # Never accept an unverified success, even when callback credentials match.
        try:
            timestamp, password = password_fields(config)
            response = requests.post(config['domain'] + '/mpesa/stkpushquery/v1/query', headers={'Authorization': 'Bearer ' + get_access_token()}, json={'BusinessShortCode': config['shortcode'], 'Password': password, 'Timestamp': timestamp, 'CheckoutRequestID': checkout}, timeout=20)
            response.raise_for_status()
            result = response.json()
            if not isinstance(result, dict) or str(result.get('ResultCode')) != '0':
                return error('Daraja has not verified this payment as successful.', 'payment_not_verified', 409)
        except (requests.RequestException, ValueError, TypeError, AttributeError):
            return error('Unable to verify payment with Daraja. Payment remains pending.', 'payment_verification_unavailable', 503)

    # Serialize final state transitions only; no external calls while holding locks.
    order = Order.query.filter_by(id=order_id).with_for_update().one()
    payment = db.session.get(Payment, payment_id)
    if payment.status in TERMINAL or order.payment_status == 'Paid':
        return jsonify({'Result': 'Callback already processed'}), 200
    if receipt and Order.query.filter(Order.mpesa_receipt_number == receipt, Order.id != order_id).first():
        return error('Transaction has already been recorded.', 'duplicate_transaction', 409)
    status = 'Paid' if code == 0 else 'Cancelled' if code == 1032 else 'Failed'
    changed = Payment.query.filter(Payment.id == payment_id, Payment.status.in_(ACTIVE)).update({'status': status}, synchronize_session=False)
    if not changed:
        db.session.rollback()
        return jsonify({'Result': 'Callback already processed'}), 200
    order.payment_status = status
    if receipt:
        order.mpesa_receipt_number = receipt
        confirm_receipt(order)
    try:
        db.session.commit()
    except SQLAlchemyError:
        db.session.rollback()
        return error('Payment could not be recorded. It will need verification again.', 'payment_record_failed', 503)
    if status == 'Paid':
        safely_notify(order, 'payment_confirmed', include_receipt=True)
    return jsonify({'Result': 'Callback received'}), 200


@payments_bp.post('/orders/<int:order_id>/confirm')
@staff_required('waiter', 'manager')
def confirm_counter_payment(order_id):
    order = Order.query.filter_by(id=order_id).with_for_update().first_or_404()
    if order.payment_method not in ('Cash', 'Card'):
        return error('M-Pesa must be confirmed by Daraja.', 'invalid_payment_method', 400)
    order.payment_status = 'Paid'
    confirm_receipt(order)
    db.session.commit()
    safely_notify(order, 'payment_confirmed', include_receipt=True)
    return jsonify({'message': 'Payment confirmed', 'payment_status': order.payment_status}), 200
