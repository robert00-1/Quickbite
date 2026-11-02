
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
  getWeeklyShifts,
  createWeeklyShifts,
  deleteWeeklyShift,
  updateMenuItemAvailability,
  updateMenuItemImage,
  uploadMenuItemImage,
  setFoodOfTheDay,
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
    style: "bg-amber-100 text-amber-700",
  },
  PREPARING: {
    label: "Preparing",
    style: "bg-blue-100 text-blue-700",
  },
  READY: {
    label: "Ready",
    style: "bg-emerald-100 text-emerald-700",
  },
  SERVED: {
    label: "Served",
    style: "bg-slate-100 text-slate-700",
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
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:shadow-md">
      <p className="text-sm font-medium text-slate-500">
        {title}
      </p>

      <h2 className="mt-3 break-words text-3xl font-bold text-slate-800">
        {value}
      </h2>

      <p className="mt-2 text-sm text-slate-500">
        {description}
      </p>
    </div>
  );
}

function StatusBadge({ status }) {
  const normalized = String(status ?? "PENDING").toUpperCase();

  const config = STATUS_CONFIG[normalized] ?? {
    label: normalized,
    style: "bg-slate-100 text-slate-700",
  };

  return (
    <span
      className={`inline-block whitespace-nowrap rounded-full px-3 py-1 text-xs font-semibold ${config.style}`}
    >
      {config.label}
    </span>
  );
}

