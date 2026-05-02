import { NextResponse } from "next/server";

import {
  buildLeadExport,
  type LeadExportFormat
} from "@/lib/server/leads/lead-export-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function resolveFormat(request: Request): LeadExportFormat {
  const format = new URL(request.url).searchParams.get("format");
  return format === "markdown" ? "markdown" : "csv";
}

export async function GET(
  request: Request,
  context: { params: Promise<{ runId: string }> }
) {
  const { runId } = await context.params;

  try {
    const exportFile = await buildLeadExport({
      runId,
      format: resolveFormat(request)
    });

    return new NextResponse(exportFile.body, {
      headers: {
        "content-type": exportFile.contentType,
        "content-disposition": `attachment; filename="${exportFile.filename}"`
      }
    });
  } catch (error) {
    return NextResponse.json(
      {
        errorMessage: error instanceof Error ? error.message : "Unable to export Scout leads."
      },
      {
        status:
          error instanceof Error && error.message === "Scout run not found."
            ? 404
            : 422
      }
    );
  }
}
