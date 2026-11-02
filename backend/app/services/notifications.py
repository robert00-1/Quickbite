"""Persist receipt delivery attempts; never report an unconfigured provider as sent."""
from flask import current_app
import requests
from ..extensions import db
from ..models.receipt import Receipt


def receipt_url(receipt):
    return current_app.config['PUBLIC_API_URL'].rstrip('/') + '/api/receipts/' + receipt.receipt_token + '/view'


def confirm_receipt(order):
    if order.receipt:
        return order.receipt
    receipt = Receipt(order=order)
    db.session.add(receipt)
    db.session.flush()
    return receipt


def deliver_receipt(receipt):
    # Atomic claim prevents concurrent callbacks from sending the same notification twice.
    claimed = Receipt.query.filter_by(id=receipt.id, notification_status='pending').update({'notification_status': 'sending'})
    db.session.commit()
    if not claimed:
        return
    config = current_app.config
    token = config.get('WHATSAPP_ACCESS_TOKEN')
    sender = config.get('WHATSAPP_PHONE_NUMBER_ID')
    template = config.get('WHATSAPP_TEMPLATE_NAME')
    if not all([token, sender, template]):
        receipt.notification_status = 'not_configured'
        receipt.notification_error = 'WhatsApp Business credentials and approved receipt template are required.'
        db.session.commit()
        return
    url = receipt_url(receipt)
    try:
        # Approved template: IMAGE header, two body parameters (receipt number and URL).
        response = requests.post(
            f"https://graph.facebook.com/{config['WHATSAPP_API_VERSION']}/{sender}/messages",
            headers={'Authorization': f'Bearer {token}'},
            json={'messaging_product': 'whatsapp', 'to': receipt.order.phone, 'type': 'template',
                  'template': {'name': template, 'language': {'code': config.get('WHATSAPP_TEMPLATE_LANGUAGE', 'en')}, 'components': [
                      {'type': 'header', 'parameters': [{'type': 'image', 'image': {'link': config['PUBLIC_API_URL'].rstrip('/') + '/api/receipts/' + receipt.receipt_token + '/qr'}}]},
                      {'type': 'body', 'parameters': [{'type': 'text', 'text': f'QB-{receipt.id:06d}'}, {'type': 'text', 'text': url}]}]}}, timeout=20)
        response.raise_for_status()
        provider_id = response.json()['messages'][0]['id']
        if not isinstance(provider_id, str) or not provider_id:
            raise ValueError('Provider message ID missing')
        receipt.notification_provider_id = provider_id
        receipt.notification_status = 'accepted'  # Acceptance is not proof of delivery.
    except (requests.RequestException, KeyError, ValueError, IndexError, TypeError):
        receipt.notification_status = 'failed'
        receipt.notification_error = 'Provider request failed; receipt remains available online.'
    db.session.commit()


EVENT_LABELS = {
    'order_received': 'Order received',
    'payment_confirmed': 'Payment confirmed',
    'preparing': 'Your order is being prepared',
    'ready': 'Your order is ready',
    'completed': 'Your order has been served. Thank you!',
}


def notify_order_event(order, event):
    """One durable event per order; atomic claim avoids repeat sends across workers."""
    from sqlalchemy.exc import IntegrityError
    from ..models.notification import OrderNotification
    if event not in EVENT_LABELS:
        raise ValueError('Unsupported order event')
    record = OrderNotification(order_id=order.id, event=event, status='pending')
    try:
        with db.session.begin_nested():
            db.session.add(record)
            db.session.flush()
    except IntegrityError:
        record = OrderNotification.query.filter_by(order_id=order.id, event=event).one()
    db.session.commit()
    claimed = OrderNotification.query.filter_by(id=record.id, status='pending').update({'status': 'sending'})
    db.session.commit()
    if not claimed:
        return
    config = current_app.config
    if not all(config.get(key) for key in ('WHATSAPP_ACCESS_TOKEN', 'WHATSAPP_PHONE_NUMBER_ID', 'WHATSAPP_ORDER_TEMPLATE_NAME')):
        record.status = 'not_configured'
        record.error_code = 'provider_not_configured'
    else:
        try:
            response = requests.post(
                f"https://graph.facebook.com/{config['WHATSAPP_API_VERSION']}/{config['WHATSAPP_PHONE_NUMBER_ID']}/messages",
                headers={'Authorization': f"Bearer {config['WHATSAPP_ACCESS_TOKEN']}"},
                json={'messaging_product': 'whatsapp', 'to': order.phone, 'type': 'template',
                      'template': {'name': config['WHATSAPP_ORDER_TEMPLATE_NAME'], 'language': {'code': config.get('WHATSAPP_TEMPLATE_LANGUAGE', 'en')},
                          'components': [{'type': 'body', 'parameters': [{'type': 'text', 'text': str(order.id)}, {'type': 'text', 'text': EVENT_LABELS[event]}]}]}}, timeout=20)
            response.raise_for_status()
            provider_id = response.json()['messages'][0]['id']
            if not isinstance(provider_id, str) or not provider_id:
                raise ValueError('Provider message ID missing')
            record.provider_id = provider_id
            record.status = 'accepted'
        except (requests.RequestException, KeyError, ValueError, IndexError, TypeError):
            record.status = 'failed'
            record.error_code = 'provider_request_failed'
    db.session.commit()


def safely_notify(order, event, include_receipt=False):
    """Notifications are optional post-commit work; failures cannot undo an order."""
    try:
        if include_receipt and order.receipt:
            deliver_receipt(order.receipt)
    except Exception as exc:
        db.session.rollback()
        current_app.logger.error('Receipt delivery failed (%s)', type(exc).__name__)
    try:
        notify_order_event(order, event)
    except Exception as exc:
        db.session.rollback()
        current_app.logger.error('Order notification failed (%s)', type(exc).__name__)
