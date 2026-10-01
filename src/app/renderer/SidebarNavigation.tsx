import { useEffect, useState } from "react";
import { ChevronDown, Wrench } from "lucide-react";
import type { AppSettings } from "../../shared/domain/models";
import en from "../../shared/localization/en.json";
import vi from "../../shared/localization/vi.json";
import { otherToolsNavigation, primaryNavigation, settingsNavigation, type NavigableView, type View } from "./navigation";

const expandedKey = "getgo-tools:other-tools-expanded";
const isOtherTool = (view: View) => otherToolsNavigation.some((item) => item.id === view);

function readExpanded(view: View): boolean {
  if (isOtherTool(view)) return true;
  try { return localStorage.getItem(expandedKey) === "true"; }
  catch { return false; }
}

export function SidebarNavigation({ locale, view, collapsed, onExpandSidebar, onNavigate }: {
  locale: AppSettings["locale"];
  view: View;
  collapsed: boolean;
  onExpandSidebar(): void;
  onNavigate(view: NavigableView): void;
}) {
  const copy = locale === "vi" ? vi : en;
  const [expanded, setExpanded] = useState(() => readExpanded(view));
  const otherToolsLabel = locale === "vi" ? "Công cụ khác" : "Other Tools";
  const itemLabel = (item: (typeof primaryNavigation)[number]) => item.id === "topics"
    ? copy.contentV2.nav
    : item.id === "image-pdf"
      ? copy.imagePdf.nav
      : item.id === "screenshots"
        ? copy.screenshotManager.nav
        : item.id === "avatar-sets"
          ? locale === "vi" ? "Bộ ảnh đại diện" : "Avatar sets"
          : item.label;

  useEffect(() => {
    if (isOtherTool(view)) setExpanded(true);
  }, [view]);
  useEffect(() => {
    try { localStorage.setItem(expandedKey, String(expanded)); }
    catch { /* Storage can be unavailable in hardened renderer sessions. */ }
  }, [expanded]);

  const renderItem = (item: (typeof primaryNavigation)[number], nested = false) => {
    const Icon = item.icon;
    const label = itemLabel(item);
    return <button
      key={item.id}
      className={view === item.id ? "active" : ""}
      aria-current={view === item.id ? "page" : undefined}
      aria-label={label}
      title={collapsed && !nested ? label : undefined}
      onClick={() => onNavigate(item.id)}
    >
      <i><Icon size={nested ? 17 : 18} strokeWidth={1.8} /></i>
      <span>{label}</span>
    </button>;
  };

  return <nav className="sidebar-navigation" aria-label={locale === "vi" ? "Điều hướng chính" : "Main navigation"}>
    <div className="sidebar-navigation-group sidebar-navigation-group-0">
      {primaryNavigation.map((item) => renderItem(item))}
    </div>
    <div className="sidebar-navigation-group sidebar-navigation-group-1">
      <button
        type="button"
        className={`sidebar-submenu-trigger ${!expanded && isOtherTool(view) ? "active" : ""}`.trim()}
        aria-expanded={expanded && !collapsed}
        aria-controls="sidebar-other-tools"
        aria-label={otherToolsLabel}
        title={collapsed ? otherToolsLabel : undefined}
        onClick={() => {
          if (collapsed) onExpandSidebar();
          setExpanded((value) => !value || collapsed);
        }}
      >
        <i><Wrench size={18} strokeWidth={1.8} /></i>
        <span>{otherToolsLabel}</span>
        <ChevronDown className={`sidebar-submenu-chevron ${expanded && !collapsed ? "expanded" : ""}`} size={15} aria-hidden="true" />
      </button>
      {expanded && !collapsed && <div id="sidebar-other-tools" className="sidebar-submenu-items">
        {otherToolsNavigation.map((item) => renderItem(item, true))}
      </div>}
    </div>
    <div className="sidebar-navigation-group sidebar-navigation-group-2">
      {settingsNavigation.map((item) => renderItem(item))}
    </div>
  </nav>;
}
