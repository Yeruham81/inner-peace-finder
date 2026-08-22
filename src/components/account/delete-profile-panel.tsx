import { Trash2 } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

export function DeleteProfilePanel({
  pending,
  onConfirm,
}: {
  pending: boolean;
  onConfirm: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const phrase = "מחיקת הפרופיל לצמיתות";

  function close(nextOpen: boolean) {
    setOpen(nextOpen);
    if (!nextOpen && !pending) {
      setAcknowledged(false);
      setConfirmation("");
    }
  }

  return (
    <section className="mt-8 rounded-2xl border border-destructive/25 bg-surface-elevated shadow-card">
      <details className="group">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-4 text-sm font-medium text-muted-foreground marker:content-none sm:px-5">
          <span className="flex items-center gap-2">
            <Trash2 className="h-4 w-4 text-destructive" />
            <span>אפשרויות מחיקת הפרופיל</span>
          </span>
          <span className="text-xs group-open:hidden">הצגה</span>
          <span className="hidden text-xs group-open:inline">הסתרה</span>
        </summary>

        <div className="border-t border-destructive/20 px-4 py-4 sm:px-5 sm:py-5">
          <h2 className="text-lg font-semibold text-destructive">מחיקת הפרופיל לצמיתות</h2>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted-foreground">
            המחיקה תסיר לצמיתות את הפרופיל, המסמכים, המיקומים וכל המידע המקצועי שנשמר בו. חשבון
            ההתחברות יישאר פעיל, ותוכלו ליצור באמצעותו פרופיל חדש בעתיד.
          </p>
          <Button
            type="button"
            variant="destructive"
            className="mt-4"
            onClick={() => setOpen(true)}
          >
            מחיקת הפרופיל
          </Button>
        </div>
      </details>

      <Dialog open={open} onOpenChange={close}>
        <DialogContent dir="rtl" className="max-w-lg">
          <DialogHeader>
            <DialogTitle>אישור מחיקת הפרופיל</DialogTitle>
            <DialogDescription>
              לאחר המחיקה לא תהיה אפשרות לשחזר את הפרופיל הקיים.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <label className="flex items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-3">
              <Checkbox
                checked={acknowledged}
                onCheckedChange={(value) => setAcknowledged(value === true)}
              />
              <span className="text-sm text-foreground">
                ברור לי שהמחיקה היא לצמיתות ולא ניתן לשחזר את הפרופיל.
              </span>
            </label>
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-foreground">
                כדי לאשר, הקלידו: {phrase}
              </span>
              <Input
                value={confirmation}
                onChange={(event) => setConfirmation(event.target.value)}
                autoComplete="off"
              />
            </label>
            <div className="flex flex-col-reverse gap-2 sm:flex-row">
              <Button
                type="button"
                variant="outline"
                disabled={pending}
                onClick={() => close(false)}
              >
                ביטול
              </Button>
              <Button
                type="button"
                variant="destructive"
                disabled={pending || !acknowledged || confirmation !== phrase}
                onClick={onConfirm}
              >
                {pending ? "הפרופיל נמחק…" : "כן, מחיקת הפרופיל לצמיתות"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}
