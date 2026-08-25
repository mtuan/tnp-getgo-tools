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
  onPageChange,
}: {
  locale: "en" | "vi";
  page: number;
  pageCount: number;
  onPageChange(page: number): void;
}) {
  if (pageCount <= 1) return null;

  const previousLabel = locale === "vi" ? "Trang trước" : "Previous page";
  const nextLabel = locale === "vi" ? "Trang sau" : "Next page";
  const paginationLabel = locale === "vi" ? "Phân trang" : "Pagination";

  return <nav className="ui-pagination" aria-label={paginationLabel}>
    <Button
      variant="icon"
      icon={<ChevronLeft />}
      aria-label={previousLabel}
      title={previousLabel}
      disabled={page === 1}
      onClick={() => onPageChange(page - 1)}
    />
    <span className="ui-pagination-status" aria-live="polite">{page} / {pageCount}</span>
    <Button
      variant="icon"
      icon={<ChevronRight />}
      aria-label={nextLabel}
      title={nextLabel}
      disabled={page === pageCount}
      onClick={() => onPageChange(page + 1)}
    />
  </nav>;
}
