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
                  'template': {'name': template, 'language': {'code': 'en'}, 'components': [
                      {'type': 'header', 'parameters': [{'type': 'image', 'image': {'link': config['PUBLIC_API_URL'].rstrip('/') + '/api/receipts/' + receipt.receipt_token + '/qr'}}]},
                      {'type': 'body', 'parameters': [{'type': 'text', 'text': f'QB-{receipt.id:06d}'}, {'type': 'text', 'text': url}]}]}}, timeout=20)
        response.raise_for_status()
        receipt.notification_provider_id = response.json()['messages'][0]['id']
        receipt.notification_status = 'accepted'  # Acceptance is not proof of delivery.
    except (requests.RequestException, KeyError, ValueError):
        receipt.notification_status = 'failed'
        receipt.notification_error = 'Provider request failed; receipt remains available online.'
    db.session.commit()
