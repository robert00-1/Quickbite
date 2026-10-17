import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { getMealById } from "../services/api";
import Loading from "../components/menu/Loading";
import ErrorMessage from "../components/menu/ErrorMessage";
import { useCart } from "../context/CartContext";

function FoodDetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { addToCart } = useCart();

  const [meal, setMeal] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    const fetchMeal = async () => {
      setLoading(true);
      setError("");

      try {
        const data = await getMealById(id);

        if (!cancelled) {
          setMeal(data);
        }
      } catch (err) {
        if (!cancelled) {
          console.error("Meal details loading error:", err);
          setError("Unable to load meal details.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    fetchMeal();

    return () => {
      cancelled = true;
    };
  }, [id]);

  // Treat a meal as unavailable only when the API explicitly says false.
  const isAvailable = meal?.availability !== false;

  const handleAddToCart = () => {
    if (!meal || !isAvailable) return;

    addToCart(meal);

    // Automatically open the cart after adding the meal.
    navigate("/cart");
  };

  if (loading) {
    return <Loading />;
  }

  if (error) {
    return <ErrorMessage message={error} />;
  }

  if (!meal) {
    return <ErrorMessage message="Meal not found." />;
  }

  return (
    <main className="mx-auto max-w-[1200px] px-5 py-8">
      <div className="rounded-[10px] bg-white p-6 shadow-sm md:p-8">
        {/* Top Section */}
        <div className="mb-6 flex justify-between gap-4">
          <span
            className={`h-fit rounded-full px-4 py-2 text-sm font-bold ${
              isAvailable
                ? "bg-green-100 text-green-700"
                : "bg-red-100 text-red-700"
            }`}
          >
            {isAvailable ? "Available" : "Unavailable"}
          </span>

          <Link
            to="/menu"
            className="rounded-lg border-2 border-red-500 bg-white px-5 py-2.5 text-center font-semibold text-red-500 no-underline transition hover:bg-red-500 hover:text-white"
          >
            Back to Menu
          </Link>
        </div>

        {/* Meal Image */}
        <img
          src={meal.image}
          alt={meal.name}
          className={`w-full max-w-[500px] rounded-[10px] object-cover ${
            !isAvailable ? "grayscale" : ""
          }`}
        />

        {/* Meal Information */}
        <div className="mt-6">
          <h1 className="mb-4 text-3xl font-bold text-gray-800">
            {meal.name}
          </h1>

          <p className="mb-2 text-gray-600">
            <span className="font-semibold">Category:</span>{" "}
            {meal.category}
          </p>

          <p className="mb-6 text-xl font-bold text-red-500">
            KSh {meal.price}
          </p>

          <h2 className="mb-3 text-xl font-bold text-gray-800">
            About this meal
          </h2>

          <p className="mb-6 leading-7 text-gray-600">
            {meal.description || "No description available."}
          </p>

          <h2 className="mb-3 text-xl font-bold text-gray-800">
            Ingredients
          </h2>

          <ul className="mb-8 list-disc space-y-2 pl-6 text-gray-600">
            {(Array.isArray(meal.ingredients) ? meal.ingredients : []).map(
              (ingredient, index) => (
                <li key={`${ingredient}-${index}`}>{ingredient}</li>
              )
            )}
          </ul>

          {/* Availability Message */}
          {!isAvailable && (
            <p
              role="status"
              className="mb-4 rounded-lg border border-red-200 bg-red-50 p-4 font-medium text-red-700"
            >
              Sorry, this meal is currently unavailable. Please check back
              later or choose another meal.
            </p>
          )}

          {/* Add to Cart */}
          <button
            type="button"
            onClick={handleAddToCart}
            disabled={!isAvailable}
            className={`rounded-lg px-6 py-3 font-semibold transition ${
              !isAvailable
                ? "cursor-not-allowed bg-gray-300 text-gray-600"
                : "bg-red-500 text-white hover:bg-red-600"
            }`}
          >
            {!isAvailable ? "Currently Unavailable" : "Add to Cart"}
          </button>
        </div>
      </div>
    </main>
  );
}

export default FoodDetails;