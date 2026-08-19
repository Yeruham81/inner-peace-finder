import { SearchX } from "lucide-react";

export function AdminEmptyState({
  title = "לא נמצאו רשומות",
  description = "נסו לשנות את החיפוש או את הסינון.",
}: {
  title?: string;
  description?: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-4 py-12 text-center">
      <SearchX className="h-6 w-6 text-muted-foreground" aria-hidden="true" />
      <p className="text-sm font-medium text-foreground">{title}</p>
      <p className="text-xs text-muted-foreground">{description}</p>
    </div>
  );
}
