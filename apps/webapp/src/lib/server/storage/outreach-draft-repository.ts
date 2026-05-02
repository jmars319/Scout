import type {
  OutreachChannelKind,
  OutreachContactChannel,
  OutreachDraft,
  OutreachLength,
  OutreachPhoneTalkingPoints,
  OutreachTone
} from "@scout/domain";
import { outreachDraftSchema } from "@scout/validation";

import { getPostgresClient } from "./postgres-client.ts";

interface OutreachDraftRow {
  draft_id: string;
  run_id: string;
  candidate_id: string;
  created_at: string;
  updated_at: string;
  business_name: string;
  primary_url: string;
  tone: OutreachTone;
  draft_length: OutreachLength;
  recommended_channel: OutreachChannelKind | null;
  contact_channels: OutreachContactChannel[];
  contact_rationale: string[];
  subject_line: string;
  body: string;
  short_message: string | null;
  phone_talking_points: OutreachPhoneTalkingPoints | null;
  grounding: OutreachDraft["grounding"];
  model: string | null;
}

export interface SaveOutreachDraftInput {
  runId: string;
  candidateId: string;
  businessName: string;
  primaryUrl: string;
  tone: OutreachTone;
  length: OutreachLength;
  recommendedChannel?: OutreachChannelKind | undefined;
  contactChannels: OutreachContactChannel[];
  contactRationale: string[];
  subjectLine: string;
  body: string;
  shortMessage?: string | undefined;
  phoneTalkingPoints?: OutreachPhoneTalkingPoints | undefined;
  grounding: string[];
  model?: string | undefined;
}

export interface OutreachDraftRepository {
  listByRun: (runId: string) => Promise<OutreachDraft[]>;
  listByRunIds: (runIds: string[]) => Promise<OutreachDraft[]>;
  get: (runId: string, candidateId: string) => Promise<OutreachDraft | null>;
  save: (input: SaveOutreachDraftInput) => Promise<OutreachDraft>;
}

function createDraftId(runId: string, candidateId: string): string {
  return `${runId}:${candidateId}`;
}

function serializeContactChannels(
  channels: OutreachContactChannel[]
): Array<Record<string, number | string | undefined>> {
  return channels.map((channel) => ({
    kind: channel.kind,
    label: channel.label,
    value: channel.value,
    url: channel.url,
    score: channel.score,
    reason: channel.reason
  }));
}

function serializePhoneTalkingPoints(
  phoneTalkingPoints: OutreachPhoneTalkingPoints | undefined
): Record<string, string | string[]> | null {
  if (!phoneTalkingPoints) {
    return null;
  }

  return {
    opener: phoneTalkingPoints.opener,
    keyPoints: phoneTalkingPoints.keyPoints,
    close: phoneTalkingPoints.close
  };
}

function mapRowToDraft(row: OutreachDraftRow): OutreachDraft {
  return outreachDraftSchema.parse({
    draftId: row.draft_id,
    runId: row.run_id,
    candidateId: row.candidate_id,
    businessName: row.business_name,
    primaryUrl: row.primary_url,
    tone: row.tone,
    length: row.draft_length,
    ...(row.recommended_channel ? { recommendedChannel: row.recommended_channel } : {}),
    contactChannels: row.contact_channels,
    contactRationale: row.contact_rationale,
    subjectLine: row.subject_line,
    body: row.body,
    ...(row.short_message ? { shortMessage: row.short_message } : {}),
    ...(row.phone_talking_points ? { phoneTalkingPoints: row.phone_talking_points } : {}),
    grounding: row.grounding,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
    ...(row.model ? { model: row.model } : {})
  });
}

