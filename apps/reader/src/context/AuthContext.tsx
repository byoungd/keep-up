"use client";

/**
 * AuthProvider - Wraps next-auth/react's SessionProvider for client components.
 */

import { SessionProvider } from "next-auth/react";
import type * as React from "react";

export function AuthProvider({ children }: { children: React.ReactNode }) {
  return <SessionProvider>{children}</SessionProvider>;
}
