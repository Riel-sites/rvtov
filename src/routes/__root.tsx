import type { ErrorComponentProps } from "@tanstack/react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
  useNavigate,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { reportClientError } from "../lib/monitoring.functions";
import { AuthProvider, useAuth } from "../hooks/useAuth";
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

function ErrorComponent({ error, reset }: ErrorComponentProps) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
    const message =
      error instanceof Response
        ? `Response ${error.status}`
        : error instanceof Error
          ? error.message
          : String(error);
    void reportClientError({
      data: {
        kind: "page_error",
        message: message.slice(0, 500),
        stack: error instanceof Error ? error.stack?.slice(0, 2000) : undefined,
        route: typeof window !== "undefined" ? window.location.pathname : undefined,
      },
    }).catch(() => {});
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          This page didn't load
        </h1>
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
      { title: "Virtual Try-On" },
      { name: "description", content: "Preview clothing on yourself or your chosen subject with AI virtual try-on and artistic styles." },
      { name: "author", content: "Virtual Try-On" },
      { property: "og:title", content: "Virtual Try-On" },
      { property: "og:description", content: "AI clothing previews and artistic styles for everyone imagining a new look." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:site", content: "@VirtualTryOn" },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,400;9..40,500&family=Space+Grotesk:wght@700&display=swap",
      },
      { rel: "icon", href: "/favicon.ico", type: "image/x-icon" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
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

function Header() {
  const { user, isLoading, isBrand, isAdmin, signOut } = useAuth();
  const navigate = useNavigate();

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/80 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <Link to="/" className="flex items-center gap-2 text-lg font-semibold tracking-tight">
          <span className="text-accent">V</span>
          <span className="text-foreground">Try-On</span>
        </Link>

        <nav className="hidden items-center gap-8 text-sm font-medium md:flex">
          <Link to="/" className="text-muted-foreground transition-colors hover:text-foreground">
            Home
          </Link>
          <Link to="/products" className="text-muted-foreground transition-colors hover:text-foreground">
            Catalog
          </Link>
          {isBrand && (
            <Link to="/brand/dashboard" className="text-muted-foreground transition-colors hover:text-foreground">
              Brand Dashboard
            </Link>
          )}
          {isAdmin && (
            <Link to="/admin" className="text-muted-foreground transition-colors hover:text-foreground">
              Admin
            </Link>
          )}
          <Link to="/try-on" className="text-muted-foreground transition-colors hover:text-foreground">
            Try On
          </Link>
          <Link to="/cart" className="text-muted-foreground transition-colors hover:text-foreground">
            Cart
          </Link>
        </nav>

        <div className="flex items-center gap-3">
          {user && !isLoading && (
            <a
              href="/try-on#topup"
              className="inline-flex items-center justify-center rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
            >
              Buy tokens
            </a>
          )}
          {isAdmin && !isLoading && (
            <Link
              to="/admin"
              className="inline-flex items-center justify-center rounded-md border border-border bg-background px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent md:hidden"
            >
              Admin
            </Link>
          )}
          {!isLoading && (
            <>
              {user ? (
                <button
                  onClick={async () => {
                    await signOut();
                    await navigate({ to: "/auth", replace: true });
                  }}
                  className="inline-flex items-center justify-center rounded-md border border-border bg-background px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
                >
                  Sign out
                </button>
              ) : (
                <Link
                  to="/auth"
                  className="inline-flex items-center justify-center rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
                >
                  Sign in
                </Link>
              )}
            </>
          )}
        </div>
      </div>
    </header>
  );
}

function Footer() {
  return (
    <footer className="border-t border-border/40 bg-background py-12">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col items-center justify-between gap-4 md:flex-row">
          <p className="text-sm text-muted-foreground">
            © {new Date().getFullYear()} Virtual Try-On. All rights reserved.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-3 text-sm text-muted-foreground">
            <Link to="/privacy" className="hover:text-foreground">
              Privacy Policy
            </Link>
            <Link to="/terms" className="hover:text-foreground">
              Terms of Service
            </Link>
            <a href="mailto:rielsites@gmail.com" className="hover:text-foreground">Email Support</a>
            <a href="https://wa.me/233209765822" target="_blank" rel="noopener noreferrer" className="hover:text-foreground">WhatsApp Support</a>
          </div>
        </div>
      </div>
    </footer>
  );
}

function useGlobalErrorReporting() {
  useEffect(() => {
    const seen = new Set<string>();
    const report = (message: string, stack?: string) => {
      const key = message.slice(0, 200);
      if (seen.has(key) || seen.size > 20) return;
      seen.add(key);
      void reportClientError({
        data: {
          kind: "client_error",
          message: message.slice(0, 500),
          stack: stack?.slice(0, 2000),
          route: window.location.pathname,
        },
      }).catch(() => {});
    };
    const onError = (event: ErrorEvent) =>
      report(event.message || "Unknown error", event.error instanceof Error ? event.error.stack : undefined);
    const onRejection = (event: PromiseRejectionEvent) => {
      const r = event.reason;
      report(r instanceof Error ? r.message : String(r), r instanceof Error ? r.stack : undefined);
    };
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  useGlobalErrorReporting();

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <div className="flex min-h-screen flex-col">
          <Header />
          <main className="flex-1">
            <Outlet />
          </main>
          <Footer />
        </div>
        <Toaster />
      </AuthProvider>
    </QueryClientProvider>
  );
}
