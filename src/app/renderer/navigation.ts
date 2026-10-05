import { BriefcaseBusiness, Camera, CreditCard, FileDown, Images, Library, MessageSquareWarning, Settings, ShieldCheck, UserRoundCog, UsersRound, type LucideIcon } from "lucide-react";
import type { AppSettings } from "../../shared/domain/models";
import type { SelectOption } from "../../shared/ui/Select";

export type View = "topics" | "quizzes" | "feedbacks" | "jobs" | "deploy"
  | "amc-import" | "image-pdf" | "screenshots" | "designs" | "avatar-sets" | "payments" | "members" | "safe-words" | "settings" | "not-found";
export type NavigableView = Exclude<View, "not-found">;
type NavigationItem = { id: NavigableView; label: string; icon: LucideIcon };

export const primaryNavigation: NavigationItem[] = [
  { id: "jobs", label: "Jobs", icon: BriefcaseBusiness },
  { id: "topics", label: "Topics", icon: Library },
  { id: "feedbacks", label: "Feedbacks", icon: MessageSquareWarning },
];
export const otherToolsNavigation: NavigationItem[] = [
  { id: "amc-import", label: "AMC importer", icon: FileDown },
  { id: "image-pdf", label: "Image to PDF", icon: Images },
  { id: "screenshots", label: "Screenshots", icon: Camera },
  { id: "avatar-sets", label: "Avatar sets", icon: UserRoundCog },
  { id: "payments", label: "Payments", icon: CreditCard },
  { id: "members", label: "Members", icon: UsersRound },
  { id: "safe-words", label: "Safe words", icon: ShieldCheck },
];
export const settingsNavigation: NavigationItem[] = [{ id: "settings", label: "Settings", icon: Settings }];
export const environmentOptions: SelectOption[] = [
  { value: "development", label: "Development" },
  { value: "staging", label: "Staging" },
  { value: "production", label: "Production" },
];

export const deploymentTargets = ["development", "staging", "production"] as const satisfies readonly AppSettings["environment"][];

export function deploymentTargetFromRoute(route: string): AppSettings["environment"] | null {
  let pathname: string;
  try { pathname = new URL(route, "app://getgo").pathname; }
  catch { pathname = route.split("?")[0]; }
  const target = pathname.match(/^\/deploy\/(development|staging|production)\/?$/)?.[1];
  return target && deploymentTargets.includes(target as AppSettings["environment"])
    ? target as AppSettings["environment"]
    : null;
}
