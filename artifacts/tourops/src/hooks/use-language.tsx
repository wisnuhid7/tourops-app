import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { translations, type Language, type TranslationKey } from "./translations";

export type { Language, TranslationKey } from "./translations";

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: TranslationKey) => string;
  /**
   * Localize a dynamic DB field: returns entity.translations[language][field]
   * when available, falling back to the English source value. Works for any
   * entity carrying a `translations` jsonb ({ es: {...}, id: {...} }).
   */
  lt: (entity: any, field: string) => string;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

function getStoredLanguage(): Language {
  if (typeof window === "undefined") return "en";
  // localStorage can throw in sandboxed iframes / privacy mode — guard it.
  try {
    const stored = localStorage.getItem("tourops-language");
    if (stored === "en" || stored === "es" || stored === "id") return stored;
  } catch {
    /* storage unavailable — fall through to browser detection */
  }
  // Auto-detect from browser
  try {
    const browserLang = navigator.language.slice(0, 2);
    if (browserLang === "es") return "es";
    if (browserLang === "id") return "id";
  } catch {
    /* navigator unavailable */
  }
  return "en";
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>(getStoredLanguage);

  const setLanguage = (lang: Language) => {
    // Update React state so every consumer re-renders immediately —
    // no full page reload required.
    setLanguageState(lang);
    try {
      localStorage.setItem("tourops-language", lang);
    } catch {
      /* persistence unavailable (sandboxed iframe / privacy mode) — ignore */
    }
    if (typeof document !== "undefined") {
      document.documentElement.lang = lang;
    }
  };

  useEffect(() => {
    if (typeof document !== "undefined") {
      document.documentElement.lang = language;
    }
  }, [language]);

  const t = (key: TranslationKey): string => {
    return translations[language][key] || translations.en[key] || key;
  };

  const lt = (entity: any, field: string): string => {
    const base = entity?.[field] ?? "";
    if (language === "en") return base;
    const translated = entity?.translations?.[language]?.[field];
    return typeof translated === "string" && translated.trim() ? translated : base;
  };

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t, lt }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error("useLanguage must be used within a LanguageProvider");
  }
  return context;
}
