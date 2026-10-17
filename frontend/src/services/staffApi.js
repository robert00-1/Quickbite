const MENU_API_URL =
  import.meta.env.VITE_API_BASE_URL ||
  "http://127.0.0.1:5000/api/menu-items";

export const API_ROOT = MENU_API_URL.replace(/\/menu-items\/?$/, "");

const TOKEN_KEY = "quickbite_staff_token";
const USER_KEY = "quickbite_staff_user";

export function getStaffToken() {
  return localStorage.getItem(TOKEN_KEY);
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
  if (!data?.access_token || !data?.user) {
    throw new Error(
      "The login response is missing staff session information."
    );
  }

  localStorage.setItem(TOKEN_KEY, data.access_token);
  localStorage.setItem(USER_KEY, JSON.stringify(data.user));
}

export function clearStaffSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

export async function staffRequest(endpoint, options = {}) {
  const headers = new Headers(options.headers || {});
  const token = getStaffToken();

  // Attach the staff authentication token.
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  // Let the browser set the multipart boundary for file uploads.
  const isFormData =
    typeof FormData !== "undefined" &&
    options.body instanceof FormData;

  if (isFormData) {
    headers.delete("Content-Type");
  } else if (options.body && !headers.has("Content-Type")) {
    // Normal requests with JSON bodies use this content type.
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(`${API_ROOT}${endpoint}`, {
    ...options,
    headers,
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