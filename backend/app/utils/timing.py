from datetime import datetime, timezone, timedelta

def utc(value):
    return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value.astimezone(timezone.utc)

def estimates(order):
    # Dishes prepare in parallel; serving follows preparation.
    prep = max((item.preparation_time for item in order.items), default=0)
    serving = max((item.serving_time for item in order.items), default=0)
    due = utc(order.created_at) + timedelta(minutes=prep + serving)
    confirmed = order.payment_method == "Cash" or order.payment_status == "Paid"
    late = confirmed and order.order_status not in ("Served", "Cancelled") and datetime.now(timezone.utc) > due
    return {"preparationMinutes": prep, "servingMinutes": serving, "estimatedReadyAt": due.isoformat(), "isLate": late}
