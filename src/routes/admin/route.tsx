import { Outlet, createFileRoute } from "@tanstack/react-router";

import { AdminLayout } from "@/components/admin/admin-layout";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [
      { title: "ניהול טיפולינקס" },
      { name: "robots", content: "noindex" },
      { name: "description", content: "אזור הניהול הפנימי של טיפולינקס." },
    ],
  }),
  component: AdminRouteLayout,
});

function AdminRouteLayout() {
  return (
    <AdminLayout>
      <Outlet />
    </AdminLayout>
  );
}