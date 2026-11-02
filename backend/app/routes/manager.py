
from collections import defaultdict
from datetime import date, datetime, time, timezone
from calendar import day_name

from flask import Blueprint, jsonify, request
from sqlalchemy import or_

from ..extensions import db
from ..models.order import Order
from ..models.waiter_profile import WaiterProfile
from ..models.weekly_shift import WeeklyShift
from ..utils.auth import staff_required
from ..models.menu_item import MenuItem


manager_bp = Blueprint(
    "manager",
    __name__,
    url_prefix="/api/manager",
)

ORDER_STATUSES = ["PENDING", "PREPARING", "READY", "SERVED"]

PAID_STATUSES = {
    "PAID",
    "COMPLETED",
    "SUCCESS",
    "SUCCESSFUL",
}

# =========================================================
# EXISTING MANAGER FUNCTIONS
# =========================================================

def get_value(obj, *names, default=None):
    """Read the first available non-None attribute from an object."""
    for name in names:
        value = getattr(obj, name, None)
        if value is not None:
            return value

    return default


def serialize_order(order):
    """Convert an SQLAlchemy order into JSON-friendly data."""
    items = []

    for line in (getattr(order, "items", None) or []):
        menu_item = getattr(line, "menu_item", None)

        item_name = get_value(
            line,
            "item_name",
            "name",
            default=None,
        )

        if not item_name and menu_item:
            item_name = getattr(menu_item, "name", None)

        item_price = get_value(
            line,
            "unit_price",
            "price",
            default=None,
        )

        if item_price is None and menu_item:
            item_price = getattr(menu_item, "price", 0)

        items.append({
            "id": getattr(line, "id", None),
            "name": item_name or "Unknown item",
            "quantity": get_value(line, "quantity", default=1),
            "price": item_price if item_price is not None else 0,
        })

    created_at = get_value(order, "created_at")

    if created_at and hasattr(created_at, "isoformat"):
        created_at = created_at.isoformat()

    return {
        "id": order.id,
        "customer": get_value(
            order,
            "customer_name",
            "customer",
            default="",
        ),
        "customer_phone": get_value(
            order,
            "customer_phone",
            "phone",
            "phone_number",
            default="",
        ),
        "table_number": get_value(order, "table_number"),
        "total_amount": get_value(
            order,
            "total_amount",
            "total",
            default=0,
        ),
        "payment_method": get_value(
            order,
            "payment_method",
            default="",
        ),
        "payment_status": get_value(
            order,
            "payment_status",
            default="",
        ),
        "created_at": created_at,
        "status": str(
            get_value(
                order,
                "order_status",
                "status",
                default="PENDING",
            )
        ).upper(),
        "items": items,
    }


def order_sort_key(order):
    """Safely sort orders by creation time, newest first."""
    created_at = get_value(order, "created_at")

    if not isinstance(created_at, datetime):
        return (0, 0)

    if created_at.tzinfo is None:
        created_at = created_at.replace(tzinfo=timezone.utc)

    return (1, created_at.timestamp())


def load_orders():
    """Load orders visible to managers."""
    orders = Order.query.filter(
        or_(
            Order.payment_method != "M-Pesa",
            Order.payment_status == "Paid",
        )
    ).all()

    return sorted(
        orders,
        key=order_sort_key,
        reverse=True,
    )


def parse_date(value):
    """Parse YYYY-MM-DD query parameters."""
    if not value:
        return None

    try:
        return date.fromisoformat(value)
    except ValueError:
        raise ValueError(
            f"Invalid date '{value}'. Use YYYY-MM-DD."
        )


def order_in_date_range(order, start_date=None, end_date=None):
    """Check whether an order falls within the requested date range."""
    created_at = get_value(order, "created_at")

    if not created_at:
        return False

    if isinstance(created_at, datetime):
        order_date = created_at.date()
    elif isinstance(created_at, date):
        order_date = created_at
    else:
        return False

    if start_date and order_date < start_date:
        return False

    if end_date and order_date > end_date:
        return False

    return True


