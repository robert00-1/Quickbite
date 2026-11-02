import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import App from "./App";
import {
  getCartTotal,
  saveCustomer,
  getCustomer,
  generateOrderId,
  placeOrder,
  updateStoredOrder,
  getOrders,
} from "./utils/orderHelpers";

describe("Order Helpers Utilities", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("calculates cart total correctly", () => {
    const cart = [
      { id: 1, name: "Burger", price: 500, quantity: 2 },
      { id: 2, name: "Chips", price: 200, quantity: 3 },
    ];
    expect(getCartTotal(cart)).toBe(1600);
  });

  it("saves and retrieves customer details", () => {
    const customer = { fullName: "Jane Doe", phone: "0711223344", tableNumber: "A4" };
    saveCustomer(customer);
    expect(getCustomer()).toEqual(customer);
  });

  it("generates structured order IDs", () => {
    const id = generateOrderId();
    expect(id).toMatch(/^ORD-\d+$/);
  });

  it("places and updates orders in storage", () => {
    const customer = { fullName: "Alice", phone: "0700112233", tableNumber: "B1" };
    const cart = [{ id: 1, name: "Juice", price: 150, quantity: 1 }];

    const order = placeOrder({ customer, cart, paymentMethod: "Cash" });
    expect(order.customerName).toBe("Alice");
    expect(order.tableNumber).toBe("B1");
    expect(order.total).toBe(150);

    const stored = getOrders();
    expect(stored.length).toBe(1);

    updateStoredOrder(order.id, { orderStatus: "Ready" });
    const updated = getOrders();
    expect(updated[0].orderStatus).toBe("Ready");
  });
});

describe("Application Component", () => {
  it("renders Navbar and core navigation without crashing", () => {
    render(<App />);
    expect(screen.getByAltText(/QuickBite/i)).toBeInTheDocument();
    expect(screen.getByText("Menu")).toBeInTheDocument();
    expect(screen.getByText("Cart")).toBeInTheDocument();
  });
});
