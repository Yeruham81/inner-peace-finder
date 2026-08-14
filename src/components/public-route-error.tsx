import { Link, useRouter } from "@tanstack/react-router";
import { useEffect } from "react";

import { reportLovableError } from "@/lib/lovable-error-reporting";

type PublicRouteErrorProps = {
  error: Error;
  reset: () => void;
  boundary: string;
  title: string;
  message: string;
};

export function PublicRouteError({
  error,
  reset,
  boundary,
  title,
  message,
}: PublicRouteErrorProps) {
  const router = useRouter();

  useEffect(() => {
    reportLovableError(error, { boundary });
  }, [boundary, error]);

  return (
    <div className="mx-auto max-w-2xl px-4 py-12 text-center text-foreground sm:px-6">
      <h1 className="text-xl font-semibold sm:text-2xl">{title}</h1>
      <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-muted-foreground sm:text-base">
        {message}
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <button
          type="button"
          onClick={() => {
            router.invalidate();
            reset();
          }}
          className="inline-flex min-h-11 items-center justify-center rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 focus-visible:ring-offset-2"
        >
          ניסיון נוסף
        </button>
        <Link
          to="/"
          className="inline-flex min-h-11 items-center justify-center rounded-xl border border-border bg-background px-5 py-2.5 text-sm font-semibold text-foreground transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 focus-visible:ring-offset-2"
        >
          חזרה לדף הבית
        </Link>
      </div>
    </div>
  );
}
