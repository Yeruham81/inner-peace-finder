import { createFileRoute } from "@tanstack/react-router";

import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { AdminPlaceholderCard } from "@/components/admin/admin-placeholder-card";

export const Route = createFileRoute("/admin/leads")({
  head: () => ({
    meta: [
      { title: "פניות | ניהול טיפולינקס" },
      { name: "robots", content: "noindex" },
      { name: "description", content: "צפייה בפניות שנוצרו דרך המערכת" },
    ],
  }),
  component: LeadsPage,
});

function LeadsPage() {
  return (
    <div>
      <AdminPageHeader title="פניות" subtitle="צפייה בפניות שנוצרו דרך המערכת" breadcrumb="פניות" />
      <AdminPlaceholderCard text="צפייה בפניות שנוצרו דרך המערכת." />
    </div>
  );
}
