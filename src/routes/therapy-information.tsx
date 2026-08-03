import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/therapy-information")({
  head: () => ({
    meta: [
      { title: "תחומי טיפול | Tipulinks" },
      {
        name: "description",
        content: "מידע כללי על תחומי הטיפול השונים בטיפולינקס — העמוד יתווסף בהמשך.",
      },
      { property: "og:title", content: "תחומי טיפול | Tipulinks" },
      {
        property: "og:description",
        content: "מידע כללי על תחומי הטיפול השונים בטיפולינקס.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: TherapyInformationPage,
});

function TherapyInformationPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
      <h1 className="text-3xl font-bold tracking-tight text-foreground">תחומי טיפול</h1>
      <p className="mt-4 text-base text-muted-foreground">
        עמוד מידע כללי על תחומי הטיפול השונים יתווסף בהמשך.
      </p>
    </div>
  );
}
