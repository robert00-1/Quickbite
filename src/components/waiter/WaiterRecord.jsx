import { useEffect, useState } from "react";
import {
  endWaiterShift,
  getWaiterRecord,
  startWaiterShift,
} from "../../services/waiterApi";

const RECORD_REFRESH_MS = 10000;

// The backend sends UTC times without a timezone, so add one before showing them
const formatDateTime = (iso) => {
  if (!iso) return "";
  const utc = /Z$|[+-]\d\d:\d\d$/.test(iso) ? iso : iso + "Z";
  return new Date(utc).toLocaleString([], {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
};

function WaiterRecord({ waiterId }) {
  const [record, setRecord] = useState(null);
  const [error, setError] = useState("");
  const [reloadCount, setReloadCount] = useState(0);

  useEffect(() => {
    const load = async () => {
      try {
        setRecord(await getWaiterRecord(waiterId));
        setError("");
      } catch {
        setError("Unable to load your record.");
      }
    };

    const first = setTimeout(load, 0);
    const interval = setInterval(load, RECORD_REFRESH_MS);
    return () => {
      clearTimeout(first);
      clearInterval(interval);
    };
  }, [waiterId, reloadCount]);

  const onShift = Boolean(record?.shifts?.[0]?.is_active);

  const handleShiftButton = async () => {
    try {
      if (onShift) {
        await endWaiterShift(waiterId);
      } else {
        await startWaiterShift(waiterId);
      }
      setError("");
      setReloadCount((count) => count + 1);
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <section className="rounded-xl bg-white p-6 shadow">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-xl font-bold text-gray-800">My record</h2>
        <button
          type="button"
          onClick={handleShiftButton}
          className={
            "rounded-lg px-4 py-2 text-sm font-semibold text-white " +
            (onShift
              ? "bg-gray-700 hover:bg-gray-800"
              : "bg-red-500 hover:bg-red-600")
          }
        >
          {onShift ? "End shift" : "Start shift"}
        </button>
      </div>

      {error && <p className="mb-3 text-sm text-red-600">{error}</p>}

      {record && (
        <>
          <div className="mb-4 grid grid-cols-2 gap-4">
            <div className="rounded-lg bg-gray-50 p-4 text-center">
              <p className="text-2xl font-bold text-gray-800">
                {record.total_hours}
              </p>
              <p className="text-sm text-gray-500">Hours worked</p>
            </div>
            <div className="rounded-lg bg-gray-50 p-4 text-center">
              <p className="text-2xl font-bold text-gray-800">
                {record.tables_served}
              </p>
              <p className="text-sm text-gray-500">Tables served</p>
            </div>
          </div>

          <h3 className="mb-2 text-sm font-semibold text-gray-600">
            Recent shifts
          </h3>
          {record.shifts.length === 0 ? (
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
                      ? " to " + formatDateTime(shift.ended_at)
                      : " (on shift)"}
                  </span>
                  <span className="font-semibold">{shift.hours_worked} hrs</span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}

export default WaiterRecord;
