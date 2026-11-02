from ..models.order import Order
from ..models.shift import Shift
from ..utils.timing import utc

def activity(user_id, profile):
    shifts = Shift.query.filter_by(waiter_id=user_id).order_by(Shift.started_at.desc()).all() if user_id else []
    orders = Order.query.filter_by(assigned_waiter_id=profile.id, order_status="Served").all() if profile else []
    durations = [(utc(o.served_at)-utc(o.created_at)).total_seconds()/60 for o in orders if o.served_at]
    return {"total_hours": round(sum(s.hours_worked for s in shifts), 2),
        "tables_served": len({o.table_number for o in orders}), "orders_served": len(orders),
        "average_serving_minutes": round(sum(durations)/len(durations), 1) if durations else None,
        "shifts": [{"id": s.id, "started_at": utc(s.started_at).isoformat(), "ended_at": utc(s.ended_at).isoformat() if s.ended_at else None, "hours": s.hours_worked, "is_active": s.is_active} for s in shifts]}
