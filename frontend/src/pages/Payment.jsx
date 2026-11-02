
import { useState, useRef } from "react";
import { useCart } from "../context/CartContext";
import { Link, useLocation, useNavigate } from "react-router-dom";
import DemoPayment from "../components/checkout/DemoPayment";
import {
  getCustomer,
  getCart,
  getCartTotal,
} from "../utils/orderHelpers";

import { API_ROOT } from "../services/staffApi";

function Payment() {
  const navigate = useNavigate();
  const { clearCart } = useCart();
  const location = useLocation();
  const method = location.state?.method;

  const [customer] = useState(() => getCustomer());
  const [cart] = useState(() => getCart());
  const [mpesaPhone, setMpesaPhone] = useState(() => getCustomer()?.phone || "");
  const [processing, setProcessing] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [pendingOrderId, setPendingOrderId] = useState(null);
  const submitting = useRef(false);
  const createdOrder = useRef(null);

  if (!method || !customer || cart.length === 0) {
    return (
      <div className="min-h-screen bg-gray-100 px-6 py-12 text-center">
        <p className="mb-4 text-gray-700">
          Nothing to pay for yet. Please review your order first.
        </p>
        <Link to="/checkout" className="font-bold text-red-500">
          Back to Checkout
        </Link>
      </div>
    );
  }

  const total = getCartTotal(cart);

  // Save the backend order locally only after payment is confirmed.
  const finishOrder = (order) => {
    let existingOrders;
    try { existingOrders = JSON.parse(localStorage.getItem("quickbite_orders") || "[]"); } catch { existingOrders = []; }

    const updatedOrders = [
      ...existingOrders.filter(
        (existing) => String(existing.id) !== String(order.id)
      ),
      order,
    ];

    localStorage.setItem(
      "quickbite_orders",
      JSON.stringify(updatedOrders)
    );

    sessionStorage.removeItem("quickbite_checkout_request");
    clearCart();
    localStorage.removeItem("quickbite_customer");

    navigate("/order-confirmation");
  };

  // Check the actual order status returned by Flask.
  const checkPaymentStatus = async (orderId) => {
    const response = await fetch(`${API_ROOT}/orders/${orderId}`, { credentials: "include" });
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Could not check payment status.");
    }

    const order = data.order;

    if (order.paymentStatus === "Paid") {
      finishOrder(order);
      return "paid";
    }

    if (["Failed", "Cancelled"].includes(order.paymentStatus)) {
      setError(
        order.paymentStatus === "Cancelled" ? "The M-Pesa request was cancelled. Your cart has been kept; you can retry." : "M-Pesa payment failed. Your cart has been kept; please try again."
      );
      setMessage("");
      setPendingOrderId(null);
      return "failed";
    }

    if (!order.paymentRequestPending) {
      setPendingOrderId(null);
      setMessage("No active payment request is recorded. You can retry M-Pesa.");
      return "pending";
    }
    setMessage(
      "Your payment is still pending. Check your phone and approve the M-Pesa request."
    );

    return "pending";
  };

  const orderPayload = () => ({
    customerName: customer.fullName,
    phone: customer.phone,
    tableNumber: String(customer.tableNumber).trim().toUpperCase(),
    paymentMethod: method,
    items: cart.map((item) => ({id: String(item.id).startsWith("mealdb_") ? item.id : Number(item.id), quantity: Number(item.quantity)})),
  });

  const createOrder = async () => {
    if (createdOrder.current) return createdOrder.current;
    const payload = orderPayload();
    const serialized = JSON.stringify(payload);
    let draft;
    try { draft = JSON.parse(sessionStorage.getItem("quickbite_checkout_request")); } catch { draft = null; }
    if (!draft || draft.payload !== serialized) {
      draft = {payload: serialized, key: crypto.randomUUID()};
      sessionStorage.setItem("quickbite_checkout_request", JSON.stringify(draft));
    }
    const sessionResponse = await fetch(`${API_ROOT}/orders/session`, {method: "POST", credentials: "include"});
    if (!sessionResponse.ok) {
      const data = await sessionResponse.json().catch(() => ({}));
      throw new Error(data.error || "Guest checkout is temporarily unavailable.");
    }
    const response = await fetch(`${API_ROOT}/orders`, {
      method: "POST", credentials: "include",
      headers: {"Content-Type": "application/json", "Idempotency-Key": draft.key},
      body: serialized,
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Unable to save your order. Your cart has been kept.");
    if (!data.order?.id) throw new Error("The restaurant returned an incomplete order response. Your cart has been kept.");
    createdOrder.current = data.order;
    return data.order;
  };

  const handleMpesaPayment = async () => {
    if (submitting.current) return;
    if (!/^\+?(?:254[17][0-9]{8}|0[17][0-9]{8}|[17][0-9]{8})$/.test(mpesaPhone.replace(/[ ()-]/g, ""))) {
      setError("Enter a valid Kenyan M-Pesa phone number, such as 0712345678 or 0112345678.");
      return;
    }
    submitting.current = true;
    setProcessing(true);
    setError("");
    setMessage("Creating your order...");
    try {
      const order = await createOrder();
      setMessage("Sending M-Pesa payment request...");

      // 2. Ask the backend to initiate the Daraja STK Push.
      const paymentResponse = await fetch(
        `${API_ROOT}/payments/stk-push`,
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ order_id: order.id, phone: mpesaPhone }),
        }
      );

      const paymentData = await paymentResponse.json();

      if (!paymentResponse.ok) {
        throw new Error(
          paymentData.error || "Could not initiate M-Pesa payment."
        );
      }

      setPendingOrderId(order.id);
      setMessage(
        paymentData.customer_message ||
          "M-Pesa request sent. Check your phone and enter your PIN."
      );

      // 3. Poll the backend while waiting for Safaricom's callback.
      for (let attempt = 0; attempt < 30; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 3000));

        const status = await checkPaymentStatus(order.id);

        if (status === "paid" || status === "failed") {
          return;
        }
      }

      setMessage(
        "The payment is still pending. You can check the status below; do not submit another payment yet."
      );
    } catch (err) {
      if (createdOrder.current) setPendingOrderId(createdOrder.current.id);
      setError(err.message || "Something went wrong during payment.");
      setMessage("");
    } finally {
      submitting.current = false;
      setProcessing(false);
    }
  };

  const handleDirectPayment = async () => {
    if (submitting.current) return;
    submitting.current = true;
    setProcessing(true);
    setError("");
    try {
      finishOrder(await createOrder());
    } catch (err) {
      setError(err.message || "Unable to place your order. Please try again.");
    } finally {
      submitting.current = false;
      setProcessing(false);
    }
  };

  const handleContinue = () => {
    if (method === "M-Pesa") {
      handleMpesaPayment();
      return;
    }

    handleDirectPayment();
  };

  const handleManualStatusCheck = async () => {
    if (!pendingOrderId) return;

    setProcessing(true);
    setError("");

    try {
      await checkPaymentStatus(pendingOrderId);
    } catch (err) {
      setError(err.message || "Could not check payment status.");
    } finally {
      submitting.current = false;
      setProcessing(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 px-6 py-12">
      <div className="mx-auto max-w-md">
        <h1 className="mb-6 text-center text-3xl font-bold text-gray-800">
          Payment
        </h1>

        <div className="mb-5 rounded-xl bg-white p-6 shadow">
          <p className="text-gray-600">Payment method</p>
          <p className="mb-4 text-xl font-bold">{method === "Card" ? "Card at the restaurant" : method === "Cash" ? "Cash at the restaurant" : method}</p>

          <p className="text-gray-600">Order total</p>
          <p className="text-2xl font-bold text-red-500">
            KES {total.toLocaleString("en-KE")}
          </p>

          {method === "M-Pesa" && <label className="mt-4 block text-sm font-semibold text-gray-700">M-Pesa phone number
            <input type="tel" autoComplete="tel" value={mpesaPhone} onChange={(event) => setMpesaPhone(event.target.value)} disabled={processing || Boolean(pendingOrderId)} placeholder="0712345678 or 0112345678" className="mt-2 w-full rounded-lg border border-gray-200 px-3 py-3 outline-none focus:border-red-500" />
          </label>}
          {method === "M-Pesa" && (
            <p className="mt-3 text-sm text-gray-500">
              Approve the payment request on your phone. Your order remains pending until payment is verified.
            </p>
          )}
        </div>

        {method !== "M-Pesa" && (
          <DemoPayment
            method={method}
            total={total}
            onSuccess={handleContinue}
            processing={processing}
          />
        )}

        {method === "M-Pesa" && (
          <button
            type="button"
            onClick={handleContinue}
            disabled={processing || Boolean(pendingOrderId)}
            className="w-full rounded-lg bg-red-500 px-6 py-3 font-bold text-white transition hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {processing ? "Processing..." : "Pay with M-Pesa"}
          </button>
        )}

        {message && (
          <p className="mt-4 rounded-lg bg-blue-50 p-4 text-center text-blue-800">
            {message}
          </p>
        )}

        {error && (
          <p className="mt-4 rounded-lg bg-red-50 p-4 text-center text-red-700">
            {error}
          </p>
        )}

        {method === "M-Pesa" &&
          pendingOrderId &&
          !processing && (
            <button
              type="button"
              onClick={handleManualStatusCheck}
              className="mt-4 w-full rounded-lg border border-gray-300 bg-white px-6 py-3 font-semibold text-gray-700 hover:bg-gray-50"
            >
              Check Payment Status
            </button>
          )}
      </div>
    </div>
  );
}

export default Payment;
