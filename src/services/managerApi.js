
const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ||
  "http://127.0.0.1:5000/api/menu-items";

const MANAGER_API_URL = API_BASE_URL.replace(/\/menu-items\/?$/, "/manager");

async function requestManager(endpoint) {
  const response = await fetch(`${MANAGER_API_URL}${endpoint}`);

  if (!response.ok) {
    throw new Error(`Manager API request failed: ${response.status}`);
  }

  return response.json();
}

function normalizeOrder(order) {
  return {
    id: order.id,
    customerName: order.customer ?? order.customer_name ?? "Customer",
    phone: order.customer_phone ?? order.phone ?? "",
    tableNumber: order.table_number,
    total: Number(order.total_amount ?? order.total ?? 0),
    paymentMethod: order.payment_method ?? "",
    paymentStatus: order.payment_status ?? "",
    orderStatus: order.status ?? order.order_status ?? "Pending",
    createdAt: order.created_at ?? order.createdAt ?? null,
    items: (order.items ?? []).map((item) => ({
      id: item.id,
      name: item.name ?? item.item_name ?? "Unknown item",
      quantity: Number(item.quantity ?? 1),
      price: Number(item.price ?? item.unit_price ?? 0),
    })),
  };
}

export async function getManagerOrders() {
  const data = await requestManager("/orders");

  if (!Array.isArray(data)) {
    throw new Error("The manager orders endpoint did not return an array.");
  }

  return data.map(normalizeOrder);
}

export async function getManagerDashboard() {
  return requestManager("/dashboard");
}

export async function getManagerSales(params = {}) {
  const query = new URLSearchParams(params).toString();
  return requestManager(`/sales${query ? `?${query}` : ""}`);
}

export async function getManagerCustomers() {
  return requestManager("/customers");
}
