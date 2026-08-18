import { createFileRoute } from "@tanstack/react-router";

import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { AdminPlaceholderCard } from "@/components/admin/admin-placeholder-card";

export const Route = createFileRoute("/admin/claims")({
  head: () => ({
    meta: [
      { title: "בקשות שיוך | ניהול טיפולינקס" },
      { name: "robots", content: "noindex" },
      { name: "description", content: "ניהול בקשות לשיוך פרופילים קיימים למטפלים" },
    ],
  }),
  component: ClaimsPage,
});

function ClaimsPage() {
  return (
    <div>
      <AdminPageHeader title="בקשות שיוך" subtitle="ניהול בקשות לשיוך פרופילים קיימים למטפלים" breadcrumb="בקשות שיוך" />
      <AdminPlaceholderCard text="ניהול בקשות לשיוך פרופילים קיימים למטפלים." />
    </div>
  );
}
