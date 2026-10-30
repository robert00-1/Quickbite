import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { Link, useNavigate } from "react-router-dom";

import {
  createMenuItem,
  getManagerOrders,
  getManagerDashboard,
  getMenuItems,
  updateMenuItemAvailability,
  updateMenuItemImage,
  uploadMenuItemImage,

} from "../services/managerApi";

import {
  clearStaffSession,
  getStaffUser,
  staffRequest,
} from "../services/staffApi";

const REFRESH_MS = 10000;
const MAX_IMAGE_SIZE = 5 * 1024 * 1024;

const STATUS_CONFIG = {
  PENDING: {
    label: "Pending",
    style: "bg-red-100 text-red-600",
  },
  PREPARING: {
    label: "Preparing",
    style: "bg-yellow-100 text-yellow-700",
  },
  READY: {
    label: "Ready",
    style: "bg-green-100 text-green-700",
  },
  SERVED: {
    label: "Served",
    style: "bg-gray-100 text-gray-700",
  },
};

const INITIAL_FOOD_DRAFT = {
  name: "",
  description: "",
  price: "",
  image: null,
  category: "Main Course",
  ingredients: "",
  stock_quantity: "10",
};

function StatCard({ title, value, description }) {
  return (
    <div className="rounded-xl border-l-4 border-red-500 bg-white p-6 shadow">
      <p className="text-sm font-semibold uppercase tracking-wide text-gray-500">
        {title}
      </p>

      <h2 className="mt-3 break-words text-3xl font-bold text-red-500 sm:text-4xl">
        {value}
      </h2>

      <p className="mt-2 text-sm text-gray-500">{description}</p>
    </div>
  );
}

function StatusBadge({ status }) {
  const normalized = String(status ?? "PENDING").toUpperCase();

  const config = STATUS_CONFIG[normalized] ?? {
    label: normalized,
    style: "bg-gray-100 text-gray-700",
  };

  return (
    <span
      className={`inline-block whitespace-nowrap rounded-full px-3 py-1 text-sm font-medium ${config.style}`}
    >
      {config.label}
    </span>
  );
}

