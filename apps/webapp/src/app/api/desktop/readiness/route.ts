import { NextResponse } from "next/server";

import { checkDatabaseReadiness } from "@/lib/server/storage/schema-readiness";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const readiness = await checkDatabaseReadiness({
    ensureSchema: url.searchParams.get("ensure") === "1"
  });

  return NextResponse.json(readiness, {
    status: readiness.ok ? 200 : 503
  });
}
