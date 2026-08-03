import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/for-therapists")({
  head: () => ({
    meta: [
      { title: "מידע למטפלים | Tipulinks" },
      {
        name: "description",
        content: "מידע למטפלים המעוניינים להצטרף לטיפולינקס — העמוד יתווסף בהמשך.",
      },
      { property: "og:title", content: "מידע למטפלים | Tipulinks" },
      {
        property: "og:description",
        content: "מידע למטפלים המעוניינים להצטרף לטיפולינקס.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ForTherapistsPage,
});

function ForTherapistsPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
      <h1 className="text-3xl font-bold tracking-tight text-foreground">מידע למטפלים</h1>
      <p className="mt-4 text-base text-muted-foreground">
        מידע למטפלים המעוניינים להצטרף לטיפולינקס יתווסף בהמשך.
      </p>
    </div>
  );
}
