import { createFileRoute } from "@tanstack/react-router";

import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { AdminPlaceholderCard } from "@/components/admin/admin-placeholder-card";

export const Route = createFileRoute("/admin/integrations")({
  head: () => ({
    meta: [
      { title: "אינטגרציות | ניהול טיפולינקס" },
      { name: "robots", content: "noindex" },
      { name: "description", content: "ניהול עתידי של שירותי תקשורת וספקים חיצוניים" },
    ],
  }),
  component: IntegrationsPage,
});

function IntegrationsPage() {
  return (
    <div>
      <AdminPageHeader title="אינטגרציות" subtitle="ניהול עתידי של שירותי תקשורת וספקים חיצוניים" breadcrumb="אינטגרציות" />
      <AdminPlaceholderCard text="ניהול עתידי של שירותי תקשורת וספקים חיצוניים." />
    </div>
  );
}
