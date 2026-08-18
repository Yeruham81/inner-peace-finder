import { createFileRoute } from "@tanstack/react-router";

import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { AdminPlaceholderCard } from "@/components/admin/admin-placeholder-card";

export const Route = createFileRoute("/admin/credentials")({
  head: () => ({
    meta: [
      { title: "אימות הסמכות | ניהול טיפולינקס" },
      { name: "robots", content: "noindex" },
      { name: "description", content: "בדיקת מסמכים ובקשות לאימות פרטי הכשרה ורישוי" },
    ],
  }),
  component: CredentialsPage,
});

function CredentialsPage() {
  return (
    <div>
      <AdminPageHeader title="אימות הסמכות" subtitle="בדיקת מסמכים ובקשות לאימות פרטי הכשרה ורישוי" breadcrumb="אימות הסמכות" />
      <AdminPlaceholderCard text="בדיקת מסמכים ובקשות לאימות פרטי הכשרה ורישוי." />
    </div>
  );
}
