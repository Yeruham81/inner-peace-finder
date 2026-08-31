import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { AdminDataTable, type AdminColumn } from "@/components/admin/admin-data-table";
import { AdminDetailDrawer, AdminDetailRow, AdminDetailSection } from "@/components/admin/admin-detail-drawer";
import { AdminFilterBar, AdminSearchField, AdminSelectFilter } from "@/components/admin/admin-filter-bar";
import { formatAdminDateTime } from "@/components/admin/admin-formatters";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { AdminStatusBadge } from "@/components/admin/admin-status-badge";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  deleteAdminManagedTherapist,
  listAdminTherapists,
  type AdminTherapistRow,
} from "@/lib/admin-therapists.functions";

export const Route = createFileRoute("/admin/therapists")({
  head: () => ({
    meta: [
      { title: "מטפלים | ניהול טיפולינקס" },
      { name: "robots", content: "noindex" },
      { name: "description", content: "ניהול וצפייה בפרופילי המטפלים במערכת" },
    ],
  }),
  component: TherapistsPage,
});

function publicationStatus(row: AdminTherapistRow): string {
  if (row.doNotRepublish) return "ממתין למחיקה";
  if (
    row.profileStatus === "published" &&
    row.isActive &&
    (row.visibility === "visible" || row.visibility === "published")
  ) {
    return "פורסם";
  }
  if (row.profileStatus === "completed") return "מוכן לפרסום";
  if (row.profileStatus === "published") return "מוקפא";
  return "טיוטה";
}

function ownershipStatus(row: AdminTherapistRow): string {
  return row.ownerAccountId ? "בבעלות המטפל" : "ממתין ללקיחת בעלות";
}

function originStatus(row: AdminTherapistRow): string {
  return row.profileOrigin === "admin_public_info" ? "נוצר ע״י Tipulinks" : "נוצר ע״י המטפל";
}

const CONTACT_POLICY_TYPE_LABELS: Record<string, string> = {
  phone: "טלפון",
  email: "אימייל",
  website: "אתר/קישור",
  social: "רשת חברתית/ערוץ תקשורת",
};

function contactPolicyTypesLabel(types: string[]): string {
  return types.map((type) => CONTACT_POLICY_TYPE_LABELS[type] ?? type).join(", ");
}

function canAdminEdit(row: AdminTherapistRow): boolean {
  return row.profileOrigin === "admin_public_info" && !row.ownerAccountId && !row.profileClaimed && !row.doNotRepublish;
}

function canAdminDelete(row: AdminTherapistRow): boolean {
  return row.profileOrigin === "admin_public_info" && !row.ownerAccountId && !row.profileClaimed;
}

