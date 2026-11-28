import { createContext, useContext, useMemo, type ReactNode } from "react";
import type { AppLanguage } from "../data/types";

export interface I18nValue {
  lang: AppLanguage;
  isEn: boolean;
  /** Returns the Indonesian string when `lang === "id"` or English when `lang === "en"`. */
  tr: (id: string, en: string) => string;
}

const DEFAULT_I18N: I18nValue = {
  lang: "id",
  isEn: false,
  tr: (id) => id,
};

const LanguageContext = createContext<I18nValue>(DEFAULT_I18N);

export function LanguageProvider({
  language,
  children,
}: {
  language: AppLanguage;
  children: ReactNode;
}) {
  const value = useMemo<I18nValue>(
    () => ({
      lang: language,
      isEn: language === "en",
      tr: (id, en) => (language === "en" ? en : id),
    }),
    [language],
  );
  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useI18n(): I18nValue {
  return useContext(LanguageContext);
}
