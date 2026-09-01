import { useEffect, useMemo, useState, type ReactNode } from "react";

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

export type AdminControlledPagination = {
  page: number;
  pageCount: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
  pageSizeOptions?: readonly number[];
  showPageNumbers?: boolean;
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
  pagination,
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
  pagination?: AdminControlledPagination;
}) {
  const [internalPage, setInternalPage] = useState(1);
  const [internalPageSize, setInternalPageSize] = useState<number>(ADMIN_PAGE_SIZE_OPTIONS[0]);
  const rowIdentity = rows.map((row) => getRowId(row)).join("\u0000");
  const internalPageCount = Math.max(1, Math.ceil(rows.length / internalPageSize));
  const currentInternalPage = Math.min(internalPage, internalPageCount);
  const visibleRows = pagination
    ? rows
    : rows.slice((currentInternalPage - 1) * internalPageSize, currentInternalPage * internalPageSize);
  const showPagination = pagination ? pagination.total > 0 : rows.length > 0;
  const isControlledPagination = Boolean(pagination);

  useEffect(() => {
    if (!isControlledPagination) setInternalPage(1);
  }, [isControlledPagination, rowIdentity]);

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
      <div className="hidden overflow-x-auto md:block">
        <Table>
          <TableHeader className="bg-secondary/30 [&_tr]:border-border/90">
            <TableRow>
              {columns.map((column) => {
                const activeSort = sortKey === column.key;
                return (
                  <TableHead
                    key={column.key}
                    aria-sort={
                      activeSort
                        ? sortDirection === "asc"
                          ? "ascending"
                          : "descending"
                        : column.sortable
                          ? "none"
                          : undefined
                    }
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
                        aria-label={`${column.header}${activeSort ? `, מיון ${sortDirection === "asc" ? "עולה" : "יורד"}` : ", ללא מיון פעיל"}`}
                      >
                        {column.header}
                        {activeSort ? <span aria-hidden="true">{sortDirection === "asc" ? " ↑" : " ↓"}</span> : null}
                      </button>
                    ) : (
                      column.header
                    )}
                  </TableHead>
                );
              })}
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
            pagination ? (
              <AdminPagination {...pagination} />
            ) : (
              <AdminPagination
                page={currentInternalPage}
                pageCount={internalPageCount}
                pageSize={internalPageSize}
                total={rows.length}
                onPageChange={setInternalPage}
                onPageSizeChange={(nextPageSize) => {
                  setInternalPageSize(nextPageSize);
                  setInternalPage(1);
                }}
              />
            )
          ) : null}
          {footer}
        </div>
      ) : null}
    </div>
  );
}

function paginationItems(page: number, pageCount: number): Array<number | "ellipsis-start" | "ellipsis-end"> {
  if (pageCount <= 7) return Array.from({ length: pageCount }, (_, index) => index + 1);

  const pages = new Set([1, pageCount, page - 1, page, page + 1]);
  const values = [...pages].filter((value) => value >= 1 && value <= pageCount).sort((a, b) => a - b);
  const items: Array<number | "ellipsis-start" | "ellipsis-end"> = [];

  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    const previous = values[index - 1];
    if (previous && value - previous > 1) {
      items.push(previous === 1 ? "ellipsis-start" : "ellipsis-end");
    }
    items.push(value);
  }
  return items;
}

export function AdminPagination({
  page,
  pageCount,
  pageSize,
  total,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = ADMIN_PAGE_SIZE_OPTIONS,
  showPageNumbers = false,
}: {
  page: number;
  pageCount: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
  pageSizeOptions?: readonly number[];
  showPageNumbers?: boolean;
}) {
  const items = useMemo(() => paginationItems(page, pageCount), [page, pageCount]);
  const start = total > 0 ? (page - 1) * pageSize + 1 : 0;
  const end = total > 0 ? Math.min(total, page * pageSize) : 0;

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 px-1 text-xs text-muted-foreground">
      <span>
        {showPageNumbers
          ? `${start}–${end} מתוך ${total} · עמוד ${page} מתוך ${pageCount}`
          : `עמוד ${page} מתוך ${pageCount} · ${total} רשומות`}
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
            {pageSizeOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
        <nav className="flex flex-wrap items-center gap-1" aria-label="דפדוף בין עמודי הטבלה">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>
            הקודם
          </Button>
          {showPageNumbers
            ? items.map((item) =>
                typeof item === "number" ? (
                  <Button
                    key={item}
                    variant={item === page ? "secondary" : "outline"}
                    size="sm"
                    aria-current={item === page ? "page" : undefined}
                    aria-label={`עמוד ${item}`}
                    onClick={() => onPageChange(item)}
                  >
                    {item}
                  </Button>
                ) : (
                  <span key={item} className="px-1" aria-hidden="true">
                    …
                  </span>
                ),
              )
            : null}
          <Button variant="outline" size="sm" disabled={page >= pageCount} onClick={() => onPageChange(page + 1)}>
            הבא
          </Button>
        </nav>
      </div>
    </div>
  );
}
