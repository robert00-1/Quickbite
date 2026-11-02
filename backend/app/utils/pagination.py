"""Opt-in metadata; existing callers still receive the complete array by default."""
from math import ceil
from flask import request, jsonify


def menu_response(items, warning=None):
    if 'page' in request.args or 'per_page' in request.args:
        try:
            page = int(request.args.get('page', '1'))
            per_page = int(request.args.get('per_page', '10'))
            if page < 1 or not 1 <= per_page <= 100:
                raise ValueError()
        except ValueError:
            return jsonify({'error': 'page must be positive and per_page must be between 1 and 100'}), 400
        pages = max(1, ceil(len(items) / per_page))
        response = jsonify({'items': items[(page - 1) * per_page:page * per_page], 'pagination': {'page': page, 'per_page': per_page, 'total': len(items), 'total_pages': pages, 'has_previous': page > 1, 'has_next': page < pages}})
    else:
        response = jsonify(items)
    if warning:
        response.headers['X-Menu-Warning'] = warning
    return response
