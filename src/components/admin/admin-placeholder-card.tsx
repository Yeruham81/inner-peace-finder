import { Card, CardContent } from "@/components/ui/card";

export function AdminPlaceholderCard({ text }: { text: string }) {
  return (
    <Card className="shadow-card">
      <CardContent className="p-6">
        <p className="text-sm text-muted-foreground">{text}</p>
        <p className="mt-2 text-xs text-muted-foreground">מסך זה יאוכלס בנתונים ובכלי ניהול בשלב הבא.</p>
      </CardContent>
    </Card>
  );
}