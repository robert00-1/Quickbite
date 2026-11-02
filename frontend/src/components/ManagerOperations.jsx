import { useEffect, useState } from "react";
import { staffRequest } from "../services/staffApi";

export default function ManagerOperations() {
  const [data, setData] = useState({complaints: [], late: [], activity: [], meals: []});
  const [error, setError] = useState("");
  const [status, setStatus] = useState("All");
  async function load() {
    try {
      const [complaints, late, activity, meals] = await Promise.all([staffRequest("/complaints"), staffRequest("/manager/late-orders"), staffRequest("/manager/waiter-activity"), staffRequest("/menu-items")]);
      setData({complaints, late, activity, meals});
      setError("");
    } catch (err) { setError(err.message); }
  }
  useEffect(() => { load(); const timer = setInterval(load, 15000); return () => clearInterval(timer); }, []);
  async function update(path, body) {
    try { await staffRequest(path, {method: "PATCH", body: JSON.stringify(body)}); await load(); }
    catch (err) { setError(err.message); }
  }
  return <section className="mt-8 space-y-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
    <h2 className="text-xl font-bold text-slate-800">Service and meal management</h2>
    {error && <p role="alert" className="text-red-600">{error}</p>}
    <div><h3 className="mb-3 font-bold">Meal of the Day selections and estimates</h3>
      <div className="space-y-2">{data.meals.map((meal) => <div key={meal.id} className="flex flex-wrap items-center gap-3 border-b p-2">
        <label className="flex gap-2"><input type="checkbox" checked={meal.is_food_of_day} onChange={(e) => update(`/menu-items/${meal.id}`, {is_food_of_day: e.target.checked})} />{meal.name}</label>
        <label>Prep (min) <input aria-label={`Preparation time for ${meal.name}`} className="w-20 rounded border p-1" type="number" min="0" defaultValue={meal.preparation_time} key={`prep-${meal.id}-${meal.preparation_time}`} onBlur={(e) => { if (e.target.value !== "" && Number(e.target.value) !== meal.preparation_time) update(`/menu-items/${meal.id}`, {preparation_time: Number(e.target.value)}); }} /></label>
        <label>Serving (min) <input aria-label={`Serving time for ${meal.name}`} className="w-20 rounded border p-1" type="number" min="0" defaultValue={meal.serving_time} key={`serve-${meal.id}-${meal.serving_time}`} onBlur={(e) => { if (e.target.value !== "" && Number(e.target.value) !== meal.serving_time) update(`/menu-items/${meal.id}`, {serving_time: Number(e.target.value)}); }} /></label>
      </div>)}</div>
    </div>
    <div><h3 className="mb-3 font-bold">Late orders</h3>
      {data.late.length === 0 ? <p>No late orders.</p> : <ul className="space-y-2">{data.late.map((o) => <li key={o.id} className="rounded bg-red-50 p-3">Order {o.id} · {o.customer} · Table {o.table_number} · {o.status} · {o.elapsed_minutes} min elapsed / {o.expected_minutes} min estimated</li>)}</ul>}
    </div>
    <div><h3 className="mb-3 font-bold">Customer complaints</h3>
      <label>Status filter <select aria-label="Complaint status filter" value={status} onChange={(e) => setStatus(e.target.value)}>{["All", "Open", "In Progress", "Resolved"].map((s) => <option key={s}>{s}</option>)}</select></label>
      {data.complaints.filter((c) => status === "All" || c.status === status).map((c) => <div key={c.id} className="my-2 rounded border p-3"><p>{c.customerName} · Order {c.orderId} · Table {c.tableNumber}</p><p>{c.message}</p><p>{new Date(c.createdAt).toLocaleString()}</p><select aria-label={`Status for complaint ${c.id}`} value={c.status} onChange={(e) => update(`/complaints/${c.id}`, {status: e.target.value})}>{["Open", "In Progress", "Resolved"].map((s) => <option key={s}>{s}</option>)}</select></div>)}
    </div>
    <div><h3 className="mb-3 font-bold">Waiter activity</h3>{data.activity.map((w) => <details className="my-2 rounded border p-3" key={w.id}><summary>{w.name} · {w.on_shift ? "On shift" : "Off shift"} · {w.orders_served} orders · {w.tables_served} tables · {w.total_hours} hours</summary><p>Average serving time: {w.average_serving_minutes == null ? "No timed service records" : `${w.average_serving_minutes} min`}</p>{w.shifts.map((s) => <p key={s.id}>{new Date(s.started_at).toLocaleString()} – {s.ended_at ? new Date(s.ended_at).toLocaleString() : "Active"} · {s.hours} hours</p>)}</details>)}</div>
  </section>;
}