def order_amount(order):
    """Safely convert an order total into a float."""
    try:
        return float(
            get_value(
                order,
                "total_amount",
                "total",
                default=0,
            ) or 0
        )
    except (TypeError, ValueError):
        return 0.0


def is_paid(order):
    """Only count confirmed payments as revenue."""
    status = str(
        get_value(
            order,
            "payment_status",
            default="",
        )
    ).strip().upper()

    return status in PAID_STATUSES


def payment_type(order):
    """Normalize payment method names."""
    return (
        str(
            get_value(
                order,
                "payment_method",
                default="",
            )
        )
        .strip()
        .upper()
        .replace("-", "")
        .replace("_", "")
        .replace(" ", "")
    )


def unique_customers(orders):
    """Count identifiable customers without counting each order twice."""
    customers = {}

    for order in orders:
        name = str(
            get_value(
                order,
                "customer_name",
                "customer",
                default="",
            ) or ""
        ).strip()

        phone = str(
            get_value(
                order,
                "customer_phone",
                "phone",
                "phone_number",
                default="",
            ) or ""
        ).strip()

        if phone:
            key = f"phone:{phone}"
        elif name:
            key = f"name:{name.casefold()}"
        else:
            continue

        customers[key] = {
            "name": name or "Customer",
            "phone": phone,
        }

    return customers


# =========================================================
# EXISTING MANAGER ENDPOINTS
# =========================================================

@manager_bp.get("/orders")
@staff_required("manager")
def get_manager_orders():
    """Return manager-visible orders."""
    try:
        orders = load_orders()

        return jsonify([
            serialize_order(order)
            for order in orders
        ]), 200

    except Exception:
        return jsonify({
            "error": "Unable to retrieve orders."
        }), 500


@manager_bp.get("/dashboard")
@staff_required("manager")
def get_manager_dashboard():
    """Return the manager dashboard's summary statistics."""
    try:
        orders = load_orders()
        today = date.today()

        monthly_orders = [
            order for order in orders
            if order_in_date_range(
                order,
                date(today.year, today.month, 1),
                today,
            )
        ]

        today_orders = [
            order for order in orders
            if order_in_date_range(
                order,
                today,
                today,
            )
        ]

        monthly_paid = [
            order for order in monthly_orders
            if is_paid(order)
        ]

        paid_today = [
            order for order in today_orders
            if is_paid(order)
        ]

        status_counts = {
            status: 0
            for status in ORDER_STATUSES
        }

        for order in orders:
            status = str(
                get_value(
                    order,
                    "order_status",
                    "status",
                    default="",
                )
            ).upper()

            if status in status_counts:
                status_counts[status] += 1

        cash_sales = sum(
            order_amount(order)
            for order in orders
            if is_paid(order)
            and payment_type(order) == "CASH"
        )

        mpesa_sales = sum(
            order_amount(order)
            for order in orders
            if is_paid(order)
            and payment_type(order) in {
                "MPESA",
                "SAFARICOM",
            }
        )

        return jsonify({
            "stats": {
                "total_orders": len(orders),
                "monthly_orders": len(monthly_orders),
                "today_orders": len(today_orders),
                "total_customers": len(
                    unique_customers(orders)
                ),
                "active_orders": sum(
                    1 for order in orders
                    if str(
                        get_value(
                            order,
                            "order_status",
                            "status",
                            default="",
                        )
                    ).upper() in {
                        "PENDING",
                        "PREPARING",
                        "READY",
                    }
                ),
                "total_sales": round(
                    sum(
                        order_amount(order)
                        for order in orders
                        if is_paid(order)
                    ),
                    2,
                ),
                "monthly_revenue": round(
                    sum(
                        order_amount(order)
                        for order in monthly_paid
                    ),
                    2,
                ),
                "today_revenue": round(
                    sum(
                        order_amount(order)
                        for order in paid_today
                    ),
                    2,
                ),
            },
            "payments": {
                "cash": round(cash_sales, 2),
                "mpesa": round(mpesa_sales, 2),
            },
            "order_statuses": status_counts,
        }), 200

    except Exception:
        return jsonify({
            "error": "Unable to calculate dashboard statistics."
        }), 500


