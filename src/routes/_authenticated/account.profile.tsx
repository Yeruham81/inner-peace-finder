import { createFileRoute, useNavigate } from "@tanstack/react-router";

import { EditorPage } from "./new-profile";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const Route = createFileRoute("/_authenticated/account/profile")({
  validateSearch: (input: Record<string, unknown>) => ({
    therapistId:
      typeof input.therapistId === "string" && UUID_PATTERN.test(input.therapistId) ? input.therapistId : undefined,
  }),
  head: () => ({
    meta: [{ title: "הפרופיל שלי | Tipulinks" }, { name: "robots", content: "noindex,nofollow" }],
  }),
  component: AccountProfilePage,
});

function AccountProfilePage() {
  const { user } = Route.useRouteContext();
  const { therapistId } = Route.useSearch();
  const navigate = useNavigate();
  return (
    <EditorPage
      embedded
      defaultEmail={user.email ?? ""}
      adminTherapistId={therapistId ?? null}
      onAdminTherapistIdChange={(nextTherapistId) =>
        void navigate({
          to: "/account/profile",
          search: { therapistId: nextTherapistId },
          replace: true,
        })
      }
    />
  );
}
