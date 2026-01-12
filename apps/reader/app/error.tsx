"use client";

import { ErrorPrimitive } from "@/components/error/ErrorPrimitive";
import { Button } from "@/components/ui/Button";
import { Home, RotateCcw } from "lucide-react";
import Link from "next/link";
import { useEffect } from "react";

/**
 * Root error page for the application.
 * catches unexpected runtime errors.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log the error to an error reporting service
    console.error("Critical Application Error:", error);
  }, [error]);

  return (
    <ErrorPrimitive
      statusCode="500"
      title="Something went wrong"
      description="An unexpected error occurred. Our team has been notified and we're working to fix it."
      actions={
        <>
          <Button
            variant="outline"
            size="lg"
            onClick={() => reset()}
            className="w-full sm:w-auto min-w-[160px] gap-2 shadow-sm hover:bg-secondary/50 h-12"
          >
            <RotateCcw className="h-4 w-4" />
            Try Again
          </Button>

          <Button
            asChild
            variant="primary"
            size="lg"
            className="w-full sm:w-auto min-w-[160px] gap-2 shadow-md shadow-primary/20 h-12"
          >
            <Link href="/unread">
              <Home className="h-4 w-4" />
              Go Home
            </Link>
          </Button>
        </>
      }
    />
  );
}
