import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { ES } from "./es";

/**
 * Dependency-free i18n, gettext-style: the lookup KEY is the English source
 * string, so `t("Add member")` renders English as-is and Spanish via the ES map,
 * falling back to the English key when a translation is missing. No key registry
 * to keep in sync, and the JSX stays readable.
 *
 * Locale detection defaults to the device/browser's ordered languages, then
 * English. If a user manually chooses EN/ES, that explicit choice persists.
 */
export type Locale = "en" | "es";
const STORAGE_KEY = "lovalte:lang";
const MODE_STORAGE_KEY = "lovalte:lang-mode";

function localeFromNavigator(): Locale {
  if (typeof window === "undefined") return "en";
  const langs = navigator.languages?.length ? navigator.languages : [navigator.language];
  for (const l of langs) if (l && l.toLowerCase().startsWith("es")) return "es";
  return "en";
}

function savedLocale(): Locale | "auto" {
  if (typeof window === "undefined") return "auto";
  const mode = window.localStorage.getItem(MODE_STORAGE_KEY);
  if (mode !== "manual") return "auto";
  const saved = window.localStorage.getItem(STORAGE_KEY);
  return saved === "en" || saved === "es" ? saved : "auto";
}

function detectLocale(): Locale {
  const saved = savedLocale();
  return saved === "auto" ? localeFromNavigator() : saved;
}

type Vars = Record<string, string | number>;

/** Replace {name} placeholders. Unmatched tokens are left intact (visible in dev). */
function interpolate(s: string, vars?: Vars): string {
  if (!vars) return s;
  return s.replace(/\{(\w+)\}/g, (_, k: string) => (k in vars ? String(vars[k]) : `{${k}}`));
}

interface I18n {
  locale: Locale;
  localeMode: Locale | "auto";
  setLocale: (l: Locale) => void;
  setAutoLocale: () => void;
  t: (en: string, vars?: Vars) => string;
}

const Ctx = createContext<I18n | null>(null);

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [localeMode, setLocaleMode] = useState<Locale | "auto">(savedLocale);
  const [locale, setLocaleState] = useState<Locale>(detectLocale);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  useEffect(() => {
    if (localeMode !== "auto") return;
    const syncLocale = () => setLocaleState(localeFromNavigator());
    window.addEventListener("languagechange", syncLocale);
    syncLocale();
    return () => window.removeEventListener("languagechange", syncLocale);
  }, [localeMode]);

  const value = useMemo<I18n>(
    () => ({
      locale,
      localeMode,
      setLocale: (l) => {
        setLocaleMode(l);
        setLocaleState(l);
        try {
          window.localStorage.setItem(MODE_STORAGE_KEY, "manual");
          window.localStorage.setItem(STORAGE_KEY, l);
        } catch {
          /* private mode / storage disabled - language still applies for the session */
        }
      },
      setAutoLocale: () => {
        setLocaleMode("auto");
        setLocaleState(localeFromNavigator());
        try {
          window.localStorage.setItem(MODE_STORAGE_KEY, "auto");
          window.localStorage.removeItem(STORAGE_KEY);
        } catch {
          /* private mode / storage disabled - language still applies for the session */
        }
      },
      t: (en, vars) => interpolate(locale === "es" ? (ES[en] ?? en) : en, vars),
    }),
    [locale, localeMode],
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
