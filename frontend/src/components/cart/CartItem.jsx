import { useCart } from "../../context/CartContext";

function CartItem({ item }) {
  const {
    removeFromCart,
    increaseQuantity,
    decreaseQuantity,
  } = useCart();

  return (
    <div className="flex flex-col gap-5 rounded-xl border border-gray-200 bg-white p-5 shadow-sm sm:flex-row">
      <img
        src={item.image}
        alt={item.name}
        className="h-40 w-full rounded-lg object-cover sm:w-40"
      />

      <div className="flex-1">
        <h2 className="mb-2 text-xl font-bold text-gray-800">
          {item.name}
        </h2>

        <p className="mb-4 text-gray-600">
          KSh {item.price}
        </p>

        <div className="mb-4 flex items-center gap-3">
          <button
            onClick={() => decreaseQuantity(item.id)}
            className="h-9 w-9 rounded-lg border border-gray-300 bg-white text-xl text-gray-700 transition hover:border-red-500 hover:text-red-500"
          >
            -
          </button>

          <span className="min-w-6 text-center text-lg font-bold text-gray-800">
            {item.quantity}
          </span>

          <button
            onClick={() => increaseQuantity(item.id)}
            className="h-9 w-9 rounded-lg border border-gray-300 bg-white text-xl text-gray-700 transition hover:border-red-500 hover:text-red-500"
          >
            +
          </button>
        </div>

        <p className="mb-3 font-bold text-gray-800">
          Item Total: KSh {item.price * item.quantity}
        </p>

        <button
          onClick={() => removeFromCart(item.id)}
          className="rounded-lg border-2 border-red-500 bg-white px-4 py-2 font-semibold text-red-500 transition hover:bg-red-500 hover:text-white"
        >
          Remove
        </button>
      </div>
    </div>
  );
}

export default CartItem;