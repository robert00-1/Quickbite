
import { useState } from "react";
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
  const [isOpen, setIsOpen] = useState(false);
  const { cart, cartCount } = useCart();
  const location = useLocation();

  const itemCount =
    cartCount ??
    (cart || []).reduce((total, item) => total + item.quantity, 0);

  const closeMenu = () => setIsOpen(false);

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
    <>
      <button
        type="button"
        onClick={() => setIsOpen((open) => !open)}
        className="fixed left-4 top-4 z-[60] flex h-11 w-11 items-center justify-center rounded-lg bg-red-500 shadow-md"
        aria-label={isOpen ? "Close menu" : "Open menu"}
        aria-expanded={isOpen}
      >
        <span className="text-xl font-bold text-white">
          {isOpen ? "×" : "☰"}
        </span>
      </button>

      {isOpen && (
        <div
          onClick={closeMenu}
          className="fixed inset-0 z-40 bg-black/40"
        />
      )}

      <aside
        className={`fixed left-0 top-0 z-50 flex h-screen w-64 flex-col bg-red-500 p-5 shadow-xl transition-transform duration-300 ${
          isOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <Link
          to="/menu"
          onClick={closeMenu}
          className="mb-8 flex h-32 shrink-0 items-center justify-center rounded-xl bg-white"
        >
          <img
            src={logo}
            alt="QuickBite"
            className="max-h-28 max-w-full object-contain"
          />
        </Link>

        <nav className="flex flex-col gap-4">
          {links.map(({ to, label, Icon }) => (
            <Link
              key={to}
              to={to}
              onClick={closeMenu}
              className={`relative flex items-center gap-3 rounded-xl px-5 py-4 font-bold no-underline transition ${
                isActive(to)
                  ? "bg-white text-red-600"
                  : "text-white hover:bg-red-600"
              }`}
            >
              <Icon size={20} />
              <span>{label}</span>

              {label === "Cart" && itemCount > 0 && (
                <span className="ml-auto flex h-6 min-w-6 items-center justify-center rounded-full bg-yellow-400 px-1 text-xs font-bold text-red-700">
                  {itemCount}
                </span>
              )}
            </Link>
          ))}
        </nav>
      </aside>
    </>
  );
}

export default Navbar;
