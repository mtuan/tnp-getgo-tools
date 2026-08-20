import { useState } from "react";

export type TopicsView = "list" | "tree";

export function useTopicsView() {
  return useState<TopicsView>(() => {
    try {
      return localStorage.getItem("getgo-tools.topics-view") === "tree"
        ? "tree"
        : "list";
    } catch {
      return "list";
    }
  });
}
