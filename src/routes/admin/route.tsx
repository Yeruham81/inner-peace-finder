import { Outlet, createFileRoute, redirect } from "@tanstack/react-router";

import { AdminLayout } from "@/components/admin/admin-layout";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/admin")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    const user = data.user;

    if (error || !user || user.app_metadata?.tipulinks_role !== "admin") {
      throw redirect({ to: "/" });
    }

    return { user };
  },
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
