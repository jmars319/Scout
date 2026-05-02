import { NextResponse } from "next/server";

import { listLeadInboxResponseSchema } from "@scout/api-contracts";

import {
  filterLeadInboxItems,
  listLeadInboxItems,
  normalizeLeadInboxFilter
} from "@/lib/server/leads/lead-inbox-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const generatedAt = new Date().toISOString();
  const searchParams = new URL(request.url).searchParams;
  const items = filterLeadInboxItems(await listLeadInboxItems(500), {
    filter: normalizeLeadInboxFilter(searchParams.get("filter")),
    search: searchParams.get("q") ?? undefined,
    today: generatedAt.slice(0, 10)
  });

  return NextResponse.json(
    listLeadInboxResponseSchema.parse({
      generatedAt,
      items
    })
  );
}
