import {
  BadgeCheck,
  CreditCard,
  LayoutDashboard,
  MessageSquareText,
  Settings,
  UserRoundPen,
  type LucideIcon,
} from "lucide-react";

export type AccountNavItem = {
  to: string;
  label: string;
  description: string;
  icon: LucideIcon;
  exact?: boolean;
};

export const ACCOUNT_NAV_ITEMS: AccountNavItem[] = [
  {
    to: "/account",
    label: "סקירה",
    description: "ביצועי הפרופיל במבט אחד",
    icon: LayoutDashboard,
    exact: true,
  },
  {
    to: "/account/profile",
    label: "הפרופיל שלי",
    description: "עריכה, תצוגה מקדימה ופרסום",
    icon: UserRoundPen,
  },
  {
    to: "/account/leads",
    label: "פניות",
    description: "פניות שהתקבלו דרך טיפולינקס",
    icon: MessageSquareText,
  },
  {
    to: "/account/billing",
    label: "חיובים",
    description: "חיובים, זיכויים והיסטוריה",
    icon: CreditCard,
  },
  {
    to: "/account/credentials",
    label: "אימות והסמכות",
    description: "מסמכים וסטטוס אימות מקצועי",
    icon: BadgeCheck,
  },
  {
    to: "/account/settings",
    label: "הגדרות",
    description: "חשבון, התראות והעדפות",
    icon: Settings,
  },
];
