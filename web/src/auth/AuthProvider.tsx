import type { LoginInput, Role, UserDto } from "@bookleaf/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createContext, useCallback, useContext, useEffect, useMemo, type ReactNode } from "react";
import { ApiError, api, setUnauthorizedHandler } from "../api/client";
import { queryKeys } from "../api/queryKeys";

interface AuthContextValue {
  user: UserDto | null;
  isLoading: boolean;
  login: (input: LoginInput) => Promise<UserDto>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export const homeFor = (role: Role) => (role === "admin" ? "/admin/dashboard" : "/author/overview");

async function fetchMe(): Promise<UserDto | null> {
  try {
    return (await api<{ user: UserDto }>("/auth/me", { expectUnauthorized: true })).user;
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) return null;
    throw error;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const me = useQuery({ queryKey: queryKeys.me, queryFn: fetchMe, staleTime: Infinity });

  /** Drops the user and every cached query; route guards then send the user to /login. */
  const clearSession = useCallback(() => {
    queryClient.removeQueries({ predicate: (q) => q.queryKey[0] !== queryKeys.me[0] });
    queryClient.setQueryData(queryKeys.me, null);
  }, [queryClient]);

  useEffect(() => {
    setUnauthorizedHandler(clearSession);
    return () => setUnauthorizedHandler(null);
  }, [clearSession]);

  const loginMutation = useMutation({
    mutationFn: (input: LoginInput) =>
      api<{ user: UserDto }>("/auth/login", { method: "POST", body: input, expectUnauthorized: true }),
    onSuccess: ({ user }) => queryClient.setQueryData(queryKeys.me, user),
  });

  const logout = useCallback(async () => {
    try {
      await api<void>("/auth/logout", { method: "POST", expectUnauthorized: true });
    } finally {
      clearSession();
    }
  }, [clearSession]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user: me.data ?? null,
      isLoading: me.isPending,
      login: async (input) => (await loginMutation.mutateAsync(input)).user,
      logout,
    }),
    [me.data, me.isPending, loginMutation, logout],
  );

  return <AuthContext value={value}>{children}</AuthContext>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
