from collections import defaultdict
from datetime import date, datetime

from flask import Blueprint, jsonify, request

from ..models.order import Order
from ..utils.auth import staff_required
from sqlalchemy import or_

manager_bp = Blueprint(
    "manager",
    __name__,
    url_prefix="/api/manager",
)

ORDER_STATUSES = ["PENDING", "PREPARING", "READY", "SERVED"]


def get_value(obj, *names, default=None):
    """Read the first available attribute from an object."""
    for name in names:
        value = getattr(obj, name, None)
        if value is not None:
            return value
    return default


def serialize_order(order):
    """Convert an SQLAlchemy order into JSON-friendly data."""
    items = []

    for line in (getattr(order, "items", None) or []):
        items.append({
            "id": getattr(line, "id", None),
            "name": get_value(
                line, "item_name", "name", default="Unknown item"
            ),
            "quantity": get_value(line, "quantity", default=1),
            "price": get_value(
                line, "unit_price", "price", default=0
            ),
        })

    created_at = get_value(order, "created_at")

    return {
        "id": order.id,
        "customer": get_value(
            order, "customer_name", "customer", default=""
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
            order, "total_amount", "total", default=0
        ),
        "payment_method": get_value(
            order, "payment_method", default=""
        ),
        "payment_status": get_value(
            order, "payment_status", default=""
        ),
        "created_at": (
            created_at.isoformat()
            if created_at and hasattr(created_at, "isoformat")
            else created_at
        ),
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


def load_orders():
    """Load confirmed orders, newest first."""
    orders = Order.query.filter(
        or_(
            Order.payment_method != "M-Pesa",
            Order.payment_status == "Paid",
        )
    ).all()

    return sorted(
        orders,
        key=lambda order: (
            get_value(order, "created_at") or datetime.min
        ),
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
    created_at = get_value(order, "created_at")

    if not created_at:
        return False

    order_date = (
        created_at.date()
        if isinstance(created_at, datetime)
        else created_at
    )

    if isinstance(order_date, datetime):
        order_date = order_date.date()

    if not isinstance(order_date, date):
        return False

    if start_date and order_date < start_date:
        return False

    if end_date and order_date > end_date:
        return False

    return True


def order_amount(order):
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
        get_value(order, "payment_status", default="")
    ).strip().upper()

    # Missing payment status is not assumed to mean paid.
    return status in {
        "PAID",
        "COMPLETED",
        "SUCCESS",
        "SUCCESSFUL",
    }


def payment_type(order):
    return str(
        get_value(order, "payment_method", default="")
    ).strip().upper().replace("-", "").replace("_", "")


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
            # Do not count unidentified walk-in orders as unique people.
            continue

        customers[key] = {
            "name": name or "Customer",
            "phone": phone,
        }

    return customers


@manager_bp.get("/orders")
@staff_required("manager")
def get_manager_orders():
    """Return orders in the format expected by managerApi.js."""
    try:
        orders = load_orders()
        return jsonify([
            serialize_order(order) for order in orders
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
            if order_in_date_range(order, today, today)
        ]

        monthly_paid = [
            order for order in monthly_orders if is_paid(order)
        ]

        paid_today = [
            order for order in today_orders if is_paid(order)
        ]

        status_counts = {
            status: 0 for status in ORDER_STATUSES
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
            and payment_type(order) in {"MPESA", "SAFARICOM"}
        )

        return jsonify({
            "stats": {
                "total_orders": len(orders),
                "monthly_orders": len(monthly_orders),
                "today_orders": len(today_orders),
                "total_customers": len(unique_customers(orders)),
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
    """Return sales totals grouped by date."""
    try:
        start_date = parse_date(request.args.get("start_date"))
        end_date = parse_date(request.args.get("end_date"))

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

            order_date = (
                created_at.date()
                if isinstance(created_at, datetime)
                else created_at
            )

            if isinstance(order_date, date):
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
                sum(daily_sales.values()), 2
            ),
            "sales": sales,
        }), 200

    except ValueError as error:
        return jsonify({"error": str(error)}), 400
    except Exception:
        return jsonify({
            "error": "Unable to retrieve sales."
        }), 500


@manager_bp.get("/customers")
@staff_required("manager")
def get_manager_customers():
    """Return unique identifiable customers derived from orders."""
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