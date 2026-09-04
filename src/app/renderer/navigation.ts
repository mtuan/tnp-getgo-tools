import { BriefcaseBusiness, CreditCard, Images, LayoutDashboard, Library, MessageSquareWarning, Rocket, Settings, ShieldCheck, UserRoundCog, type LucideIcon } from "lucide-react";
import type { SelectOption } from "../../shared/ui/Select";

export type View = "dashboard" | "topics" | "quizzes" | "feedbacks" | "jobs" | "deploy"
  | "image-pdf" | "avatar-sets" | "payments" | "safe-words" | "settings" | "not-found";
export type NavigableView = Exclude<View, "not-found">;
type NavigationItem = { id: NavigableView; label: string; icon: LucideIcon };

export const primaryNavigation: NavigationItem[] = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "jobs", label: "Jobs", icon: BriefcaseBusiness },
];
export const featureNavigation: NavigationItem[] = [
  { id: "topics", label: "Topics", icon: Library },
  { id: "feedbacks", label: "Feedbacks", icon: MessageSquareWarning },
  { id: "deploy", label: "Deploy", icon: Rocket },
  { id: "image-pdf", label: "Image to PDF", icon: Images },
  { id: "avatar-sets", label: "Avatar sets", icon: UserRoundCog },
  { id: "payments", label: "Payments", icon: CreditCard },
  { id: "safe-words", label: "Safe words", icon: ShieldCheck },
];
export const utilityNavigation: NavigationItem[] = [{ id: "settings", label: "Settings", icon: Settings }];
export const environmentOptions: SelectOption[] = [
  { value: "development", label: "Development" },
  { value: "staging", label: "Staging" },
  { value: "production", label: "Production" },
];
