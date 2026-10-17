import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import OrderCard from "../components/waiter/OrderCard";
import StatusFilter from "../components/waiter/StatusFilter";
import ReceiptPreview from "../components/waiter/ReceiptPreview";

import { ORDER_STATUSES } from "../utils/orderHelpers";

import {
  clearStaffSession,
  getStaffUser,
  staffRequest,
} from "../services/staffApi";

const REFRESH_MS = 3000;
const WAITER_REFRESH_MS = 10000;
const FINAL_STATUS = "Served";

function normalizeOrder(order) {
  const incomingStatus = String(
    order.status ?? order.order_status ?? "Pending"
  );

  const normalizedStatus =
    ORDER_STATUSES.find(
      (status) =>
        status.toLowerCase() === incomingStatus.toLowerCase()
    ) || "Pending";

  return {
    id: String(order.id),
    customerName: order.customer || order.customer_name || "Customer",
    phone: order.phone || "",
    tableNumber: order.table_number,
    total: Number(order.total_amount ?? order.total ?? 0),
    paymentMethod: order.payment_method || "",
    paymentStatus: order.payment_status || "",
    orderStatus: normalizedStatus,
    createdAt: order.created_at || order.createdAt || null,

    items: (order.items || []).map((item, index) => ({
      id: item.id ?? `${order.id}-${index}`,
      name: item.name || "Unknown item",
      quantity: Number(item.quantity || 1),
      price: Number(item.price || 0),
    })),

    assignedWaiterId: order.assigned_waiter_id ?? null,
    assignedWaiterName: order.assigned_waiter_name ?? null,
    servedByName: order.served_by_name ?? null,
    mpesaReceiptNumber: order.mpesa_receipt_number ?? null,
  };
}