function SectionTitle({ title, description }) {
  return (
    <div className="mb-6">
      <h2 className="text-xl font-bold text-slate-800">
        {title}
      </h2>

      {description && (
        <p className="mt-1 text-sm text-slate-500">
          {description}
        </p>
      )}
    </div>
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

  const [stockItems, setStockItems] = useState([]);
  const [stockLoading, setStockLoading] = useState(true);
  const [stockError, setStockError] = useState("");
  const [savingStockId, setSavingStockId] = useState(null);
  const [stockSuccess, setStockSuccess] = useState("");
  const [uploadingImageId, setUploadingImageId] = useState(null);

  const [showAddFoodForm, setShowAddFoodForm] = useState(false);
  const [foodDraft, setFoodDraft] = useState(INITIAL_FOOD_DRAFT);
  const [foodFormError, setFoodFormError] = useState("");
  const [foodFormSuccess, setFoodFormSuccess] = useState("");
  const [foodFormLoading, setFoodFormLoading] = useState(false);

  const [showSettings, setShowSettings] = useState(false);
  const [activeSettingsTab, setActiveSettingsTab] = useState("");
  const [showWaiterManagementMenu, setShowWaiterManagementMenu] = useState(false);
  const [showWaiterForm, setShowWaiterForm] = useState(false);
  const [waiterNameDraft, setWaiterNameDraft] = useState("");
  const [waiters, setWaiters] = useState([]);
  const [waiterFormError, setWaiterFormError] = useState("");
  const [waiterFormSuccess, setWaiterFormSuccess] = useState("");
  const [waiterFormLoading, setWaiterFormLoading] = useState(false);
  const [deletingWaiterId, setDeletingWaiterId] = useState(null);
  const [selectedFoodOfDay, setSelectedFoodOfDay] = useState("");
  const [savingFoodOfDay, setSavingFoodOfDay] = useState(false);
  const [foodOfDayMessage, setFoodOfDayMessage] = useState("");
  // Weekly waiter scheduling state.
const [shiftDraft, setShiftDraft] = useState({
  waiterId: "",
  dayOfWeek: "0",
  startTime: "07:00",
  endTime: "18:00",
});

const [plannedShifts, setPlannedShifts] = useState([]);
const [shiftMessage, setShiftMessage] = useState("");
const [shiftLoading, setShiftLoading] = useState(false);
const [shiftSaving, setShiftSaving] = useState(false);
const [deletingShiftId, setDeletingShiftId] = useState(null);

const savingStockIdRef = useRef(null);
const ordersRequestInProgress = useRef(false);
const stockRequestInProgress = useRef(false);

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

  const loadOrders = useCallback(async () => {
    if (ordersRequestInProgress.current) return;

    ordersRequestInProgress.current = true;

    try {
      const data = await getManagerOrders();
      setOrders(Array.isArray(data) ? data : []);
      setError("");
    } catch (err) {
      console.error("Manager dashboard error:", err);
      setError("Unable to load orders. Please check your connection.");
    } finally {
      setLoading(false);
      ordersRequestInProgress.current = false;
    }
  }, []);

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

  const loadStock = useCallback(async () => {
    if (stockRequestInProgress.current) return;

    stockRequestInProgress.current = true;

    try {
      const data = await getMenuItems();

      setStockItems((previous) => {
        if (savingStockIdRef.current === null) {
          return Array.isArray(data) ? data : [];
        }

        return data.map((item) => {
          if (item.id !== savingStockIdRef.current) {
            return item;
          }

          return previous.find((current) => current.id === item.id) ?? item;
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

  const handleFoodOfDayUpdate = async (event) => {
    event.preventDefault();
    setFoodOfDayMessage("");
    setSavingFoodOfDay(true);
  
    try {
      await setFoodOfTheDay(selectedFoodOfDay);
      setFoodOfDayMessage("Food of the Day updated successfully.");
      await loadStock();
    } catch (err) {
      setFoodOfDayMessage(
        err.message || "Unable to update Food of the Day."
      );
    } finally {
      setSavingFoodOfDay(false);
    }
  };

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
      setStockError(err.message || "Failed to update meal availability.");
    } finally {
      savingStockIdRef.current = null;
      setSavingStockId(null);
    }
  };

  const handleExistingFoodImageChange = async (event, item) => {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) return;

    setStockError("");
    setStockSuccess("");

    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setStockError("Choose a JPG, PNG, or WebP image.");
      return;
    }

    if (file.size === 0 || file.size > MAX_IMAGE_SIZE) {
      setStockError(
        "Choose an image larger than 0 bytes and no bigger than 5 MB."
      );
      return;
    }

    if (uploadingImageId !== null) return;

    setUploadingImageId(item.id);

    try {
      const uploadResult = await uploadMenuItemImage(file);

      if (!uploadResult?.image) {
        throw new Error("The upload did not return an image URL.");
      }

      const updatedItem = await updateMenuItemImage(
        item.id,
        uploadResult.image
      );

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

    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setFoodFormError("Choose a JPG, PNG, or WebP image.");
      event.target.value = "";
      setFoodDraft((previous) => ({
        ...previous,
        image: null,
      }));
      return;
    }

    if (file.size === 0 || file.size > MAX_IMAGE_SIZE) {
      setFoodFormError("The image must be larger than 0 bytes and no bigger than 5 MB.");
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
      setFoodFormError("Stock must be a non-negative whole number.");
      return;
    }

    setFoodFormLoading(true);

    try {
      let imageUrl = "";

      if (foodDraft.image) {
        const uploadResult = await uploadMenuItemImage(foodDraft.image);

        if (!uploadResult?.image) {
          throw new Error("The photo upload did not return an image URL.");
        }

        imageUrl = uploadResult.image;
      }

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

      setStockItems((previous) =>
        [...previous.filter((item) => item.id !== createdItem.id), createdItem]
          .sort((a, b) => a.id - b.id)
      );

      setFoodFormSuccess(
        `${createdItem.name} was added to the menu successfully.`
      );

      setFoodDraft({ ...INITIAL_FOOD_DRAFT });
      setShowAddFoodForm(false);
    } catch (err) {
      console.error("Add food error:", err);
      setFoodFormError(err.message || "Unable to add food. Please try again.");
    } finally {
      setFoodFormLoading(false);
    }
  };

  const loadWaiters = useCallback(async () => {
    try {
      const data = await staffRequest("/waiter-profiles");
      setWaiters(Array.isArray(data) ? data : []);
      setWaiterFormError("");
    } catch (err) {
      console.error("Waiter roster loading error:", err);
      setWaiterFormError(err.message || "Unable to load the waiter roster.");
    }
  }, []);
  const loadWeeklyShifts = useCallback(async () => {
  setShiftLoading(true);

  try {
    const data = await getWeeklyShifts();

    setPlannedShifts(
      data.filter((shift) => shift.is_active)
    );

    setShiftMessage("");
  } catch (err) {
    console.error("Weekly schedules loading error:", err);
    setShiftMessage(
      err.message || "Unable to load saved weekly schedules."
    );
  } finally {
    setShiftLoading(false);
  }
}, []);

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
      setWaiterFormError(err.message || "Unable to add waiter.");
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

      setPlannedShifts((previous) =>
        previous.filter((shift) => shift.waiterId !== waiter.id)
      );

      setWaiterFormSuccess(
        data.message || `${waiter.full_name} was removed successfully.`
      );
    } catch (err) {
      console.error("Remove waiter error:", err);
      setWaiterFormError(err.message || "Unable to remove this waiter.");
    } finally {
      setDeletingWaiterId(null);
    }
  };
const handleAddShift = async (event) => {
  event.preventDefault();
  setShiftMessage("");

  if (!shiftDraft.waiterId) {
    setShiftMessage("Please select a waiter.");
    return;
  }

  if (shiftDraft.endTime <= shiftDraft.startTime) {
    setShiftMessage("The shift end time must be later than the start time.");
    return;
  }

  setShiftSaving(true);

  try {
    await createWeeklyShifts(shiftDraft.waiterId, [
      {
        day_of_week: Number(shiftDraft.dayOfWeek),
        start_time: shiftDraft.startTime,
        end_time: shiftDraft.endTime,
      },
    ]);

    await loadWeeklyShifts();

    setShiftMessage("Weekly shift saved successfully.");
  } catch (err) {
    console.error("Weekly shift creation error:", err);
    setShiftMessage(err.message || "Unable to save the weekly shift.");
  } finally {
    setShiftSaving(false);
  }
};

const handleRemoveShift = async (shiftId) => {
  setDeletingShiftId(shiftId);
  setShiftMessage("");

  try {
    await deleteWeeklyShift(shiftId);

    setPlannedShifts((previous) =>
      previous.filter((shift) => shift.id !== shiftId)
    );

    setShiftMessage("Weekly shift deactivated successfully.");
  } catch (err) {
    console.error("Weekly shift removal error:", err);
    setShiftMessage(err.message || "Unable to remove the weekly shift.");
  } finally {
    setDeletingShiftId(null);
  }
};
  useEffect(() => {
    loadWaiters();
  }, [loadWaiters]);

  useEffect(() => {
  loadWeeklyShifts();
}, [loadWeeklyShifts]);

  useEffect(() => {
    loadOrders();

    const interval = setInterval(loadOrders, REFRESH_MS);
    return () => clearInterval(interval);
  }, [loadOrders]);

  useEffect(() => {
    loadStock();

    const interval = setInterval(loadStock, REFRESH_MS);
    return () => clearInterval(interval);
  }, [loadStock]);

  useEffect(() => {
    loadDashboardStats();

    const interval = setInterval(loadDashboardStats, REFRESH_MS);
    return () => clearInterval(interval);
  }, [loadDashboardStats]);

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
      <div className="flex min-h-screen items-center justify-center bg-slate-100">
        <div className="rounded-2xl bg-white p-8 text-center shadow-sm">
          <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-4 border-slate-200 border-t-blue-600" />
          <p className="font-medium text-slate-600">
            Loading manager dashboard...
          </p>
        </div>
      </div>
    );
  }

  if (error && orders.length === 0) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100 p-6">
        <div className="w-full max-w-lg rounded-2xl bg-white p-8 shadow-sm">
          <h1 className="text-xl font-bold text-slate-800">
            Unable to load Manager Dashboard
          </h1>

          <p className="mt-3 text-slate-600">{error}</p>

          <button
            type="button"
            onClick={loadOrders}
            className="mt-5 rounded-lg bg-blue-600 px-5 py-2.5 font-semibold text-white hover:bg-blue-700"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 px-4 py-6 sm:px-6 lg:py-10">
      <div className="mx-auto max-w-7xl">

        {/* HEADER */}
        <header className="mb-8 rounded-2xl bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-5">

          {/* CENTERED DASHBOARD HEADER */}
<div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3">
 <div className="flex flex-col items-start gap-3">
  <button
    type="button"
    onClick={() => {
      setShowSettings((previous) => !previous);
      setShowAddFoodForm(false);
      setShowWaiterForm(false);
      setShowWaiterManagementMenu(false);
      setActiveSettingsTab("");
    }}
    className="flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-5 py-3 text-sm font-semibold text-blue-700 hover:bg-blue-100"
  >
    ⚙ {showSettings ? "Close Settings" : "Settings"}
  </button>

  {showSettings && (
    <div className="flex w-56 flex-col gap-3">
      {/* Add Food */}
      <button
        type="button"
        onClick={() => {
          setShowAddFoodForm(true);
          setShowSettings(false);
          setShowWaiterForm(false);
          setShowWaiterManagementMenu(false);
          setFoodFormError("");
          setFoodFormSuccess("");
        }}
        className="w-full rounded-xl bg-blue-600 px-5 py-3 font-semibold text-white hover:bg-blue-700"
      >
        + Add Food
      </button>

      {/* Waiter Management */}
      <button
        type="button"
        onClick={() =>
          setShowWaiterManagementMenu((previous) => !previous)
        }
        aria-expanded={showWaiterManagementMenu}
        className="w-full rounded-xl border border-blue-200 bg-blue-50 px-5 py-3 font-semibold text-blue-700 hover:bg-blue-100"
      >
        Waiter Management {showWaiterManagementMenu ? "▲" : "▼"}
      </button>

      {showWaiterManagementMenu && (
        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={() => {
              setActiveSettingsTab("waiters");
              setShowWaiterForm(true);
              setShowWaiterManagementMenu(false);
            }}
            className="rounded-lg border bg-white p-3 text-sm"
          >
            + Add Waiter
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveSettingsTab("shifts");
              setShowWaiterForm(false);
              setShowWaiterManagementMenu(false);
            }}
            className="rounded-lg border bg-white p-3 text-sm"
          >
            Shift Scheduling
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveSettingsTab("waiters");
              setShowWaiterForm(false);
              setShowWaiterManagementMenu(false);
            }}
            className="rounded-lg border bg-white p-3 text-sm"
          >
            Waiter Roster
          </button>
        </div>
      )}

      {/* Log Out */}
      <button
        type="button"
        onClick={handleLogout}
        className="w-full rounded-xl border border-rose-200 bg-rose-50 px-5 py-3 font-semibold text-rose-700 hover:bg-rose-100"
      >
        Log Out
      </button>
    </div>
  )}
