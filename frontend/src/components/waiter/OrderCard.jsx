import { useEffect, useState } from "react";
import { ORDER_STATUSES } from "../../utils/orderHelpers";

const NEXT_ACTION = {
  Pending: "Start Preparing",
  Preparing: "Mark Ready",
  Ready: "Mark Served",
};

const STATUS_STYLES = {
  Pending: {
    border: "border-red-500",
    badge: "bg-red-100 text-red-700",
  },
  Preparing: {
    border: "border-yellow-500",
    badge: "bg-yellow-100 text-yellow-700",
  },
  Ready: {
    border: "border-green-500",
    badge: "bg-green-100 text-green-700",
  },
  Served: {
    border: "border-gray-500",
    badge: "bg-gray-100 text-gray-700",
  },
};

function minutesAgo(isoDate) {
  if (!isoDate) return "Time unavailable";

  const timestamp = new Date(isoDate).getTime();

  if (Number.isNaN(timestamp)) return "Time unavailable";

  const minutes = Math.max(
    0,
    Math.floor((Date.now() - timestamp) / 60000)
  );

  if (minutes < 1) return "Just now";
  if (minutes === 1) return "1 min ago";

  return `${minutes} min ago`;
}

function formatMoney(value) {
  return `KSh ${Number(value || 0).toLocaleString("en-KE", {
    maximumFractionDigits: 2,
  })}`;
}

function OrderCard({
  order,
  waiters = [],
  selectedWaiterId = "",
  isSaving = false,
  onAssignWaiter,
  onStatusChange,
  onPrintReceipt,
}) {
  const [waiterChoice, setWaiterChoice] = useState(
    order.assignedWaiterId != null
      ? String(order.assignedWaiterId)
      : selectedWaiterId
  );

  useEffect(() => {
    setWaiterChoice(
      order.assignedWaiterId != null
        ? String(order.assignedWaiterId)
        : selectedWaiterId
    );
  }, [order.assignedWaiterId, selectedWaiterId, order.id]);

  const currentIndex = ORDER_STATUSES.indexOf(order.orderStatus);
  const nextStatus = ORDER_STATUSES[currentIndex + 1];
  const styles = STATUS_STYLES[order.orderStatus] || STATUS_STYLES.Served;
  const isServed = order.orderStatus === "Served";

  return (
    <article
      className={`rounded-xl border-l-4 bg-white p-6 shadow ${styles.border}`}
    >
      <div className="mb-1 flex items-center justify-between gap-3">
        <h3 className="text-xl font-bold text-gray-800">
          Table {order.tableNumber ?? "—"}
        </h3>

        <span
          className={`rounded-full px-3 py-1 text-sm font-semibold ${styles.badge}`}
        >
          {order.orderStatus}
        </span>
      </div>

      <p className="mb-4 text-sm text-gray-500">
        Order #{order.id} · {order.customerName} ·{" "}
        {minutesAgo(order.createdAt)}
      </p>

      <div className="divide-y">
        {order.items.map((item, index) => (
          <div
            key={`${order.id}-${item.id}-${index}`}
            className="flex justify-between gap-3 py-2 text-gray-700"
          >
            <span>
              {item.quantity} × {item.name}
            </span>

            <span className="whitespace-nowrap">
              {formatMoney(item.price * item.quantity)}
            </span>
          </div>
        ))}
      </div>

      <p className="mt-3 text-sm text-gray-500">
        {order.paymentMethod} ({order.paymentStatus})
      </p>

      <div className="mt-4 rounded-lg bg-gray-50 p-3">
        <p className="text-sm font-semibold text-gray-700">
          {isServed ? "Served by" : "Assigned waiter"}
        </p>

        <p className="mt-1 text-gray-800">
          {order.servedByName ||
            order.assignedWaiterName ||
            "Not assigned yet"}
        </p>
      </div>

      {!isServed && (
        <div className="mt-4 space-y-2">
          <label
            htmlFor={`waiter-${order.id}`}
            className="block text-sm font-semibold text-gray-700"
          >
            Assign or reassign waiter
          </label>

          <div className="flex gap-2">
            <select
              id={`waiter-${order.id}`}
              value={waiterChoice}
              onChange={(event) => setWaiterChoice(event.target.value)}
              disabled={isSaving}
              className="min-w-0 flex-1 rounded-lg border border-gray-300 bg-white px-3 py-2"
            >
              <option value="">Select waiter</option>

              {waiters.map((waiter) => (
                <option key={waiter.id} value={String(waiter.id)}>
                  {waiter.full_name}
                </option>
              ))}
            </select>

            <button
              type="button"
              disabled={!waiterChoice || isSaving}
              onClick={() => onAssignWaiter(order.id, waiterChoice)}
              className="rounded-lg border border-blue-600 px-3 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Assign
            </button>
          </div>
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t pt-4">
        <span className="text-lg font-bold text-gray-800">
          {formatMoney(order.total)}
        </span>

        {nextStatus && (
          <button
            type="button"
            disabled={isSaving}
            className="rounded-lg bg-red-500 px-4 py-2 font-bold text-white transition hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-60"
            onClick={() => onStatusChange(order.id, nextStatus)}
          >
            {isSaving ? "Saving..." : NEXT_ACTION[order.orderStatus]}
          </button>
        )}

        {isServed && (
          <button
            type="button"
            onClick={() => onPrintReceipt(order)}
            className="rounded-lg border border-gray-700 px-4 py-2 font-semibold text-gray-800 hover:bg-gray-100"
          >
            Print Receipt
          </button>
        )}
      </div>
    </article>
  );
}

export default OrderCard;