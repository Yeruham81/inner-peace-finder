import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Outlet, Link, createRootRouteWithContext, useRouter, HeadContent, Scripts } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { AnalyticsDebugPanel } from "@/components/analytics-debug-panel";
import { supabase } from "@/integrations/supabase/client";
import { Toaster } from "@/components/ui/sonner";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">This page didn't load</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. You can try refreshing or head back home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "מטפלים — מציאת מטפל לחרדה לפי בעיה" },
      {
        name: "description",
        content:
          "פלטפורמה למציאת מטפלים בחרדה לפי סימפטומים ובעיות רגשיות בעברית. חפשו לפי תחושה, קבלו מטפלים מתאימים.",
      },
      { property: "og:title", content: "מטפלים — מציאת מטפל לחרדה לפי בעיה" },
      {
        property: "og:description",
        content: "חיפוש מטפלים בעברית לפי בעיה, עיר, אוכלוסייה ושפה.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
      {
        rel: "preconnect",
        href: "https://fonts.googleapis.com",
      },
      {
        rel: "preconnect",
        href: "https://fonts.gstatic.com",
        crossOrigin: "anonymous",
      },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Heebo:wght@400;500;600;700;800&display=swap",
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="he" dir="rtl">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  return (
    <QueryClientProvider client={queryClient}>
      <SiteHeader />
      <main className="min-h-[calc(100vh-4rem)]">
        <Outlet />
      </main>
      <SiteFooter />
      <AnalyticsDebugPanel />
      <Toaster />
    </QueryClientProvider>
  );
}

const navBaseClass = "rounded-md px-3 py-2 transition-colors hover:bg-secondary hover:text-foreground";
const navActiveClass = "font-semibold text-foreground bg-secondary";
const navInactiveClass = "text-muted-foreground";

function SiteHeader() {
  const [signedIn, setSignedIn] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSignedIn(!!data.session);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" || event === "SIGNED_OUT" || event === "USER_UPDATED") {
        setSignedIn(!!session);
      }
    });

    return () => {
      sub.subscription.unsubscribe();
    };
  }, []);

  const mobileNavLinkClass = `${navBaseClass} flex min-w-0 items-center justify-center px-0.5 py-2 text-center leading-[1.15] sm:shrink-0 sm:px-3 sm:leading-normal`;

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-surface-elevated/85 backdrop-blur">
      <div className="mx-auto flex min-h-16 max-w-6xl flex-nowrap items-center gap-1 px-2 sm:gap-2 sm:px-6">
        <Link
          to="/"
          aria-label="Tipulinks — עמוד הבית"
          className="flex shrink-0 flex-col items-center justify-center gap-1 sm:flex-row sm:gap-2"
        >
          <span className="grid h-9 w-9 place-items-center rounded-full bg-brand text-base font-bold text-brand-foreground sm:text-lg">
            T
          </span>

          <span className="text-[11px] font-bold uppercase leading-none tracking-[0.08em] text-foreground sm:hidden">
            TIPULINKS
          </span>

          <span className="hidden text-lg font-semibold tracking-tight text-foreground sm:inline">Tipulinks</span>
        </Link>

        <nav
          aria-label="ניווט ראשי"
          className="grid min-w-0 flex-1 grid-cols-4 items-stretch gap-0 text-sm sm:flex sm:items-center sm:justify-end sm:gap-1"
        >
          <Link
            to="/"
            activeOptions={{ exact: true }}
            activeProps={{ className: navActiveClass }}
            inactiveProps={{ className: navInactiveClass }}
            className={mobileNavLinkClass}
          >
            <span className="whitespace-nowrap">בית</span>
          </Link>

          <Link
            to="/therapy-information"
            aria-label="תחומי טיפול"
            activeProps={{ className: navActiveClass }}
            inactiveProps={{ className: navInactiveClass }}
            className={mobileNavLinkClass}
          >
            <span className="flex flex-col items-center sm:hidden">
              <span>תחומי</span>
              <span>טיפול</span>
            </span>

            <span className="hidden whitespace-nowrap sm:inline">תחומי טיפול</span>
          </Link>

          <Link
            to="/for-therapists"
            aria-label="מידע למטפלים"
            activeProps={{ className: navActiveClass }}
            inactiveProps={{ className: navInactiveClass }}
            className={mobileNavLinkClass}
          >
            <span className="flex flex-col items-center sm:hidden">
              <span>מידע</span>
              <span>למטפלים</span>
            </span>

            <span className="hidden whitespace-nowrap sm:inline">מידע למטפלים</span>
          </Link>

          {signedIn ? (
            <Link
              to="/account"
              aria-label="החשבון שלי"
              activeProps={{ className: navActiveClass }}
              inactiveProps={{ className: "font-medium text-foreground" }}
              className={mobileNavLinkClass}
            >
              <span className="flex flex-col items-center sm:hidden">
                <span>החשבון</span>
                <span>שלי</span>
              </span>

              <span className="hidden whitespace-nowrap sm:inline">החשבון שלי</span>
            </Link>
          ) : (
            <Link
              to="/auth"
              search={{ mode: "signin" as const }}
              aria-label="החשבון שלי"
              activeProps={{ className: navActiveClass }}
              inactiveProps={{ className: "font-medium text-brand" }}
              className={mobileNavLinkClass}
            >
              <span className="flex flex-col items-center sm:hidden">
                <span>החשבון</span>
                <span>שלי</span>
              </span>

              <span className="hidden whitespace-nowrap sm:inline">החשבון שלי</span>
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
}
function SiteFooter() {
  return (
    <footer className="border-t border-border bg-surface">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 py-10 text-sm text-muted-foreground">
        <p>
          © {new Date().getFullYear()} Tipulinks — האתר מסייע במציאת אנשי מקצוע ומטפלים ואינו מהווה תחליף לייעוץ מקצועי
        </p>
      </div>
    </footer>
  );
}
