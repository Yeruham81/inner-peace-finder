import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type Tone = "positive" | "pending" | "negative" | "neutral";

const TONE_CLASS: Record<Tone, string> = {
  positive: "border-transparent bg-emerald-100 text-emerald-900",
  pending: "border-transparent bg-amber-100 text-amber-900",
  negative: "border-transparent bg-rose-100 text-rose-900",
  neutral: "border-border bg-secondary text-foreground",
};

const STATUS_TONES: Record<string, Tone> = {
  // profile / account
  פורסם: "positive",
  פעיל: "positive",
  טיוטה: "neutral",
  ממתין: "pending",
  "מוכן לפרסום": "pending",
  "ממתין ללקיחת בעלות": "pending",
  "בבעלות המטפל": "positive",
  "נוצר ע״י Tipulinks": "neutral",
  "נוצר ע״י המטפל": "neutral",
  "ממתין למחיקה": "negative",
  מוקפא: "negative",
  // verification / credentials
  מאומת: "positive",
  "ממתין לאימות": "pending",
  "ללא אימות": "neutral",
  "ממתין לבדיקה": "pending",
  "ממתין לשליחה": "pending",
  "הזמנה נשלחה": "pending",
  "בעלות התקבלה": "positive",
  "שליחה נכשלה": "negative",
  "הזמנה פגה": "neutral",
  "הזמנה בוטלה": "neutral",
  נדחה: "negative",
  "פג תוקף": "neutral",
  // leads
  נוצרה: "neutral",
  נמסרה: "pending",
  נענתה: "positive",
  נכשלה: "negative",
  חדשה: "pending",
  בטיפול: "pending",
  נפתרה: "positive",
  נסגרה: "neutral",
  טופלה: "positive",
  בארכיון: "neutral",
  // claims / billing
  אושר: "positive",
  שולם: "positive",
  נכשל: "negative",
  הופקה: "positive",
  // catalogs / integrations
  "לא פעיל": "neutral",
  "טרם חובר": "pending",
  תקין: "positive",
  אזהרה: "pending",
  שגיאה: "negative",
  מתוכנן: "neutral",
  "לא נבדק": "neutral",
  מתוזמנת: "pending",
  בתהליך: "pending",
  נשלחה: "positive",
  "נשלחה חלקית": "pending",
  בוטלה: "neutral",
  // admin task urgency
  דחוף: "negative",
  לבדיקה: "neutral",
};

export function AdminStatusBadge({ status, className }: { status: string; className?: string }) {
  const tone = STATUS_TONES[status] ?? "neutral";
  return (
    <Badge variant="outline" className={cn("whitespace-nowrap text-[11px] font-medium", TONE_CLASS[tone], className)}>
      {status}
    </Badge>
  );
}
