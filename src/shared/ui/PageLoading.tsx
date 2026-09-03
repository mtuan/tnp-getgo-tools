type PageLoadingProps = {
  label: string;
  className?: string;
};

export function PageLoading({ label, className }: PageLoadingProps) {
  return (
    <div
      className={["ui-page-loading", className].filter(Boolean).join(" ")}
      role="status"
      aria-label={label}
    >
      <span className="ui-page-loading-spinner" aria-hidden="true" />
    </div>
  );
}