@manager_bp.get("/sales")
@staff_required("manager")
def get_manager_sales():
    """Return paid sales totals grouped by date."""
    try:
        start_date = parse_date(
            request.args.get("start_date")
        )

        end_date = parse_date(
            request.args.get("end_date")
        )

        if start_date and end_date and start_date > end_date:
            return jsonify({
                "error": "start_date cannot be after end_date."
            }), 400

        orders = [
            order for order in load_orders()
            if order_in_date_range(
                order,
                start_date,
                end_date,
            )
        ]

        daily_sales = defaultdict(float)
        daily_orders = defaultdict(int)

        for order in orders:
            if not is_paid(order):
                continue

            created_at = get_value(order, "created_at")

            if isinstance(created_at, datetime):
                order_date = created_at.date()
            elif isinstance(created_at, date):
                order_date = created_at
            else:
                continue

            key = order_date.isoformat()
            daily_sales[key] += order_amount(order)
            daily_orders[key] += 1

        sales = [
            {
                "date": day,
                "sales": round(daily_sales[day], 2),
                "orders": daily_orders[day],
            }
            for day in sorted(daily_sales)
        ]

        return jsonify({
            "total_sales": round(
                sum(daily_sales.values()),
                2,
            ),
            "sales": sales,
        }), 200

    except ValueError as error:
        return jsonify({
            "error": str(error)
        }), 400

    except Exception:
        return jsonify({
            "error": "Unable to retrieve sales."
        }), 500


@manager_bp.get("/customers")
@staff_required("manager")
def get_manager_customers():
    """Return unique identifiable customers derived from visible orders."""
    try:
        customers = unique_customers(load_orders())

        return jsonify({
            "total_customers": len(customers),
            "customers": list(customers.values()),
        }), 200

    except Exception:
        return jsonify({
            "error": "Unable to retrieve customers."
        }), 500


# =========================================================
# WEEKLY WAITER SCHEDULING
# =========================================================

def serialize_weekly_shift(shift):
    """Convert a weekly shift into JSON-friendly data."""
    return {
        "id": shift.id,
        "waiter_id": shift.waiter_id,
        "waiter_name": shift.waiter.full_name,
        "day_of_week": shift.day_of_week,
        "day_name": day_name[shift.day_of_week],
        "start_time": shift.start_time.strftime("%H:%M"),
        "end_time": shift.end_time.strftime("%H:%M"),
        "is_active": shift.is_active,
        "created_at": (
            shift.created_at.isoformat()
            if shift.created_at else None
        ),
    }


def parse_shift_time(value, field_name):
    """Validate and parse a 24-hour HH:MM time."""
    if not isinstance(value, str):
        raise ValueError(f"{field_name} must use HH:MM format.")

    try:
        return datetime.strptime(value, "%H:%M").time()
    except ValueError:
        raise ValueError(
            f"{field_name} must be a valid time in HH:MM format."
        )


def shift_overlaps(waiter_id, day, start_time, end_time, exclude_id=None):
    """Check whether a new shift overlaps an active existing shift."""
    query = WeeklyShift.query.filter(
        WeeklyShift.waiter_id == waiter_id,
        WeeklyShift.day_of_week == day,
        WeeklyShift.is_active.is_(True),
        WeeklyShift.start_time < end_time,
        WeeklyShift.end_time > start_time,
    )

    if exclude_id is not None:
        query = query.filter(WeeklyShift.id != exclude_id)

    return query.first() is not None


