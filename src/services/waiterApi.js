const WAITER_API_URL =
  import.meta.env.VITE_WAITER_API_URL || "http://127.0.0.1:5000/api/waiter";

// "PENDING" becomes "Pending", the way the waiter screen writes it
const toTitleCase = (text) =>
  text ? text.charAt(0).toUpperCase() + text.slice(1).toLowerCase() : "";

// Turns an order from the backend into the shape the screen already uses
const toScreenOrder = (order) => ({
  id: String(order.id),
  customerName: order.customer || "",
  tableNumber: order.table_number,
  orderStatus: toTitleCase(order.status),
  total: order.total_amount,
  paymentMethod: order.payment_method,
  paymentStatus: toTitleCase(order.payment_status),
  createdAt: order.created_at,
  items: (order.items || []).map((item, index) => ({
    id: item.id ?? index,
    name: item.name,
    quantity: item.quantity,
    price: item.price,
  })),
});

export const getWaiterOrders = async () => {
  const response = await fetch(`${WAITER_API_URL}/orders`);

  if (!response.ok) {
    throw new Error("Failed to load orders");
  }

  const orders = await response.json();
  return orders.map(toScreenOrder);
};

export const updateWaiterOrderStatus = async (id, status) => {
  const response = await fetch(`${WAITER_API_URL}/orders/${id}/status`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status: status.toUpperCase() }),
  });

  if (!response.ok) {
    throw new Error("Failed to update order status");
  }

  return toScreenOrder(await response.json());
};