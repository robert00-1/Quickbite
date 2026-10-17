import { Link } from "react-router-dom";

function OrderSummary({ total }) {
  return (
    <div className="sticky top-5 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
      <h2 className="mb-6 text-2xl font-bold text-gray-800">
        Order Summary
      </h2>

      <div className="mb-6 flex items-center justify-between text-lg">
        <span className="text-gray-600">Total</span>

        <strong className="text-xl text-red-500">
          KSh {total}
        </strong>
      </div>

      <Link
        to="/customer-details"
        className="block rounded-lg bg-red-500 px-5 py-3 text-center font-bold text-white no-underline transition hover:bg-red-600"
      >
        Proceed to Checkout
      </Link>
    </div>
  );
}

export default OrderSummary;