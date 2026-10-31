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
  const [compareMeals, setCompareMeals] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [minPrice, setMinPrice] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const handleCompare = (meal) => {
    setCompareMeals((currentMeals) => {
      const alreadySelected = currentMeals.some(
        (selectedMeal) => selectedMeal.id === meal.id,
      );

      if (alreadySelected) {
        return currentMeals.filter(
          (selectedMeal) => selectedMeal.id !== meal.id,
        );
      }

      if (currentMeals.length >= 2) {
        return currentMeals;
      }

      return [...currentMeals, meal];
    });
  };

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

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchTerm(searchTerm);
    }, 300);

    return () => clearTimeout(timer);
  }, [searchTerm]);

  const categories = [
    ...new Set(meals.map((meal) => meal.category).filter(Boolean)),
  ];

  const filteredMeals = meals.filter((meal) => {
    const matchesSearch = (meal.name ?? "")
      .toLowerCase()
      .includes(debouncedSearchTerm.toLowerCase());

    const matchesCategory =
      selectedCategory === "All" || meal.category === selectedCategory;

    const matchesMinPrice = minPrice === "" || meal.price >= Number(minPrice);

    const matchesMaxPrice = maxPrice === "" || meal.price <= Number(maxPrice);

    return (
      matchesSearch && matchesCategory && matchesMinPrice && matchesMaxPrice
    );
  });

  // Separate meals into categories
  const mealOfTheDay = filteredMeals.filter(
    (meal) => meal.category === "Meal of the Day",
  );

  const kidsMeals = filteredMeals.filter((meal) => meal.category === "Kids");

  const otherMeals = filteredMeals.filter(
    (meal) => meal.category !== "Meal of the Day" && meal.category !== "Kids",
  );

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

      <div className="mb-8 flex flex-col gap-4">
        <div className="flex flex-col gap-4 sm:flex-row">
          <SearchBar searchTerm={searchTerm} onSearch={setSearchTerm} />

          <CategoryFilter
            categories={categories}
            selectedCategory={selectedCategory}
            onCategoryChange={setSelectedCategory}
          />
        </div>

        <div className="flex flex-col gap-4 sm:flex-row">
          <input
            type="number"
            min="0"
            placeholder="Minimum price"
            value={minPrice}
            onChange={(event) => setMinPrice(event.target.value)}
            className="w-full rounded-lg border-2 border-gray-200 bg-white px-4 py-3 text-gray-700 outline-none transition placeholder:text-gray-400 focus:border-red-500 sm:w-auto"
          />

          <input
            type="number"
            min="0"
            placeholder="Maximum price"
            value={maxPrice}
            onChange={(event) => setMaxPrice(event.target.value)}
            className="w-full rounded-lg border-2 border-gray-200 bg-white px-4 py-3 text-gray-700 outline-none transition placeholder:text-gray-400 focus:border-red-500 sm:w-auto"
          />
        </div>
      </div>

      {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

      {/* Meal of the Day */}
      {mealOfTheDay.length > 0 && (
        <section className="mb-10">
          <h2 className="mb-5 text-2xl font-bold text-gray-800">
            Meal of the Day
          </h2>

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
            {mealOfTheDay.map((meal) => (
              <FoodCard
                key={meal.id}
                food={meal}
                onCompare={handleCompare}
                isSelected={compareMeals.some(
                  (selectedMeal) => selectedMeal.id === meal.id,
                )}
              />
            ))}
          </div>
        </section>
      )}

      {/* Kids Meals */}
      {kidsMeals.length > 0 && (
        <section className="mb-10">
          <h2 className="mb-5 text-2xl font-bold text-gray-800">Kids Meals</h2>

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
            {kidsMeals.map((meal) => (
              <FoodCard
                key={meal.id}
                food={meal}
                onCompare={handleCompare}
                isSelected={compareMeals.some(
                  (selectedMeal) => selectedMeal.id === meal.id,
                )}
              />
            ))}
          </div>
        </section>
      )}

      {/* Other Meals */}
      {otherMeals.length > 0 && (
        <section className="mb-10">
          <h2 className="mb-5 text-2xl font-bold text-gray-800">Other Meals</h2>

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
            {otherMeals.map((meal) => (
              <FoodCard
                key={meal.id}
                food={meal}
                onCompare={handleCompare}
                isSelected={compareMeals.some(
                  (selectedMeal) => selectedMeal.id === meal.id,
                )}
              />
            ))}
          </div>
        </section>
      )}

      {compareMeals.length === 2 && (
        <section className="mb-10 rounded-lg bg-gray-100 p-6">
          <h2 className="mb-5 text-2xl font-bold text-gray-800">
            Compare Meals
          </h2>

          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            {compareMeals.map((meal) => (
              <div key={meal.id} className="rounded-lg bg-white p-5 shadow">
                <img
                  src={meal.image}
                  alt={meal.name}
                  className="mb-4 h-48 w-full rounded-lg object-cover"
                />

                <h3 className="mb-2 text-xl font-bold text-gray-800">
                  {meal.name}
                </h3>

                <p className="mb-2 text-gray-600">Category: {meal.category}</p>

                <p className="mb-2 font-bold text-red-500">
                  Price: KSh {meal.price}
                </p>

                <p className="text-gray-600">{meal.description}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {filteredMeals.length === 0 && (
        <p className="mt-10 text-center text-gray-500">No meals found.</p>
      )}
    </main>
  );
}

export default Menu;
