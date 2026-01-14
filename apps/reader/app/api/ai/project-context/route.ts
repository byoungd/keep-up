import { getProjectContextSnapshot } from "@/lib/ai/projectContext";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET() {
  try {
    const snapshot = await getProjectContextSnapshot();
    return NextResponse.json(snapshot, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      {
        sections: [],
        tasks: [],
        updatedAt: new Date().toISOString(),
        warnings: [message],
      },
      { status: 500 }
    );
  }
}