export function createOutreachDraftRepository(): OutreachDraftRepository {
  const sql = getPostgresClient();

  return {
    async listByRun(runId) {
      const rows = await sql<OutreachDraftRow[]>`
        select
          draft_id,
          run_id,
          candidate_id,
          created_at,
          updated_at,
          business_name,
          primary_url,
          tone,
          draft_length,
          recommended_channel,
          contact_channels,
          contact_rationale,
          subject_line,
          body,
          short_message,
          phone_talking_points,
          grounding,
          model
        from scout_outreach_drafts
        where run_id = ${runId}
        order by updated_at desc
      `;

      return rows.map(mapRowToDraft);
    },

    async listByRunIds(runIds) {
      const uniqueRunIds = [...new Set(runIds.filter(Boolean))];

      if (uniqueRunIds.length === 0) {
        return [];
      }

      const rows = await sql<OutreachDraftRow[]>`
        select
          draft_id,
          run_id,
          candidate_id,
          created_at,
          updated_at,
          business_name,
          primary_url,
          tone,
          draft_length,
          recommended_channel,
          contact_channels,
          contact_rationale,
          subject_line,
          body,
          short_message,
          phone_talking_points,
          grounding,
          model
        from scout_outreach_drafts
        where run_id = any(${sql.array(uniqueRunIds)})
        order by updated_at desc
      `;

      return rows.map(mapRowToDraft);
    },

    async get(runId, candidateId) {
      const rows = await sql<OutreachDraftRow[]>`
        select
          draft_id,
          run_id,
          candidate_id,
          created_at,
          updated_at,
          business_name,
          primary_url,
          tone,
          draft_length,
          recommended_channel,
          contact_channels,
          contact_rationale,
          subject_line,
          body,
          short_message,
          phone_talking_points,
          grounding,
          model
        from scout_outreach_drafts
        where run_id = ${runId} and candidate_id = ${candidateId}
        limit 1
      `;

      return rows[0] ? mapRowToDraft(rows[0]) : null;
    },

    async save(input) {
      const now = new Date().toISOString();
      const rows = await sql<OutreachDraftRow[]>`
        insert into scout_outreach_drafts (
          draft_id,
          run_id,
          candidate_id,
          created_at,
          updated_at,
          business_name,
          primary_url,
          tone,
          draft_length,
          recommended_channel,
          contact_channels,
          contact_rationale,
          subject_line,
          body,
          short_message,
          phone_talking_points,
          grounding,
          model
        )
        values (
          ${createDraftId(input.runId, input.candidateId)},
          ${input.runId},
          ${input.candidateId},
          ${now},
          ${now},
          ${input.businessName},
          ${input.primaryUrl},
          ${input.tone},
          ${input.length},
          ${input.recommendedChannel ?? null},
          ${sql.json(serializeContactChannels(input.contactChannels))},
          ${sql.json(input.contactRationale)},
          ${input.subjectLine},
          ${input.body},
          ${input.shortMessage ?? null},
          ${sql.json(serializePhoneTalkingPoints(input.phoneTalkingPoints))},
          ${sql.json(input.grounding)},
          ${input.model ?? null}
        )
        on conflict (run_id, candidate_id) do update
        set
          updated_at = excluded.updated_at,
          business_name = excluded.business_name,
          primary_url = excluded.primary_url,
          tone = excluded.tone,
          draft_length = excluded.draft_length,
          recommended_channel = excluded.recommended_channel,
          contact_channels = excluded.contact_channels,
          contact_rationale = excluded.contact_rationale,
          subject_line = excluded.subject_line,
          body = excluded.body,
          short_message = excluded.short_message,
          phone_talking_points = excluded.phone_talking_points,
          grounding = excluded.grounding,
          model = excluded.model
        returning
          draft_id,
          run_id,
          candidate_id,
          created_at,
          updated_at,
          business_name,
          primary_url,
          tone,
          draft_length,
          recommended_channel,
          contact_channels,
          contact_rationale,
          subject_line,
          body,
          short_message,
          phone_talking_points,
          grounding,
          model
      `;

      if (!rows[0]) {
        throw new Error("Scout could not persist the outreach draft.");
      }

      return mapRowToDraft(rows[0]);
    }
  };
}