function TherapistsPage() {
  const queryClient = useQueryClient();
  const listFn = useServerFn(listAdminTherapists);
  const deleteFn = useServerFn(deleteAdminManagedTherapist);
  const [search, setSearch] = useState("");
  const [profileStatus, setProfileStatus] = useState("all");
  const [ownership, setOwnership] = useState("all");
  const [origin, setOrigin] = useState("all");
  const [sortKey, setSortKey] = useState("createdAt");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
  const [selected, setSelected] = useState<AdminTherapistRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AdminTherapistRow | null>(null);

  const therapists = useQuery({
    queryKey: ["admin-therapists"],
    queryFn: () => listFn(),
  });
  const publishedCount = (therapists.data ?? []).filter((row) => publicationStatus(row) === "פורסם").length;

  const deleteMutation = useMutation({
    mutationFn: (therapistId: string) => deleteFn({ data: { therapist_id: therapistId } }),
    onSuccess: () => {
      toast.success("הפרופיל נמחק לצמיתות.");
      setSelected(null);
      setDeleteTarget(null);
      void queryClient.invalidateQueries({ queryKey: ["admin-therapists"] });
    },
    onError: (error: Error) => toast.error(error.message || "מחיקת הפרופיל נכשלה."),
  });

  const filtered = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("he");
    const rows = (therapists.data ?? []).filter((row) => {
      if (term) {
        const haystack = [row.fullName, row.professionalTitle ?? "", row.email ?? "", row.city ?? ""]
          .join(" ")
          .toLocaleLowerCase("he");
        if (!haystack.includes(term)) return false;
      }
      if (profileStatus !== "all" && publicationStatus(row) !== profileStatus) return false;
      if (ownership !== "all" && ownershipStatus(row) !== ownership) return false;
      if (origin !== "all" && originStatus(row) !== origin) return false;
      return true;
    });

    return [...rows].sort((a, b) => {
      const left = sortKey === "name" ? a.fullName : a.createdAt;
      const right = sortKey === "name" ? b.fullName : b.createdAt;
      const compare = left.localeCompare(right, "he");
      return sortDirection === "asc" ? compare : -compare;
    });
  }, [therapists.data, search, profileStatus, ownership, origin, sortKey, sortDirection]);

  function handleSort(key: string) {
    if (key === sortKey) {
      setSortDirection((direction) => (direction === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(key);
    setSortDirection("asc");
  }

  const columns: AdminColumn<AdminTherapistRow>[] = [
    {
      key: "name",
      header: "שם המטפל/ת",
      sortable: true,
      render: (row) => <span className="font-medium">{row.fullName}</span>,
    },
    {
      key: "profileStatus",
      header: "סטטוס פרופיל",
      render: (row) => <AdminStatusBadge status={publicationStatus(row)} />,
    },
    {
      key: "ownership",
      header: "בעלות",
      render: (row) => <AdminStatusBadge status={ownershipStatus(row)} />,
    },
    {
      key: "origin",
      header: "מקור",
      hideOnNarrow: true,
      render: (row) => <AdminStatusBadge status={originStatus(row)} />,
    },
    {
      key: "email",
      header: "אימייל",
      hideOnNarrow: true,
      render: (row) => <span dir="ltr">{row.email || "—"}</span>,
    },
    {
      key: "contactPolicyViolations",
      header: "ניסיונות עקיפת קשר",
      hideOnNarrow: true,
      render: (row) =>
        row.contactPolicyViolationCount > 0 ? (
          <span className="font-semibold text-destructive">{row.contactPolicyViolationCount}</span>
        ) : (
          <span className="text-muted-foreground">0</span>
        ),
    },
    {
      key: "createdAt",
      header: "נוצר",
      sortable: true,
      hideOnNarrow: true,
      render: (row) => <span dir="ltr">{formatAdminDateTime(row.createdAt)}</span>,
    },
    {
      key: "actions",
      header: "פעולות",
      render: (row) => (
        <div className="flex flex-wrap gap-1">
          <Button
            variant="outline"
            size="sm"
            onClick={(event) => {
              event.stopPropagation();
              setSelected(row);
            }}
          >
            פרטים
          </Button>
          {canAdminEdit(row) ? (
            <Button asChild variant="outline" size="sm" onClick={(event) => event.stopPropagation()}>
              <Link to="/new-profile" search={{ therapistId: row.id }}>
                עריכה
              </Link>
            </Button>
          ) : null}
        </div>
      ),
    },
  ];

  return (
    <div>
      <AdminPageHeader
        title="מטפלים"
        subtitle={
          therapists.isLoading
            ? "טוען פרופילים…"
            : `${therapists.data?.length ?? 0} רשומות פרופיל במערכת · ${publishedCount} מפורסמים ופעילים`
        }
        breadcrumb="מטפלים"
        actions={
          <Button asChild>
            <Link to="/new-profile" search={{ therapistId: undefined }}>
              יצירת פרופיל חדש
            </Link>
          </Button>
        }
      />

      {therapists.isError ? (
        <div className="mb-4 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          לא ניתן לטעון את רשימת המטפלים. {therapists.error instanceof Error ? therapists.error.message : ""}
        </div>
      ) : null}

      <AdminFilterBar>
        <AdminSearchField
          id="therapist-search"
          label="חיפוש"
          placeholder="שם, אימייל, כותרת או יישוב"
          value={search}
          onChange={setSearch}
        />
        <AdminSelectFilter
          id="filter-profile"
          label="סטטוס פרופיל"
          value={profileStatus}
          onChange={setProfileStatus}
          options={["פורסם", "מוכן לפרסום", "טיוטה", "מוקפא", "ממתין למחיקה"]}
        />
        <AdminSelectFilter
          id="filter-ownership"
          label="בעלות"
          value={ownership}
          onChange={setOwnership}
          options={["ממתין ללקיחת בעלות", "בבעלות המטפל"]}
        />
        <AdminSelectFilter
          id="filter-origin"
          label="מקור"
          value={origin}
          onChange={setOrigin}
          options={["נוצר ע״י Tipulinks", "נוצר ע״י המטפל"]}
        />
      </AdminFilterBar>

      <AdminDataTable
        columns={columns}
        rows={filtered}
        getRowId={(row) => row.id}
        onRowClick={(row) => setSelected(row)}
        sortKey={sortKey}
        sortDirection={sortDirection}
        onSortChange={handleSort}
        emptyTitle={therapists.isLoading ? "טוען…" : "לא נמצאו פרופילים"}
        emptyDescription="נסו לשנות את מסנני החיפוש."
        mobileRow={(row) => (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <span className="font-semibold text-foreground">{row.fullName}</span>
              <AdminStatusBadge status={publicationStatus(row)} />
            </div>
            <p className="text-xs text-muted-foreground">{row.professionalTitle || "ללא כותרת מקצועית"}</p>
            <div className="flex flex-wrap gap-1.5">
              <AdminStatusBadge status={ownershipStatus(row)} />
              <AdminStatusBadge status={originStatus(row)} />
            </div>
            {row.contactPolicyViolationCount > 0 ? (
              <p className="text-xs font-semibold text-destructive">
                ניסיונות עקיפת קשר: {row.contactPolicyViolationCount}
              </p>
            ) : null}
          </div>
        )}
      />

      <AdminDetailDrawer
        open={selected !== null}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
        title={selected?.fullName ?? ""}
        description={selected ? `/${selected.slug}` : undefined}
        footer={
          selected ? (
            <div className="flex flex-wrap justify-end gap-2">
              {selected.profileStatus === "published" && selected.isActive && !selected.doNotRepublish ? (
                <Button asChild variant="outline" size="sm">
                  <Link to="/therapists/$slug" params={{ slug: selected.slug }} search={{}}>
                    צפייה בפרופיל
                  </Link>
                </Button>
              ) : null}
              {canAdminEdit(selected) ? (
                <Button asChild variant="outline" size="sm">
                  <Link to="/new-profile" search={{ therapistId: selected.id }}>
                    עריכה
                  </Link>
                </Button>
              ) : null}
              {canAdminDelete(selected) ? (
                <Button variant="destructive" size="sm" onClick={() => setDeleteTarget(selected)}>
                  מחיקה
                </Button>
              ) : null}
            </div>
          ) : undefined
        }
      >
        {selected ? (
          <>
            <AdminDetailSection title="סטטוס">
              <AdminDetailRow label="פרופיל" value={<AdminStatusBadge status={publicationStatus(selected)} />} />
              <AdminDetailRow label="בעלות" value={<AdminStatusBadge status={ownershipStatus(selected)} />} />
              <AdminDetailRow label="מקור" value={<AdminStatusBadge status={originStatus(selected)} />} />
              <AdminDetailRow
                label="אימות מקצועי"
                value={<AdminStatusBadge status={selected.verified ? "מאומת" : "ללא אימות"} />}
              />
            </AdminDetailSection>
            <AdminDetailSection title="ניטור עקיפת קשר">
              <AdminDetailRow label="ניסיונות חסומים" value={String(selected.contactPolicyViolationCount)} />
              <AdminDetailRow
                label="ניסיון אחרון"
                value={
                  selected.contactPolicyLastViolationAt ? (
                    <span dir="ltr">{formatAdminDateTime(selected.contactPolicyLastViolationAt)}</span>
                  ) : (
                    "—"
                  )
                }
              />
              <AdminDetailRow
                label="סוגים בניסיון האחרון"
                value={
                  selected.contactPolicyLastViolationTypes.length > 0
                    ? contactPolicyTypesLabel(selected.contactPolicyLastViolationTypes)
                    : "—"
                }
              />
            </AdminDetailSection>
            <AdminDetailSection title="פרטים">
              <AdminDetailRow label="כותרת מקצועית" value={selected.professionalTitle || "—"} />
              <AdminDetailRow label="יישוב" value={selected.city || "—"} />
              <AdminDetailRow label="נוצר" value={<span dir="ltr">{formatAdminDateTime(selected.createdAt)}</span>} />
            </AdminDetailSection>
            <AdminDetailSection title="פרטי קשר">
              <AdminDetailRow label="אימייל" value={<span dir="ltr">{selected.email || "—"}</span>} />
              <AdminDetailRow label="טלפון" value={<span dir="ltr">{selected.phone || "—"}</span>} />
            </AdminDetailSection>
            {selected.profileOrigin === "admin_public_info" ? (
              <AdminDetailSection title="לקיחת בעלות">
                <AdminDetailRow label="פנייה ראשונה" value={selected.firstContactSentAt ? "נשלחה" : "טרם נשלחה"} />
                <AdminDetailRow label="נבדק ע״י המטפל" value={selected.ownerReviewedAt ? "כן" : "לא"} />
              </AdminDetailSection>
            ) : null}
          </>
        ) : null}
      </AdminDetailDrawer>

      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open && !deleteMutation.isPending) setDeleteTarget(null);
        }}
      >
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>מחיקת הפרופיל לצמיתות?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget
                ? `הפרופיל של ${deleteTarget.fullName} יימחק מהמערכת יחד עם הנתונים המשויכים אליו. פעולה זו אינה ניתנת לביטול.`
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>ביטול</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteMutation.isPending || !deleteTarget}
              onClick={(event) => {
                event.preventDefault();
                if (deleteTarget) deleteMutation.mutate(deleteTarget.id);
              }}
            >
              {deleteMutation.isPending ? "מוחק…" : "מחיקה לצמיתות"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
