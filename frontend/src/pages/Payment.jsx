
import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import DemoPayment from "../components/checkout/DemoPayment";
import {
  getCustomer,
  getCart,
  getCartTotal,
  placeOrder,
} from "../utils/orderHelpers";

const API_ROOT =
  import.meta.env.VITE_API_ROOT || "http://127.0.0.1:5000/api";

function Payment() {
  const navigate = useNavigate();
  const location = useLocation();
  const method = location.state?.method;

  const [customer] = useState(() => getCustomer());
  const [cart] = useState(() => getCart());
  const [processing, setProcessing] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [pendingOrderId, setPendingOrderId] = useState(null);

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
  const finishPaidOrder = (order) => {
    const existingOrders = JSON.parse(
      localStorage.getItem("quickbite_orders") || "[]"
    );

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

    localStorage.removeItem("quickbite_cart");
    localStorage.removeItem("quickbite_customer");

    navigate("/order-confirmation");
  };

  // Check the actual order status returned by Flask.
  const checkPaymentStatus = async (orderId) => {
    const response = await fetch(`${API_ROOT}/orders/${orderId}`);
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Could not check payment status.");
    }

    const order = data.order;

    if (order.paymentStatus === "Paid") {
      finishPaidOrder(order);
      return "paid";
    }

    if (order.paymentStatus === "Failed") {
      setError(
        "M-Pesa payment failed. Please check your phone and try again."
      );
      setMessage("");
      setPendingOrderId(null);
      return "failed";
    }

    setMessage(
      "Your payment is still pending. Check your phone and approve the M-Pesa request."
    );

    return "pending";
  };

  const handleMpesaPayment = async () => {
    setProcessing(true);
    setError("");
    setMessage("Creating your order...");

    try {
      // 1. Create the order in the Flask database.
      const orderResponse = await fetch(`${API_ROOT}/orders`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerName: customer.fullName,
          phone: customer.phone,
          tableNumber: Number(customer.tableNumber),
          paymentMethod: "M-Pesa",
          items: cart.map((item) => ({
            id: Number(item.id),
            quantity: Number(item.quantity),
          })),
        }),
      });

      const orderData = await orderResponse.json();

      if (!orderResponse.ok) {
        throw new Error(orderData.error || "Could not create your order.");
      }

      const order = orderData.order;
      setMessage("Sending M-Pesa payment request...");

      // 2. Ask the backend to initiate the Daraja STK Push.
      const paymentResponse = await fetch(
        `${API_ROOT}/payments/stk-push`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ order_id: order.id }),
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
      setError(err.message || "Something went wrong during payment.");
      setMessage("");
    } finally {
      setProcessing(false);
    }
  };

  const handleContinue = () => {
    if (method === "M-Pesa") {
      handleMpesaPayment();
      return;
    }

    // Preserve the existing Cash/Card demo flow.
    placeOrder({ customer, cart, paymentMethod: method });
    navigate("/order-confirmation");
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
          <p className="mb-4 text-xl font-bold">{method}</p>

          <p className="text-gray-600">Order total</p>
          <p className="text-2xl font-bold text-red-500">
            KES {total.toLocaleString("en-KE")}
          </p>

          {method === "M-Pesa" && (
            <p className="mt-3 text-sm text-gray-500">
              For this presentation, the backend is configured to request
              a KSh 1 sandbox payment.
            </p>
          )}
        </div>

        {method !== "M-Pesa" && (
          <DemoPayment
            method={method}
            total={total}
            onSuccess={handleContinue}
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
