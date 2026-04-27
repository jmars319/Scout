import type { OutreachProfile } from "@scout/domain";
import { outreachProfileSchema } from "@scout/validation";

import { getPostgresClient } from "./postgres-client.ts";

const DEFAULT_PROFILE_ID = "default";

interface OutreachProfileRow {
  profile_id: string;
  updated_at: string | Date;
  sender_name: string;
  company_name: string;
  role_title: string;
  service_line: string;
  service_summary: string;
  default_call_to_action: string;
  contact_email: string;
  contact_phone: string;
  website_url: string;
  scheduler_url: string;
  tone_notes: string;
  avoid_phrases: string[];
  signature: string;
}

export interface SaveOutreachProfileInput {
  senderName: string;
  companyName: string;
  roleTitle: string;
  serviceLine: string;
  serviceSummary: string;
  defaultCallToAction: string;
  contactEmail: string;
  contactPhone: string;
  websiteUrl: string;
  schedulerUrl: string;
  toneNotes: string;
  avoidPhrases: string[];
  signature: string;
}

export interface OutreachProfileRepository {
  getDefault: () => Promise<OutreachProfile | null>;
  saveDefault: (input: SaveOutreachProfileInput) => Promise<OutreachProfile>;
}

function mapRowToProfile(row: OutreachProfileRow): OutreachProfile {
  return outreachProfileSchema.parse({
    profileId: row.profile_id,
    updatedAt: new Date(row.updated_at).toISOString(),
    senderName: row.sender_name,
    companyName: row.company_name,
    roleTitle: row.role_title,
    serviceLine: row.service_line,
    serviceSummary: row.service_summary,
    defaultCallToAction: row.default_call_to_action,
    contactEmail: row.contact_email,
    contactPhone: row.contact_phone,
    websiteUrl: row.website_url,
    schedulerUrl: row.scheduler_url,
    toneNotes: row.tone_notes,
    avoidPhrases: row.avoid_phrases,
    signature: row.signature
  });
}

export function createOutreachProfileRepository(): OutreachProfileRepository {
  const sql = getPostgresClient();

  return {
    async getDefault() {
      const rows = await sql<OutreachProfileRow[]>`
        select
          profile_id,
          updated_at,
          sender_name,
          company_name,
          role_title,
          service_line,
          service_summary,
          default_call_to_action,
          contact_email,
          contact_phone,
          website_url,
          scheduler_url,
          tone_notes,
          avoid_phrases,
          signature
        from scout_outreach_profiles
        where profile_id = ${DEFAULT_PROFILE_ID}
        limit 1
      `;

      return rows[0] ? mapRowToProfile(rows[0]) : null;
    },

    async saveDefault(input) {
      const now = new Date().toISOString();
      const rows = await sql<OutreachProfileRow[]>`
        insert into scout_outreach_profiles (
          profile_id,
          updated_at,
          sender_name,
          company_name,
          role_title,
          service_line,
          service_summary,
          default_call_to_action,
          contact_email,
          contact_phone,
          website_url,
          scheduler_url,
          tone_notes,
          avoid_phrases,
          signature
        )
        values (
          ${DEFAULT_PROFILE_ID},
          ${now},
          ${input.senderName},
          ${input.companyName},
          ${input.roleTitle},
          ${input.serviceLine},
          ${input.serviceSummary},
          ${input.defaultCallToAction},
          ${input.contactEmail},
          ${input.contactPhone},
          ${input.websiteUrl},
          ${input.schedulerUrl},
          ${input.toneNotes},
          ${sql.json(input.avoidPhrases)},
          ${input.signature}
        )
        on conflict (profile_id) do update
        set
          updated_at = excluded.updated_at,
          sender_name = excluded.sender_name,
          company_name = excluded.company_name,
          role_title = excluded.role_title,
          service_line = excluded.service_line,
          service_summary = excluded.service_summary,
          default_call_to_action = excluded.default_call_to_action,
          contact_email = excluded.contact_email,
          contact_phone = excluded.contact_phone,
          website_url = excluded.website_url,
          scheduler_url = excluded.scheduler_url,
          tone_notes = excluded.tone_notes,
          avoid_phrases = excluded.avoid_phrases,
          signature = excluded.signature
        returning
          profile_id,
          updated_at,
          sender_name,
          company_name,
          role_title,
          service_line,
          service_summary,
          default_call_to_action,
          contact_email,
          contact_phone,
          website_url,
          scheduler_url,
          tone_notes,
          avoid_phrases,
          signature
      `;

      if (!rows[0]) {
        throw new Error("Scout could not persist the outreach profile.");
      }

      return mapRowToProfile(rows[0]);
    }
  };
}
