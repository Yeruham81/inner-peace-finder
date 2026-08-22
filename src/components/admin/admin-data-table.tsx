import { useEffect, useState, type ReactNode } from "react";

import { AdminEmptyState } from "./admin-empty-state";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

export type AdminColumn<T> = {
  key: string;
  header: string;
  render: (row: T) => ReactNode;
  /** Hide this column on narrow desktop widths to avoid horizontal scrolling. */
  hideOnNarrow?: boolean;
  sortable?: boolean;
  className?: string;
};

export const ADMIN_PAGE_SIZE_OPTIONS = [10, 20, 50, 100, 250, 500, 1000] as const;

export function AdminDataTable<T>({
  columns,
  rows,
  getRowId,
  onRowClick,
  sortKey,
  sortDirection,
  onSortChange,
  mobileRow,
  emptyTitle,
  emptyDescription,
  footer,
}: {
  columns: AdminColumn<T>[];
  rows: T[];
  getRowId: (row: T) => string;
  onRowClick?: (row: T) => void;
  sortKey?: string;
  sortDirection?: "asc" | "desc";
  onSortChange?: (key: string) => void;
  mobileRow?: (row: T) => ReactNode;
  emptyTitle?: string;
  emptyDescription?: string;
  footer?: ReactNode;
}) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(ADMIN_PAGE_SIZE_OPTIONS[0]);
  const rowIdentity = rows.map((row) => getRowId(row)).join("\u0000");
  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const visibleRows = rows.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const showPagination = rows.length > 0;

  useEffect(() => {
    setPage(1);
  }, [rowIdentity]);

  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-surface-elevated">
        <AdminEmptyState title={emptyTitle} description={emptyDescription} />
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-surface-elevated">
      {/* Desktop / tablet table */}
      <div className="hidden md:block">
        <Table>
          <TableHeader className="bg-secondary/30 [&_tr]:border-border/90">
            <TableRow>
              {columns.map((column) => (
                <TableHead
                  key={column.key}
                  className={cn(
                    "text-right text-xs font-semibold text-foreground/80",
                    column.hideOnNarrow && "hidden lg:table-cell",
                    column.className,
                  )}
                >
                  {column.sortable && onSortChange ? (
                    <button
                      type="button"
                      onClick={() => onSortChange(column.key)}
                      className="font-medium underline-offset-4 hover:underline"
                    >
                      {column.header}
                      {sortKey === column.key ? (
                        <span aria-hidden="true">{sortDirection === "asc" ? " ↑" : " ↓"}</span>
                      ) : null}
                    </button>
                  ) : (
                    column.header
                  )}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {visibleRows.map((row) => (
              <TableRow
                key={getRowId(row)}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                className={cn("border-border/80", onRowClick && "cursor-pointer")}
              >
                {columns.map((column) => (
                  <TableCell
                    key={column.key}
                    className={cn(
                      "text-right align-middle text-sm",
                      column.hideOnNarrow && "hidden lg:table-cell",
                      column.className,
                    )}
                  >
                    {column.render(row)}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Mobile stacked cards */}
      <div className="divide-y divide-border md:hidden">
        {visibleRows.map((row) => (
          <div
            key={getRowId(row)}
            role={onRowClick ? "button" : undefined}
            tabIndex={onRowClick ? 0 : undefined}
            onClick={onRowClick ? () => onRowClick(row) : undefined}
            onKeyDown={
              onRowClick
                ? (event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      onRowClick(row);
                    }
                  }
                : undefined
            }
            className="p-3 text-sm"
          >
            {mobileRow
              ? mobileRow(row)
              : columns.map((column) => (
                  <div key={column.key} className="flex items-center justify-between gap-3 py-0.5">
                    <span className="text-xs text-muted-foreground">{column.header}</span>
                    <span className="min-w-0 text-right">{column.render(row)}</span>
                  </div>
                ))}
          </div>
        ))}
      </div>

      {showPagination || footer ? (
        <div className="space-y-2 border-t border-border p-2">
          {showPagination ? (
            <AdminPagination
              page={currentPage}
              pageCount={pageCount}
              pageSize={pageSize}
              total={rows.length}
              onPageChange={setPage}
              onPageSizeChange={(nextPageSize) => {
                setPageSize(nextPageSize);
                setPage(1);
              }}
            />
          ) : null}
          {footer}
        </div>
      ) : null}
    </div>
  );
}

export function AdminPagination({
  page,
  pageCount,
  pageSize,
  total,
  onPageChange,
  onPageSizeChange,
}: {
  page: number;
  pageCount: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 px-1 text-xs text-muted-foreground">
      <span>
        עמוד {page} מתוך {pageCount} · {total} רשומות
      </span>
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-1.5">
          <span>שורות בעמוד</span>
          <select
            aria-label="מספר שורות בעמוד"
            className="h-8 rounded-md border border-input bg-background px-2 text-xs text-foreground"
            value={pageSize}
            onChange={(event) => onPageSizeChange(Number(event.target.value))}
          >
            {ADMIN_PAGE_SIZE_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
        <div className="flex gap-1">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>
            הקודם
          </Button>
          <Button variant="outline" size="sm" disabled={page >= pageCount} onClick={() => onPageChange(page + 1)}>
            הבא
          </Button>
        </div>
      </div>
    </div>
  );
}
