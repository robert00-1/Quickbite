
from collections import defaultdict
from datetime import date, datetime

from flask import Blueprint, jsonify, request

from ..models.order import Order
from ..utils.auth import staff_required


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


def load_orders():
    """Load all orders, newest first."""
    orders = Order.query.all()

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
        get_value(order, "payment_status", default="")
    ).strip().upper()

    return status in PAID_STATUSES


def payment_type(order):
    """Normalize payment method names."""
    return (
        str(
            get_value(order, "payment_method", default="")
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


@manager_bp.get("/orders")
@staff_required("manager")
def get_manager_orders():
    """Return all orders in the format expected by managerApi.js."""
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
            if order_in_date_range(order, today, today)
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
    """Return sales totals grouped by date."""
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
