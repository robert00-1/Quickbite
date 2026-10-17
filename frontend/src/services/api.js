
const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ||
  "http://127.0.0.1:5000/api/menu-items";

export const getMeals = async () => {
  const response = await fetch(API_BASE_URL);

  if (!response.ok) {
    throw new Error("Failed to load menu");
  }

  const meals = await response.json();

  // Keep ALL meals, including unavailable ones.
  return meals.map((meal) => ({
    ...meal,
    id: Number(meal.id),
    price: Number(meal.price),
    ingredients: meal.ingredients || [],
  }));
};

export const getMealById = async (id) => {
  const response = await fetch(`${API_BASE_URL}/${id}`);

  if (!response.ok) {
    throw new Error("Failed to fetch meal details");
  }

  const meal = await response.json();

  return {
    ...meal,
    id: Number(meal.id),
    price: Number(meal.price),
    ingredients: meal.ingredients || [],
  };
};
