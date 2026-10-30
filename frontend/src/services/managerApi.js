
import { staffRequest } from "./staffApi";

/**
 * Safely convert a value to a number.
 */
function toNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

/**
 * Normalize an order returned by the Flask manager API.
 */
function normalizeOrder(order) {
  if (!order || typeof order !== "object") {
    throw new Error("Invalid order data received from the server.");
  }

  return {
    id: order.id,

    customerName:
      order.customer ??
      order.customer_name ??
      order.customerName ??
      "Customer",

    phone:
      order.customer_phone ??
      order.phone ??
      order.phone_number ??
      "",

    tableNumber:
      order.table_number ??
      order.tableNumber ??
      null,

    total: toNumber(
      order.total_amount ?? order.total,
      0
    ),

    paymentMethod:
      order.payment_method ??
      order.paymentMethod ??
      "",

    paymentStatus:
      order.payment_status ??
      order.paymentStatus ??
      "",

    orderStatus: String(
      order.status ??
      order.order_status ??
      order.orderStatus ??
      "PENDING"
    ).toUpperCase(),

    createdAt:
      order.created_at ??
      order.createdAt ??
      null,

    items: Array.isArray(order.items)
      ? order.items.map((item) => ({
          id: item.id,

          name:
            item.name ??
            item.item_name ??
            "Unknown item",

          quantity: toNumber(
            item.quantity,
            1
          ),

          price: toNumber(
            item.price ?? item.unit_price,
            0
          ),
        }))
      : [],
  };
}

/**
 * Get all manager orders.
 */
export async function getManagerOrders() {
  const data = await staffRequest("/manager/orders");

  if (!Array.isArray(data)) {
    throw new Error(
      "The manager orders endpoint did not return an array."
    );
  }

  return data.map(normalizeOrder);
}

/**
 * Get manager dashboard statistics.
 */
export async function getManagerDashboard() {
  const data = await staffRequest("/manager/dashboard");

  if (!data || typeof data !== "object") {
    throw new Error(
      "The manager dashboard returned invalid data."
    );
  }

  return data;
}

/**
 * Get sales reports, optionally filtered by date.
 *
 * Supported parameters:
 * start_date: YYYY-MM-DD
 * end_date: YYYY-MM-DD
 */
export async function getManagerSales(params = {}) {
  const queryParams = new URLSearchParams();

  if (params.start_date) {
    queryParams.set("start_date", params.start_date);
  }

  if (params.end_date) {
    queryParams.set("end_date", params.end_date);
  }

  const query = queryParams.toString();

  return staffRequest(
    `/manager/sales${query ? `?${query}` : ""}`
  );
}

/**
 * Get manager customer records.
 */
export async function getManagerCustomers() {
  const data = await staffRequest("/manager/customers");

  if (!data || !Array.isArray(data.customers)) {
    throw new Error(
      "The manager customers endpoint returned invalid data."
    );
  }

  return data;
}

/**
 * Get all menu items.
 */
export async function getMenuItems() {
  const data = await staffRequest("/menu-items");

  if (!Array.isArray(data)) {
    throw new Error(
      "The menu API did not return an array."
    );
  }

  return data;
}

/**
 * Update menu item availability.
 */
export async function updateMenuItemAvailability(
  itemId,
  availability
) {
  if (itemId === undefined || itemId === null) {
    throw new Error("A valid menu item ID is required.");
  }

  if (typeof availability !== "boolean") {
    throw new Error(
      "Availability must be true or false."
    );
  }

  return staffRequest(`/menu-items/${itemId}`, {
    method: "PATCH",
    body: JSON.stringify({ availability }),
  });
}

/**
 * Create a new menu item.
 */
export async function createMenuItem(menuItem) {
  if (!menuItem || typeof menuItem !== "object") {
    throw new Error("Valid menu item details are required.");
  }

  return staffRequest("/menu-items", {
    method: "POST",
    body: JSON.stringify(menuItem),
  });
}

/**
 * Upload a food photo from the manager's computer.
 */
export async function uploadMenuItemImage(file) {
  if (!file) {
    throw new Error("Please select a food photo.");
  }

  if (!(file instanceof File)) {
    throw new Error("The selected image file is invalid.");
  }

  const formData = new FormData();
  formData.append("image", file);

  return staffRequest("/menu-items/upload-image", {
    method: "POST",
    body: formData,
  });
}

/**
 * Update an existing menu item's image URL.
 */
export async function updateMenuItemImage(
  itemId,
  imageUrl
) {
  if (itemId === undefined || itemId === null) {
    throw new Error("A valid menu item ID is required.");
  }

  if (
    !imageUrl ||
    typeof imageUrl !== "string" ||
    !imageUrl.trim()
  ) {
    throw new Error("A valid image URL is required.");
  }

  return staffRequest(`/menu-items/${itemId}`, {
    method: "PATCH",
    body: JSON.stringify({
      image: imageUrl.trim(),
    }),
  });
}
