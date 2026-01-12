"use client";

import { ErrorPrimitive } from "@/components/error/ErrorPrimitive";
import { Button } from "@/components/ui/Button";
import { ArrowLeft, Home } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export default function NotFound() {
  const router = useRouter();

  return (
    <ErrorPrimitive
      statusCode="404"
      title="Page not found"
      description="Sorry, we couldn't find the page you're looking for. It might have been moved or deleted."
      actions={
        <>
          <Button
            variant="outline"
            size="lg"
            onClick={() => router.back()}
            className="w-full sm:w-auto min-w-[160px] gap-2 shadow-sm hover:bg-secondary/50 h-12"
          >
            <ArrowLeft className="h-4 w-4" />
            Go Back
          </Button>

          <Button
            asChild
            variant="primary"
            size="lg"
            className="w-full sm:w-auto min-w-[160px] gap-2 shadow-md shadow-primary/20 h-12"
          >
            <Link href="/unread">
              <Home className="h-4 w-4" />
              Go to Unread
            </Link>
          </Button>
        </>
      }
    />
  );
}
