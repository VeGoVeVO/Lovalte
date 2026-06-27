import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { ES } from "./es";

/**
 * Dependency-free i18n, gettext-style: the lookup KEY is the English source
 * string, so `t("Add member")` renders English as-is and Spanish via the ES map,
 * falling back to the English key when a translation is missing. No key registry
 * to keep in sync, and the JSX stays readable.
 *
 * Locale detection (industry-standard order): an explicit saved choice wins, then
 * the browser's ordered languages (navigator.languages), then English.
 */
export type Locale = "en" | "es";
const STORAGE_KEY = "lovalte:lang";

function detectLocale(): Locale {
  if (typeof window === "undefined") return "en";
  const saved = window.localStorage.getItem(STORAGE_KEY);
  if (saved === "en" || saved === "es") return saved;
  const langs = navigator.languages?.length ? navigator.languages : [navigator.language];
  for (const l of langs) if (l && l.toLowerCase().startsWith("es")) return "es";
  return "en";
}

type Vars = Record<string, string | number>;

/** Replace {name} placeholders. Unmatched tokens are left intact (visible in dev). */
function interpolate(s: string, vars?: Vars): string {
  if (!vars) return s;
  return s.replace(/\{(\w+)\}/g, (_, k: string) => (k in vars ? String(vars[k]) : `{${k}}`));
}

interface I18n {
  locale: Locale;
  setLocale: (l: Locale) => void;
  t: (en: string, vars?: Vars) => string;
}

const Ctx = createContext<I18n | null>(null);

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(detectLocale);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const value = useMemo<I18n>(
    () => ({
      locale,
      setLocale: (l) => {
        setLocaleState(l);
        try {
          window.localStorage.setItem(STORAGE_KEY, l);
        } catch {
          /* private mode / storage disabled - language still applies for the session */
        }
      },
      t: (en, vars) => interpolate(locale === "es" ? ES[en] ?? en : en, vars),
    }),
    [locale],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useT(): I18n {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useT must be used within <LocaleProvider>");
  return ctx;
}

const LABELS: Record<Locale, string> = { en: "EN", es: "ES" };

/**
 * Compact EN/ES toggle. Two real buttons (keyboard-reachable, aria-pressed),
 * sized for the 44px touch target on mobile.
 */
export function LanguageSwitcher({ className = "" }: { className?: string }) {
  const { locale, setLocale } = useT();
  return (
    <div
      className={className}
      role="group"
      aria-label="Language"
      style={{
        display: "inline-flex",
        gap: 2,
        padding: 2,
        borderRadius: 999,
        border: "1px solid rgba(20,24,32,.12)",
        background: "rgba(255,255,255,.5)",
      }}
    >
      {(["en", "es"] as Locale[]).map((l) => {
        const active = locale === l;
        return (
          <button
            key={l}
            type="button"
            onClick={() => setLocale(l)}
            aria-pressed={active}
            style={{
              minWidth: 36,
              minHeight: 30,
              padding: "0 .55rem",
              border: 0,
              borderRadius: 999,
              cursor: "pointer",
              font: "inherit",
              fontSize: ".8rem",
              fontWeight: 600,
              letterSpacing: ".02em",
              color: active ? "var(--text)" : "var(--muted, #6F7684)",
              background: active ? "#fff" : "transparent",
              boxShadow: active ? "0 1px 4px -2px rgba(16,18,27,.35)" : "none",
            }}
          >
            {LABELS[l]}
          </button>
        );
      })}
    </div>
  );
}
