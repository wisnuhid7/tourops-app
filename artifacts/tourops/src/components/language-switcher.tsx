import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useLanguage, LANGUAGE_LABELS, LANGUAGE_FLAGS, type Language } from "@/hooks/use-language";
import { Globe } from "lucide-react";

const LANGUAGES: Language[] = ["en", "es", "id"];

export function LanguageSwitcher({ variant = "dropdown" }: { variant?: "dropdown" | "buttons" }) {
  const { language, setLanguage } = useLanguage();

  if (variant === "buttons") {
    return (
      <div className="flex gap-1">
        {LANGUAGES.map((lang) => (
          <Button
            key={lang}
            variant={language === lang ? "default" : "ghost"}
            size="sm"
            className="h-6 text-[10px] px-2 font-bold"
            onClick={() => setLanguage(lang)}
          >
            {lang.toUpperCase()}
          </Button>
        ))}
      </div>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="h-8 gap-1.5 px-2">
          <Globe className="h-4 w-4" />
          <span className="text-xs font-medium">{LANGUAGE_FLAGS[language]} {language.toUpperCase()}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[140px]">
        {LANGUAGES.map((lang) => (
          <DropdownMenuItem
            key={lang}
            onClick={() => setLanguage(lang)}
            className={language === lang ? "bg-primary/10 font-medium" : ""}
          >
            <span className="mr-2">{LANGUAGE_FLAGS[lang]}</span>
            {LANGUAGE_LABELS[lang]}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
