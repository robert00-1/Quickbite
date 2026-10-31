import { Link } from "react-router-dom";

function FoodCard({ food, onCompare, isSelected }) {
  const isAvailable = food.availability !== false;

  return (
    <div
      className={`overflow-hidden rounded-[10px] bg-white shadow-[0_2px_8px_rgba(0,0,0,0.1)] transition hover:-translate-y-1 hover:shadow-lg ${
        !isAvailable ? "opacity-90" : ""
      }`}
    >
      <Link
        to={`/menu/${food.id}`}
        className="text-inherit no-underline"
        aria-label={`${food.name}, ${
          isAvailable ? "Available" : "Unavailable"
        }`}
      >
        <div className="relative">
          <img
            src={food.image}
            alt={food.name}
            className={`h-[200px] w-full object-cover ${
              !isAvailable ? "grayscale" : ""
            }`}
          />

          {!isAvailable && (
            <span className="absolute left-3 top-3 rounded-full bg-red-600 px-3 py-1.5 text-sm font-bold text-white shadow">
              Unavailable
            </span>
          )}

          {isAvailable && (
            <span className="absolute left-3 top-3 rounded-full bg-green-600 px-3 py-1.5 text-sm font-bold text-white shadow">
              Available
            </span>
          )}
        </div>

        <div className="p-[15px]">
          <h3 className="mt-0 font-bold text-gray-800">{food.name}</h3>

          <p className="my-2 text-gray-600">{food.category}</p>

          <button
            type="button"
            onClick={(event) => {
              event.preventDefault();
              onCompare(food);
            }}
            className={`mt-3 w-full rounded-lg px-4 py-2 font-semibold transition ${
              isSelected
                ? "bg-gray-700 text-white"
                : "bg-blue-500 text-white hover:bg-blue-600"
            }`}
          >
            {isSelected ? "Remove from Compare" : "Compare"}
          </button>

          {!isAvailable && (
            <p className="mt-3 text-sm font-medium text-red-600">
              This meal is currently unavailable.
            </p>
          )}
        </div>
      </Link>
    </div>
  );
}

export default FoodCard;
