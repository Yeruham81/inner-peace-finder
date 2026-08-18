import { createFileRoute } from "@tanstack/react-router";

import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { AdminPlaceholderCard } from "@/components/admin/admin-placeholder-card";

export const Route = createFileRoute("/admin/settings")({
  head: () => ({
    meta: [
      { title: "הגדרות מערכת | ניהול טיפולינקס" },
      { name: "robots", content: "noindex" },
      { name: "description", content: "הגדרות כלליות של מערכת טיפולינקס" },
    ],
  }),
  component: SettingsPage,
});

function SettingsPage() {
  return (
    <div>
      <AdminPageHeader title="הגדרות מערכת" subtitle="הגדרות כלליות של מערכת טיפולינקס" breadcrumb="הגדרות מערכת" />
      <AdminPlaceholderCard text="הגדרות כלליות של מערכת טיפולינקס." />
    </div>
  );
}
