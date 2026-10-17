const CUSTOMER_KEY = "quickbite_customer";
const CART_KEY = "quickbite_cart";
const ORDERS_KEY = "quickbite_orders";

function readJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

export function getCustomer() {
  return readJSON(CUSTOMER_KEY, null);
}

export function getCart() {
  return readJSON(CART_KEY, []);
}

export function getOrders() {
  return readJSON(ORDERS_KEY, []);
}

export function getCartTotal(cart) {
  return cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
}
function saveCart(cart) {
  localStorage.setItem(CART_KEY, JSON.stringify(cart));
  return cart;
}
export function addToCart(meal) {
  const cart = getCart();
  const existing = cart.find((item) => item.id === meal.id);
  if (existing) {
    return saveCart(
      cart.map((item) =>
        item.id === meal.id ? { ...item, quantity: item.quantity + 1 } : item
      )
    );
  }
  return saveCart([
    ...cart,
    { id: meal.id, name: meal.name, price: meal.price, quantity: 1 },
  ]);
}
export function removeFromCart(id) {
  return saveCart(getCart().filter((item) => item.id !== id));
}
export function updateCartQuantity(id, quantity) {
  if (quantity < 1) return removeFromCart(id);

  return saveCart(
    getCart().map((item) => (item.id === id ? { ...item, quantity } : item))
  );
}
export function saveCustomer(customer) {
  localStorage.setItem(CUSTOMER_KEY, JSON.stringify(customer));
}

export function generateOrderId() {
  return `ORD-${1001 + getOrders().length}`;
}

export function placeOrder({ customer, cart, paymentMethod }) {
  const order = {
    id: generateOrderId(),
    customerName: customer.fullName,
    phone: customer.phone,
    tableNumber: Number(customer.tableNumber),
    items: cart.map((item) => ({
      id: item.id,
      name: item.name,
      quantity: item.quantity,
      price: item.price,
    })),
    total: getCartTotal(cart),
    paymentMethod,
    paymentStatus: "Paid",
    orderStatus: "Pending",
    createdAt: new Date().toISOString(),
  };

  localStorage.setItem(ORDERS_KEY, JSON.stringify([...getOrders(), order]));
  localStorage.removeItem(CART_KEY);
  localStorage.removeItem(CUSTOMER_KEY);
  return order;
}

export const ORDER_STATUSES = ["Pending", "Preparing", "Ready", "Served"];

export function updateOrderStatus(id, orderStatus) {
  const orders = getOrders();

  if (!orders.some((order) => order.id === id)) {
    throw new Error("Order not found");
  }

  const updated = orders.map((order) =>
    order.id === id ? { ...order, orderStatus } : order
  );

  localStorage.setItem(ORDERS_KEY, JSON.stringify(updated));
}