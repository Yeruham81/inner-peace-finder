import { createFileRoute } from "@tanstack/react-router";

import { EditorPage } from "./new-profile";

export const Route = createFileRoute("/_authenticated/account/profile")({
  head: () => ({
    meta: [{ title: "הפרופיל שלי | Tipulinks" }, { name: "robots", content: "noindex,nofollow" }],
  }),
  component: AccountProfilePage,
});

function AccountProfilePage() {
  return <EditorPage embedded />;
}
