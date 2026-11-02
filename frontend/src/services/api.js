import { API_ROOT } from "./staffApi";

export const FALLBACK_IMAGE = "/images/meal-unavailable.svg";
export function imageUrl(value) {
  if (!value || typeof value !== "string" || !value.trim()) return FALLBACK_IMAGE;
  value = value.trim();
  try {
    if (/^[a-z]+:/i.test(value) && !/^https?:\/\//i.test(value)) return FALLBACK_IMAGE;
    const backendOrigin = new URL(API_ROOT, window.location.origin).origin;
    const url = new URL(value.startsWith("//") ? `https:${value}` : value.startsWith("/") || /^https?:/i.test(value) ? value : `/${value}`, backendOrigin);
    if (!["https:", "http:"].includes(url.protocol) || url.username || url.password) return FALLBACK_IMAGE;
    return url.href;
  } catch { return FALLBACK_IMAGE; }
}

const normalize = (meal) => ({...meal, image: imageUrl(meal.image), id: String(meal.id).startsWith("mealdb_") ? String(meal.id) : Number(meal.id), price: Number(meal.price), ingredients: meal.ingredients || []});
export async function getMeals(query = "", signal) {
  const response = await fetch(`${API_ROOT}/menu-items${query ? `?${query}` : ""}`, { signal });
  if (!response.ok) {
    let data = {};
    try { data = await response.json(); } catch { /* Handle non-JSON proxy/server errors too. */ }
    throw new Error(data.error || `Unable to load menu (HTTP ${response.status}).`);
  }
  const data = await response.json();
  const items = Array.isArray(data) ? data : data.items;
  if (!Array.isArray(items)) throw new Error("Invalid menu response");
  const meals = items.map(normalize);
  meals.pagination = Array.isArray(data) ? undefined : data.pagination;
  meals.warning = response.headers?.get("X-Menu-Warning") || "";
  return meals;
}
export async function getMealById(id) {
  const path = String(id).startsWith("mealdb_") ? `mealdb/${String(id).slice(7)}` : id;
  const response = await fetch(`${API_ROOT}/menu-items/${path}`);
  if (!response.ok) throw new Error("Failed to fetch meal details");
  return normalize(await response.json());
}

// Use provider-supported thumbnails; preserve signed/custom image URLs.
export function menuThumbnail(value) {
  const normalized = imageUrl(value);
  const url = new URL(normalized, window.location.origin);
  if (url.hostname === "res.cloudinary.com" && /\/image\/upload\/v[0-9]+\//.test(url.pathname)) {
    url.pathname = url.pathname.replace("/image/upload/", "/image/upload/f_auto,q_auto,w_800,c_limit/");
  }
  if (["www.themealdb.com", "themealdb.com"].includes(url.hostname) && /\/images\/media\/meals\/[^/]+\.(jpg|png)$/i.test(url.pathname)) {
    url.pathname += "/preview";
  }
  return url.href;
}
