import { createFileRoute } from "@tanstack/react-router";

import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { AdminPlaceholderCard } from "@/components/admin/admin-placeholder-card";

export const Route = createFileRoute("/admin/billing")({
  head: () => ({
    meta: [
      { title: "חיובים | ניהול טיפולינקס" },
      { name: "robots", content: "noindex" },
      { name: "description", content: "ניהול עתידי של חיובים, תשלומים וקרדיטים" },
    ],
  }),
  component: BillingPage,
});

function BillingPage() {
  return (
    <div>
      <AdminPageHeader title="חיובים" subtitle="ניהול עתידי של חיובים, תשלומים וקרדיטים" breadcrumb="חיובים" />
      <AdminPlaceholderCard text="ניהול עתידי של חיובים, תשלומים וקרדיטים." />
    </div>
  );
}
