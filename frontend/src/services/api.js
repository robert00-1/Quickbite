import { API_ROOT } from "./staffApi";

export const FALLBACK_IMAGE = "/images/meal-unavailable.svg";
export function imageUrl(value) {
  if (!value || typeof value !== "string") return FALLBACK_IMAGE;
  if (/^https?:\/\//i.test(value)) return value;
  if (value.startsWith("//")) return `https:${value}`;
  if (/^[a-z]+:/i.test(value)) return FALLBACK_IMAGE;
  const backendOrigin = new URL(API_ROOT, window.location.origin).origin;
  return new URL(value.startsWith("/") ? value : `/${value}`, backendOrigin).href;
}
const normalize = (meal) => ({...meal, image: imageUrl(meal.image), id: Number(meal.id), price: Number(meal.price), ingredients: meal.ingredients || []});
export async function getMeals(query = "", signal) {
  const response = await fetch(`${API_ROOT}/menu-items${query ? `?${query}` : ""}`, { signal });
  if (!response.ok) throw new Error("Failed to load menu");
  const data = await response.json();
  if (!Array.isArray(data)) throw new Error("Invalid menu response");
  return data.map(normalize);
}
export async function getMealById(id) {
  const response = await fetch(`${API_ROOT}/menu-items/${id}`);
  if (!response.ok) throw new Error("Failed to fetch meal details");
  return normalize(await response.json());
}
