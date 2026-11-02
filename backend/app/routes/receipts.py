from flask import Blueprint, jsonify
from ..models.receipt import Receipt
from ..utils.timing import estimates, utc

receipts_bp = Blueprint("receipts", __name__, url_prefix="/api/receipts")


@receipts_bp.route("/<string:token>", methods=["GET"])
def get_receipt_by_token(token):
    receipt = Receipt.query.filter_by(receipt_token=token).first()
    if not receipt:
        return jsonify({"error": "Receipt not found"}), 404

    order = receipt.order
    if not order:
        return jsonify({"error": "Order associated with receipt not found"}), 404

    return jsonify({
        "restaurantName": "QuickBite",
        "receiptNumber": f"QB-{receipt.id:06d}",
        "notificationStatus": receipt.notification_status,
        "receiptToken": receipt.receipt_token,
        "createdAt": utc(receipt.created_at).isoformat(),
        "order": {
            **estimates(order),
            "id": order.id,
            "customerName": order.customer_name,
            "phone": order.phone,
            "tableNumber": order.table_number,
            "total": float(order.total),
            "paymentMethod": order.payment_method,
            "paymentStatus": order.payment_status,
            "orderStatus": order.order_status,
            "mpesaReceiptNumber": order.mpesa_receipt_number,
            "servedByName": order.served_by_name,
            "createdAt": utc(order.created_at).isoformat(),
            "items": [
                {
                    "id": item.menu_item_id,
                    "name": item.item_name,
                    "quantity": item.quantity,
                    "price": float(item.unit_price),
                    "subtotal": float(item.unit_price * item.quantity),
                    "preparationTime": item.preparation_time,
                    "servingTime": item.serving_time,
                }
                for item in order.items
            ],
        },
    }), 200



@receipts_bp.get('/<string:token>/qr')
def receipt_qr(token):
    import io
    import qrcode
    from flask import send_file
    from ..services.notifications import receipt_url
    receipt = Receipt.query.filter_by(receipt_token=token).first_or_404()
    output = io.BytesIO()
    qrcode.make(receipt_url(receipt)).save(output, format='PNG')
    output.seek(0)
    return send_file(output, mimetype='image/png')


@receipts_bp.get('/<string:token>/view')
def receipt_view(token):
    from flask import render_template_string
    from .orders import serialize_order
    receipt = Receipt.query.filter_by(receipt_token=token).first_or_404()
    return render_template_string('''<!doctype html><html><head><title>QuickBite Receipt</title>
    <meta name="viewport" content="width=device-width, initial-scale=1"><style>
    body{font:16px system-ui;max-width:680px;margin:2rem auto;padding:1rem}td,th{text-align:left;padding:.6rem}table{width:100%}@media print{button{display:none}}</style></head>
    <body><h1>QuickBite</h1><h2>Receipt QB-{{ '%06d'|format(receipt.id) }}</h2>
    <p>Order {{ order.id }} · {{ order.createdAt }}</p>
    <p>{{ order.customerName }} · {{ order.phone }} · Table {{ order.tableNumber }}</p>
    <table><tr><th>Item</th><th>Qty</th><th>Price (KSh)</th><th>Subtotal</th></tr>
    {% for item in order['items'] %}<tr><td>{{ item.name }}</td><td>{{ item.quantity }}</td><td>{{ item.price }}</td><td>{{ item.price * item.quantity }}</td></tr>{% endfor %}</table>
    <h3>Total KSh {{ order.total }}</h3><p>{{ order.paymentMethod }} · {{ order.paymentStatus }}</p>
    <p>Preparation: {{ order.preparationMinutes }} min · Serving: {{ order.servingMinutes }} min</p>
    <img alt="Receipt QR code" width="160" src="/api/receipts/{{ receipt.receipt_token }}/qr">
    <p>WhatsApp: {{ receipt.notification_status }}</p><button onclick="window.print()">Print receipt</button></body></html>''', receipt=receipt, order=serialize_order(receipt.order))


@receipts_bp.get('/whatsapp/webhook')
def verify_whatsapp_webhook():
    import hmac
    from flask import request, current_app
    expected = current_app.config.get('WHATSAPP_VERIFY_TOKEN')
    if expected and request.args.get('hub.mode') == 'subscribe' and hmac.compare_digest(request.args.get('hub.verify_token', ''), expected):
        return request.args.get('hub.challenge', ''), 200
    return {'error': 'Verification failed'}, 403


@receipts_bp.post('/whatsapp/webhook')
def whatsapp_delivery_webhook():
    import hashlib
    import hmac
    from flask import request, current_app
    from ..extensions import db
    secret = current_app.config.get('WHATSAPP_APP_SECRET')
    signature = request.headers.get('X-Hub-Signature-256', '')
    if not secret or not hmac.compare_digest(signature, 'sha256=' + hmac.new(secret.encode(), request.get_data(), hashlib.sha256).hexdigest()):
        return {'error': 'Invalid webhook signature'}, 403
    payload = request.get_json(silent=True)
    if not isinstance(payload, dict):
        return {'error': 'Invalid webhook'}, 400
    try:
        for entry in payload.get('entry', []):
            for change in entry.get('changes', []):
                for status in change.get('value', {}).get('statuses', []):
                    receipt = Receipt.query.filter_by(notification_provider_id=status.get('id')).first() if status.get('id') else None
                    new = status.get('status')
                    # Do not let delayed delivery events undo later read/delivered states.
                    ranks = {'accepted': 0, 'sent': 1, 'failed': 1, 'delivered': 2, 'read': 3}
                    if receipt and new in ranks and ranks[new] >= ranks.get(receipt.notification_status, 0):
                        receipt.notification_status = new
        db.session.commit()
    except (AttributeError, TypeError):
        db.session.rollback()
        return {'error': 'Malformed webhook'}, 400
    return {'message': 'Delivery status saved'}, 200