@manager_bp.get("/weekly-shifts")
@staff_required("manager")
def get_weekly_shifts():
    """Return weekly schedules, optionally filtered by waiter or status."""
    try:
        query = WeeklyShift.query

        waiter_id = request.args.get("waiter_id")
        if waiter_id:
            try:
                waiter_id = int(waiter_id)
            except ValueError:
                return jsonify({
                    "error": "waiter_id must be an integer."
                }), 400

            query = query.filter_by(waiter_id=waiter_id)

        active = request.args.get("active")
        if active is not None:
            if active.lower() not in {"true", "false"}:
                return jsonify({
                    "error": "active must be true or false."
                }), 400

            query = query.filter_by(
                is_active=active.lower() == "true"
            )

        shifts = query.order_by(
            WeeklyShift.waiter_id,
            WeeklyShift.day_of_week,
            WeeklyShift.start_time,
        ).all()

        return jsonify({
            "total": len(shifts),
            "schedules": [
                serialize_weekly_shift(shift)
                for shift in shifts
            ],
        }), 200

    except Exception:
        return jsonify({
            "error": "Unable to retrieve weekly schedules."
        }), 500


@manager_bp.post("/weekly-shifts")
@staff_required("manager")
def create_weekly_shifts():
    """
    Assign one or more recurring weekly shifts to a waiter.

    The request is validated fully before any records are committed.
    """
    data = request.get_json(silent=True)

    if not isinstance(data, dict):
        return jsonify({
            "error": "Invalid request body."
        }), 400

    waiter_id = data.get("waiter_id")
    shifts_data = data.get("shifts")

    if isinstance(waiter_id, bool) or not isinstance(waiter_id, int):
        return jsonify({
            "error": "waiter_id must be an integer."
        }), 400

    waiter = db.session.get(WaiterProfile, waiter_id)

    if waiter is None:
        return jsonify({
            "error": "Waiter not found."
        }), 404

    if not waiter.is_active:
        return jsonify({
            "error": "Cannot assign shifts to an inactive waiter."
        }), 400

    if not isinstance(shifts_data, list) or not shifts_data:
        return jsonify({
            "error": "shifts must be a non-empty list."
        }), 400

    if len(shifts_data) > 7:
        return jsonify({
            "error": "A maximum of seven shifts can be assigned at once."
        }), 400

    proposed = []

    for index, item in enumerate(shifts_data):
        if not isinstance(item, dict):
            return jsonify({
                "error": f"Shift at position {index} must be an object."
            }), 400

        day = item.get("day_of_week")

        if isinstance(day, bool) or not isinstance(day, int) or not 0 <= day <= 6:
            return jsonify({
                "error": f"Invalid day_of_week at position {index}. Use 0 to 6."
            }), 400

        try:
            start_time = parse_shift_time(
                item.get("start_time"),
                "start_time",
            )
            end_time = parse_shift_time(
                item.get("end_time"),
                "end_time",
            )
        except ValueError as error:
            return jsonify({
                "error": str(error)
            }), 400

        if end_time <= start_time:
            return jsonify({
                "error": "end_time must be later than start_time."
            }), 400

        proposed.append({
            "day": day,
            "start_time": start_time,
            "end_time": end_time,
        })

    # Check overlaps against existing active shifts.
    for item in proposed:
        if shift_overlaps(
            waiter_id,
            item["day"],
            item["start_time"],
            item["end_time"],
        ):
            return jsonify({
                "error": (
                    f"{day_name[item['day']]} overlaps with an "
                    "existing active shift."
                )
            }), 409

    # Check overlaps among shifts in this same request.
    for index, item in enumerate(proposed):
        for other in proposed[index + 1:]:
            if item["day"] != other["day"]:
                continue

            if (
                item["start_time"] < other["end_time"]
                and item["end_time"] > other["start_time"]
            ):
                return jsonify({
                    "error": (
                        f"The submitted shifts overlap on "
                        f"{day_name[item['day']]}."
                    )
                }), 409

    try:
        created_shifts = []

        for item in proposed:
            shift = WeeklyShift(
                waiter_id=waiter_id,
                day_of_week=item["day"],
                start_time=item["start_time"],
                end_time=item["end_time"],
                is_active=True,
            )

            db.session.add(shift)
            created_shifts.append(shift)

        db.session.commit()

        return jsonify({
            "message": "Weekly shifts assigned successfully.",
            "waiter": waiter.full_name,
            "total_created": len(created_shifts),
            "schedules": [
                serialize_weekly_shift(shift)
                for shift in created_shifts
            ],
        }), 201

    except Exception:
        db.session.rollback()
        return jsonify({
            "error": "Unable to assign weekly shifts."
        }), 500


