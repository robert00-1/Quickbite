import { staffRequest } from "./staffApi";

function normalizeOrder(order) {
  return {
    id: order.id,
    customerName:
      order.customer ?? order.customer_name ?? "Customer",
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
  const data = await staffRequest("/manager/orders");

  if (!Array.isArray(data)) {
    throw new Error(
      "The manager orders endpoint did not return an array."
    );
  }

  return data.map(normalizeOrder);
}

export async function getManagerDashboard() {
  return staffRequest("/manager/dashboard");
}

export async function getManagerSales(params = {}) {
  const query = new URLSearchParams(params).toString();

  return staffRequest(
    `/manager/sales${query ? `?${query}` : ""}`
  );
}

export async function getManagerCustomers() {
  return staffRequest("/manager/customers");
}

export async function getMenuItems() {
  const data = await staffRequest("/menu-items");

  if (!Array.isArray(data)) {
    throw new Error("The menu API did not return an array.");
  }

  return data;
}

export async function updateMenuItemAvailability(
  itemId,
  availability
) {
  if (typeof availability !== "boolean") {
    throw new Error("Availability must be true or false.");
  }

  return staffRequest(`/menu-items/${itemId}`, {
    method: "PATCH",
    body: JSON.stringify({ availability }),
  });
}

export async function createMenuItem(menuItem) {
  return staffRequest("/menu-items", {
    method: "POST",
    body: JSON.stringify(menuItem),
  });
}

// Upload a food photo from the manager's computer.
export async function uploadMenuItemImage(file) {
  if (!file) {
    throw new Error("Please select a food photo.");
  }

  const formData = new FormData();
  formData.append("image", file);

  return staffRequest("/menu-items/upload-image", {
    method: "POST",
    body: formData,
  });
}

export async function updateMenuItemImage(itemId, imageUrl) {
  if (!imageUrl || typeof imageUrl !== "string") {
    throw new Error("A valid image URL is required.");
  }

  return staffRequest(`/menu-items/${itemId}`, {
    method: "PATCH",
    body: JSON.stringify({ image: imageUrl }),
  });
}
