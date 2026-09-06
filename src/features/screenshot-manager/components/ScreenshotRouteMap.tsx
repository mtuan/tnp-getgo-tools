import { ChevronRight, Image as ImageIcon, Route } from "lucide-react";
import * as ui from "../../../shared/ui";
import type { ScreenshotRecord } from "../domain/screenshot-project";

interface RouteNode {
  key: string;
  label: string;
  route: string;
  screenshots: ScreenshotRecord[];
  children: RouteNode[];
}

function routeTree(screenshots: ScreenshotRecord[]): RouteNode[] {
  const root: RouteNode = {
    key: "root",
    label: "/",
    route: "/",
    screenshots: [],
    children: [],
  };
  for (const screenshot of screenshots) {
    const segments = screenshot.route
      .split(/[?#]/)[0]
      .split("/")
      .filter(Boolean);
    let parent = root;
    if (!segments.length) root.screenshots.push(screenshot);
    segments.forEach((segment, index) => {
      const route = `/${segments.slice(0, index + 1).join("/")}`;
      let child = parent.children.find((item) => item.route === route);
      if (!child) {
        child = {
          key: route,
          label: segment,
          route,
          screenshots: [],
          children: [],
        };
        parent.children.push(child);
      }
      parent = child;
      if (index === segments.length - 1) child.screenshots.push(screenshot);
    });
  }
  const sort = (nodes: RouteNode[]) =>
    nodes
      .sort((a, b) => a.route.localeCompare(b.route))
      .forEach((node) => sort(node.children));
  sort(root.children);
  return root.screenshots.length ? [root, ...root.children] : root.children;
}

function MapNode({
  node,
  depth,
  onOpen,
}: {
  node: RouteNode;
  depth: number;
  onOpen(record: ScreenshotRecord): void;
}) {
  return (
    <div className="screenshot-map-branch">
      <div className="screenshot-map-node" style={{ marginLeft: depth * 34 }}>
        <i>
          <Route size={17} />
        </i>
        <div>
          <strong>{node.label}</strong>
          <span>{node.route}</span>
        </div>
        {(node.screenshots.length > 0 || node.children.length > 0) && (
          <small>
            {node.screenshots.length} screens · {node.children.length} branches
          </small>
        )}
      </div>
      {node.screenshots.map((record) => (
        <button
          className="screenshot-map-screen"
          style={{ marginLeft: (depth + 1) * 34 }}
          type="button"
          key={record.id}
          onClick={() => onOpen(record)}
        >
          <ImageIcon size={16} />
          <span>{record.name}</span>
          <ChevronRight size={15} />
        </button>
      ))}
      {node.children.map((child) => (
        <MapNode
          node={child}
          depth={depth + 1}
          onOpen={onOpen}
          key={child.key}
        />
      ))}
    </div>
  );
}

export function ScreenshotRouteMap({
  screenshots,
  emptyTitle,
  emptyDescription,
  onOpen,
}: {
  screenshots: ScreenshotRecord[];
  emptyTitle: string;
  emptyDescription: string;
  onOpen(record: ScreenshotRecord): void;
}) {
  if (!screenshots.length)
    return (
      <div className="screenshot-empty">
        <Route />
        <strong>{emptyTitle}</strong>
        <span>{emptyDescription}</span>
      </div>
    );
  return (
    <ui.Panel className="screenshot-map-panel">
      <ui.PanelBody className="screenshot-map">
        {routeTree(screenshots).map((node) => (
          <MapNode node={node} depth={0} onOpen={onOpen} key={node.key} />
        ))}
      </ui.PanelBody>
    </ui.Panel>
  );
}
