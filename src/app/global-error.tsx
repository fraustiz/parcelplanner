"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect, useState } from "react";
import { detectLocale, t, type Locale } from "@/i18n";
import "./globals.css";

/**
 * Replaces the root layout, so neither the store nor ThemeScript has run: the
 * saved theme and language are read straight from storage. The keys match
 * THEME_KEY and LOCALE_KEY in src/store/editor.ts, not imported in case it is
 * what failed.
 */
function savedPreferences(): { theme: "dark" | "light"; locale: Locale } {
  let theme: "dark" | "light" = window.matchMedia?.("(prefers-color-scheme: light)").matches ? "light" : "dark";
  let locale = detectLocale(navigator.languages ?? [navigator.language]);
  try {
    const savedTheme = window.localStorage.getItem("parcelplanner.theme");
    if (savedTheme === "light" || savedTheme === "dark") theme = savedTheme;
    const savedLocale = window.localStorage.getItem("parcelplanner.locale");
    if (savedLocale === "en" || savedLocale === "fr") locale = savedLocale;
  } catch {
    // Private browsing can throw on storage; the defaults above stand.
  }
  return { theme, locale };
}

export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string };
}) {
  const [{ theme, locale }, setPreferences] = useState<{ theme: "dark" | "light"; locale: Locale }>(
    { theme: "dark", locale: "en" },
  );

  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  useEffect(() => {
    setPreferences(savedPreferences());
  }, []);

  return (
    <html lang={locale} data-theme={theme} suppressHydrationWarning>
      <body>
        <main className="flex min-h-full items-center justify-center p-4">
          <div className="w-full max-w-md rounded-lg border border-[var(--raised)] bg-[var(--panel)] p-4 text-sm">
            <h1 className="mb-2 font-medium text-[var(--text-strong)]">{t(locale, "error.title")}</h1>
            <p className="mb-4 leading-relaxed text-[var(--text-muted)]">{t(locale, "error.body")}</p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="rounded border border-transparent bg-[var(--tint-accent)] px-3 py-1.5 text-[var(--accent)] hover:border-[var(--accent)] active:translate-y-px active:bg-[var(--tint-warm)]"
            >
              {t(locale, "error.reload")}
            </button>
          </div>
        </main>
      </body>
    </html>
  );
}
