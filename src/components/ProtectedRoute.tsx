import { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/lib/auth/AuthProvider";
import { useRestaurant } from "@/lib/auth/RestaurantProvider";
import { Loader2 } from "lucide-react";

interface ProtectedRouteProps {
  children: ReactNode;
  allowedRoles?: string[];
}

export function ProtectedRoute({ children, allowedRoles }: ProtectedRouteProps) {
  const { session, loading: authLoading } = useAuth();
  const { currentMembership, loading: restaurantLoading } = useRestaurant();
  const location = useLocation();

  if (authLoading || restaurantLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-muted-foreground bg-white">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!session) {
    return <Navigate to="/auth" replace state={{ from: location }} />;
  }

  if (allowedRoles && currentMembership) {
    if (!allowedRoles.includes(currentMembership.role)) {
      return <Navigate to="/" replace />;
    }
  }

  return <>{children}</>;
}
