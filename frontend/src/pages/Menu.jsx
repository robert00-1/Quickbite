
import { useEffect, useState, useCallback, useRef } from "react";
import { getMeals, FALLBACK_IMAGE } from "../services/api";
import { useCart } from "../context/CartContext";
import FoodCard from "../components/menu/FoodCard";
import Loading from "../components/menu/Loading";
import ErrorMessage from "../components/menu/ErrorMessage";
import SearchBar from "../components/menu/SearchBar";
import CategoryFilter from "../components/menu/CategoryFilter";

const DEBOUNCE_MS = 300;

function Menu() {
  const { cart } = useCart();
  void cart; // cart used in Navbar; kept here for context subscription

  const [meals, setMeals] = useState([]);
  const [allCategories, setAllCategories] = useState([]);
  const [compareMeals, setCompareMeals] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [minPrice, setMinPrice] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const handleCompare = (meal) => {
    setCompareMeals((current) => {
      const already = current.some((m) => m.id === meal.id);
      if (already) return current.filter((m) => m.id !== meal.id);
      if (current.length >= 2) return [current[1], meal];
      return [...current, meal];
    });
  };

  const requestVersion = useRef(0);
  const fetchMeals = useCallback(async () => {
    const version = ++requestVersion.current;
    try {
      const params = new URLSearchParams();
      if (debouncedSearchTerm) params.set("search", debouncedSearchTerm);
      if (selectedCategory && selectedCategory !== "All")
        params.set("category", selectedCategory);
      if (minPrice) params.set("min_price", minPrice);
      if (maxPrice) params.set("max_price", maxPrice);

      const data = await getMeals(params.toString());
      const all = await getMeals();
      if (version !== requestVersion.current) return;
      setMeals(Array.isArray(data) ? data : []);
      const availableCategories = [...new Set(all.map((m) => m.category).filter(Boolean))];
      setAllCategories(availableCategories);
      if (selectedCategory !== "All" && !availableCategories.includes(selectedCategory)) setSelectedCategory("All");
      setError("");
    } catch (err) {
      console.error("Menu loading error:", err);
      setError("Unable to load menu. Please try again.");
    } finally {
      if (version === requestVersion.current) setLoading(false);
    }
  }, [debouncedSearchTerm, selectedCategory, minPrice, maxPrice]);

  // Debounce search term
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchTerm(searchTerm);
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  // Fetch when filters change
  useEffect(() => {
    setLoading(true);
    fetchMeals();
  }, [fetchMeals]);

  // Poll for updates every 15 seconds
  useEffect(() => {
    const id = setInterval(fetchMeals, 15000);
    return () => clearInterval(id);
  }, [fetchMeals]);

  const categories = [
    "All",
    ...allCategories,
  ];

  // Filter client-side (in addition to server-side for UX responsiveness)
  const filteredMeals = meals.filter((meal) => {
    const matchesMin = minPrice === "" || meal.price >= Number(minPrice);
    const matchesMax = maxPrice === "" || meal.price <= Number(maxPrice);
    return matchesMin && matchesMax;
  });

  const mealsOfDay = filteredMeals.filter((m) => m.is_food_of_day === true);
  const kidsMeals = filteredMeals.filter((m) => m.category === "Kids");
  const otherMeals = filteredMeals.filter(
    (m) => m.category !== "Kids"
  );

  if (loading && meals.length === 0) return <Loading />;

  if (error && meals.length === 0) {
    return <ErrorMessage message={error} />;
  }

  return (
    <main className="mx-auto max-w-[1200px] px-5 py-8">
      {/* Header — no "View Cart" button; cart is in navbar */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-800">
          QUICKBITE <span className="text-red-500">Menu</span>
        </h1>
        <p className="mt-1 text-gray-500">
          Fresh meals prepared just for you
        </p>
      </div>

      {/* Search and filters */}
      <div className="mb-8 flex flex-col gap-4">
        <div className="flex flex-col gap-4 sm:flex-row">
          <SearchBar searchTerm={searchTerm} onSearch={setSearchTerm} />
          <CategoryFilter
            categories={categories}
            selectedCategory={selectedCategory}
            onCategoryChange={(cat) => {
              setSelectedCategory(cat);
            }}
          />
        </div>

        <div className="flex flex-col gap-4 sm:flex-row">
          <input
            type="number"
            min="0"
            placeholder="Min price (KSh)"
            value={minPrice}
            onChange={(e) => setMinPrice(e.target.value)}
            className="w-full rounded-lg border-2 border-gray-200 bg-white px-4 py-3 text-gray-700 outline-none transition placeholder:text-gray-400 focus:border-red-500 sm:w-auto"
          />
          <input
            type="number"
            min="0"
            placeholder="Max price (KSh)"
            value={maxPrice}
            onChange={(e) => setMaxPrice(e.target.value)}
            className="w-full rounded-lg border-2 border-gray-200 bg-white px-4 py-3 text-gray-700 outline-none transition placeholder:text-gray-400 focus:border-red-500 sm:w-auto"
          />
        </div>
      </div>

      {error && (
        <p className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-600">
          {error}
        </p>
      )}

      {/* Meal of the Day — supports multiple */}
      {mealsOfDay.length > 0 && (
        <section className="mb-10 rounded-xl border border-red-100 bg-red-50 p-5">
          <h2 className="mb-1 text-2xl font-bold text-gray-800">
            🌟 Meal of the Day
          </h2>
          <p className="mb-5 text-sm text-gray-500">
            Chef's special selections for today
          </p>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
            {mealsOfDay.map((meal) => (
              <FoodCard
                key={meal.id}
                food={meal}
                onCompare={handleCompare}
                isSelected={compareMeals.some((m) => m.id === meal.id)}
              />
            ))}
          </div>
        </section>
      )}

      {/* Kids Meals */}
      {kidsMeals.length > 0 && (
        <section className="mb-10">
          <h2 className="mb-5 text-2xl font-bold text-gray-800">
            👶 Kids Meals
          </h2>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
            {kidsMeals.map((meal) => (
              <FoodCard
                key={meal.id}
                food={meal}
                onCompare={handleCompare}
                isSelected={compareMeals.some((m) => m.id === meal.id)}
              />
            ))}
          </div>
        </section>
      )}

      {/* All Other Meals */}
      {otherMeals.length > 0 && (
        <section className="mb-10">
          <h2 className="mb-5 text-2xl font-bold text-gray-800">
            All Items
          </h2>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
            {otherMeals.map((meal) => (
              <FoodCard
                key={meal.id}
                food={meal}
                onCompare={handleCompare}
                isSelected={compareMeals.some((m) => m.id === meal.id)}
              />
            ))}
          </div>
        </section>
      )}

      {/* Comparison panel */}
      {compareMeals.length > 0 && (
        <section className="mb-10 rounded-xl bg-gray-100 p-6">
          <div className="mb-5 flex items-center justify-between">
            <h2 className="text-2xl font-bold text-gray-800">
              Compare Meals
            </h2>
            <button
              type="button"
              onClick={() => setCompareMeals([])}
              className="rounded-lg bg-gray-600 px-4 py-2 text-sm text-white hover:bg-gray-700"
            >
              Clear
            </button>
          </div>
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            {compareMeals.map((meal) => (
              <div key={meal.id} className="rounded-xl bg-white p-5 shadow">
                <img
                  src={meal.image || FALLBACK_IMAGE}
                  alt={meal.name}
                  className="mb-4 h-48 w-full rounded-lg object-cover"
                  onError={(e) => {
                    e.target.onerror = null;
                    e.target.src = FALLBACK_IMAGE;
                  }}
                />
                <button type="button" className="mb-2 text-sm text-red-500" onClick={() => handleCompare(meal)}>Remove {meal.name}</button>
                <h3 className="mb-2 text-xl font-bold text-gray-800">
                  {meal.name}
                </h3>
                <p className="mb-1 text-gray-500">Category: {meal.category}</p>
                <p className="mb-1 font-bold text-red-500">
                  KSh {Number(meal.price).toLocaleString("en-KE")}
                </p>
                {meal.preparation_time != null && (
                  <p className="mb-1 text-sm text-gray-500">
                    Prep: {meal.preparation_time} min · Serving: {meal.serving_time ?? "—"} min
                  </p>
                )}
                <p className="mt-2 text-gray-600">{meal.description}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {filteredMeals.length === 0 && !loading && (
        <p className="mt-10 text-center text-gray-500">
          No meals found matching your search.
        </p>
      )}
    </main>
  );
}

export default Menu;
