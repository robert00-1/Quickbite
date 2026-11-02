
import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import OrderCard from "../components/waiter/OrderCard";
import StatusFilter from "../components/waiter/StatusFilter";
import ReceiptPreview from "../components/waiter/ReceiptPreview";
import WaiterSettingsMenu from "../components/waiter/WaiterSettingsMenu";
import { ORDER_STATUSES } from "../utils/orderHelpers";

import {
  clearStaffSession,
  getStaffUser,
  staffRequest,
} from "../services/staffApi";

const REFRESH_MS = 3000;
const WAITER_REFRESH_MS = 10000;
const FINAL_STATUS = "Served";

const DAYS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];

function normalizeOrder(order) {
  const incomingStatus = String(
    order.status ?? order.order_status ?? "Pending"
  );

  const normalizedStatus =
    ORDER_STATUSES.find(
      (status) => status.toLowerCase() === incomingStatus.toLowerCase()
    ) || "Pending";

  return {
    id: String(order.id),
    preparationMinutes: order.preparationMinutes,
    servingMinutes: order.servingMinutes,
    receiptUrl: order.receipt_url,
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

  const [activePanel, setActivePanel] = useState("orders");
  const [orders, setOrders] = useState([]);
  const [waiters, setWaiters] = useState([]);
  const [availableWaiters, setAvailableWaiters] = useState([]);

  const [selectedWaiterId, setSelectedWaiterId] = useState(
    () => sessionStorage.getItem("quickbite_selected_waiter_id") || ""
  );

  const [profileWaiter, setProfileWaiter] = useState(null);
  const [selectedStatus, setSelectedStatus] = useState("Active");
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [rosterError, setRosterError] = useState("");
  const [availableError, setAvailableError] = useState("");
  const [loading, setLoading] = useState(true);
  const [savingOrderId, setSavingOrderId] = useState(null);
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

  // Load every active waiter for the team.
  const loadWaiters = useCallback(async () => {
    try {
      const data = await staffRequest("/waiter-profiles");
      const activeWaiters = Array.isArray(data) ? data : [];

      setWaiters(activeWaiters);
      setRosterError("");

      setSelectedWaiterId((current) => {
        const savedId =
          current || sessionStorage.getItem("quickbite_selected_waiter_id");

        const exists = activeWaiters.some(
          (waiter) => String(waiter.id) === String(savedId)
        );

        if (exists) return String(savedId);

        sessionStorage.removeItem("quickbite_selected_waiter_id");
        return "";
      });

      setProfileWaiter((current) => {
        if (!current) return null;

        return (
          activeWaiters.find(
            (waiter) => String(waiter.id) === String(current.id)
          ) || null
        );
      });
    } catch (err) {
      console.error("Waiter roster loading error:", err);

      if (!handleSessionError(err)) {
        setRosterError(err.message || "Unable to load the waiter team.");
      }
    }
  }, [handleSessionError]);

  // Load only waiters currently on shift and free of active orders.
  const loadAvailableWaiters = useCallback(async () => {
    try {
      const data = await staffRequest("/waiter-profiles/available");

      setAvailableWaiters(
        Array.isArray(data?.waiters) ? data.waiters : []
      );

      setAvailableError("");
    } catch (err) {
      console.error("Available waiters loading error:", err);

      if (!handleSessionError(err)) {
        setAvailableError(
          err.message || "Unable to load available waiters."
        );
      }
    }
  }, [handleSessionError]);

  const loadOrders = useCallback(
    async (showLoading = false) => {
      if (requestInProgress.current) return;

      requestInProgress.current = true;
      if (showLoading) setLoading(true);

      try {
        const data = await staffRequest("/waiter/orders");

        if (!Array.isArray(data)) {
          throw new Error("The backend did not return an order list.");
        }

        setOrders(data.map(normalizeOrder));
        setError("");
      } catch (err) {
        console.error("Waiter orders loading error:", err);

        if (!handleSessionError(err)) {
          setError(
            err.message || "Unable to load orders. Check your connection."
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
    const interval = setInterval(() => loadOrders(), REFRESH_MS);

    return () => clearInterval(interval);
  }, [loadOrders]);

  useEffect(() => {
    loadWaiters();
    loadAvailableWaiters();

    const interval = setInterval(() => {
      loadWaiters();
      loadAvailableWaiters();
    }, WAITER_REFRESH_MS);

    return () => clearInterval(interval);
  }, [loadWaiters, loadAvailableWaiters]);

  const handleAssignWaiter = async (orderId, waiterId) => {
    if (!waiterId) {
      setError("Choose an available waiter before assigning the order.");
      return;
    }

    const isAvailable = availableWaiters.some(
      (waiter) => String(waiter.id) === String(waiterId)
    );

    if (!isAvailable) {
      setError(
        "This waiter is no longer available. Refresh the available waiter list."
      );
      await loadAvailableWaiters();
      return;
    }

    setSavingOrderId(String(orderId));
    setError("");

    try {
      const data = await staffRequest(
        `/waiter/orders/${Number(orderId)}/assignment`,
        {
          method: "PATCH",
          body: JSON.stringify({ waiter_id: Number(waiterId) }),
        }
      );

      const updatedOrder = normalizeOrder(data);

      setOrders((previous) =>
        previous.map((order) =>
          order.id === String(orderId) ? updatedOrder : order
        )
      );

      await loadAvailableWaiters();
    } catch (err) {
      console.error("Waiter assignment error:", err);

      if (!handleSessionError(err)) {
        setError(err.message || "Unable to assign this waiter.");
      }

      await loadAvailableWaiters();
    } finally {
      setSavingOrderId(null);
    }
  };

  const handleStatusChange = async (orderId, status) => {
    const order = orders.find((item) => item.id === String(orderId));

    if (!order) {
      setError("Order not found. Refresh the dashboard and try again.");
      return;
    }

    setSavingOrderId(String(orderId));
    setError("");

    try {
      const assignedWaiterId = order.assignedWaiterId;

      const assignedWaiterIsActive = waiters.some(
        (waiter) => String(waiter.id) === String(assignedWaiterId)
      );

      if (!assignedWaiterId || !assignedWaiterIsActive) {
        const selectedWaiterIsAvailable = availableWaiters.some(
          (waiter) => String(waiter.id) === String(selectedWaiterId)
        );

        if (!selectedWaiterId || !selectedWaiterIsAvailable) {
          setError(
            "Select a waiter who is currently available, or assign an available waiter to this order."
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

      if (status === FINAL_STATUS) {
        setPrintOrder(updatedOrder);
      }

      await loadAvailableWaiters();
    } catch (err) {
      console.error("Order status update error:", err);

      if (!handleSessionError(err)) {
        setError(err.message || "Unable to update this order.");
      }

      await loadAvailableWaiters();
    } finally {
      setSavingOrderId(null);
    }
  };

  const handleLogout = async () => {
    try {
      await staffRequest("/auth/logout", { method: "POST" });
    } catch (err) {
      console.error("Logout request failed:", err);
    } finally {
      clearStaffSession();
      sessionStorage.removeItem("quickbite_selected_waiter_id");
      navigate("/staff-login", { replace: true });
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
      String(order.tableNumber ?? "").toLowerCase().includes(term) ||
      String(order.customerName ?? "").toLowerCase().includes(term) ||
      String(order.id ?? "").toLowerCase().includes(term);

    return matchesStatus && matchesSearch;
  });

  return (
    <>
      <main className="min-h-screen bg-gray-100 px-4 py-8 sm:px-6">
        <div className="mx-auto max-w-6xl space-y-6">

          <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
            <div className="flex items-center gap-3">
              <WaiterSettingsMenu
                onSelect={setActivePanel}
                onLogout={handleLogout}
              />

              <div>
                <h1 className="text-2xl font-bold text-gray-800 sm:text-3xl">
                  Waiter Dashboard
                </h1>

                <p className="mt-1 text-sm text-gray-600">
                  Signed in as {staffUser?.full_name || "Waiter account"}.
                  {" "}
                  {counts.Active} active{" "}
                  {counts.Active === 1 ? "order" : "orders"}.
                </p>
              </div>
            </div>
          </div>

          {activePanel !== "orders" && (
            <button
              type="button"
              onClick={() => {
                setActivePanel("orders");
                setProfileWaiter(null);
              }}
              className="rounded-lg bg-gray-800 px-4 py-2 font-semibold text-white hover:bg-gray-900"
            >
              Back to Orders
            </button>
          )}

          {/* Waiter Team */}
          {activePanel === "team" && (
            <section className="rounded-xl bg-white p-5 shadow">
              <h2 className="text-xl font-bold text-gray-800">
                Waiter Team
              </h2>

              <p className="mt-1 text-sm text-gray-500">
                Select a waiter to view their profile and weekly schedule.
              </p>

              {rosterError && (
                <p role="alert" className="mt-3 rounded-lg bg-red-50 p-3 text-red-700">
                  {rosterError}
                </p>
              )}

              {waiters.length === 0 ? (
                <p className="mt-4 text-sm text-gray-500">
                  No active waiter profiles found.
                </p>
              ) : (
                <div className="mt-4 flex flex-col items-start gap-2">
                  {waiters.map((waiter, index) => (
                    <button
                      key={waiter.id}
                      type="button"
                      onClick={() => setProfileWaiter(waiter)}
                      className={`rounded-full px-4 py-2 text-sm font-semibold ${
                        String(profileWaiter?.id) === String(waiter.id)
                          ? "bg-blue-700 text-white"
                          : "bg-blue-50 text-blue-800 hover:bg-blue-100"
                      }`}
                    >
                      {index + 1}. {waiter.full_name}
                    </button>
                  ))}
                </div>
              )}

              {profileWaiter && (
                <div className="mt-6 rounded-xl border border-gray-200 p-5">
                  <h3 className="text-lg font-bold text-gray-800">
                    {profileWaiter.full_name}
                  </h3>

                  <p className="mt-1 text-sm text-green-700">
                    Active waiter
                  </p>

                  <h4 className="mt-5 font-semibold text-gray-700">
                    Weekly Schedule
                  </h4>

                  {Array.isArray(profileWaiter.weekly_shifts) &&
                  profileWaiter.weekly_shifts.length > 0 ? (
                    <div className="mt-3 space-y-2">
                      {DAYS.map((day, index) => {
                        const dayShifts =
                          profileWaiter.weekly_shifts.filter(
                            (shift) =>
                              Number(shift.day_of_week) === index &&
                              shift.is_active !== false
                          );

                        return (
                          <div
                            key={day}
                            className="flex flex-col justify-between gap-1 rounded-lg bg-gray-50 px-4 py-3 sm:flex-row"
                          >
                            <span className="font-medium text-gray-700">
                              {day}
                            </span>

                            <span className="text-sm text-gray-600">
                              {dayShifts.length > 0
                                ? dayShifts
                                    .map(
                                      (shift) =>
                                        `${shift.start_time} – ${shift.end_time}`
                                    )
                                    .join(", ")
                                : "No scheduled shift"}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="mt-2 text-sm text-gray-500">
                      No weekly schedule has been provided.
                    </p>
                  )}
                </div>
              )}
            </section>
          )}

          {/* Available Waiters */}
          {activePanel === "available" && (
            <section className="rounded-xl bg-white p-5 shadow">
              <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
                <div>
                  <h2 className="text-xl font-bold text-gray-800">
                    Available Waiters
                  </h2>

                  <p className="mt-1 text-sm text-gray-500">
                    Waiters currently on shift and free to receive an order.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    loadAvailableWaiters();
                    loadWaiters();
                  }}
                  className="rounded-lg bg-gray-800 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-900"
                >
                  Refresh
                </button>
              </div>

              {availableError && (
                <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-red-700">
                  {availableError}
                </p>
              )}

              {availableWaiters.length === 0 ? (
                <p className="mt-5 rounded-lg bg-gray-50 p-5 text-center text-gray-500">
                  No waiters are currently available.
                </p>
              ) : (
                <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {availableWaiters.map((waiter, index) => (
                    <div
                      key={waiter.id}
                      className="rounded-lg border border-green-200 bg-green-50 p-4"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <h3 className="font-semibold text-gray-800">
                          {index + 1}. {waiter.full_name}
                        </h3>

                        <span className="rounded-full bg-green-100 px-2 py-1 text-xs font-semibold text-green-700">
                          Available
                        </span>
                      </div>

                      {waiter.shift && (
                        <p className="mt-2 text-sm text-gray-600">
                          {waiter.shift.start_time} – {waiter.shift.end_time}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}

          {/* Orders */}
          {activePanel === "orders" && (
            <>
              <input
                className="w-full rounded-lg border-2 border-gray-200 bg-white px-4 py-3 text-gray-700 focus:border-red-500 focus:outline-none"
                type="text"
                placeholder="Search by table, customer name, or order number"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />

              {error && (
                <p role="alert" className="rounded-lg bg-red-50 p-3 text-center text-red-700">
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
                      waiters={availableWaiters}
                      selectedWaiterId={selectedWaiterId}
                      isSaving={savingOrderId === order.id}
                      onAssignWaiter={handleAssignWaiter}
                      onStatusChange={handleStatusChange}
                      onPrintReceipt={setPrintOrder}
                    />
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </main>

      <ReceiptPreview
        order={printOrder}
        onClose={() => setPrintOrder(null)}
      />
    </>
  );
}

export default WaiterDashboard;
