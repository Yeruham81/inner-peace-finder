import {
  BadgeCheck,
  CreditCard,
  LayoutDashboard,
  Library,
  LifeBuoy,
  MessageSquare,
  MailPlus,
  Megaphone,
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
  { to: "/admin/recruitment", label: "הזמנות מטפלים", icon: MailPlus },
  { to: "/admin/support", label: "פניות לצוות", icon: LifeBuoy },
  { to: "/admin/catalogs", label: "קטלוגים", icon: Library },
  { to: "/admin/integrations", label: "אינטגרציות", icon: Plug },
  { to: "/admin/billing", label: "חיובים", icon: CreditCard },
  { to: "/admin/broadcasts", label: "הודעות ועדכונים", icon: Megaphone },
  { to: "/admin/settings", label: "הגדרות מערכת", icon: Settings },
];
