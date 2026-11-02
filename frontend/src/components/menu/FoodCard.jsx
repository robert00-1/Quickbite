import { Link } from "react-router-dom";

import { FALLBACK_IMAGE } from "../../services/api";

function FoodCard({ food, onCompare, isSelected }) {
  const isAvailable = food.availability !== false;

  return (
    <div
      className={`overflow-hidden rounded-[10px] bg-white shadow-[0_2px_8px_rgba(0,0,0,0.1)] transition hover:-translate-y-1 hover:shadow-lg ${
        !isAvailable ? "opacity-75" : ""
      }`}
    >
      <Link
        to={`/menu/${food.id}`}
        className="block text-inherit no-underline"
        aria-label={`${food.name}${!isAvailable ? ", currently unavailable" : ""}`}
      >
        <div className="relative">
          <img
            key={food.image}
            src={food.image || FALLBACK_IMAGE}
            alt={food.name}
            className={`h-[200px] w-full object-cover ${
              !isAvailable ? "grayscale" : ""
            }`}
            onError={(event) => { event.currentTarget.onerror = null; event.currentTarget.src = FALLBACK_IMAGE; }}
          />

          {/* Only show a badge when the item is UNAVAILABLE — no "Available" badge */}
          {!isAvailable && (
            <span className="absolute left-3 top-3 rounded-full bg-red-600 px-3 py-1.5 text-sm font-bold text-white shadow">
              Unavailable
            </span>
          )}
        </div>

        <div className="p-4">
          <h3 className="font-bold text-gray-800">{food.name}</h3>
          <p className="mt-1 text-sm text-gray-500">{food.category}</p>
          <p className="mt-2 text-lg font-bold text-red-500">
            KSh {Number(food.price || 0).toLocaleString("en-KE")}
          </p>
          {food.preparation_time != null && (
            <p className="mt-1 text-xs text-gray-400">
              ~{food.preparation_time} min prep · {food.serving_time ?? "—"} min serving
            </p>
          )}
          {!isAvailable && (
            <p className="mt-2 text-sm font-medium text-red-500">
              Currently unavailable
            </p>
          )}
        </div>
      </Link>

      <div className="px-4 pb-4">
        <button
          type="button"
          onClick={() => onCompare && onCompare(food)}
          className={`w-full rounded-lg px-4 py-2 text-sm font-semibold transition ${
            isSelected
              ? "bg-gray-700 text-white hover:bg-gray-800"
              : "bg-blue-50 text-blue-700 hover:bg-blue-100"
          }`}
        >
          {isSelected ? "✓ Remove from Compare" : "Compare"}
        </button>
      </div>
    </div>
  );
}

export default FoodCard;
