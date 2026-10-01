import { BriefcaseBusiness, Camera, CreditCard, FileDown, Images, Library, MessageSquareWarning, Rocket, Settings, ShieldCheck, UserRoundCog, UsersRound, type LucideIcon } from "lucide-react";
import type { SelectOption } from "../../shared/ui/Select";

export type View = "topics" | "quizzes" | "feedbacks" | "jobs" | "deploy"
  | "amc-import" | "image-pdf" | "screenshots" | "designs" | "avatar-sets" | "payments" | "members" | "safe-words" | "settings" | "not-found";
export type NavigableView = Exclude<View, "not-found">;
type NavigationItem = { id: NavigableView; label: string; icon: LucideIcon };

export const primaryNavigation: NavigationItem[] = [
  { id: "deploy", label: "Deploy", icon: Rocket },
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
