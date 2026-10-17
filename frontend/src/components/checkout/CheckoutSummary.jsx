function CheckoutSummary({ customer, cart, total }) {
  return (
    <div className="rounded-xl bg-white p-6 shadow">
      <h2 className="mb-4 text-2xl font-bold text-gray-800">Order Summary</h2>

      <div className="mb-6 space-y-1 text-gray-700">
        <p>
          <span className="font-semibold">Name:</span> {customer.fullName}
        </p>
        <p>
          <span className="font-semibold">Phone:</span> {customer.phone}
        </p>
        <p>
          <span className="font-semibold">Table:</span> {customer.tableNumber}
        </p>
      </div>

      <div className="divide-y">
        {cart.map((item) => (
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
        <span>KES {total}</span>
      </div>
    </div>
  );
}

export default CheckoutSummary;