</div>

  <div className="col-start-2 flex min-w-0 flex-col items-center justify-center gap-2 text-center sm:flex-row">
    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-lg font-bold text-white sm:h-12 sm:w-12 sm:text-xl">
      Q
    </div>

    <div className="min-w-0">
      <h1 className="text-lg font-bold text-slate-800 sm:text-3xl">
        Manager Dashboard
      </h1>
      <p className="mt-1 text-xs text-slate-500 sm:text-sm">
        Restaurant management and performance overview
      </p>
    </div>
  </div>

  <div aria-hidden="true" />
</div>
            <div className="border-t border-slate-100 pt-4">
              <p className="text-sm text-slate-600">
                Signed in as{" "}
                <span className="font-semibold text-slate-800">
                  {staffUser?.full_name || staffUser?.username || "Manager"}
                </span>

                <span className="ml-2 rounded-full bg-blue-100 px-3 py-1 text-xs font-semibold text-blue-700">
                  Manager
                </span>
              </p>
            </div>
          </div>
        </header>

        {/* ADD FOOD FORM */}
        {showAddFoodForm && (
          <section className="mb-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <SectionTitle
              title="Add New Food"
              description="Create a menu item and optionally upload its photo."
            />

            {foodFormError && (
              <p role="alert" className="mb-4 rounded-lg bg-rose-50 p-3 text-sm text-rose-700">
                {foodFormError}
              </p>
            )}

            <form onSubmit={handleAddFood} className="space-y-5">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <label className="text-sm font-medium text-slate-700">
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
                    className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-3 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  />
                </label>

                <label className="text-sm font-medium text-slate-700">
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
                    className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-3 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  />
                </label>

                <label className="text-sm font-medium text-slate-700">
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
                    className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-3 outline-none focus:border-blue-500"
                  >
                    <option value="Main Course">Main Course</option>
                    <option value="Starters">Starters</option>
                    <option value="Snacks">Snacks</option>
                    <option value="Drinks">Drinks</option>
                    <option value="Desserts">Desserts</option>
                    <option value="Miscellaneous">Miscellaneous</option>
                  </select>
                </label>

                <label className="text-sm font-medium text-slate-700">
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
                    className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-3 outline-none focus:border-blue-500"
                  />
                </label>
              </div>

              <label className="block text-sm font-medium text-slate-700">
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
                  className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-3 outline-none focus:border-blue-500"
                />
              </label>

              <label className="block text-sm font-medium text-slate-700">
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
                  className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-3 outline-none focus:border-blue-500"
                />
                <span className="mt-1 block text-xs font-normal text-slate-500">
                  Separate ingredients with commas.
                </span>
              </label>

              <label className="block text-sm font-medium text-slate-700">
                Upload food photo
                <input
                  id="food-image-input"
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={handleFoodImageChange}
                  className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-3"
                />
                <span className="mt-1 block text-xs font-normal text-slate-500">
                  JPG, PNG or WebP. Maximum size 5 MB.
                </span>
              </label>

              {foodDraft.image && (
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                  <p className="text-sm font-semibold text-slate-700">
                    Selected photo
                  </p>
                  <p className="mt-1 break-all text-sm text-slate-600">
                    {foodDraft.image.name}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    {(foodDraft.image.size / (1024 * 1024)).toFixed(2)} MB
                  </p>

                  <button
                    type="button"
                    onClick={() => {
                      setFoodDraft((previous) => ({
                        ...previous,
                        image: null,
                      }));

                      const fileInput = document.getElementById("food-image-input");
                      if (fileInput) fileInput.value = "";
                    }}
                    className="mt-2 text-sm font-semibold text-slate-600 hover:text-slate-900"
                  >
                    Remove photo
                  </button>
                </div>
              )}

              <div className="flex flex-wrap gap-3">
                <button
                  type="submit"
                  disabled={foodFormLoading}
                  className="rounded-lg bg-blue-600 px-5 py-3 font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
                >
                  {foodFormLoading ? "Uploading and Saving..." : "Save Food"}
                </button>

                <button
                  type="button"
                  disabled={foodFormLoading}
                  onClick={() => setShowAddFoodForm(false)}
                  className="rounded-lg border border-slate-300 px-5 py-3 font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
              </div>
            </form>
          </section>
        )}

        {foodFormSuccess && (
          <p role="status" className="mb-6 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-700">
            {foodFormSuccess}
          </p>
        )}
        {activeSettingsTab !== "" && (
  <section className="mb-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
     
     {activeSettingsTab === "waiters" && (
  <div>
          <div className="mb-5">
  <h3 className="text-lg font-bold text-slate-800">
    Waiter Roster
  </h3>
  <p className="mt-1 text-sm text-slate-500">
    View and manage your registered restaurant waiters.
  </p>
</div>
                {waiterFormError && (
                  <p role="alert" className="mb-4 rounded-lg bg-rose-50 p-3 text-sm text-rose-700">
                    {waiterFormError}
                  </p>
                )}

                {waiterFormSuccess && (
                  <p role="status" className="mb-4 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-700">
                    {waiterFormSuccess}
                  </p>
                )}

                {showWaiterForm && (
                  <form
                    onSubmit={handleAddWaiter}
                    className="mb-5 flex flex-col gap-3 sm:flex-row"
                  >
                    <input
                      type="text"
                      value={waiterNameDraft}
                      onChange={(event) => setWaiterNameDraft(event.target.value)}
                      placeholder="Enter waiter full name"
                      maxLength={120}
                      required
                      className="flex-1 rounded-lg border border-slate-300 px-4 py-3 outline-none focus:border-blue-500"
                    />

                    <button
                      type="submit"
                      disabled={waiterFormLoading}
                      className="rounded-lg bg-blue-600 px-5 py-3 font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
                    >
                      {waiterFormLoading ? "Adding..." : "Save Waiter"}
                    </button>

                    <button
                      type="button"
                      disabled={waiterFormLoading}
                      onClick={() => setShowWaiterForm(false)}
                      className="rounded-lg border border-slate-300 px-5 py-3 font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      Cancel
                    </button>
                  </form>
                )}

             {/* WAITER ROSTER CARDS */}
{waiters.length === 0 ? (
  <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center">
    <p className="font-medium text-slate-700">
      No waiters registered yet.
    </p>
    <p className="mt-1 text-sm text-slate-500">
      Select Add Waiter from Waiter Management to register your first waiter.
    </p>
  </div>
) : (
  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
    {waiters.map((waiter) => (
      <div
        key={waiter.id}
        className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-blue-200 hover:shadow-md sm:flex-row sm:items-center"
      >
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-blue-100 text-lg font-bold text-blue-700">
            {waiter.full_name?.charAt(0)?.toUpperCase() || "W"}
          </div>

          <div className="min-w-0">
            <p className="break-words font-semibold text-slate-800">
              {waiter.full_name}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Registered Waiter
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => handleDeleteWaiter(waiter)}
          disabled={deletingWaiterId === waiter.id}
          className="w-full shrink-0 rounded-lg border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-semibold text-rose-700 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
        >
          {deletingWaiterId === waiter.id ? "Removing..." : "Remove"}
        </button>
      </div>
    ))}
  </div>
)}
              </div>
            )}

            {/* SHIFT SCHEDULING */}
            {activeSettingsTab === "shifts" && (
              <div>
                <div className="mb-5">
                  <h3 className="font-bold text-slate-800">
                    Waiter Shift Scheduling
                  </h3>
                  <p className="mt-1 text-sm text-slate-500">
                    Assign recurring weekly shifts to your waiters.
                  </p>
                </div>

                {shiftMessage && (
                  <p role="status" className="mb-4 rounded-lg bg-blue-50 p-3 text-sm text-blue-700">
                    {shiftMessage}
                  </p>
                )}

                <form
                  onSubmit={handleAddShift}
                  className="grid grid-cols-1 gap-4 rounded-xl border border-slate-200 bg-slate-50 p-4 md:grid-cols-2 lg:grid-cols-5"
                >
                  <label className="text-sm font-medium text-slate-700">
                    Select waiter
                    <select
                      value={shiftDraft.waiterId}
                      onChange={(event) =>
                        setShiftDraft((previous) => ({
                          ...previous,
                          waiterId: event.target.value,
                        }))
                      }
                      required
                      className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-3"
                    >
                      <option value="">Choose waiter</option>
                      {waiters.map((waiter) => (
                        <option key={waiter.id} value={waiter.id}>
                          {waiter.full_name}
                        </option>
                      ))}
                    </select>
                  </label>
                   <label className="text-sm font-medium text-slate-700">
  Day of week
  <select
    value={shiftDraft.dayOfWeek}
    onChange={(event) =>
      setShiftDraft((previous) => ({
        ...previous,
        dayOfWeek: event.target.value,
      }))
    }
    required
    className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-3"
  >
    <option value="0">Monday</option>
    <option value="1">Tuesday</option>
    <option value="2">Wednesday</option>
    <option value="3">Thursday</option>
    <option value="4">Friday</option>
    <option value="5">Saturday</option>
    <option value="6">Sunday</option>
  </select>
</label>
                

                  <label className="text-sm font-medium text-slate-700">
                    Start time
                    <input
                      type="time"
                      value={shiftDraft.startTime}
                      onChange={(event) =>
                        setShiftDraft((previous) => ({
                          ...previous,
                          startTime: event.target.value,
                        }))
                      }
                      required
                      className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-3"
                    />
                  </label>

                  <label className="text-sm font-medium text-slate-700">
                    End time
                    <input
                      type="time"
                      value={shiftDraft.endTime}
                      onChange={(event) =>
                        setShiftDraft((previous) => ({
                          ...previous,
                          endTime: event.target.value,
                        }))
                      }
                      required
                      className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-3"
                    />
                  </label>

                  <div className="flex items-end">
                    <button
                      type="submit"
                      disabled={waiters.length === 0 || shiftSaving}
                      className="w-full rounded-lg bg-blue-600 px-4 py-3 font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {shiftSaving ? "Saving..." : "Save Weekly Shift"}
                    </button>
                  </div>
                </form>

                <div className="mt-6">
                  <h4 className="mb-3 font-semibold text-slate-800">
                    Planned Shifts
                  </h4>

                  {plannedShifts.length === 0 ? (
                    <p className="rounded-lg bg-slate-50 p-4 text-sm text-slate-500">
                      No weekly shifts have been assigned yet.
                    </p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[600px] text-left">
                        <thead>
                          <tr className="border-b border-slate-200 text-xs uppercase text-slate-500">
                            <th className="px-3 py-3">Waiter</th>
                            <th className="px-3 py-3">Day</th>
                            <th className="px-3 py-3">Start</th>
                            <th className="px-3 py-3">End</th>
                            <th className="px-3 py-3">Action</th>
                          </tr>
                        </thead>

                        <tbody>
                          {plannedShifts.map((shift) => (
                            <tr
                              key={shift.id}
                              className="border-b border-slate-100"
                            >
                              <td className="px-3 py-4 font-medium text-slate-800">
                                {shift.waiter_name}
                              </td>
                              <td className="px-3 py-4 text-slate-600">
                                {shift.day_name}
                              </td>
                              <td className="px-3 py-4 text-slate-600">
                                {shift.start_time}
                              </td>
                              <td className="px-3 py-4 text-slate-600">
                                {shift.end_time}
                              </td>
                              <td className="px-3 py-4">
                                <button
                                  type="button"
                                  onClick={() => handleRemoveShift(shift.id)}
                                    disabled={deletingShiftId === shift.id}
                                  className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100"
                                >
                                  {deletingShiftId === shift.id ? "Removing..." : "Remove"}
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            )}
          </section>
        )}

        {/* GENERAL ERROR */}
        {error && (
          <div role="alert" className="mb-6 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
            {error} Showing the last successfully loaded data.
          </div>
        )}

        {/* STATISTICS */}
        <section>
          <div className="mb-4">
            <h2 className="text-xl font-bold text-slate-800">
              Restaurant Overview
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              A summary of your restaurant's performance.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
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
              value={
                dashboardStats
                  ? `KSh ${Number(dashboardStats.monthly_revenue ?? 0).toLocaleString("en-KE", { maximumFractionDigits: 2 })}`
                  : "—"
              }
              description="Confirmed payments this month"
            />

            <StatCard
              title="Today's Revenue"
              value={
                dashboardStats
                  ? `KSh ${Number(dashboardStats.today_revenue ?? 0).toLocaleString("en-KE", { maximumFractionDigits: 2 })}`
                  : "—"
              }
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
              description={
                mostLikedMeal
                  ? `${mostLikedMeal[1]} portions ordered this month`
                  : "No orders this month"
              }
            />
          </div>

          {dashboardStatsError && (
            <p role="alert" className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              {dashboardStatsError}
            </p>
          )}
        </section>

        {/* ORDER STATUS AND TOP MEALS */}
        <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <SectionTitle
              title="Order Status"
              description="Breakdown of orders received this month."
            />

            <div className="space-y-4">
              {Object.entries(STATUS_CONFIG).map(([status, config]) => (
                <div
                  key={status}
                  className="flex items-center justify-between"
                >
                  <span className="text-sm font-medium text-slate-600">
                    {config.label}
                  </span>

                  <span className={`rounded-full px-4 py-1.5 text-sm font-semibold ${config.style}`}>
                    {statusCounts[status]}
                  </span>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <SectionTitle
              title="Top 5 Meals"
              description="Ranked by quantity ordered this month."
            />

            {topMeals.length === 0 ? (
              <p className="text-sm text-slate-500">
                No meal data available.
              </p>
            ) : (
              <div className="space-y-4">
                {topMeals.map(([meal, quantity], index) => (
                  <div
                    key={meal}
                    className="flex items-center justify-between gap-4 border-b border-slate-100 pb-3 last:border-0"
                  >
                    <div className="flex min-w-0 items-center gap-4">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-50 text-sm font-bold text-blue-700">
                        {index + 1}
                      </span>

                      <span className="break-words font-medium text-slate-700">
                        {meal}
                      </span>
                    </div>

                    <span className="shrink-0 font-semibold text-slate-800">
                      {quantity}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        {/* MEAL AVAILABILITY */}
        <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
          <SectionTitle
            title="Meal Availability"
            description="Control which meals customers can order."
          />

          {stockError && (
            <div role="alert" className="mb-4 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
              {stockError}
            </div>
          )}

          {stockSuccess && (
            <div role="status" className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
              {stockSuccess}
            </div>
          )}

          {stockLoading ? (
            <p className="py-6 text-slate-500">
              Loading meal availability...
            </p>
          ) : stockItems.length === 0 ? (
            <p className="py-6 text-slate-500">
              No menu items found.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[600px] text-left">
                <thead>
                  <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                    <th className="px-3 py-3">Meal</th>
                    <th className="px-3 py-3">Availability</th>
                    <th className="px-3 py-3">Price</th>
                    <th className="px-3 py-3">Actions</th>
                  </tr>
                </thead>

                <tbody>
                  {stockItems.map((item) => {
                    const isAvailable = item.availability === true;
                    const isSaving = savingStockId === item.id;

                    return (
                      <tr
                        key={item.id}
                        className="border-b border-slate-100 last:border-0 hover:bg-slate-50"
                      >
                        <td className="px-3 py-4">
                          <p className="font-semibold text-slate-800">
                            {item.name}
                          </p>
                          <p className="mt-1 text-xs text-slate-500">
                            {item.category || "Menu item"}
                          </p>
                        </td>

                        <td className="px-3 py-4">
                          <span
                            className={`inline-block rounded-full px-3 py-1 text-xs font-semibold ${
                              isAvailable
                                ? "bg-emerald-100 text-emerald-700"
                                : "bg-slate-100 text-slate-600"
                            }`}
                          >
                            {isAvailable ? "Available" : "Unavailable"}
                          </span>
                        </td>

                        <td className="px-3 py-4 font-medium text-slate-700">
                          KSh {Number(item.price || 0).toLocaleString("en-KE")}
                        </td>

                        <td className="px-3 py-4">
                          <div className="flex flex-col items-start gap-3">
                            {item.image ? (
                              <img
                                src={item.image}
                                alt={item.name}
                                className="h-16 w-16 rounded-lg border border-slate-200 object-cover"
                                loading="lazy"
                              />
                            ) : (
                              <div className="flex h-16 w-16 items-center justify-center rounded-lg bg-slate-100 text-xs text-slate-500">
                                No photo
                              </div>
                            )}

                            <label
                              className={`cursor-pointer rounded-lg border px-3 py-2 text-xs font-semibold ${
                                uploadingImageId !== null
                                  ? "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400"
                                  : "border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100"
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

                            <button
                              type="button"
                              onClick={() => handleAvailabilityUpdate(item)}
                              disabled={isSaving || savingStockId !== null}
                              className="whitespace-nowrap rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
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
        <div className="mb-6 rounded-xl border border-red-100 bg-red-50 p-5">
          <h3 className="mb-2 text-lg font-bold text-gray-800">
            Food of the Day
          </h3>

          <p className="mb-4 text-sm text-gray-600">
            Choose the meal featured on the customer menu.
          </p>

          <form
            onSubmit={handleFoodOfDayUpdate}
            className="flex flex-col gap-3 sm:flex-row"
          >
            <select
              value={selectedFoodOfDay}
              onChange={(event) => setSelectedFoodOfDay(event.target.value)}
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2"
              required
            >
              <option value="">Select an available meal</option>
              {stockItems
                .filter((item) => item.availability === true)
                .map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
            </select>

            <button
              type="submit"
              disabled={!selectedFoodOfDay || savingFoodOfDay}
              className="rounded-lg bg-red-500 px-5 py-2 font-semibold text-white hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {savingFoodOfDay ? "Saving..." : "Set Food of the Day"}
            </button>
          </form>

          {foodOfDayMessage && (
            <p role="status" className="mt-3 text-sm text-gray-700">
              {foodOfDayMessage}
            </p>
          )}
        </div>

        {/* RECENT ORDERS */}
        <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
          <SectionTitle
            title="Recent Orders"
            description="The five most recently created orders."
          />

          {recentOrders.length === 0 ? (
            <p className="py-6 text-slate-500">
              No orders available.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[700px] text-left">
                <thead>
                  <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
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
                      className="border-b border-slate-100 last:border-0 hover:bg-slate-50"
                    >
                      <td className="whitespace-nowrap px-4 py-4 font-semibold text-blue-700">
                        #{order.id}
                      </td>

                      <td className="px-4 py-4 text-slate-700">
                        {order.customerName || "Walk-in customer"}
                      </td>

                      <td className="px-4 py-4 text-slate-700">
                        {order.tableNumber || "—"}
                      </td>

                      <td className="whitespace-nowrap px-4 py-4 font-semibold text-slate-800">
                        KSh {(Number(order.total) || 0).toLocaleString("en-KE")}
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

        <footer className="mt-8 pb-4 text-center text-xs text-slate-400">
          QuickBite Manager Dashboard
        </footer>
      </div>
    </div>
  );
}

export default ManagerDashboard;
