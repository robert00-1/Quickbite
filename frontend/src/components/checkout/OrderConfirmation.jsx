import { Link } from "react-router-dom";

function OrderConfirmation({ order }) {
  return (
    <div className="rounded-xl bg-white p-6 text-center shadow">
      <div className="mb-2 text-5xl">✅</div>
      <h2 className="mb-1 text-2xl font-bold text-gray-800">
        Order Placed!
      </h2>
      <p className="mb-6 text-gray-600">
        Thank you, {order.customerName}. Your food is being prepared.
      </p>

      <div className="mb-6 rounded-lg bg-gray-100 p-4">
        <p className="text-sm text-gray-500">Order number</p>
        <p className="text-3xl font-bold text-red-500">{order.id}</p>
      </div>

      <div className="mb-6 space-y-1 text-left text-gray-700">
        <p>
          <span className="font-semibold">Table:</span> {order.tableNumber}
        </p>
        <p>
          <span className="font-semibold">Payment:</span> {order.paymentMethod}{" "}
          ({order.paymentStatus})
        </p>
      </div>

      <div className="divide-y text-left">
        {order.items.map((item) => (
          <div key={item.id} className="flex justify-between py-2 text-gray-700">
            <span>
              {item.name} x {item.quantity}
            </span>
            <span>KES {item.price * item.quantity}</span>
          </div>
        ))}
      </div>

      <div className="mt-4 flex justify-between border-t pt-4 text-xl font-bold text-gray-800">
        <span>Total</span>
        <span>KES {order.total}</span>
      </div>

      <Link
        to="/menu"
        className="mt-6 inline-block rounded-lg bg-red-500 px-6 py-3 font-bold text-white transition hover:bg-red-600"
      >
        Back to Menu
      </Link>
    </div>
  );
}

export default OrderConfirmation;
