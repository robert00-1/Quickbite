import { useEffect, useState } from "react";
import { getWaiterRoster } from "../../services/waiterApi";

const ROSTER_REFRESH_MS = 10000;

const formatTime = (iso) => {
  if (!iso) return "";

  return new Date(iso).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
};

function WaiterRoster() {
  const [roster, setRoster] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const data = await getWaiterRoster();
        setRoster(data);
        setError("");
      } catch (err) {
        setError(err.message || "Unable to load the roster.");
      } finally {
        setLoading(false);
      }
    };

    load();

    const interval = setInterval(load, ROSTER_REFRESH_MS);
    return () => clearInterval(interval);
  }, []);

  return (
    <section className="rounded-xl bg-white p-6 shadow">
      <h2 className="mb-4 text-xl font-bold text-gray-800">
        On shift now
      </h2>

      {error && <p className="mb-3 text-sm text-red-600">{error}</p>}

      {loading ? (
        <p className="text-gray-500">Loading roster...</p>
      ) : roster.length === 0 ? (
        <p className="text-gray-500">No waiters are on shift.</p>
      ) : (
        <ul className="space-y-3">
          {roster.map((waiter) => (
            <li
              key={waiter.waiter_id}
              className="flex items-center justify-between rounded-lg border border-gray-200 p-4"
            >
              <div>
                <p className="font-semibold text-gray-800">
                  {waiter.full_name || `Waiter #${waiter.waiter_id}`}
                </p>

                <p className="text-sm text-gray-500">
                  {waiter.status === "OFF_SHIFT" ? "Off shift" : `Since ${formatTime(waiter.on_shift_since)}`} ·{" "}
                  {waiter.hours_so_far} hrs
                </p>

                <p className="text-sm text-gray-600">
                  Tables:{" "}
                  {waiter.current_tables?.length
                    ? waiter.current_tables.join(", ")
                    : "none"}{" "}
                  · Served: {waiter.tables_served ?? 0}
                </p>
              </div>

              <span
                className={
                  "rounded-full px-3 py-1 text-xs font-semibold " +
                  (waiter.status === "BUSY"
                    ? "bg-red-100 text-red-700"
                    : "bg-green-100 text-green-700")
                }
              >
                {waiter.status === "BUSY" ? "Busy" : "Available"}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export default WaiterRoster;