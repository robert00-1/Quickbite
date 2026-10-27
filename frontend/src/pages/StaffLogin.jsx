import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { API_ROOT, saveStaffSession } from "../services/staffApi";

function StaffLogin() {
  const navigate = useNavigate();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async (event) => {
    event.preventDefault();
    setError("");

    if (!username.trim() || !password) {
      setError("Please enter your username and password.");
      return;
    }

    setLoading(true);

    try {
      const response = await fetch(`${API_ROOT}/auth/login`, {
  method: "POST",
  credentials: "include",
  headers: {
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    username: username.trim(),
    password,
  }),
});


      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Unable to log in.");
      }

      if (!["waiter", "manager"].includes(data.user?.role)) {
        throw new Error("This account is not authorized for staff access.");
      }

      saveStaffSession(data);

      if (data.user.role === "manager") {
        navigate("/manager", { replace: true });
      } else {
        navigate("/waiter", { replace: true });
      }
    } catch (err) {
      console.error("Staff login error:", err);
      setError(err.message || "Unable to log in. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-100 px-5 py-10">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-lg">
        <h1 className="mb-2 text-center text-3xl font-bold text-gray-800">
          Staff <span className="text-red-500">Login</span>
        </h1>

        <p className="mb-8 text-center text-gray-500">
          Sign in with your assigned QuickBite staff account.
        </p>

        {error && (
          <div
            role="alert"
            className="mb-5 rounded-lg border border-red-200 bg-red-50 p-3 text-center text-sm font-semibold text-red-600"
          >
            {error}
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-5">
          <div>
            <label
              htmlFor="username"
              className="mb-2 block font-semibold text-gray-700"
            >
              Username
            </label>

            <input
              id="username"
              type="text"
              autoComplete="username"
              required
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              placeholder="Enter your username"
              className="w-full rounded-lg border-2 border-gray-200 px-4 py-3 outline-none transition focus:border-red-500"
            />
          </div>

          <div>
            <label
              htmlFor="password"
              className="mb-2 block font-semibold text-gray-700"
            >
              Password
            </label>

            <input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Enter your password"
              className="w-full rounded-lg border-2 border-gray-200 px-4 py-3 outline-none transition focus:border-red-500"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-red-500 px-5 py-3 font-bold text-white transition hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? "Signing in..." : "Login"}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-gray-500">
          Customer?
          {" "}
          <Link
            to="/menu"
            className="font-semibold text-red-500 hover:text-red-600"
          >
            Return to menu
          </Link>
        </p>
      </div>
    </main>
  );
}

export default StaffLogin;