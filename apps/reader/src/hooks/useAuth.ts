"use client";

/**
 * useAuth - Convenience hook wrapping next-auth/react's useSession.
 * Provides `isAuthenticated`, `user`, `login/logout` helpers, etc.
 */

import { signIn, signOut, useSession } from "next-auth/react";

export interface AuthState {
  /** Current user (null if not logged in) */
  user: {
    id: string;
    displayName: string;
    avatarUrl?: string;
    email?: string;
  } | null;
  /** Loading state */
  isLoading: boolean;
  /** Check if user is authenticated */
  isAuthenticated: boolean;
  /** Trigger OAuth login */
  login: (provider?: "google" | "github") => void;
  /** Logout */
  logout: () => void;
}

export function useAuth(): AuthState {
  const { data: session, status } = useSession();

  const isLoading = status === "loading";
  const isAuthenticated = status === "authenticated";

  const user = session?.user
    ? {
        id: (session.user as { id?: string }).id ?? session.user.email ?? "unknown",
        displayName: session.user.name ?? "Anonymous",
        avatarUrl: session.user.image ?? undefined,
        email: session.user.email ?? undefined,
      }
    : null;

  const login = (provider: "google" | "github" = "google") => {
    signIn(provider);
  };

  const logout = () => {
    signOut();
  };

  return {
    user,
    isLoading,
    isAuthenticated,
    login,
    logout,
  };
}
