import { useState } from "react";
import { Link } from "react-router-dom";

function Navbar() {
  const [isOpen, setIsOpen] = useState(false);

  const closeMenu = () => {
    setIsOpen(false);
  };

  return (
    <>
      {/* Menu button — visible on desktop and mobile */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="fixed left-4 top-4 z-[60] flex h-11 w-11 flex-col items-center justify-center gap-1.5 rounded-lg bg-red-500 shadow-md"
        aria-label={isOpen ? "Close menu" : "Open menu"}
        aria-expanded={isOpen}
      >
        <span
          className={`block h-0.5 w-5 bg-white transition-transform ${
            isOpen ? "translate-y-2 rotate-45" : ""
          }`}
        />
        <span
          className={`block h-0.5 w-5 bg-white transition-opacity ${
            isOpen ? "opacity-0" : ""
          }`}
        />
        <span
          className={`block h-0.5 w-5 bg-white transition-transform ${
            isOpen ? "-translate-y-2 -rotate-45" : ""
          }`}
        />
      </button>

      {/* Overlay */}
      {isOpen && (
        <div
          onClick={closeMenu}
          className="fixed inset-0 z-40 bg-black/40"
        />
      )}

      {/* Customer sidebar */}
      <aside
        className={`fixed left-0 top-0 z-50 flex h-screen w-64 flex-col bg-red-500 p-5 shadow-xl transition-transform duration-300 ${
          isOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {/* Logo */}
        <div className="mb-8 flex h-32 shrink-0 items-center justify-center rounded-xl bg-white">
          <span className="text-2xl font-bold text-red-500">
            QUICKBITE
          </span>
        </div>

        {/* Customer navigation */}
        <nav className="flex flex-col gap-4">
          <Link
            to="/menu"
            onClick={closeMenu}
            className="rounded-xl bg-white px-5 py-4 text-center font-bold text-red-500 no-underline transition hover:bg-red-50"
          >
            Menu
          </Link>

          <Link
            to="/cart"
            onClick={closeMenu}
            className="rounded-xl bg-white px-5 py-4 text-center font-bold text-red-500 no-underline transition hover:bg-red-50"
          >
            Cart
          </Link>

          <Link
            to="/order-status"
            onClick={closeMenu}
            className="rounded-xl bg-white px-5 py-4 text-center font-bold text-red-500 no-underline transition hover:bg-red-50"
          >
            Order Status
          </Link>

          <Link
            to="/games"
            onClick={closeMenu}
            className="rounded-xl bg-white px-5 py-4 text-center font-bold text-red-500 no-underline transition hover:bg-red-50"
          >
            Games
          </Link>
        </nav>
      </aside>
    </>
  );
}

export default Navbar;