function ManagerDashboard() {
  const navigate = useNavigate();
  const staffUser = getStaffUser();

  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [dashboardStats, setDashboardStats] = useState(null);
  const [dashboardStatsError, setDashboardStatsError] = useState("");

  // Meal availability.
  const [stockItems, setStockItems] = useState([]);
  const [stockLoading, setStockLoading] = useState(true);
  const [stockError, setStockError] = useState("");
  const [savingStockId, setSavingStockId] = useState(null);
  const [stockSuccess, setStockSuccess] = useState("");
  const [uploadingImageId, setUploadingImageId] = useState(null);

  // Add Food form.
  const [showAddFoodForm, setShowAddFoodForm] = useState(false);
  const [foodDraft, setFoodDraft] = useState(INITIAL_FOOD_DRAFT);
  const [foodFormError, setFoodFormError] = useState("");
  const [foodFormSuccess, setFoodFormSuccess] = useState("");
  const [foodFormLoading, setFoodFormLoading] = useState(false);

  // Add Waiter form and roster.
  const [showWaiterForm, setShowWaiterForm] = useState(false);
  const [waiterNameDraft, setWaiterNameDraft] = useState("");
  const [waiters, setWaiters] = useState([]);
  const [waiterFormError, setWaiterFormError] = useState("");
  const [waiterFormSuccess, setWaiterFormSuccess] = useState("");
  const [waiterFormLoading, setWaiterFormLoading] = useState(false);
  const [deletingWaiterId, setDeletingWaiterId] = useState(null);
  const savingStockIdRef = useRef(null);
  const ordersRequestInProgress = useRef(false);
  const stockRequestInProgress = useRef(false);

  // Log out the current manager.
  const handleLogout = async () => {
    try {
      await staffRequest("/auth/logout", {
        method: "POST",
      });
    } catch (err) {
      console.error("Logout failed:", err);
    } finally {
      clearStaffSession();
      navigate("/staff-login", { replace: true });
    }
  };

  // Load orders.
  const loadOrders = useCallback(async () => {
    if (ordersRequestInProgress.current) return;

    ordersRequestInProgress.current = true;

    try {
      const data = await getManagerOrders();
      setOrders(data);
      setError("");
    } catch (err) {
      console.error("Manager dashboard error:", err);
      setError("Unable to load orders. Please check your connection.");
    } finally {
      setLoading(false);
      ordersRequestInProgress.current = false;
    }
  }, []);

  // Load summary statistics from the backend.
  const loadDashboardStats = useCallback(async () => {
    try {
      const data = await getManagerDashboard();
      const stats = data?.stats ?? null;

      setDashboardStats(stats);
      setDashboardStatsError(
        stats ? "" : "Dashboard statistics were not returned by the server."
      );
    } catch (err) {
      console.error("Dashboard statistics error:", err);
      setDashboardStatsError(
        err.message || "Unable to load the latest dashboard statistics."
      );
    }
  }, []);

  // Load menu items.
  const loadStock = useCallback(async () => {
    if (stockRequestInProgress.current) return;

    stockRequestInProgress.current = true;

    try {
      const data = await getMenuItems();

      setStockItems((previous) => {
        if (savingStockIdRef.current === null) {
          return data;
        }

        return data.map((item) => {
          if (item.id !== savingStockIdRef.current) {
            return item;
          }

          return (
            previous.find((current) => current.id === item.id) ?? item
          );
        });
      });

      setStockError("");
    } catch (err) {
      console.error("Menu availability loading error:", err);
      setStockError(
        "Unable to load meal availability. Check your backend connection."
      );
    } finally {
      setStockLoading(false);
      stockRequestInProgress.current = false;
    }
  }, []);

  // Toggle meal availability.
  const handleAvailabilityUpdate = async (item) => {
    if (savingStockIdRef.current !== null) return;

    const newAvailability = item.availability !== true;

    savingStockIdRef.current = item.id;
    setSavingStockId(item.id);
    setStockError("");
    setStockSuccess("");

    try {
      const updatedItem = await updateMenuItemAvailability(
        item.id,
        newAvailability
      );

      setStockItems((previous) =>
        previous.map((currentItem) =>
          currentItem.id === item.id ? updatedItem : currentItem
        )
      );

      setStockSuccess(
        `${updatedItem.name} marked ${
          updatedItem.availability ? "Available" : "Unavailable"
        } successfully.`
      );
    } catch (err) {
      console.error("Availability update error:", err);
      setStockError(
        err.message || "Failed to update meal availability."
      );
    } finally {
      savingStockIdRef.current = null;
      setSavingStockId(null);
    }
  };

  // Upload a new photo for an existing menu item.
  const handleExistingFoodImageChange = async (event, item) => {
    const file = event.target.files?.[0];

    // Allow selecting the same file again later.
    event.target.value = "";

    if (!file) return;

    setStockError("");
    setStockSuccess("");

    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setStockError("Choose a JPG, PNG, or WebP image.");
      return;
    }

    if (file.size === 0 || file.size > MAX_IMAGE_SIZE) {
      setStockError("Choose an image larger than 0 bytes and no bigger than 5 MB.");
      return;
    }

    if (uploadingImageId !== null) return;

    setUploadingImageId(item.id);

    try {
      // First, upload the photo to Cloudinary.
      const uploadResult = await uploadMenuItemImage(file);

      if (!uploadResult?.image) {
        throw new Error("The upload did not return an image URL.");
      }

      // Next, save the Cloudinary URL in the database.
      const updatedItem = await updateMenuItemImage(
        item.id,
        uploadResult.image
      );

      // Update the dashboard immediately without a page reload.
      setStockItems((previous) =>
        previous.map((currentItem) =>
          currentItem.id === item.id ? updatedItem : currentItem
        )
      );

      setStockSuccess(`Photo updated successfully for ${item.name}.`);
    } catch (err) {
      console.error("Food photo update failed:", err);
      setStockError(err.message || "Unable to update the food photo.");
    } finally {
      setUploadingImageId(null);
    }
  };


  // Select a food photo from the computer.
  const handleFoodImageChange = (event) => {
    const file = event.target.files?.[0] ?? null;

    setFoodFormError("");
    setFoodFormSuccess("");

    if (!file) {
      setFoodDraft((previous) => ({
        ...previous,
        image: null,
      }));
      return;
    }

    const allowedTypes = [
      "image/jpeg",
      "image/png",
      "image/webp",
    ];

    if (!allowedTypes.includes(file.type)) {
      setFoodFormError("Choose a JPG, PNG, or WebP image.");
      event.target.value = "";
      setFoodDraft((previous) => ({
        ...previous,
        image: null,
      }));
      return;
    }

    if (file.size > MAX_IMAGE_SIZE) {
      setFoodFormError("The image must be 5 MB or smaller.");
      event.target.value = "";
      setFoodDraft((previous) => ({
        ...previous,
        image: null,
      }));
      return;
    }

    setFoodDraft((previous) => ({
      ...previous,
      image: file,
    }));
  };

  // Create a new food item and upload its photo if selected.
  const handleAddFood = async (event) => {
    event.preventDefault();

    setFoodFormError("");
    setFoodFormSuccess("");

    const name = foodDraft.name.trim();
    const price = Number(foodDraft.price);
    const stockQuantity = Number(foodDraft.stock_quantity);

    if (!name) {
      setFoodFormError("Enter the food name.");
      return;
    }

    if (
      foodDraft.price === "" ||
      !Number.isFinite(price) ||
      price < 0
    ) {
      setFoodFormError("Enter a valid, non-negative price.");
      return;
    }

    if (
      foodDraft.stock_quantity === "" ||
      !Number.isInteger(stockQuantity) ||
      stockQuantity < 0
    ) {
      setFoodFormError(
        "Stock must be a non-negative whole number."
      );
      return;
    }

    if (foodDraft.image && foodDraft.image.size > MAX_IMAGE_SIZE) {
      setFoodFormError("The image must be 5 MB or smaller.");
      return;
    }

    setFoodFormLoading(true);

    try {
      // Step 1: Upload the selected photo, if any.
      let imageUrl = "";

      if (foodDraft.image) {
        const uploadResult = await uploadMenuItemImage(
          foodDraft.image
        );

        if (!uploadResult?.image) {
          throw new Error(
            "The photo uploaded, but the server did not return an image URL."
          );
        }

        imageUrl = uploadResult.image;
      }

      // Step 2: Create the menu item using the returned photo URL.
      const menuItem = {
        name,
        description: foodDraft.description.trim(),
        price,
        image: imageUrl,
        category: foodDraft.category || "Miscellaneous",
        ingredients: foodDraft.ingredients
          .split(",")
          .map((ingredient) => ingredient.trim())
          .filter(Boolean),
        stock_quantity: stockQuantity,
        availability: true,
      };

      const createdItem = await createMenuItem(menuItem);

      // Step 3: Update the dashboard without reloading the page.
      setStockItems((previous) =>
        [
          ...previous.filter((item) => item.id !== createdItem.id),
          createdItem,
        ].sort((a, b) => a.id - b.id)
      );

      setFoodFormSuccess(
        `${createdItem.name} was added to the menu successfully.`
      );

      setFoodDraft({ ...INITIAL_FOOD_DRAFT });
      setShowAddFoodForm(false);
    } catch (err) {
      console.error("Add food error:", err);

      setFoodFormError(
        err.message || "Unable to add food. Please try again."
      );
    } finally {
      setFoodFormLoading(false);
    }
  };

  // Load waiter roster.
  const loadWaiters = useCallback(async () => {
    try {
      const data = await staffRequest("/waiter-profiles");
      setWaiters(Array.isArray(data) ? data : []);
      setWaiterFormError("");
    } catch (err) {
      console.error("Waiter roster loading error:", err);
      setWaiterFormError(
        err.message || "Unable to load the waiter roster."
      );
    }
  }, []);

  // Add a waiter to the roster.
  const handleAddWaiter = async (event) => {
    event.preventDefault();

    const fullName = waiterNameDraft.trim();

    if (!fullName) {
      setWaiterFormError("Enter the waiter's full name.");
      return;
    }

    setWaiterFormLoading(true);
    setWaiterFormError("");
    setWaiterFormSuccess("");

    try {
      const data = await staffRequest("/waiter-profiles", {
        method: "POST",
        body: JSON.stringify({ full_name: fullName }),
      });

      setWaiters((previous) => [...previous, data.waiter]);
      setWaiterNameDraft("");
      setWaiterFormSuccess(
        `${data.waiter.full_name} was added successfully.`
      );
      setShowWaiterForm(false);
    } catch (err) {
      console.error("Add waiter error:", err);
      setWaiterFormError(
        err.message || "Unable to add waiter."
      );
    } finally {
      setWaiterFormLoading(false);
    }
  };