@manager_bp.patch("/weekly-shifts/<int:shift_id>")
@staff_required("manager")
def update_weekly_shift(shift_id):
    """Update a shift's day, time, or active status."""
    shift = db.session.get(WeeklyShift, shift_id)

    if shift is None:
        return jsonify({
            "error": "Weekly shift not found."
        }), 404

    data = request.get_json(silent=True)

    if not isinstance(data, dict) or not data:
        return jsonify({
            "error": "Provide at least one field to update."
        }), 400

    waiter_id = shift.waiter_id
    day = shift.day_of_week
    start_time = shift.start_time
    end_time = shift.end_time
    is_active = shift.is_active

    if "waiter_id" in data:
        return jsonify({
            "error": "A shift cannot be transferred to another waiter. Create a new shift instead."
        }), 400

    if "day_of_week" in data:
        day = data["day_of_week"]

        if isinstance(day, bool) or not isinstance(day, int) or not 0 <= day <= 6:
            return jsonify({
                "error": "day_of_week must be an integer from 0 to 6."
            }), 400

    try:
        if "start_time" in data:
            start_time = parse_shift_time(
                data["start_time"],
                "start_time",
            )

        if "end_time" in data:
            end_time = parse_shift_time(
                data["end_time"],
                "end_time",
            )

    except ValueError as error:
        return jsonify({
            "error": str(error)
        }), 400

    if "is_active" in data:
        if not isinstance(data["is_active"], bool):
            return jsonify({
                "error": "is_active must be true or false."
            }), 400

        is_active = data["is_active"]

    if end_time <= start_time:
        return jsonify({
            "error": "end_time must be later than start_time."
        }), 400

    # Only active shifts need to be checked for overlap.
    if is_active and shift_overlaps(
        waiter_id,
        day,
        start_time,
        end_time,
        exclude_id=shift.id,
    ):
        return jsonify({
            "error": (
                f"{day_name[day]} overlaps with another active shift."
            )
        }), 409

    shift.day_of_week = day
    shift.start_time = start_time
    shift.end_time = end_time
    shift.is_active = is_active

    try:
        db.session.commit()

        return jsonify({
            "message": "Weekly shift updated successfully.",
            "schedule": serialize_weekly_shift(shift),
        }), 200

    except Exception:
        db.session.rollback()
        return jsonify({
            "error": "Unable to update weekly shift."
        }), 500


@manager_bp.delete("/weekly-shifts/<int:shift_id>")
@staff_required("manager")
def deactivate_weekly_shift(shift_id):
    """Deactivate a weekly shift without deleting its history."""
    shift = db.session.get(WeeklyShift, shift_id)

    if shift is None:
        return jsonify({
            "error": "Weekly shift not found."
        }), 404

    shift.is_active = False

    try:
        db.session.commit()

        return jsonify({
            "message": "Weekly shift deactivated successfully.",
            "schedule": serialize_weekly_shift(shift),
        }), 200

    except Exception:
        db.session.rollback()
        return jsonify({
            "error": "Unable to deactivate weekly shift."
        }), 500

@manager_bp.get("/food-of-the-day")
def get_food_of_the_day():
    """Return all items currently marked as Meal of the Day."""
    meals = MenuItem.query.filter_by(is_food_of_day=True).all()
    return jsonify([{
        "id": m.id,
        "name": m.name,
        "description": m.description,
        "price": float(m.price),
        "image": m.image,
        "category": m.category,
        "ingredients": m.ingredients or [],
        "availability": m.availability,
        "is_food_of_day": m.is_food_of_day,
    } for m in meals]), 200


