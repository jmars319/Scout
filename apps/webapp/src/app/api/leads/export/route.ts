import { NextResponse } from "next/server";

import {
  buildLeadInboxExport,
  type LeadExportFormat
} from "@/lib/server/leads/lead-export-service";
import { normalizeLeadInboxFilter } from "@/lib/server/leads/lead-inbox-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function resolveFormat(request: Request): LeadExportFormat {
  const format = new URL(request.url).searchParams.get("format");
  return format === "markdown" ? "markdown" : "csv";
}

export async function GET(request: Request) {
  const searchParams = new URL(request.url).searchParams;
  const exportFile = await buildLeadInboxExport({
    format: resolveFormat(request),
    filters: {
      filter: normalizeLeadInboxFilter(searchParams.get("filter")),
      search: searchParams.get("q") ?? undefined
    }
  });

  return new NextResponse(exportFile.body, {
    headers: {
      "content-type": exportFile.contentType,
      "content-disposition": `attachment; filename="${exportFile.filename}"`
    }
  });
}
