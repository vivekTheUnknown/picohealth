import type { ReactNode } from "react";

import { cn } from "@/lib/cn";
import { EmptyState } from "@/components/layout/empty-state";
import { Skeleton } from "@/components/layout/skeleton";

export interface Column<T> {
  key: string;
  header: ReactNode;
  render: (row: T) => ReactNode;
  className?: string;
  headClassName?: string;
  align?: "left" | "right" | "center";
}

export interface DataTableProps<T> {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  caption: string;
  empty?: ReactNode;
  loading?: boolean;
  loadingRows?: number;
  className?: string;
  /** Highlights the row that is currently open in a detail panel. */
  isRowActive?: (row: T) => boolean;
  rowClassName?: (row: T) => string | undefined;
  /** Keeps the header visible while a long table scrolls (style.md §6). */
  stickyHeader?: boolean;
}

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  caption,
  empty,
  loading = false,
  loadingRows = 6,
  className,
  isRowActive,
  rowClassName,
  stickyHeader = false,
}: DataTableProps<T>) {
  return (
    <div className={cn("w-full overflow-x-auto", className)}>
      <table className="w-full min-w-full border-collapse text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead
          className={cn(
            "border-b border-line",
            stickyHeader && "sticky top-0 z-10 bg-surface",
          )}
        >
          <tr>
            {columns.map((column) => (
              <th
                key={column.key}
                scope="col"
                className={cn(
                  "h-9 whitespace-nowrap px-4 text-left text-2xs font-medium text-ink-subtle",
                  column.align === "right" && "text-right",
                  column.align === "center" && "text-center",
                  column.headClassName,
                )}
              >
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {loading ? (
            Array.from({ length: loadingRows }).map((_, rowIndex) => (
              <tr key={`skeleton-${rowIndex}`} className="border-b border-line-subtle">
                {columns.map((column) => (
                  <td key={column.key} className="h-11 px-4">
                    <Skeleton className="h-3 w-2/3" />
                  </td>
                ))}
              </tr>
            ))
          ) : rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="px-4 py-6">
                {empty ?? <EmptyState title="Nothing to show" compact />}
              </td>
            </tr>
          ) : (
            rows.map((row) => {
              const active = isRowActive?.(row) ?? false;
              return (
                <tr
                  key={rowKey(row)}
                  aria-current={active ? "true" : undefined}
                  className={cn(
                    "border-b border-line-subtle transition-colors duration-fast last:border-0",
                    "hover:bg-surface-raised/60",
                    active && "bg-surface-active hover:bg-surface-active",
                    rowClassName?.(row),
                  )}
                >
                  {columns.map((column) => (
                    <td
                      key={column.key}
                      className={cn(
                        // 10px vertical padding gives the 40–48px single-line
                        // row height from style.md §6 while letting multi-line
                        // cells grow instead of clipping.
                        "px-4 py-2.5 text-ink",
                        column.align === "right" && "text-right tabular-nums",
                        column.align === "center" && "text-center",
                        column.className,
                      )}
                    >
                      {column.render(row)}
                    </td>
                  ))}
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}
