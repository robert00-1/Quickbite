import { useCallback, useEffect, useState } from "react";
import OrderCard from "../components/waiter/OrderCard";
import StatusFilter from "../components/waiter/StatusFilter";
import { ORDER_STATUSES } from "../utils/orderHelpers";
import { getWaiterOrders, updateWaiterOrderStatus } from "../services/waiterApi";

const REFRESH_MS = 3000;
const FINAL_STATUS = "Served";

function WaiterDashboard() {
  const [orders, setOrders] = useState([]);
  const [selectedStatus, setSelectedStatus] = useState("Active");
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");

  const loadOrders = useCallback(async () => {
    try {
      const data = await getWaiterOrders();
      setOrders(data);
      setError("");
    } catch {
      setError("Unable to load orders. Please check your connection.");
    }
  }, []);

  // Ask the backend for fresh orders every few seconds
  useEffect(() => {
    loadOrders();

    const interval = setInterval(loadOrders, REFRESH_MS);

    return () => {
      clearInterval(interval);
    };
  }, [loadOrders]);

  const handleStatusChange = async (id, status) => {
    try {
      await updateWaiterOrderStatus(id, status);
      setError("");
      loadOrders();
    } catch {
      setError("Unable to update the order. Please try again later.");
    }
  };

  const counts = orders.reduce(
    (acc, order) => {
      acc[order.orderStatus] = (acc[order.orderStatus] || 0) + 1;

      if (order.orderStatus !== FINAL_STATUS) {
        acc.Active += 1;
      }

      return acc;
    },
    { Active: 0 }
  );

  const term = search.trim().toLowerCase();

  const visibleOrders = orders.filter((order) => {
    const matchesStatus =
      selectedStatus === "Active"
        ? order.orderStatus !== FINAL_STATUS
        : order.orderStatus === selectedStatus;

    const matchesSearch =
      term === "" ||
      String(order.tableNumber).includes(term) ||
      order.customerName.toLowerCase().includes(term) ||
      order.id.toLowerCase().includes(term);

    return matchesStatus && matchesSearch;
  });

  return (
    <div className="min-h-screen bg-gray-100 px-6 py-12">
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-800">
              Welcome to Waiter Dashboard
            </h1>
            <p className="text-gray-600">
              {counts.Active} active {counts.Active === 1 ? "order" : "orders"}
            </p>
          </div>
          <input
            className="w-full rounded-lg border-2 border-gray-200 bg-white px-4 py-3 text-gray-700 focus:border-red-500 focus:outline-none sm:w-80"
            type="text"
            placeholder="Search by table, name or even order number"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>

        {error && (
          <p className="rounded-lg bg-red-50 p-3 text-center text-red-600">
            {error}
          </p>
        )}

        <StatusFilter
          statuses={ORDER_STATUSES}
          counts={counts}
          selectedStatus={selectedStatus}
          onStatusChange={setSelectedStatus}
        />

        {visibleOrders.length === 0 ? (
          <div className="rounded-xl bg-white p-10 text-center text-gray-500 shadow">
            No orders found.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
            {visibleOrders.map((order) => (
              <OrderCard
                key={order.id}
                order={order}
                onStatusChange={handleStatusChange}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default WaiterDashboard;