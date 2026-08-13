import { useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

const BUCKET = "therapist-images";
const MAX_BYTES = 2 * 1024 * 1024; // 2 MB
const ACCEPTED = ["image/jpeg", "image/png", "image/webp"];
const SIGNED_TTL_SECONDS = 60 * 60 * 24 * 365 * 10; // 10 years

function extFromMime(mime: string): string {
  if (mime === "image/png") return "png";
  if (mime === "image/webp") return "webp";
  return "jpg";
}

export function TherapistImageUpload({
  therapistId,
  value,
  onChange,
  gender,
}: {
  therapistId: string | null;
  value: string | null;
  onChange: (url: string | null) => void;
  gender: "male" | "female" | "unspecified" | "" | null;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  async function handleFile(file: File) {
    if (!therapistId) {
      toast.error("יש לשמור טיוטה לפני העלאת תמונה");
      return;
    }
    if (!ACCEPTED.includes(file.type)) {
      toast.error("פורמט לא נתמך. השתמשו ב־JPG, PNG או WEBP");
      return;
    }
    if (file.size > MAX_BYTES) {
      toast.error("הקובץ גדול מדי. גודל מרבי: 2MB");
      return;
    }
    setUploading(true);
    try {
      const path = `${therapistId}/avatar-${Date.now()}.${extFromMime(file.type)}`;
      const up = await supabase.storage.from(BUCKET).upload(path, file, {
        contentType: file.type,
        upsert: true,
      });
      if (up.error) throw up.error;
      const signed = await supabase.storage.from(BUCKET).createSignedUrl(path, SIGNED_TTL_SECONDS);
      if (signed.error || !signed.data?.signedUrl) throw signed.error ?? new Error("signed url failed");
      onChange(signed.data.signedUrl);
      toast.success("התמונה הועלתה — לחצו על שמירה כדי לעדכן את הפרופיל");
    } catch (e) {
      toast.error((e as Error).message || "שגיאה בהעלאת התמונה");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  const showFallbackHint = !value && !!gender;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-3">
        <div className="h-20 w-20 shrink-0 overflow-hidden rounded-full border border-border bg-surface">
          {value ? (
            <img src={value} alt="תמונת פרופיל" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">
              אין תמונה
            </div>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPTED.join(",")}
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void handleFile(f);
            }}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={uploading || !therapistId}
            onClick={() => inputRef.current?.click()}
          >
            {uploading ? "מעלה…" : value ? "החלפת תמונה" : "העלאת תמונה"}
          </Button>
          {value && (
            <Button type="button" variant="ghost" size="sm" disabled={uploading} onClick={() => onChange(null)}>
              הסרה
            </Button>
          )}
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        פורמטים נתמכים: JPG, PNG, WEBP · גודל מרבי: 2MB · שדה אופציונלי
        {!therapistId && " · יש לשמור טיוטה תחילה כדי להעלות תמונה"}
      </p>
      {showFallbackHint && (
        <p className="text-xs text-muted-foreground">אם לא תעלו תמונה, יוצג איור מקצועי לפי המין שסומן.</p>
      )}
    </div>
  );
}