@manager_bp.post("/food-of-the-day")
@staff_required("manager")
def add_food_of_the_day():
    """Add an item to Meal of the Day without clearing others."""
    data = request.get_json(silent=True) or {}
    meal_id = data.get("meal_id")

    if meal_id is None:
        return jsonify({"error": "meal_id is required"}), 400

    meal = db.session.get(MenuItem, meal_id)
    if meal is None:
        return jsonify({"error": "Menu item not found"}), 404

    if not meal.availability:
        return jsonify({"error": "Cannot select an unavailable meal"}), 400

    try:
        meal.is_food_of_day = True
        db.session.commit()
        return jsonify({
            "message": "Added to Meal of the Day",
            "meal_id": meal.id,
            "name": meal.name,
        }), 200
    except Exception:
        db.session.rollback()
        return jsonify({"error": "Could not update Meal of the Day"}), 500


@manager_bp.delete("/food-of-the-day/<int:meal_id>")
@staff_required("manager")
def remove_food_of_the_day(meal_id):
    """Remove an item from Meal of the Day."""
    meal = db.session.get(MenuItem, meal_id)
    if meal is None:
        return jsonify({"error": "Menu item not found"}), 404

    try:
        meal.is_food_of_day = False
        db.session.commit()
        return jsonify({"message": "Removed from Meal of the Day", "meal_id": meal.id}), 200
    except Exception:
        db.session.rollback()
        return jsonify({"error": "Could not update Meal of the Day"}), 500


@manager_bp.put("/food-of-the-day")
@staff_required("manager")
def set_food_of_the_day():
    """Alias PUT — sets a meal as Meal of the Day (does NOT reset others)."""
    data = request.get_json(silent=True) or {}
    meal_id = data.get("meal_id")

    if meal_id is None:
        return jsonify({"error": "meal_id is required"}), 400

    meal = db.session.get(MenuItem, meal_id)

    if meal is None:
        return jsonify({"error": "Menu item not found"}), 404

    if not meal.availability:
        return jsonify({"error": "Cannot select an unavailable meal"}), 400

    try:
        meal.is_food_of_day = True
        db.session.commit()

        return jsonify({
            "message": "Food of the Day updated successfully",
            "meal_id": meal.id,
            "name": meal.name,
        }), 200

    except Exception:
        db.session.rollback()
        return jsonify({"error": "Could not update Food of the Day"}), 500



# =========================================================
# LATE ORDERS
# =========================================================

@manager_bp.get("/late-orders")
@staff_required("manager")
def get_late_orders():
    """Return orders that have exceeded their expected serving time."""
    from ..utils.timing import estimates, utc
    now = datetime.now(timezone.utc)
    result = []
    for order in Order.query.all():
        timing = estimates(order)
        if timing["isLate"]:
            result.append({**serialize_order(order), **timing,
                "elapsed_minutes": round((now - utc(order.created_at)).total_seconds()/60, 1),
                "expected_minutes": timing["preparationMinutes"] + timing["servingMinutes"]})
    return jsonify(result), 200


# =========================================================
# WAITER ACTIVITY
# =========================================================

@manager_bp.get("/waiter-activity")
@staff_required("manager")
def get_waiter_activity():
    """Return all waiter profiles with their shift hours and served orders."""
    from ..services.activity import activity
    result = []
    for waiter in WaiterProfile.query.filter_by(is_active=True).all():
        record = activity(waiter.user_id, waiter)
        active = next((s for s in record["shifts"] if s["is_active"]), None)
        result.append({"id": waiter.id, "name": waiter.full_name, **record,
            "on_shift": active is not None, "recent_shifts": record["shifts"],
            "shift_started_at": active["started_at"] if active else None})
    return jsonify(result), 200
