import * as en from "./languages/en.json";
import * as de from "./languages/de.json";
import * as fr from "./languages/fr.json";
import * as it from "./languages/it.json";
import * as es from "./languages/es.json";
import * as pt from "./languages/pt.json";
import * as nl from "./languages/nl.json";
import * as sv from "./languages/sv.json";
import * as da from "./languages/da.json";
import * as nb from "./languages/nb.json";
import * as fi from "./languages/fi.json";
import * as zh from "./languages/zh.json";
import * as ja from "./languages/ja.json";

/** Single source of truth for bundled languages — ISO-639-1 code,
 *  native-language name, and the imported JSON dict. English is the
 *  canonical fallback. To add a language, drop in the JSON file, import
 *  it above, and append an entry here. */
const LANGUAGE_REGISTRY: ReadonlyArray<{
  code: string;
  nativeName: string;
  dict: Record<string, unknown>;
}> = [
  { code: "en", nativeName: "English", dict: en },
  { code: "de", nativeName: "Deutsch", dict: de },
  { code: "fr", nativeName: "Français", dict: fr },
  { code: "it", nativeName: "Italiano", dict: it },
  { code: "es", nativeName: "Español", dict: es },
  { code: "pt", nativeName: "Português", dict: pt },
  { code: "nl", nativeName: "Nederlands", dict: nl },
  { code: "sv", nativeName: "Svenska", dict: sv },
  { code: "da", nativeName: "Dansk", dict: da },
  { code: "nb", nativeName: "Norsk bokmål", dict: nb },
  { code: "fi", nativeName: "Suomi", dict: fi },
  { code: "zh", nativeName: "简体中文", dict: zh },
  { code: "ja", nativeName: "日本語", dict: ja },
];

/** Codes that read another bundled language better than English: plain
 *  "no" and Nynorsk get Bokmål. */
const ALIASES: Readonly<Record<string, string>> = { no: "nb", nn: "nb" };

/** Code → dict lookup. English is the canonical fallback for missing
 *  dicts and missing keys (see resolveTranslation usage below). */
const languages: Record<string, Record<string, unknown>> = Object.fromEntries(
  LANGUAGE_REGISTRY.map((l) => [l.code, l.dict]),
);

function resolveTranslation(path: string, dictionary: Record<string, unknown>): string | undefined {
  const value = path.split(".").reduce<unknown>((acc, key) => {
    if (acc && typeof acc === "object" && key in (acc as Record<string, unknown>)) {
      return (acc as Record<string, unknown>)[key];
    }
    return undefined;
  }, dictionary);
  return typeof value === "string" ? value : undefined;
}

/** The bundled language for a BCP-47 tag: region and script dropped,
 *  aliases applied. "zh-Hant" → "zh", "nn-NO" → "nb". */
function baseLanguage(lang: string | undefined): string {
  const code = (lang ?? "en").toLowerCase().split(/[-_]/)[0] || "en";
  return ALIASES[code] ?? code;
}

/** Translate a dot-path key. Pass `hass.locale?.language` (or
 *  `navigator.language` at module-init time, before hass is available)
 *  as `lang`. Optional `vars` does `{name}` substitution. */
export function localize(
  key: string,
  lang?: string,
  vars?: Record<string, string | number>,
): string {
  const code = baseLanguage(lang);

  const dict = languages[code] ?? languages.en ?? {};
  const enDict = languages.en ?? {};
  let translated = resolveTranslation(key, dict);
  if (translated === undefined) translated = resolveTranslation(key, enDict);
  if (translated === undefined) translated = key;

  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      // Function form so `$&`/`$1`/`$<name>` in the substitution value
      // are NOT interpreted as replacement patterns — a todo value
      // like "Pay $50 to $&" must render literally, not as the matched
      // `{value}` placeholder.
      const replacement = String(v);
      translated = translated.replace(new RegExp(`\\{${k}\\}`, "g"), () => replacement);
    }
  }
  return translated;
}

/** Resolve UI language: `hass.locale.language` → `hass.language` →
 *  `navigator.language` → `"en"`. */
export function resolveLang(
  hass: { locale?: { language?: string }; language?: string } | undefined | null,
): string {
  return (
    hass?.locale?.language ??
    hass?.language ??
    (typeof navigator !== "undefined" ? navigator.language : "en")
  );
}
