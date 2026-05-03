import { NextResponse } from "next/server";
import { ZodError } from "zod";

import {
  leadInboxBulkActionRequestSchema,
  leadInboxBulkActionResponseSchema
} from "@scout/api-contracts";

import { runLeadInboxBulkAction } from "@/lib/server/leads/lead-inbox-actions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const input = leadInboxBulkActionRequestSchema.parse(await request.json());
    const items = await runLeadInboxBulkAction(input);

    return NextResponse.json(
      leadInboxBulkActionResponseSchema.parse({
        items
      })
    );
  } catch (error) {
    const status =
      error instanceof ZodError
        ? 400
        : error instanceof Error &&
            (error.message === "Lead inbox item not found." ||
              error.message === "Lead annotation not found." ||
              error.message === "Scout run report not found.")
          ? 404
          : 422;

    return NextResponse.json(
      leadInboxBulkActionResponseSchema.parse({
        items: [],
        errorMessage:
          error instanceof ZodError
            ? error.issues.map((issue) => issue.message).join("; ")
            : error instanceof Error
              ? error.message
              : "Unable to run bulk lead action."
      }),
      { status }
    );
  }
}
