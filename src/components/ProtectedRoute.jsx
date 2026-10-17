import { useEffect, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";

import {
  clearStaffSession,
  staffRequest,
} from "../services/staffApi";

function ProtectedRoute({ requiredRole, children }) {
  const location = useLocation();
  const [status, setStatus] = useState("checking");
  const [user, setUser] = useState(null);

  useEffect(() => {
    let cancelled = false;

    const verifySession = async () => {
      try {
        const staff = await staffRequest("/auth/me");

        if (cancelled) return;

        setUser(staff);

        if (staff.role !== requiredRole) {
          setStatus("forbidden");
        } else {
          setStatus("authorized");
        }
      } catch (error) {
        if (cancelled) return;

        if (error.status === 401 || error.status === 403) {
          clearStaffSession();
        }

        setStatus("unauthorized");
      }
    };

    verifySession();

    return () => {
      cancelled = true;
    };
  }, [requiredRole, location.pathname]);

  if (status === "checking") {
    return (
      <div className="flex min-h-screen items-center justify-center">
        Checking staff access...
      </div>
    );
  }

  if (status === "unauthorized") {
    return (
      <Navigate
        to="/staff-login"
        replace
        state={{ from: location }}
      />
    );
  }

  if (status === "forbidden") {
    const destination =
      user?.role === "manager"
        ? "/manager"
        : user?.role === "waiter"
          ? "/waiter"
          : "/staff-login";

    return <Navigate to={destination} replace />;
  }

  return children;
}

export default ProtectedRoute;