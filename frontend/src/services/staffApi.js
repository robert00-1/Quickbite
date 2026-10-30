
const DEFAULT_API_URL = "http://127.0.0.1:5000/api";

const CONFIGURED_API_URL = (
  import.meta.env.VITE_API_BASE_URL || DEFAULT_API_URL
).replace(/\/+$/, "");

// Supports either:
// http://127.0.0.1:5000/api
// http://127.0.0.1:5000/api/menu-items
export const API_ROOT = CONFIGURED_API_URL.replace(
  /\/menu-items$/,
  ""
);

const TOKEN_KEY = "quickbite_staff_token";
const USER_KEY = "quickbite_staff_user";
const CSRF_COOKIE_NAME = "quickbite_staff_csrf";

const METHODS_REQUIRING_CSRF = new Set([
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
]);

/**
 * Session tokens are stored in HttpOnly cookies.
 * JavaScript cannot access HttpOnly cookies.
 */
export function getStaffToken() {
  return null;
}

/**
 * Retrieve the logged-in staff profile.
 */
export function getStaffUser() {
  try {
    if (typeof localStorage === "undefined") {
      return null;
    }

    const user = localStorage.getItem(USER_KEY);
    return user ? JSON.parse(user) : null;
  } catch {
    return null;
  }
}

/**
 * Save staff profile after successful login.
 * Authentication is handled by the server cookie.
 */
export function saveStaffSession(data) {
  if (!data?.user) {
    throw new Error(
      "The login response is missing staff profile information."
    );
  }

  if (typeof localStorage === "undefined") {
    throw new Error(
      "Local storage is unavailable in this browser."
    );
  }

  // Remove legacy token-based authentication.
  localStorage.removeItem(TOKEN_KEY);

  localStorage.setItem(
    USER_KEY,
    JSON.stringify(data.user)
  );
}

/**
 * Clear the locally stored staff profile.
 * The server should also clear its session cookie during logout.
 */
export function clearStaffSession() {
  if (typeof localStorage === "undefined") {
    return;
  }

  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

/**
 * Read a browser cookie.
 *
 * HttpOnly cookies are intentionally inaccessible here.
 * The CSRF cookie must be readable by JavaScript.
 */
function getCookie(name) {
  if (typeof document === "undefined") {
    return "";
  }

  const prefix = `${name}=`;

  const cookie = document.cookie
    .split("; ")
    .find((item) => item.startsWith(prefix));

  if (!cookie) {
    return "";
  }

  try {
    return decodeURIComponent(
      cookie.substring(prefix.length)
    );
  } catch {
    return "";
  }
}

/**
 * Make authenticated requests to the Flask backend.
 */
export async function staffRequest(endpoint, options = {}) {
  if (
    typeof endpoint !== "string" ||
    !endpoint.startsWith("/") ||
    endpoint.startsWith("//")
  ) {
    throw new Error(
      "API endpoint must be a relative path beginning with '/'."
    );
  }

  const headers = new Headers(options.headers || {});
  const method = (options.method || "GET").toUpperCase();

  const isFormData =
    typeof FormData !== "undefined" &&
    options.body instanceof FormData;

  // Let the browser set the multipart boundary for uploads.
  if (isFormData) {
    headers.delete("Content-Type");
  } else if (
    options.body &&
    !headers.has("Content-Type")
  ) {
    headers.set("Content-Type", "application/json");
  }

  // Attach CSRF token to requests that modify server data.
  if (METHODS_REQUIRING_CSRF.has(method)) {
    const csrfToken = getCookie(CSRF_COOKIE_NAME);

    if (csrfToken) {
      headers.set("X-CSRF-Token", csrfToken);
    }
  }

  let response;

  try {
    response = await fetch(`${API_ROOT}${endpoint}`, {
      ...options,
      method,
      headers,
      credentials: "include",
    });
  } catch {
  throw new Error(
    "Unable to connect to the QuickBite server. Check that Flask is running and your API URL is correct."
  );
}

  const responseText = await response.text();

  let data = {};

  try {
    data = responseText
      ? JSON.parse(responseText)
      : {};
  } catch {
    data = {
      error: responseText || "The server returned an invalid response.",
    };
  }

  if (!response.ok) {
    let message =
      data.error ||
      data.message ||
      `Request failed with status ${response.status}.`;

    if (response.status === 401) {
      message =
        "Your staff session has expired or you are not logged in. Please sign in again.";
    } else if (response.status === 403) {
      message =
        data.error ||
        "You do not have permission to perform this action.";
    } else if (response.status >= 500) {
      message =
        data.error ||
        "A server error occurred. Please try again later.";
    }

    const error = new Error(message);
    error.status = response.status;
    error.data = data;

    throw error;
  }

  return data;
}
