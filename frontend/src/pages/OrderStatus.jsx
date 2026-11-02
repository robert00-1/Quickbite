import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getOrders, updateStoredOrder } from "../utils/orderHelpers";

import { API_ROOT } from "../services/staffApi";

const statuses = ["Pending", "Preparing", "Ready", "Served"];

function OrderStatus() {
  const [orders, setOrders] = useState([]);
  const [feedback, setFeedback] = useState({});
  const [message, setMessage] = useState("");
  async function complain(order) {
    try {
      const res = await fetch(`${API_ROOT}/complaints`, {method: "POST", credentials: "include", headers: {"Content-Type": "application/json"}, body: JSON.stringify({orderId: Number(order.id), message: feedback[order.id] || "My meal is taking longer than the estimate."})});
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setMessage("Your complaint was sent to the manager.");
    } catch (err) { setMessage(err.message); }
  }

  useEffect(() => {
    let cancelled = false;

    const syncWithBackend = async (currentOrders) => {
      const numericOrders = currentOrders.filter(
        (o) => !isNaN(Number(o.id)) && o.orderStatus !== "Served"
      );

      for (const ord of numericOrders) {
        try {
          const res = await fetch(`${API_ROOT}/orders/${ord.id}`, { credentials: "include" });
          if (!res.ok) continue;
          const data = await res.json();
          if (data?.order && !cancelled) {
            updateStoredOrder(ord.id, data.order);
          }
        } catch {
          // Ignore network errors in polling
        }
      }

      if (!cancelled) {
        setOrders([...getOrders()].reverse());
      }
    };

    const loadOrders = () => {
      const current = getOrders();
      setOrders([...current].reverse());
      syncWithBackend(current);
    };

    loadOrders();

    const interval = setInterval(loadOrders, 4000);
    window.addEventListener("storage", loadOrders);

    return () => {
      cancelled = true;
      clearInterval(interval);
      window.removeEventListener("storage", loadOrders);
    };
  }, []);

  if (orders.length === 0) {
    return (
      <main className="mx-auto max-w-[1200px] px-5 py-10">
        <h1 className="mb-8 text-3xl font-bold text-gray-800">
          Order Status
        </h1>

        <div className="rounded-xl bg-white p-12 text-center shadow-sm">
          <p className="mb-6 text-lg text-gray-600">
            You don't have any orders yet.
          </p>

          <Link
            to="/menu"
            className="inline-block rounded-lg bg-red-500 px-6 py-3 font-semibold text-white no-underline hover:bg-red-600"
          >
            Browse Menu
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-[1200px] px-5 py-10">
      <h1 className="mb-3 text-3xl font-bold text-gray-800">
        Order Status
      </h1>

      <p className="mb-8 text-gray-600">
        Track the progress of your orders.
      </p>

      {message && <p role="status">{message}</p>}
      <div className="flex flex-col gap-6">
        {orders.map((order) => {
          const currentIndex = statuses.indexOf(order.orderStatus);

          return (
            <div
              key={order.id}
              className="rounded-xl bg-white p-6 shadow-sm"
            >
              <div className="mb-6 flex flex-col justify-between gap-3 sm:flex-row">
                <div>
                  <h2 className="text-xl font-bold text-gray-800">
                    {order.id}
                  </h2>

                  <p className="text-gray-600">
                    Table {order.tableNumber}
                  </p>
                </div>

                <p className="font-bold text-red-500">
                  KSh {order.total}
                </p>
              </div>

              <p>Preparation: {order.preparationMinutes} min · Serving: {order.servingMinutes} min</p>
              {order.receiptUrl && <a className="text-red-500" href={`${API_ROOT.replace(/\/api$/, "")}${order.receiptUrl}/view`} target="_blank" rel="noreferrer">View / Print receipt</a>}
              {order.isLate && <div className="my-4"><label>Late meal feedback<input aria-label={`Feedback for order ${order.id}`} value={feedback[order.id] || ""} onChange={(e) => setFeedback({...feedback, [order.id]: e.target.value})} className="border p-2" /></label><button type="button" className="ml-2 text-red-600" onClick={() => complain(order)}>Report late meal</button></div>}
              {/* Status Progress */}
              <div className="grid grid-cols-4 gap-2">
                {statuses.map((status, index) => {
                  const completed = index <= currentIndex;

                  return (
                    <div key={status} className="text-center">
                      <div
                        className={`mx-auto mb-2 h-4 w-4 rounded-full ${
                          completed
                            ? "bg-red-500"
                            : "bg-gray-300"
                        }`}
                      />

                      <p
                        className={`text-xs font-semibold sm:text-sm ${
                          completed
                            ? "text-red-500"
                            : "text-gray-400"
                        }`}
                      >
                        {status}
                      </p>
                    </div>
                  );
                })}
              </div>

              <div className="mt-6 border-t border-gray-200 pt-5">
                <h3 className="mb-3 font-bold text-gray-800">
                  Items
                </h3>

                <div className="flex flex-col gap-2">
                  {order.items.map((item) => (
                    <div
                      key={item.id}
                      className="flex justify-between text-sm"
                    >
                      <span className="text-gray-600">
                        {item.name} × {item.quantity}
                      </span>

                      <span className="font-semibold text-gray-800">
                        KSh {item.price * item.quantity}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="mt-5 rounded-lg bg-red-50 p-4 text-center">
                <p className="font-bold text-red-500">
                  Current Status: {order.orderStatus}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </main>
  );
}

export default OrderStatus;