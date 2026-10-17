const METHODS = ["M-Pesa", "Card", "Cash"];

function PaymentMethod({ selected, onSelect }) {
  return (
    <div className="rounded-xl bg-white p-6 shadow">
      <h2 className="mb-4 text-2xl font-bold text-gray-800">Payment Method</h2>

      <div className="grid grid-cols-3 gap-3">
        {METHODS.map((method) => (
          <button
            key={method}
            type="button"
            onClick={() => onSelect(method)}
            className={`rounded-lg border-2 px-4 py-3 font-semibold transition ${
              selected === method
                ? "border-red-500 bg-red-50 text-red-600"
                : "border-gray-200 text-gray-700 hover:border-red-300"
            }`}
          >
            {method}
          </button>
        ))}
      </div>
    </div>
  );
}

export default PaymentMethod;
