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
}

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  caption,
  empty,
  loading = false,
  loadingRows = 5,
  className,
  isRowActive,
  rowClassName,
}: DataTableProps<T>) {
  return (
    <div className={cn("overflow-x-auto", className)}>
      <table className="min-w-full border-collapse text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="border-b border-line bg-slate-50/80">
            {columns.map((column) => (
              <th
                key={column.key}
                scope="col"
                className={cn(
                  "whitespace-nowrap px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-ink-subtle",
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
        <tbody className="divide-y divide-line">
          {loading ? (
            Array.from({ length: loadingRows }).map((_, rowIndex) => (
              <tr key={`skeleton-${rowIndex}`}>
                {columns.map((column) => (
                  <td key={column.key} className="px-4 py-3.5">
                    <Skeleton className="h-3.5 w-3/4" />
                  </td>
                ))}
              </tr>
            ))
          ) : rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="px-4 py-2">
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
                    "align-top hover:bg-slate-50/60",
                    active && "bg-accent-50/50 hover:bg-accent-50/60",
                    rowClassName?.(row),
                  )}
                >
                  {columns.map((column) => (
                    <td
                      key={column.key}
                      className={cn(
                        "px-4 py-3.5 text-ink",
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
