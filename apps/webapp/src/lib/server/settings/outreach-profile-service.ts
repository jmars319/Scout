import type { OutreachProfile } from "@scout/domain";

import {
  createOutreachProfileRepository,
  type SaveOutreachProfileInput
} from "../storage/outreach-profile-repository.ts";

const DEFAULT_OUTREACH_PROFILE: OutreachProfile = {
  profileId: "default",
  senderName: "",
  companyName: "JAMARQ",
  roleTitle: "",
  serviceLine: "",
  serviceSummary: "",
  defaultCallToAction: "",
  contactEmail: "",
  contactPhone: "",
  websiteUrl: "",
  schedulerUrl: "",
  toneNotes: "",
  avoidPhrases: [],
  signature: ""
};

function normalizeString(value: string): string {
  return value.trim();
}

function normalizeAvoidPhrases(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))].slice(0, 20);
}

function normalizeSaveInput(input: SaveOutreachProfileInput): SaveOutreachProfileInput {
  return {
    senderName: normalizeString(input.senderName),
    companyName: normalizeString(input.companyName) || DEFAULT_OUTREACH_PROFILE.companyName,
    roleTitle: normalizeString(input.roleTitle),
    serviceLine: normalizeString(input.serviceLine),
    serviceSummary: normalizeString(input.serviceSummary),
    defaultCallToAction: normalizeString(input.defaultCallToAction),
    contactEmail: normalizeString(input.contactEmail),
    contactPhone: normalizeString(input.contactPhone),
    websiteUrl: normalizeString(input.websiteUrl),
    schedulerUrl: normalizeString(input.schedulerUrl),
    toneNotes: normalizeString(input.toneNotes),
    avoidPhrases: normalizeAvoidPhrases(input.avoidPhrases),
    signature: input.signature.trim()
  };
}

export async function getOutreachProfile(): Promise<OutreachProfile> {
  const profile = await createOutreachProfileRepository().getDefault();

  return profile ?? DEFAULT_OUTREACH_PROFILE;
}

export async function saveOutreachProfile(
  input: SaveOutreachProfileInput
): Promise<OutreachProfile> {
  return createOutreachProfileRepository().saveDefault(normalizeSaveInput(input));
}
