import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import CheckoutSummary from "../components/checkout/CheckoutSummary";
import PaymentMethod from "../components/checkout/PaymentMethod";
import { getCustomer, getCart, getCartTotal } from "../utils/orderHelpers";

function Checkout() {
  const navigate = useNavigate();
  const customer = getCustomer();
  const cart = getCart();
  const [method, setMethod] = useState("");
  const [error, setError] = useState("");

  if (!customer || cart.length === 0) {
    return (
      <div className="min-h-screen bg-gray-100 px-6 py-12 text-center">
        <p className="mb-4 text-gray-700">
          Your details or cart are missing. Please add food and enter your details first.
        </p>
        <Link to="/menu" className="font-bold text-red-500">
          Go to Menu
        </Link>
      </div>
    );
  }

  const total = getCartTotal(cart);

  const handleContinue = () => {
    if (!method) {
      setError("Please choose a payment method.");
      return;
    }
    navigate("/payment", { state: { method } });
  };

  return (
    <div className="min-h-screen bg-gray-100 px-6 py-12">
      <div className="mx-auto max-w-2xl space-y-6">
        <h1 className="text-center text-3xl font-bold text-gray-800">
          Checkout
        </h1>

        <CheckoutSummary customer={customer} cart={cart} total={total} />
        <PaymentMethod selected={method} onSelect={setMethod} />

        {error && <p className="text-center text-red-500">{error}</p>}

        <button
          type="button"
          onClick={handleContinue}
          className="w-full rounded-lg bg-red-500 px-6 py-3 font-bold text-white transition hover:bg-red-600"
        >
          Continue to Payment
        </button>
      </div>
    </div>
  );
}

export default Checkout;
