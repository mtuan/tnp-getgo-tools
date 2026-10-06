import { useEffect, useRef, useState } from "react";
import type { ManagerPage, QuizManagerApi } from "./shared";

type Toast = {
  show(input: { title: string; description: string; variant: "error" }): void;
};

export function useTopicsOverviewRefresh(
  pageKind: ManagerPage["kind"],
  routeMode: "legacy" | "topics",
  loadTopicsOverview: QuizManagerApi["loadTopicsOverview"],
  toast: Toast,
  errorTitle: string,
): boolean {
  const previousPageKindRef = useRef(pageKind);
  const loaderRef = useRef(loadTopicsOverview);
  const toastRef = useRef(toast);
  const errorTitleRef = useRef(errorTitle);
  const [loading, setLoading] = useState(false);

  loaderRef.current = loadTopicsOverview;
  toastRef.current = toast;
  errorTitleRef.current = errorTitle;

  useEffect(() => {
    const previousPageKind = previousPageKindRef.current;
    previousPageKindRef.current = pageKind;
    const loader = loaderRef.current;
    if (
      routeMode !== "topics" ||
      pageKind !== "contests" ||
      previousPageKind === "contests" ||
      !loader
    ) return;

    let active = true;
    setLoading(true);
    void loader()
      .catch((cause) => {
        if (active) toastRef.current.show({
          title: errorTitleRef.current,
          description: cause instanceof Error ? cause.message : String(cause),
          variant: "error",
        });
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [pageKind, routeMode]);

  return loading;
}
