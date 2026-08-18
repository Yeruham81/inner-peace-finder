import {
  BadgeCheck,
  CreditCard,
  LayoutDashboard,
  Library,
  MessageSquare,
  Plug,
  Settings,
  UserRoundCheck,
  UsersRound,
  type LucideIcon,
} from "lucide-react";

export type AdminNavItem = {
  to: string;
  label: string;
  icon: LucideIcon;
  exact?: boolean;
};

export const ADMIN_NAV_ITEMS: AdminNavItem[] = [
  { to: "/admin", label: "לוח בקרה", icon: LayoutDashboard, exact: true },
  { to: "/admin/therapists", label: "מטפלים", icon: UsersRound },
  { to: "/admin/credentials", label: "אימות הסמכות", icon: BadgeCheck },
  { to: "/admin/leads", label: "פניות", icon: MessageSquare },
  { to: "/admin/claims", label: "בקשות שיוך", icon: UserRoundCheck },
  { to: "/admin/catalogs", label: "קטלוגים", icon: Library },
  { to: "/admin/integrations", label: "אינטגרציות", icon: Plug },
  { to: "/admin/billing", label: "חיובים", icon: CreditCard },
  { to: "/admin/settings", label: "הגדרות מערכת", icon: Settings },
];