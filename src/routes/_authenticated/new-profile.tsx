import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/new-profile")({
  head: () => ({
    meta: [
      { title: "יצירת פרופיל מטפל חדש | Tipulinks" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: NewProfilePage,
});

function NewProfilePage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <div className="rounded-2xl border border-border bg-surface-elevated p-6 shadow-sm">
        <h1 className="text-2xl font-bold text-foreground">יצירת פרופיל מטפל חדש</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          יצירת פרופיל חדש תיפתח לעריכה מלאה בשלב הבא של הפלטפורמה.
          עד אז, שמרנו את מקומכם — כשהעורך יהיה מוכן, נוכל להמשיך מכאן.
        </p>
        <div className="mt-6 rounded-lg border border-dashed border-border bg-surface p-4 text-sm text-muted-foreground">
          מהם השלבים הבאים? מילוי פרטים מקצועיים, בחירת התמחויות, ואישור פרסום.
        </div>
        <p className="mt-6 text-xs text-muted-foreground">
          <Link to="/account" className="underline">חזרה לחשבון</Link>
        </p>
      </div>
    </div>
  );
}