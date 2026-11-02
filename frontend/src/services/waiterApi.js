import { staffRequest } from "./staffApi";

// Convert backend order statuses into the format used by the dashboard.
const toTitleCase = (text) =>
  text
    ? text.charAt(0).toUpperCase() + text.slice(1).toLowerCase()
    : "";

const toScreenOrder = (order) => ({
  id: String(order.id),
  preparationMinutes: order.preparationMinutes,
  servingMinutes: order.servingMinutes,
  receiptUrl: order.receipt_url,
  customerName: order.customer || "",
  phone: order.phone || "",
  tableNumber: order.table_number,
  orderStatus: toTitleCase(order.status),
  total: order.total_amount,
  paymentMethod: order.payment_method,
  paymentStatus: toTitleCase(order.payment_status),
  createdAt: order.created_at,
  assignedWaiterId: order.assigned_waiter_id,
  assignedWaiterName: order.assigned_waiter_name,
  servedByName: order.served_by_name,
  items: (order.items || []).map((item, index) => ({
    id: item.id ?? index,
    name: item.name,
    quantity: item.quantity,
    price: item.price,
  })),
});

export const getWaiterOrders = async () => {
  const orders = await staffRequest("/waiter/orders");
  return orders.map(toScreenOrder);
};

export const updateWaiterOrderStatus = async (id, status) => {
  const order = await staffRequest(`/waiter/orders/${id}/status`, {
    method: "PATCH",
    body: JSON.stringify({ status: toTitleCase(status) }),
  });

  return toScreenOrder(order);
};

// These endpoints identify staff from the authenticated backend session.
// They identify the waiter from the authenticated staff session.
export const startWaiterShift = () =>
  staffRequest("/waiter/shifts/start", {
    method: "POST",
    body: JSON.stringify({}),
  });

export const endWaiterShift = () =>
  staffRequest("/waiter/shifts/end", {
    method: "POST",
    body: JSON.stringify({}),
  });

export const getWaiterRecord = () =>
  staffRequest("/waiter/record");

export const getWaiterRoster = () =>
  staffRequest("/waiter/roster");