const handleDeleteWaiter = async (waiter) => {
  const confirmed = window.confirm(
    `Remove ${waiter.full_name} from the active waiter roster?`
  );

  if (!confirmed) return;

  setDeletingWaiterId(waiter.id);
  setWaiterFormError("");
  setWaiterFormSuccess("");

  try {
    const data = await staffRequest(`/waiter-profiles/${waiter.id}`, {
      method: "DELETE",
    });

    setWaiters((previous) =>
      previous.filter((item) => item.id !== waiter.id)
    );

    setWaiterFormSuccess(
      data.message || `${waiter.full_name} was removed successfully.`
    );
  } catch (err) {
    console.error("Remove waiter error:", err);
    setWaiterFormError(
      err.message || "Unable to remove this waiter."
    );
  } finally {
    setDeletingWaiterId(null);
  }
};


  // Load waiter roster on mount.
  useEffect(() => {
    loadWaiters();
  }, [loadWaiters]);

  // Refresh orders periodically.
  useEffect(() => {
    loadOrders();

    const interval = setInterval(loadOrders, REFRESH_MS);

    return () => clearInterval(interval);
  }, [loadOrders]);

  // Refresh menu items periodically.
  useEffect(() => {
    loadStock();

    const interval = setInterval(loadStock, REFRESH_MS);

    return () => clearInterval(interval);
  }, [loadStock]);

  // Refresh backend dashboard statistics periodically.
  useEffect(() => {
    loadDashboardStats();

    const interval = setInterval(loadDashboardStats, REFRESH_MS);

    return () => clearInterval(interval);
  }, [loadDashboardStats]);

  // Calculate statistics for the current month.
  const currentDate = new Date();
  const currentMonth = currentDate.getMonth();
  const currentYear = currentDate.getFullYear();

  const {
    mostLikedMeal,
    topMeals,
    statusCounts,
    recentOrders,
  } = useMemo(() => {
    const monthly = orders.filter((order) => {
      if (!order.createdAt) return false;

      const date = new Date(order.createdAt);

      return (
        !Number.isNaN(date.getTime()) &&
        date.getMonth() === currentMonth &&
        date.getFullYear() === currentYear
      );
    });

    const mealCounts = {};

    monthly.forEach((order) => {
      (order.items ?? []).forEach((item) => {
        const name = item.name || "Unknown item";
        const quantity = Number(item.quantity) || 0;

        mealCounts[name] = (mealCounts[name] || 0) + quantity;
      });
    });

    const sortedMeals = Object.entries(mealCounts).sort(
      (a, b) => b[1] - a[1]
    );

    const counts = {
      PENDING: 0,
      PREPARING: 0,
      READY: 0,
      SERVED: 0,
    };

    monthly.forEach((order) => {
      const status = String(order.orderStatus ?? "").toUpperCase();

      if (Object.hasOwn(counts, status)) {
        counts[status]++;
      }
    });

    const recent = [...orders]
      .sort((a, b) => {
        const dateA = new Date(a.createdAt ?? 0).getTime();
        const dateB = new Date(b.createdAt ?? 0).getTime();

        return dateB - dateA;
      })
      .slice(0, 5);

    return {
      mostLikedMeal: sortedMeals[0] ?? null,
      topMeals: sortedMeals.slice(0, 5),
      statusCounts: counts,
      recentOrders: recent,
    };
  }, [orders, currentMonth, currentYear]);

  if (loading && orders.length === 0) {
    return (
      <div className="min-h-screen bg-gray-100 p-8 text-gray-600">
        Loading manager dashboard...
      </div>
    );
  }

  if (error && orders.length === 0) {
    return (
      <div className="min-h-screen bg-gray-100 p-6">
        <div className="mx-auto max-w-3xl rounded-xl bg-white p-8 shadow">
          <h1 className="text-xl font-bold text-gray-800">
            Unable to load Manager Dashboard
          </h1>

          <p className="mt-3 text-gray-600">{error}</p>

          <button
            type="button"
            onClick={loadOrders}
            className="mt-5 rounded-lg bg-red-600 px-5 py-2 font-medium text-white hover:bg-red-700"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 px-4 py-8 sm:px-6 lg:py-12">
      <div className="mx-auto max-w-7xl">
        {/* Manager Header */}
        <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-800">
              Manager <span className="text-red-500">Dashboard</span>
            </h1>

            <p className="mt-2 text-gray-600">
              Monitor restaurant performance and order activity.
            </p>

            <p className="mt-2 font-semibold text-gray-700">
              Signed in as{" "}
              {staffUser?.full_name || staffUser?.username || "Manager"}
              <span className="ml-2 rounded-full bg-purple-100 px-3 py-1 text-sm text-purple-700">
                Manager
              </span>
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <Link
              to="/menu"
              className="rounded-lg border border-red-500 bg-white px-4 py-2.5 font-medium text-red-600 hover:bg-red-50"
            >
              Back to Menu
            </Link>

            <button
              type="button"
              onClick={() => {
                loadOrders();
                loadStock();
                loadDashboardStats();
              }}
              disabled={loading || stockLoading}
              className="rounded-lg bg-red-600 px-5 py-2.5 font-medium text-white hover:bg-red-700 disabled:opacity-60"
            >
              {loading || stockLoading ? "Refreshing..." : "Refresh Data"}
            </button>

            <button
              type="button"
              onClick={() => {
                setShowAddFoodForm(true);
                setShowWaiterForm(false);
                setFoodFormError("");
                setFoodFormSuccess("");
                setWaiterFormError("");
                setWaiterFormSuccess("");
              }}
              className="rounded-lg bg-red-600 px-5 py-2.5 font-medium text-white hover:bg-red-700"
            >
              + Add Food
            </button>

            <button
              type="button"
              onClick={() => {
                setShowWaiterForm(true);
                setShowAddFoodForm(false);
                setWaiterFormError("");
                setWaiterFormSuccess("");
                setFoodFormError("");
                setFoodFormSuccess("");
              }}
              className="rounded-lg bg-green-600 px-5 py-2.5 font-semibold text-white hover:bg-green-700"
            >
              + Add Waiter
            </button>

            <button
              type="button"
              onClick={handleLogout}
              className="rounded-lg bg-gray-800 px-5 py-2.5 font-medium text-white hover:bg-gray-900"
            >
              Log Out
            </button>
          </div>
        </div>

        {/* Add Food Form */}
        {showAddFoodForm && (
          <section className="mb-8 rounded-xl border border-gray-200 bg-white p-6 shadow">
            <h2 className="text-xl font-bold text-gray-800">
              Add New Food
            </h2>

            <p className="mt-1 text-sm text-gray-500">
              Add a new meal and optionally upload its photo.
            </p>

            {foodFormError && (
              <p
                role="alert"
                className="mt-4 rounded-lg bg-red-50 p-3 text-red-700"
              >
                {foodFormError}
              </p>
            )}

            <form onSubmit={handleAddFood} className="mt-5 space-y-4">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <label className="block text-sm font-medium text-gray-700">
                  Food name *
                  <input
                    type="text"
                    value={foodDraft.name}
                    onChange={(event) =>
                      setFoodDraft((previous) => ({
                        ...previous,
                        name: event.target.value,
                      }))
                    }
                    maxLength={100}
                    required
                    placeholder="e.g. Beef Burger"
                    className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-3"
                  />
                </label>

                <label className="block text-sm font-medium text-gray-700">
                  Price in KSh *
                  <input
                    type="number"
                    value={foodDraft.price}
                    onChange={(event) =>
                      setFoodDraft((previous) => ({
                        ...previous,
                        price: event.target.value,
                      }))
                    }
                    min="0"
                    step="0.01"
                    required
                    placeholder="e.g. 650"
                    className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-3"
                  />
                </label>

                <label className="block text-sm font-medium text-gray-700">
                  Category *
                  <select
                    value={foodDraft.category}
                    onChange={(event) =>
                      setFoodDraft((previous) => ({
                        ...previous,
                        category: event.target.value,
                      }))
                    }
                    required
                    className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-3"
                  >
                    <option value="Main Course">Main Course</option>
                    <option value="Starters">Starters</option>
                    <option value="Snacks">Snacks</option>
                    <option value="Drinks">Drinks</option>
                    <option value="Desserts">Desserts</option>
                    <option value="Miscellaneous">Miscellaneous</option>
                  </select>
                </label>

                <label className="block text-sm font-medium text-gray-700">
                  Stock quantity *
                  <input
                    type="number"
                    value={foodDraft.stock_quantity}
                    onChange={(event) =>
                      setFoodDraft((previous) => ({
                        ...previous,
                        stock_quantity: event.target.value,
                      }))
                    }
                    min="0"
                    step="1"
                    required
                    className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-3"
                  />
                </label>
              </div>

              <label className="block text-sm font-medium text-gray-700">
                Description
                <textarea
                  value={foodDraft.description}
                  onChange={(event) =>
                    setFoodDraft((previous) => ({
                      ...previous,
                      description: event.target.value,
                    }))
                  }
                  rows={3}
                  placeholder="Describe the meal..."
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-3"
                />
              </label>

              <label className="block text-sm font-medium text-gray-700">
                Ingredients
                <input
                  type="text"
                  value={foodDraft.ingredients}
                  onChange={(event) =>
                    setFoodDraft((previous) => ({
                      ...previous,
                      ingredients: event.target.value,
                    }))
                  }
                  placeholder="Chicken, Bread, Lettuce"
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-3"
                />

                <span className="mt-1 block text-xs font-normal text-gray-500">
                  Separate ingredients with commas.
                </span>
              </label>

              {/* Select a photo from the computer */}
              <label className="block text-sm font-medium text-gray-700">
                Upload food photo
                <input
                  id="food-image-input"
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={handleFoodImageChange}
                  className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-3"
                />

                <span className="mt-1 block text-xs font-normal text-gray-500">
                  Choose a JPG, PNG, or WebP photo up to 5 MB. A photo is
                  optional.
                </span>
              </label>

              {foodDraft.image && (
                <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
                  <p className="text-sm font-medium text-gray-700">
                    Selected photo
                  </p>

                  <p className="mt-1 break-all text-sm text-gray-600">
                    {foodDraft.image.name}
                  </p>

                  <p className="mt-1 text-xs text-gray-500">
                    {(foodDraft.image.size / (1024 * 1024)).toFixed(2)} MB
                  </p>

                  <button
                    type="button"
                    onClick={() => {
                      setFoodDraft((previous) => ({
                        ...previous,
                        image: null,
                      }));
                      setFoodFormError("");

                      const fileInput = document.getElementById(
                        "food-image-input"
                      );

                      if (fileInput) {
                        fileInput.value = "";
                      }
                    }}
                    className="mt-2 text-sm font-semibold text-red-600 hover:text-red-700"
                  >
                    Remove photo
                  </button>
                </div>
              )}

              <div className="flex flex-col gap-3 sm:flex-row">
                <button
                  type="submit"
                  disabled={foodFormLoading}
                  className="rounded-lg bg-green-600 px-5 py-3 font-semibold text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {foodFormLoading
                    ? "Uploading and Saving..."
                    : "Save Food"}
                </button>

                <button
                  type="button"
                  disabled={foodFormLoading}
                  onClick={() => {
                    setShowAddFoodForm(false);
                    setFoodFormError("");
                  }}
                  className="rounded-lg border border-gray-300 px-5 py-3 font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-60"
                >
                  Cancel
                </button>
              </div>
            </form>
          </section>
        )}

        {foodFormSuccess && (
          <p
            role="status"
            className="mb-6 rounded-lg bg-green-50 p-3 text-green-700"
          >
            {foodFormSuccess}
          </p>
        )}

        {/* Add Waiter Form */}
        {showWaiterForm && (
          <section className="mb-8 rounded-xl border border-gray-200 bg-white p-6 shadow">
            <h2 className="text-xl font-bold text-gray-800">
              Add Waiter
            </h2>

            <p className="mt-1 text-sm text-gray-500">
              Add a name to the shared waiter screen. No separate login
              is created.
            </p>

            {waiterFormError && (
              <p
                role="alert"
                className="mt-4 rounded-lg bg-red-50 p-3 text-red-700"
              >
                {waiterFormError}
              </p>
            )}

            <form
              onSubmit={handleAddWaiter}
              className="mt-4 flex flex-col gap-3 sm:flex-row"
            >
              <input
                type="text"
                value={waiterNameDraft}
                onChange={(event) =>
                  setWaiterNameDraft(event.target.value)
                }
                placeholder="Enter waiter full name"
                maxLength={120}
                required
                className="flex-1 rounded-lg border border-gray-300 px-4 py-3 outline-none focus:border-red-500"
              />

              <button
                type="submit"
                disabled={waiterFormLoading}
                className="rounded-lg bg-green-600 px-5 py-3 font-semibold text-white hover:bg-green-700 disabled:opacity-60"
              >
                {waiterFormLoading ? "Adding..." : "Save Waiter"}
              </button>

              <button
                type="button"
                disabled={waiterFormLoading}
                onClick={() => {
                  setShowWaiterForm(false);
                  setWaiterFormError("");
                }}
                className="rounded-lg border border-gray-300 px-5 py-3 font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-60"
              >
                Cancel
              </button>
            </form>
          </section>
        )}

        {waiterFormSuccess && (
          <p
            role="status"
            className="mb-6 rounded-lg bg-green-50 p-3 text-green-700"
          >
            {waiterFormSuccess}
          </p>
        )}

        {/* Waiter Roster */}
        <section className="mb-8 rounded-xl bg-white p-6 shadow">
          <h2 className="text-xl font-bold text-gray-800">
            Waiter Roster
          </h2>

          {waiters.length === 0 ? (
            <p className="mt-3 text-gray-500">
              No waiter profiles yet. Select Add Waiter to create one.
            </p>
          ) : (

<div className="mt-4 flex flex-wrap gap-3">
  {waiters.map((waiter) => (
    <div
      key={waiter.id}
      className="flex items-center gap-3 rounded-xl border border-blue-100 bg-blue-50 px-4 py-3"
    >
      <span className="font-medium text-blue-800">
        {waiter.full_name}
      </span>

      <button
        type="button"
        onClick={() => handleDeleteWaiter(waiter)}
        disabled={deletingWaiterId === waiter.id}
        className="rounded-lg bg-red-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {deletingWaiterId === waiter.id ? "Removing..." : "Delete"}
      </button>
    </div>
  ))}
</div>

          )}
        </section>

        {error && (
          <div
            role="alert"
            className="mb-6 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700"
          >
            {error} Showing the last successfully loaded data.
          </div>
        )}

        {/* Dashboard Statistics */}
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          <StatCard
            title="Total Orders"
            value={dashboardStats?.total_orders?.toLocaleString() ?? orders.length.toLocaleString()}
            description="All orders returned by the backend"
          />

          <StatCard
            title="Today's Orders"
            value={dashboardStats?.today_orders?.toLocaleString() ?? "—"}
            description="Orders placed today"
          />

          <StatCard
            title="Active Orders"
            value={dashboardStats?.active_orders?.toLocaleString() ?? "—"}
            description="Pending, preparing, or ready"
          />

          <StatCard
            title="Monthly Orders"
            value={dashboardStats?.monthly_orders?.toLocaleString() ?? "—"}
            description="Orders placed this month"
          />

          <StatCard
            title="Monthly Revenue"
            value={dashboardStats ? `KSh ${Number(dashboardStats.monthly_revenue ?? 0).toLocaleString("en-KE", { maximumFractionDigits: 2 })}` : "—"}
            description="Confirmed payments this month"
          />

          <StatCard
            title="Today's Revenue"
            value={dashboardStats ? `KSh ${Number(dashboardStats.today_revenue ?? 0).toLocaleString("en-KE", { maximumFractionDigits: 2 })}` : "—"}
            description="Confirmed payments today"
          />

          <StatCard
            title="Total Meals"
            value={stockItems.length.toLocaleString()}
            description="Menu items currently listed"
          />

          <StatCard
            title="Most Popular Meal"
            value={mostLikedMeal ? mostLikedMeal[0] : "—"}
            description={mostLikedMeal ? `${mostLikedMeal[1]} portions ordered this month` : "No orders this month"}
          />
        </div>

        {dashboardStatsError && (
          <p role="alert" className="mt-4 rounded-lg border border-yellow-200 bg-yellow-50 p-3 text-sm text-yellow-800">
            {dashboardStatsError}
          </p>
        )}

        {/* Order Status and Top Meals */}
        <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
          <section className="rounded-xl bg-white p-6 shadow">
            <div className="mb-6">
              <h2 className="text-xl font-bold text-gray-800">
                Order Status
              </h2>

              <p className="mt-1 text-sm text-gray-500">
                Breakdown of orders received this month.
              </p>
            </div>

            <div className="space-y-5">
              {Object.entries(STATUS_CONFIG).map(([status, config]) => (
                <div
                  key={status}
                  className="flex items-center justify-between"
                >
                  <span className="text-gray-600">
                    {config.label}
                  </span>

                  <span
                    className={`rounded-full px-4 py-1 font-semibold ${config.style}`}
                  >
                    {statusCounts[status]}
                  </span>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-xl bg-white p-6 shadow">
            <h2 className="mb-2 text-xl font-bold text-gray-800">
              Top 5 Meals
            </h2>

            <p className="mb-6 text-sm text-gray-500">
              Ranked by quantity ordered this month.
            </p>

            {topMeals.length === 0 ? (
              <p className="text-gray-500">
                No meal data available.
              </p>
            ) : (
              <div className="space-y-4">
                {topMeals.map(([meal, quantity], index) => (
                  <div
                    key={meal}
                    className="flex items-center justify-between gap-4 border-b border-gray-100 pb-3 last:border-0"
                  >
                    <div className="flex min-w-0 items-center gap-4">
                      <span className="font-bold text-red-500">
                        #{index + 1}
                      </span>

                      <span className="break-words font-medium text-gray-700">
                        {meal}
                      </span>
                    </div>

                    <span className="shrink-0 font-semibold text-gray-800">
                      {quantity}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        {/* Meal Availability */}
        <section className="mt-8 rounded-xl bg-white p-4 shadow sm:p-6">
          <div className="mb-6">
            <h2 className="text-xl font-bold text-gray-800">
              Meal Availability
            </h2>

            <p className="mt-1 text-sm text-gray-500">
              Choose which meals customers can order from the menu.
            </p>
          </div>

          {stockError && (
            <div
              role="alert"
              className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700"
            >
              {stockError}
            </div>
          )}

          {stockSuccess && (
            <div
              role="status"
              className="mb-4 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-700"
            >
              {stockSuccess}
            </div>
          )}

          {stockLoading ? (
            <p className="py-6 text-gray-500">
              Loading meal availability...
            </p>
          ) : stockItems.length === 0 ? (
            <p className="py-6 text-gray-500">
              No menu items found.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] text-left">
                <thead>
                  <tr className="border-b border-gray-200 text-sm uppercase text-gray-500">
                    <th className="px-3 py-3">Meal</th>
                    <th className="px-3 py-3">Availability</th>
                    <th className="px-3 py-3">Action</th>
                  </tr>
                </thead>

                <tbody>
                  {stockItems.map((item) => {
                    const isAvailable = item.availability === true;
                    const isSaving = savingStockId === item.id;

                    return (
                      <tr
                        key={item.id}
                        className="border-b border-gray-100 last:border-0"
                      >
                        <td className="px-3 py-4 font-medium text-gray-800">
                          {item.name}
                        </td>

                        <td className="px-3 py-4">
                          <span
                            className={`inline-block rounded-full px-3 py-1 text-sm font-semibold ${
                              isAvailable
                                ? "bg-green-100 text-green-700"
                                : "bg-red-100 text-red-700"
                            }`}
                          >
                            {isAvailable ? "Available" : "Unavailable"}
                          </span>
                        </td>

<td className="px-3 py-4">
  <div className="flex flex-col items-start gap-3">
    {/* Current food photo */}
    {item.image ? (
      <img
        src={item.image}
        alt={item.name}
        className="h-16 w-16 rounded-lg border border-gray-200 object-cover"
        loading="lazy"
      />
    ) : (
      <div className="flex h-16 w-16 items-center justify-center rounded-lg bg-gray-100 text-xs text-gray-500">
        No photo
      </div>
    )}

    {/* Upload or change food photo */}
    <label
      className={`rounded-lg px-3 py-2 text-sm font-semibold text-white ${
        uploadingImageId !== null
          ? "cursor-not-allowed bg-gray-400"
          : "cursor-pointer bg-blue-600 hover:bg-blue-700"
      }`}
    >
      {uploadingImageId === item.id
        ? "Uploading..."
        : item.image
          ? "Change Photo"
          : "Upload Photo"}

      <input
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        disabled={uploadingImageId !== null}
        onChange={(event) =>
          handleExistingFoodImageChange(event, item)
        }
      />
    </label>

    {/* Existing availability button */}
    <button
      type="button"
      onClick={() => handleAvailabilityUpdate(item)}
      disabled={isSaving || savingStockId !== null}
      className={`whitespace-nowrap rounded-lg px-4 py-2 text-sm font-semibold text-white transition disabled:cursor-not-allowed disabled:opacity-60 ${
        isAvailable
          ? "bg-red-600 hover:bg-red-700"
          : "bg-green-600 hover:bg-green-700"
      }`}
    >
      {isSaving
        ? "Saving..."
        : isAvailable
          ? "Mark Unavailable"
          : "Mark Available"}
    </button>
  </div>
</td>

                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Recent Orders */}
        <section className="mt-8 rounded-xl bg-white p-4 shadow sm:p-6">
          <h2 className="mb-2 text-xl font-bold text-gray-800">
            Recent Orders
          </h2>

          <p className="mb-6 text-sm text-gray-500">
            The five most recently created orders.
          </p>

          {recentOrders.length === 0 ? (
            <p className="py-6 text-gray-500">
              No orders available.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[700px] text-left">
                <thead>
                  <tr className="border-b border-gray-200 text-sm uppercase text-gray-500">
                    <th className="px-4 py-3">Order</th>
                    <th className="px-4 py-3">Customer</th>
                    <th className="px-4 py-3">Table</th>
                    <th className="px-4 py-3">Total</th>
                    <th className="px-4 py-3">Status</th>
                  </tr>
                </thead>

                <tbody>
                  {recentOrders.map((order) => (
                    <tr
                      key={order.id}
                      className="border-b border-gray-100 last:border-0 hover:bg-gray-50"
                    >
                      <td className="whitespace-nowrap px-4 py-4 font-semibold text-red-500">
                        #{order.id}
                      </td>

                      <td className="px-4 py-4 text-gray-700">
                        {order.customerName || "Walk-in customer"}
                      </td>

                      <td className="px-4 py-4 text-gray-700">
                        {order.tableNumber || "—"}
                      </td>

                      <td className="whitespace-nowrap px-4 py-4 font-semibold text-gray-800">
                        KSh{" "}
                        {(Number(order.total) || 0).toLocaleString("en-KE")}
                      </td>

                      <td className="px-4 py-4">
                        <StatusBadge status={order.orderStatus} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

export default ManagerDashboard;