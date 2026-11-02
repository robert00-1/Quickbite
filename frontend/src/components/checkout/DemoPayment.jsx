function DemoPayment({ method, total, onSuccess }) {
  return <div className="rounded-xl bg-white p-6 text-center shadow">
    <h2 className="mb-2 text-2xl font-bold text-gray-800">{method === "Cash" ? "Pay at the restaurant" : "Card at the restaurant"}</h2>
    <p className="mb-6 text-gray-600">Total KES {total}. Payment will be confirmed by staff at the restaurant.</p>
    <button type="button" onClick={onSuccess} className="w-full rounded-lg bg-red-500 px-6 py-3 font-bold text-white">Confirm order</button>
  </div>;
}
export default DemoPayment;
