import { useCart } from "../../context/CartContext";

function QuantityControl({ id, quantity }) {
  const { increaseQuantity, decreaseQuantity } = useCart();

  return (
    <div className="quantity-control">
      <button
        className="quantity-button"
        onClick={() => decreaseQuantity(id)}
      >
        -
      </button>

      <span className="quantity-number">{quantity}</span>

      <button
        className="quantity-button"
        onClick={() => increaseQuantity(id)}
      >
        +
      </button>
    </div>
  );
}

export default QuantityControl;