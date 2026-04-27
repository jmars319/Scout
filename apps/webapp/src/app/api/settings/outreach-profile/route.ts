import { NextResponse } from "next/server";
import { ZodError } from "zod";

import {
  outreachProfileResponseSchema,
  updateOutreachProfileRequestSchema
} from "@scout/api-contracts";

import {
  getOutreachProfile,
  saveOutreachProfile
} from "@/lib/server/settings/outreach-profile-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(
    outreachProfileResponseSchema.parse({
      profile: await getOutreachProfile()
    })
  );
}

export async function PUT(request: Request) {
  try {
    const input = updateOutreachProfileRequestSchema.parse(await request.json());
    const profile = await saveOutreachProfile({
      senderName: input.senderName,
      companyName: input.companyName,
      roleTitle: input.roleTitle,
      serviceLine: input.serviceLine,
      serviceSummary: input.serviceSummary,
      defaultCallToAction: input.defaultCallToAction,
      contactEmail: input.contactEmail,
      contactPhone: input.contactPhone,
      websiteUrl: input.websiteUrl,
      schedulerUrl: input.schedulerUrl,
      toneNotes: input.toneNotes,
      avoidPhrases: input.avoidPhrases,
      signature: input.signature
    });

    return NextResponse.json(
      outreachProfileResponseSchema.parse({
        profile
      })
    );
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        outreachProfileResponseSchema.parse({
          errorMessage: error.issues.map((issue) => issue.message).join("; ")
        }),
        { status: 400 }
      );
    }

    return NextResponse.json(
      outreachProfileResponseSchema.parse({
        errorMessage: error instanceof Error ? error.message : "Unknown outreach profile failure."
      }),
      { status: 500 }
    );
  }
}
