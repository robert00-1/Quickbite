import { useState } from "react";

const MENU_ITEMS = [
  { key: "record", label: "My record and shifts" },
  { key: "roster", label: "Who is on shift" },
  { key: "account", label: "Account settings" },
];

function WaiterSettingsMenu({ onSelect, onLogout }) {
  const [isOpen, setIsOpen] = useState(false);

  const choose = (key) => {
    setIsOpen(false);
    onSelect(key);
  };

  const logout = () => {
    setIsOpen(false);
    onLogout();
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
        className="rounded-lg bg-white px-4 py-3 text-sm font-semibold text-gray-700 shadow hover:bg-gray-50"
      >
        Settings
      </button>

      {isOpen && (
        <>
          <div
            className="fixed inset-0 z-10"
            onClick={() => setIsOpen(false)}
          />
          <ul className="absolute right-0 z-20 mt-2 w-56 overflow-hidden rounded-lg bg-white py-1 shadow-lg">
            {MENU_ITEMS.map((item) => (
              <li key={item.key}>
                <button
                  type="button"
                  onClick={() => choose(item.key)}
                  className="block w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-100"
                >
                  {item.label}
                </button>
              </li>
            ))}
            <li className="border-t border-gray-200">
              <button
                type="button"
                onClick={logout}
                className="block w-full px-4 py-2 text-left text-sm font-semibold text-red-600 hover:bg-red-50"
              >
                Log out
              </button>
            </li>
          </ul>
        </>
      )}
    </div>
  );
}

export default WaiterSettingsMenu;
