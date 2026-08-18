import { createFileRoute } from "@tanstack/react-router";

import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { AdminPlaceholderCard } from "@/components/admin/admin-placeholder-card";

export const Route = createFileRoute("/admin/therapists")({
  head: () => ({
    meta: [
      { title: "מטפלים | ניהול טיפולינקס" },
      { name: "robots", content: "noindex" },
      { name: "description", content: "ניהול וצפייה בפרופילי המטפלים במערכת" },
    ],
  }),
  component: TherapistsPage,
});

function TherapistsPage() {
  return (
    <div>
      <AdminPageHeader title="מטפלים" subtitle="ניהול וצפייה בפרופילי המטפלים במערכת" breadcrumb="מטפלים" />
      <AdminPlaceholderCard text="ניהול וצפייה בפרופילי המטפלים במערכת." />
    </div>
  );
}
