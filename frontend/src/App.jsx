import { lazy, Suspense } from "react";

import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
} from "react-router-dom";

import Menu from "./pages/Menu";
import FoodDetails from "./pages/FoodDetails";
import CustomerDetails from "./pages/CustomerDetails";
import Checkout from "./pages/Checkout";
import Payment from "./pages/Payment";
import OrderConfirmationPage from "./pages/OrderConfirmation";
const Waiter = lazy(() => import("./pages/WaiterDashboard"));
import Cart from "./pages/Cart";
const ManagerDashboard = lazy(() => import("./pages/ManagerDashboard"));
import Navbar from "./components/Navbar";
import OrderStatus from "./pages/OrderStatus";
import StaffLogin from "./pages/StaffLogin";
import Games from "./pages/Games";
import ProtectedRoute from "./components/ProtectedRoute";
import { CartProvider } from "./context/CartContext";

function App() {
  return (
    <CartProvider>
      <BrowserRouter>
        <Navbar />

        <div className="min-h-screen min-w-0 overflow-x-hidden pt-20">
        <Suspense fallback={<p className="p-6">Loading page...</p>}>
        <Routes>
          <Route
            path="/"
            element={<Navigate to="/menu" replace />}
          />

          {/* Public customer pages */}
          <Route path="/menu" element={<Menu />} />

          <Route
            path="/menu/:id"
            element={<FoodDetails />}
          />

          <Route path="/cart" element={<Cart />} />

          <Route
            path="/customer-details"
            element={<CustomerDetails />}
          />

          <Route path="/checkout" element={<Checkout />} />

          <Route path="/payment" element={<Payment />} />

          <Route
            path="/order-confirmation"
            element={<OrderConfirmationPage />}
          />

          <Route
            path="/order-status"
            element={<OrderStatus />}
          />

          <Route path="/games" element={<Games />} />

          {/* Staff login */}
          <Route
            path="/staff-login"
            element={<StaffLogin />}
          />

          {/* Only authenticated waiters can access this page */}
          <Route
            path="/waiter"
            element={
              <ProtectedRoute requiredRole="waiter">
                <Waiter />
              </ProtectedRoute>
            }
          />

          {/* Only authenticated managers can access this page */}
          <Route
            path="/manager"
            element={
              <ProtectedRoute requiredRole="manager">
                <ManagerDashboard />
              </ProtectedRoute>
            }
          />

          {/* Unknown routes return to the public menu */}
          <Route
            path="*"
            element={<Navigate to="/menu" replace />}
          />
        </Routes>
        </Suspense>
        </div>
      </BrowserRouter>
  </CartProvider>
  );
}

export default App;
