import { useState, type ReactNode } from "react";

export function Image({
  src,
  alt,
  className = "",
  fit = "cover",
  inset = 0,
  loading = false,
  fallback = null,
}: {
  src?: string | null;
  alt: string;
  className?: string;
  fit?: "contain" | "cover";
  inset?: number;
  loading?: boolean;
  fallback?: ReactNode;
}) {
  const [readySource, setReadySource] = useState<string | null>(null);
  const [failedSource, setFailedSource] = useState<string | null>(null);
  const ready = Boolean(src && readySource === src);
  const failed = Boolean(src && failedSource === src);
  const showSpinner = loading || Boolean(src && !ready && !failed);

  return (
    <span className={`ui-image ${className}`.trim()}>
      {src && !failed && (
        <img
          className="ui-image-element"
          src={src}
          alt={alt}
          style={{ objectFit: fit, padding: inset, visibility: ready ? "visible" : "hidden" }}
          onLoad={() => setReadySource(src)}
          onError={() => setFailedSource(src)}
        />
      )}
      {showSpinner ? (
        <span className="mini-spinner ui-image-spinner" aria-label={`Loading ${alt}`} />
      ) : !src || failed ? (
        <span className="ui-image-fallback">{fallback}</span>
      ) : null}
    </span>
  );
}