function WaiterDashboard() {
  const navigate = useNavigate();
  const staffUser = getStaffUser();

  const [orders, setOrders] = useState([]);
  const [waiters, setWaiters] = useState([]);

  const [selectedWaiterId, setSelectedWaiterId] = useState(
    () =>
      sessionStorage.getItem("quickbite_selected_waiter_id") || ""
  );

  const [selectedStatus, setSelectedStatus] = useState("Active");
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [rosterError, setRosterError] = useState("");
  const [loading, setLoading] = useState(true);
  const [savingOrderId, setSavingOrderId] = useState(null);

  // A non-null order opens the receipt preview.
  const [printOrder, setPrintOrder] = useState(null);

  const requestInProgress = useRef(false);

  const handleSessionError = useCallback(
    (err) => {
      if (err.status === 401 || err.status === 403) {
        clearStaffSession();
        sessionStorage.removeItem("quickbite_selected_waiter_id");
        navigate("/staff-login", { replace: true });
        return true;
      }

      return false;
    },
    [navigate]
  );

  const loadWaiters = useCallback(async () => {
    try {
      const data = await staffRequest("/waiter-profiles");
      const activeWaiters = Array.isArray(data) ? data : [];

      setWaiters(activeWaiters);
      setRosterError("");

      setSelectedWaiterId((current) => {
        const savedId =
          current ||
          sessionStorage.getItem("quickbite_selected_waiter_id");

        const exists = activeWaiters.some(
          (waiter) => String(waiter.id) === String(savedId)
        );

        if (exists) {
          return String(savedId);
        }

        sessionStorage.removeItem("quickbite_selected_waiter_id");
        return "";
      });
    } catch (err) {
      console.error("Waiter roster loading error:", err);

      if (!handleSessionError(err)) {
        setRosterError(
          err.message || "Unable to load the waiter roster."
        );
      }
    }
  }, [handleSessionError]);

  const loadOrders = useCallback(
    async (showLoading = false) => {
      if (requestInProgress.current) return;

      requestInProgress.current = true;

      if (showLoading) {
        setLoading(true);
      }

      try {
        const data = await staffRequest("/waiter/orders");

        if (!Array.isArray(data)) {
          throw new Error(
            "The backend did not return an order list."
          );
        }

        setOrders(data.map(normalizeOrder));
        setError("");
      } catch (err) {
        console.error("Waiter orders loading error:", err);

        if (!handleSessionError(err)) {
          setError(
            err.message ||
              "Unable to load orders. Check your connection."
          );
        }
      } finally {
        requestInProgress.current = false;
        setLoading(false);
      }
    },
    [handleSessionError]
  );

  useEffect(() => {
    loadOrders(true);

    const interval = setInterval(() => {
      loadOrders();
    }, REFRESH_MS);

    return () => clearInterval(interval);
  }, [loadOrders]);

  useEffect(() => {
    loadWaiters();

    const interval = setInterval(
      loadWaiters,
      WAITER_REFRESH_MS
    );

    return () => clearInterval(interval);
  }, [loadWaiters]);

  const handleSelectWaiter = (event) => {
    const waiterId = event.target.value;

    setSelectedWaiterId(waiterId);

    if (waiterId) {
      sessionStorage.setItem(
        "quickbite_selected_waiter_id",
        waiterId
      );
    } else {
      sessionStorage.removeItem("quickbite_selected_waiter_id");
    }
  };

  const handleAssignWaiter = async (orderId, waiterId) => {
    if (!waiterId) {
      setError("Choose a waiter before assigning the order.");
      return;
    }

    setSavingOrderId(String(orderId));
    setError("");

    try {
      const data = await staffRequest(
        `/waiter/orders/${Number(orderId)}/assignment`,
        {
          method: "PATCH",
          body: JSON.stringify({
            waiter_id: Number(waiterId),
          }),
        }
      );

      const updatedOrder = normalizeOrder(data);

      setOrders((previous) =>
        previous.map((order) =>
          order.id === String(orderId) ? updatedOrder : order
        )
      );
    } catch (err) {
      console.error("Waiter assignment error:", err);

      if (!handleSessionError(err)) {
        setError(
          err.message || "Unable to assign this waiter."
        );
      }
    } finally {
      setSavingOrderId(null);
    }
  };

  const handleStatusChange = async (orderId, status) => {
    const order = orders.find(
      (item) => item.id === String(orderId)
    );

    if (!order) {
      setError(
        "Order not found. Refresh the dashboard and try again."
      );
      return;
    }

    setSavingOrderId(String(orderId));
    setError("");

    try {
      const assignedWaiterId = order.assignedWaiterId;

      const assignedWaiterIsActive = waiters.some(
        (waiter) =>
          String(waiter.id) === String(assignedWaiterId)
      );

      // Assign the currently selected waiter if the order is unassigned.
      if (!assignedWaiterId || !assignedWaiterIsActive) {
        if (!selectedWaiterId) {
          setError(
            "Select your name at the top of the screen or assign a waiter to this order first."
          );
          return;
        }

        await staffRequest(
          `/waiter/orders/${Number(orderId)}/assignment`,
          {
            method: "PATCH",
            body: JSON.stringify({
              waiter_id: Number(selectedWaiterId),
            }),
          }
        );
      }

      const data = await staffRequest(
        `/waiter/orders/${Number(orderId)}/status`,
        {
          method: "PATCH",
          body: JSON.stringify({ status }),
        }
      );

      const updatedOrder = normalizeOrder(data);

      setOrders((previous) =>
        previous.map((item) =>
          item.id === String(orderId) ? updatedOrder : item
        )
      );

      // Show the full-screen POS receipt when the order becomes Ready.
      // Do not automatically print or download it.
      if (status === "Served") {
        setPrintOrder(updatedOrder);
      }
    } catch (err) {
      console.error("Order status update error:", err);

      if (!handleSessionError(err)) {
        setError(
          err.message || "Unable to update this order."
        );
      }
    } finally {
      setSavingOrderId(null);
    }
  };

  const handleLogout = async () => {
    try {
      await staffRequest("/auth/logout", {
        method: "POST",
      });
    } catch (err) {
      console.error("Logout request failed:", err);
    } finally {
      clearStaffSession();
      sessionStorage.removeItem("quickbite_selected_waiter_id");
      navigate("/staff-login", { replace: true });
    }
  };

  const selectedWaiter = waiters.find(
    (waiter) =>
      String(waiter.id) === String(selectedWaiterId)
  );

  const counts = orders.reduce(
    (acc, order) => {
      acc[order.orderStatus] =
        (acc[order.orderStatus] || 0) + 1;

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
      String(order.tableNumber ?? "")
        .toLowerCase()
        .includes(term) ||
      String(order.customerName ?? "")
        .toLowerCase()
        .includes(term) ||
      String(order.id ?? "").toLowerCase().includes(term);

    return matchesStatus && matchesSearch;
  });

  return (
    <>
      {/* Do not hide the receipt on screen.
          ReceiptPreview owns its own print styles. */}

      <main className="min-h-screen bg-gray-100 px-4 py-8 sm:px-6">
        <div className="mx-auto max-w-6xl space-y-6">
          {/* Header */}
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-800">
                Shared Waiter Dashboard
              </h1>

              <p className="mt-2 text-gray-600">
                Signed in as{" "}
                {staffUser?.full_name || "Waiter account"}.{" "}
                {counts.Active} active{" "}
                {counts.Active === 1 ? "order" : "orders"}.
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <Link
                to="/menu"
                className="rounded-lg border border-red-500 bg-white px-4 py-3 font-semibold text-red-600 hover:bg-red-50"
              >
                Back to Menu
              </Link>

              <button
                type="button"
                onClick={handleLogout}
                className="rounded-lg bg-gray-800 px-4 py-3 font-semibold text-white hover:bg-gray-900"
              >
                Log Out
              </button>
            </div>
          </div>

          {/* Shared waiter roster */}
          <section className="rounded-xl bg-white p-5 shadow">
            <h2 className="text-xl font-bold text-gray-800">
              Waiter Team
            </h2>

            <p className="mt-1 text-sm text-gray-500">
              Select your name before taking an unassigned order.
            </p>

            {rosterError && (
              <p
                role="alert"
                className="mt-3 rounded-lg bg-red-50 p-3 text-red-700"
              >
                {rosterError}
              </p>
            )}

            <div className="mt-4 flex flex-wrap gap-2">
              {waiters.map((waiter) => (
                <span
                  key={waiter.id}
                  className={`rounded-full px-4 py-2 text-sm font-semibold ${
                    String(waiter.id) ===
                    String(selectedWaiterId)
                      ? "bg-blue-700 text-white"
                      : "bg-blue-50 text-blue-800"
                  }`}
                >
                  {waiter.full_name}
                </span>
              ))}
            </div>

            <div className="mt-5 max-w-md">
              <label
                htmlFor="active-waiter"
                className="mb-2 block font-semibold text-gray-700"
              >
                I'm working as
              </label>

              <select
                id="active-waiter"
                value={selectedWaiterId}
                onChange={handleSelectWaiter}
                className="w-full rounded-lg border border-gray-300 bg-white px-4 py-3 focus:border-red-500 focus:outline-none"
              >
                <option value="">Choose your name</option>

                {waiters.map((waiter) => (
                  <option
                    key={waiter.id}
                    value={String(waiter.id)}
                  >
                    {waiter.full_name}
                  </option>
                ))}
              </select>

              {selectedWaiter && (
                <p className="mt-2 text-sm text-green-700">
                  Selected: {selectedWaiter.full_name}
                </p>
              )}
            </div>
          </section>

          {/* Order search */}
          <input
            className="w-full rounded-lg border-2 border-gray-200 bg-white px-4 py-3 text-gray-700 focus:border-red-500 focus:outline-none"
            type="text"
            placeholder="Search by table, customer name, or order number"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />

          {error && (
            <p
              role="alert"
              className="rounded-lg bg-red-50 p-3 text-center text-red-700"
            >
              {error}
            </p>
          )}

          <StatusFilter
            statuses={ORDER_STATUSES}
            counts={counts}
            selectedStatus={selectedStatus}
            onStatusChange={setSelectedStatus}
          />

          {loading ? (
            <div className="rounded-xl bg-white p-10 text-center text-gray-500 shadow">
              Loading orders...
            </div>
          ) : visibleOrders.length === 0 ? (
            <div className="rounded-xl bg-white p-10 text-center text-gray-500 shadow">
              No orders found.
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
              {visibleOrders.map((order) => (
                <OrderCard
                  key={order.id}
                  order={order}
                  waiters={waiters}
                  selectedWaiterId={selectedWaiterId}
                  isSaving={savingOrderId === order.id}
                  onAssignWaiter={handleAssignWaiter}
                  onStatusChange={handleStatusChange}
                  onPrintReceipt={setPrintOrder}
                />
              ))}
            </div>
          )}
        </div>
      </main>

      {/* Full-screen POS receipt preview.
          The receipt is visible on screen by default. */}
      <ReceiptPreview
        order={printOrder}
        onClose={() => setPrintOrder(null)}
      />
    </>
  );
}

export default WaiterDashboard;