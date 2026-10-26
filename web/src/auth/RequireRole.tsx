import type { Role } from "@bookleaf/shared";
import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router";
import { Spinner } from "../components/Spinner";
import { homeFor, useAuth } from "./AuthProvider";

/** Signed-out users go to /login (remembering where they were headed); the wrong role goes home. */
export function RequireRole({ role, children }: { role: Role; children: ReactNode }) {
  const { user, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) return <Spinner label="Loading your account…" fullPage />;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  if (user.role !== role) return <Navigate to={homeFor(user.role)} replace />;
  return children;
}
