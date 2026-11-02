import { useEffect, useState } from "react";
import {
  endWaiterShift,
  getWaiterRecord,
  startWaiterShift,
} from "../../services/waiterApi";

const RECORD_REFRESH_MS = 10000;

const formatDateTime = (iso) => {
  if (!iso) return "";

  return new Date(iso).toLocaleString([], {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

function WaiterRecord() {
  const [record, setRecord] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const loadRecord = async () => {
    try {
      const data = await getWaiterRecord();
      setRecord(data);
      setError("");
    } catch (err) {
      setError(err.message || "Unable to load your record.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRecord();

    const interval = setInterval(loadRecord, RECORD_REFRESH_MS);
    return () => clearInterval(interval);
  }, []);

  const onShift = Boolean(record?.shifts?.[0]?.is_active);

  const handleShiftButton = async () => {
    try {
      setBusy(true);

      if (onShift) {
        await endWaiterShift();
      } else {
        await startWaiterShift();
      }

      await loadRecord();
    } catch (err) {
      setError(err.message || "Unable to update your shift.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="rounded-xl bg-white p-6 shadow">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-xl font-bold text-gray-800">My record</h2>

        <button
          type="button"
          onClick={handleShiftButton}
          disabled={busy || loading}
          className={
            "rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 " +
            (onShift
              ? "bg-gray-700 hover:bg-gray-800"
              : "bg-red-500 hover:bg-red-600")
          }
        >
          {busy ? "Please wait..." : onShift ? "End shift" : "Start shift"}
        </button>
      </div>

      {error && <p className="mb-3 text-sm text-red-600">{error}</p>}

      {loading ? (
        <p className="text-gray-500">Loading your record...</p>
      ) : record ? (
        <>
          <div className="mb-4 grid grid-cols-2 gap-4">
            <div className="rounded-lg bg-gray-50 p-4 text-center">
              <p className="text-2xl font-bold text-gray-800">
                {record.total_hours ?? 0}
              </p>
              <p className="text-sm text-gray-500">Hours worked</p>
            </div>

            <div className="rounded-lg bg-gray-50 p-4 text-center">
              <p className="text-2xl font-bold text-gray-800">
                {record.tables_served ?? 0}
              </p>
              <p className="text-sm text-gray-500">Tables served</p>
            </div>
          </div>

          <p className="mb-4 text-sm text-gray-600">Orders served: {record.orders_served ?? 0} · Average serving time: {record.average_serving_minutes == null ? "No timed records" : `${record.average_serving_minutes} min`}</p>
          <h3 className="mb-2 text-sm font-semibold text-gray-600">
            Recent shifts
          </h3>

          {!record.shifts?.length ? (
            <p className="text-gray-500">No shifts yet.</p>
          ) : (
            <ul className="space-y-2">
              {record.shifts.slice(0, 5).map((shift) => (
                <li
                  key={shift.id}
                  className="flex justify-between rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-700"
                >
                  <span>
                    {formatDateTime(shift.started_at)}
                    {shift.ended_at
                      ? ` to ${formatDateTime(shift.ended_at)}`
                      : " (on shift)"}
                  </span>

                  <span className="font-semibold">
                    {shift.hours} hrs
                  </span>
                </li>
              ))}
            </ul>
          )}
        </>
      ) : null}
    </section>
  );
}

export default WaiterRecord;