import { Link } from "react-router-dom";
import OrderConfirmation from "../components/checkout/OrderConfirmation";
import { getOrders } from "../utils/orderHelpers";

function OrderConfirmationPage() {
  const orders = getOrders();
  const order = orders[orders.length - 1];

  if (!order) {
    return (
      <div className="min-h-screen bg-gray-100 px-6 py-12 text-center">
        <p className="mb-4 text-gray-700">No order found yet.</p>
        <Link to="/menu" className="font-bold text-red-500">
          Go to Menu
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 px-6 py-12">
      <div className="mx-auto max-w-md">
        <OrderConfirmation order={order} />
      </div>
    </div>
  );
}

export default OrderConfirmationPage;
