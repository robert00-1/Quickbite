
const MENU_API_URL =
  import.meta.env.VITE_API_BASE_URL ||
  "http://127.0.0.1:5000/api/menu-items";

export const API_ROOT = MENU_API_URL.replace(/\/menu-items\/?$/, "");

const TOKEN_KEY = "quickbite_staff_token";
const USER_KEY = "quickbite_staff_user";
const CSRF_COOKIE_NAME = "quickbite_staff_csrf";

export function getStaffToken() {
  // Session tokens are now stored in an HttpOnly cookie, not JavaScript.
  return null;
}

export function getStaffUser() {
  try {
    const user = localStorage.getItem(USER_KEY);
    return user ? JSON.parse(user) : null;
  } catch {
    return null;
  }
}

export function saveStaffSession(data) {
  if (!data?.user) {
    throw new Error(
      "The login response is missing staff profile information."
    );
  }

  // Remove any legacy Bearer token from the previous login system.
  localStorage.removeItem(TOKEN_KEY);
  localStorage.setItem(USER_KEY, JSON.stringify(data.user));
}

export function clearStaffSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

function getCookie(name) {
  if (typeof document === "undefined") {
    return "";
  }

  const prefix = `${name}=`;
  const cookie = document.cookie
    .split("; ")
    .find((item) => item.startsWith(prefix));

  return cookie
    ? decodeURIComponent(cookie.substring(prefix.length))
    : "";
}

export async function staffRequest(endpoint, options = {}) {
  const headers = new Headers(options.headers || {});
  const method = (options.method || "GET").toUpperCase();

  const isFormData =
    typeof FormData !== "undefined" &&
    options.body instanceof FormData;

  // Preserve the browser-generated multipart boundary for uploads.
  if (isFormData) {
    headers.delete("Content-Type");
  } else if (options.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  // Require a CSRF token for requests that change data.
  if (["POST", "PUT", "PATCH", "DELETE"].includes(method)) {
    const csrfToken = getCookie(CSRF_COOKIE_NAME);

    if (csrfToken) {
      headers.set("X-CSRF-Token", csrfToken);
    }
  }

  const response = await fetch(`${API_ROOT}${endpoint}`, {
    ...options,
    method,
    headers,
    credentials: "include",
  });

  const responseText = await response.text();
  let data = {};

  try {
    data = responseText ? JSON.parse(responseText) : {};
  } catch {
    data = {};
  }

  if (!response.ok) {
    const error = new Error(
      data.error || `Request failed with status ${response.status}`
    );

    error.status = response.status;
    throw error;
  }

  return data;
}
