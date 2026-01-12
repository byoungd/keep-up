"use client";

import { ErrorPrimitive } from "@/components/error/ErrorPrimitive";
import { Button } from "@/components/ui/Button";
import { trackNotFound } from "@/lib/analytics/track";
import { ArrowLeft, Home } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * Custom 404 Not Found page.
 * Provides clear messaging and navigation options for users who land on invalid routes.
 */
export default function NotFound() {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    trackNotFound(pathname || "unknown");
  }, [pathname]);

  return (
    <ErrorPrimitive
      statusCode="404"
      title="Page not found"
      description="The page you're looking for doesn't exist or has been moved."
      actions={
        <>
          <Button
            variant="outline"
            size="lg"
            onClick={() => router.back()}
            className="w-full sm:w-auto min-w-[160px] gap-2 shadow-sm hover:bg-secondary/50 h-12"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Go back
          </Button>

          <Button
            variant="primary"
            size="lg"
            asChild
            className="w-full sm:w-auto min-w-[160px] gap-2 shadow-md shadow-primary/20 h-12"
          >
            <Link href="/unread">
              <Home className="h-4 w-4" aria-hidden="true" />
              Go to Unread
            </Link>
          </Button>
        </>
      }
    />
  );
}
