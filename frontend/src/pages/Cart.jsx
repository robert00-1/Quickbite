import { Link } from "react-router-dom";
import { useCart } from "../context/CartContext";
import CartItem from "../components/cart/CartItem";
import OrderSummary from "../components/cart/OrderSummary";

function Cart() {
  const { cart, clearCart, cartTotal } = useCart();

  if (cart.length === 0) {
    return (
      <main className="mx-auto max-w-[1200px] px-5 py-10">
        <h1 className="mb-8 text-3xl font-bold text-gray-800">
          Your Cart
        </h1>

        <div className="rounded-xl bg-white px-5 py-16 text-center shadow-sm">
          <p className="mb-6 text-lg text-gray-600">
            Your cart is empty.
          </p>

          <Link
            className="inline-block rounded-lg bg-red-500 px-6 py-3 font-semibold text-white no-underline transition hover:bg-red-600"
            to="/menu"
          >
            Continue Shopping
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-[1200px] px-5 py-10">
      <h1 className="mb-8 text-3xl font-bold text-gray-800">
        Your Cart
      </h1>

      <div className="grid grid-cols-1 items-start gap-8 lg:grid-cols-[2fr_1fr]">
        <div className="flex flex-col gap-5">
          {cart.map((item) => (
            <CartItem key={item.id} item={item} />
          ))}

          <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-center">
            <button
              className="rounded-lg bg-red-500 px-5 py-3 font-semibold text-white transition hover:bg-red-600"
              onClick={clearCart}
            >
              Clear Cart
            </button>

            <Link
              className="rounded-lg border-2 border-red-500 bg-white px-5 py-3 text-center font-semibold text-red-500 no-underline transition hover:bg-red-500 hover:text-white"
              to="/menu"
            >
              Continue Shopping
            </Link>
          </div>
        </div>

        <OrderSummary total={cartTotal} />
      </div>
    </main>
  );
}

export default Cart;