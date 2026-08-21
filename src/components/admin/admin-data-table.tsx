import type { ReactNode } from "react";

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
            {rows.map((row) => (
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
        {rows.map((row) => (
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

      {footer ? <div className="border-t border-border p-2">{footer}</div> : null}
    </div>
  );
}

export function AdminPagination({
  page,
  pageCount,
  total,
  onPageChange,
}: {
  page: number;
  pageCount: number;
  total: number;
  onPageChange: (page: number) => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 px-1 text-xs text-muted-foreground">
      <span>
        עמוד {page} מתוך {pageCount} · {total} רשומות
      </span>
      <div className="flex gap-1">
        <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>
          הקודם
        </Button>
        <Button variant="outline" size="sm" disabled={page >= pageCount} onClick={() => onPageChange(page + 1)}>
          הבא
        </Button>
      </div>
    </div>
  );
}
