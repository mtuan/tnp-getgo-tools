import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "./Button";

export const DEFAULT_PAGE_SIZE = 10;

export function usePagination<T>(items: readonly T[], pageSize = DEFAULT_PAGE_SIZE) {
  const [requestedPage, setRequestedPage] = useState(1);
  const pageCount = Math.max(1, Math.ceil(items.length / pageSize));
  const page = Math.min(requestedPage, pageCount);
  const start = (page - 1) * pageSize;

  return {
    page,
    pageCount,
    pageItems: items.slice(start, start + pageSize),
    setPage: (nextPage: number) => setRequestedPage(Math.max(1, Math.min(nextPage, pageCount))),
  };
}

export function Pagination({
  locale,
  page,
  pageCount,
  hasNextPage,
  disabled = false,
  onPageChange,
}: {
  locale: "en" | "vi";
  page: number;
  pageCount?: number;
  /** Use for cursor-backed lists where the total number of pages is unknown. */
  hasNextPage?: boolean;
  disabled?: boolean;
  onPageChange(page: number): void;
}) {
  const cursorMode = pageCount === undefined;
  const canGoBack = page > 1;
  const canGoForward = cursorMode ? Boolean(hasNextPage) : page < pageCount;
  if (!canGoBack && !canGoForward) return null;

  const previousLabel = locale === "vi" ? "Trang trước" : "Previous page";
  const nextLabel = locale === "vi" ? "Trang sau" : "Next page";
  const paginationLabel = locale === "vi" ? "Phân trang" : "Pagination";
  const pageLabel = locale === "vi" ? `Trang ${page}` : `Page ${page}`;

  return <nav className="ui-pagination" aria-label={paginationLabel}>
    <Button
      variant="icon"
      icon={<ChevronLeft />}
      aria-label={previousLabel}
      title={previousLabel}
      disabled={disabled || !canGoBack}
      onClick={() => onPageChange(page - 1)}
    />
    <span className="ui-pagination-status" aria-live="polite">{cursorMode ? pageLabel : `${page} / ${pageCount}`}</span>
    <Button
      variant="icon"
      icon={<ChevronRight />}
      aria-label={nextLabel}
      title={nextLabel}
      disabled={disabled || !canGoForward}
      onClick={() => onPageChange(page + 1)}
    />
  </nav>;
}
