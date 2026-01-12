import createMiddleware from "next-intl/middleware";
import type { NextRequest } from "next/server";
import { routing } from "./src/i18n/navigation";

const intlMiddleware = createMiddleware(routing);

export function proxy(request: NextRequest) {
  return intlMiddleware(request);
}

export const config = {
  // Match all pathnames except for
  // - API routes
  // - _next (static files)
  // - _vercel (Vercel specific)
  // - Static files (e.g. favicon.ico, etc.)
  matcher: ["/((?!api|_next|_vercel|.*\\..*).*)"],
};
