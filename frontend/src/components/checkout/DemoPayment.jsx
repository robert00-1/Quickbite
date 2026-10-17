import { useState } from "react";

function DemoPayment({ method, total, onSuccess }) {
  const [processing, setProcessing] = useState(false);

  const handlePay = () => {
    setProcessing(true);
    setTimeout(() => {
      setProcessing(false);
      onSuccess();
    }, 2000);
  };

  return (
    <div className="rounded-xl bg-white p-6 text-center shadow">
      <h2 className="mb-2 text-2xl font-bold text-gray-800">Demo Payment</h2>
      <p className="mb-6 text-gray-600">
        Paying <span className="font-semibold">KES {total}</span> with{" "}
        <span className="font-semibold">{method}</span>
      </p>

      <button
        type="button"
        onClick={handlePay}
        disabled={processing}
        className="w-full rounded-lg bg-red-500 px-6 py-3 font-bold text-white transition hover:bg-red-600 disabled:cursor-not-allowed disabled:bg-gray-400"
      >
        {processing ? "Processing..." : `Pay KES ${total}`}
      </button>

      <p className="mt-4 text-sm text-gray-500">
        This is a demo. No real money is taken.
      </p>
    </div>
  );
}

export default DemoPayment;
