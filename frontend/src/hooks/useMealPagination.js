import { useMemo, useState } from "react";
import usePagination from "./usePagination";

export default function useMealPagination(meals) {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("All");
  const categories = [...new Set(meals.map((meal) => meal.category).filter(Boolean))];
  const filtered = useMemo(() => meals.filter((meal) => (!search || meal.name.toLowerCase().includes(search.trim().toLowerCase())) && (category === "All" || meal.category === category)), [meals, search, category]);
  return {...usePagination(filtered, JSON.stringify([search, category])), search, setSearch, category, setCategory, categories};
}
