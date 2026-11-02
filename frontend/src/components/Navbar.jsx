import { Link, useLocation } from "react-router-dom";
import {
  Utensils,
  ShoppingCart,
  ReceiptText,
  Gamepad2,
} from "lucide-react";
import { useCart } from "../context/CartContext";
import logo from "../assets/QuickBite-logo.png";

function Navbar() {
  const { cart, cartCount } = useCart();
  const location = useLocation();

  const itemCount =
    cartCount ??
    (cart || []).reduce((total, item) => total + item.quantity, 0);

  const links = [
    { to: "/menu", label: "Menu", Icon: Utensils },
    { to: "/cart", label: "Cart", Icon: ShoppingCart },
    { to: "/order-status", label: "Order Status", Icon: ReceiptText },
    { to: "/games", label: "Games", Icon: Gamepad2 },
  ];

  const isActive = (path) =>
    location.pathname === path ||
    (path === "/menu" && location.pathname.startsWith("/menu/"));

  return (
    <header className="fixed top-0 left-0 z-50 w-full bg-red-500 shadow-md">
      <div className="mx-auto flex min-h-20 max-w-7xl items-center justify-between gap-4 px-4 py-3">

        {/* Logo */}
        <Link to="/menu" className="flex shrink-0 items-center">
          <img
            src={logo}
            alt="QuickBite"
            className="h-14 w-auto rounded-lg bg-white object-contain p-1"
          />
        </Link>

        {/* Navigation links */}
        <nav className="flex items-center gap-2 sm:gap-4">
          {links.map(({ to, label, Icon }) => (
            <Link
              key={to}
              to={to}
              aria-label={label === "Cart" ? `Cart (${itemCount} items)` : label}
              className={`relative flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-bold no-underline transition sm:px-4 ${
                isActive(to)
                  ? "bg-white text-red-600"
                  : "text-white hover:bg-red-600"
              }`}
            >
              <Icon size={20} />
              <span className="hidden sm:inline">{label}</span>

              {label === "Cart" && itemCount > 0 && (
                <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-yellow-400 px-1 text-xs font-bold text-red-700">
                  {itemCount}
                </span>
              )}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}

export default Navbar;