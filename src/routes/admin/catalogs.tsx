import { createFileRoute } from "@tanstack/react-router";

import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { AdminPlaceholderCard } from "@/components/admin/admin-placeholder-card";

export const Route = createFileRoute("/admin/catalogs")({
  head: () => ({
    meta: [
      { title: "קטלוגים | ניהול טיפולינקס" },
      { name: "robots", content: "noindex" },
      { name: "description", content: "ניהול עתידי של הקטלוגים המשמשים את מערכת החיפוש והפרופילים" },
    ],
  }),
  component: CatalogsPage,
});

function CatalogsPage() {
  return (
    <div>
      <AdminPageHeader title="קטלוגים" subtitle="ניהול עתידי של הקטלוגים המשמשים את מערכת החיפוש והפרופילים" breadcrumb="קטלוגים" />
      <AdminPlaceholderCard text="ניהול עתידי של הקטלוגים המשמשים את מערכת החיפוש והפרופילים." />
    </div>
  );
}
