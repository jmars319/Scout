import { AppFrame } from "@scout/ui";

import { OutreachProfileForm } from "@/components/OutreachProfileForm";
import { ScoutNavigation } from "@/components/ScoutNavigation";
import { ThemeToggle } from "@/components/ThemeToggle";
import { getOutreachProfile } from "@/lib/server/settings/outreach-profile-service";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const profile = await getOutreachProfile();

  return (
    <AppFrame
      eyebrow="Scout settings"
      title="Settings"
      description="Local desktop settings for Scout. The outreach profile is where the sender-side identity, offer, and CTA live for grounded draft generation."
      navigation={<ScoutNavigation currentView="settings" />}
      actions={<ThemeToggle />}
    >
      <OutreachProfileForm initialProfile={profile} />
    </AppFrame>
  );
}
