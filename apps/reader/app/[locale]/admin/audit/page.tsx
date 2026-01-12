/**
 * Admin Audit Log Page
 *
 * Displays audit events for documents with filtering and pagination.
 * Gated for admin access.
 */

"use client";

import { AuditLogPanel } from "@/components/admin/AuditLogPanel";
import { useSearchParams } from "next/navigation";

export default function AuditPage(): React.ReactElement {
  const searchParams = useSearchParams();
  const docId = searchParams.get("docId") ?? undefined;

  // Get server URL from env or default
  const serverUrl =
    typeof process !== "undefined" && process.env?.NEXT_PUBLIC_COLLAB_URL
      ? process.env.NEXT_PUBLIC_COLLAB_URL
      : "http://localhost:3030";

  return (
    <div className="container mx-auto max-w-4xl px-4 py-8">
      <header className="mb-8">
        <h1 className="text-2xl font-bold">Audit Log</h1>
        <p className="mt-1 text-muted-foreground">View collaboration events and activity history</p>
      </header>

      <AuditLogPanel docId={docId} serverUrl={serverUrl} />
    </div>
  );
}
