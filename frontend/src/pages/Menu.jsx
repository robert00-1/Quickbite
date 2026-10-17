
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getMeals } from "../services/api";
import FoodCard from "../components/menu/FoodCard";
import Loading from "../components/menu/Loading";
import ErrorMessage from "../components/menu/ErrorMessage";
import SearchBar from "../components/menu/SearchBar";
import CategoryFilter from "../components/menu/CategoryFilter";

function Menu() {
  const [meals, setMeals] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    const fetchMeals = async () => {
      try {
        const data = await getMeals();

        if (!cancelled) {
          // Keep every meal, including unavailable meals.
          setMeals(Array.isArray(data) ? data : []);
          setError("");
        }
      } catch (err) {
        if (!cancelled) {
          console.error("Menu loading error:", err);
          setError("Unable to load menu. Please try again.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    fetchMeals();

    const intervalId = setInterval(fetchMeals, 10000);

    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }, []);

  const categories = [
    ...new Set(meals.map((meal) => meal.category).filter(Boolean)),
  ];

  const filteredMeals = meals.filter((meal) => {
    const matchesSearch = (meal.name ?? "")
      .toLowerCase()
      .includes(searchTerm.toLowerCase());

    const matchesCategory =
      selectedCategory === "All" ||
      meal.category === selectedCategory;

    return matchesSearch && matchesCategory;
  });

  if (loading) {
    return <Loading />;
  }

  if (error && meals.length === 0) {
    return <ErrorMessage message={error} />;
  }

  return (
    <main className="mx-auto max-w-[1200px] px-5 py-8">
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-3xl font-bold text-gray-800">
          QUICKBITE <span className="text-red-500">Menu</span>
        </h1>

        <Link
          to="/cart"
          className="w-fit rounded-lg bg-red-500 px-5 py-3 font-semibold text-white transition hover:bg-red-600"
        >
          View Cart
        </Link>
      </div>

      <div className="mb-8 flex flex-col gap-4 sm:flex-row">
        <SearchBar
          searchTerm={searchTerm}
          onSearch={setSearchTerm}
        />

        <CategoryFilter
          categories={categories}
          selectedCategory={selectedCategory}
          onCategoryChange={setSelectedCategory}
        />
      </div>

      {error && (
        <p className="mb-4 text-sm text-red-600">{error}</p>
      )}

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
        {filteredMeals.map((meal) => (
          <FoodCard key={meal.id} food={meal} />
        ))}
      </div>

      {filteredMeals.length === 0 && (
        <p className="mt-10 text-center text-gray-500">
          No meals found.
        </p>
      )}
    </main>
  );
}

export default Menu;
