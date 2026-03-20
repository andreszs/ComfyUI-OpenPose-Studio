// js/modules/i18n.js
//
// i18n core – fetches flat JSON dictionaries from the server at runtime.
// - Async initialization: fetch() from /openpose/locales/<lang>/ui.json
// - Browser language auto-detection via navigator.languages
// - Manual override persisted in localStorage
// - Strong fallback to English
// - Change listeners so UI can refresh when language changes
//
// Add a new language:
// 1) Create locales/<lang>/ui.json with all keys
// 2) Add it to AVAILABLE_LANGS below

const DEFAULT_LANG = "en";
const STORAGE_KEY_LANG = "openpose_editor_lang"; // language code
const STORAGE_KEY_SOURCE = "openpose_editor_lang_source"; // "auto" | "manual"

const AVAILABLE_LANGS = [
  { code: "en", label: "English" },
  { code: "es", label: "Español" },
  { code: "zh", label: "中文（简体）" },
  { code: "zh-TW", label: "中文（繁體）" },
  { code: "ja", label: "日本語" },
  { code: "ko", label: "한국어" },
];

const LANG_CODES = AVAILABLE_LANGS.map((l) => l.code);

const BASE_URL = "/openpose/locales";

let currentLang = DEFAULT_LANG;
let langSource = "auto"; // "auto" | "manual"
let currentDict = {};
let fallbackEnDict = {};
const dictCache = new Map();
const listeners = new Set();
let _initPromise = null;

function safeGet(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function safeSet(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {}
}

function normalizeTag(tag) {
  if (!tag || typeof tag !== "string") return "";
  const t = tag.trim().replace(/_/g, "-");
  const parts = t.split("-").filter(Boolean);
  if (parts.length === 0) return "";

  // language is always lowercase
  parts[0] = parts[0].toLowerCase();

  // region is uppercase if 2-3 letters (CN, TW, AR, US, etc.)
  if (parts.length >= 2) {
    if (/^[a-zA-Z]{2,3}$/.test(parts[1])) parts[1] = parts[1].toUpperCase();
    // script is TitleCase if 4 letters (Hans, Hant)
    else if (/^[a-zA-Z]{4}$/.test(parts[1]))
      parts[1] = parts[1][0].toUpperCase() + parts[1].slice(1).toLowerCase();
    else parts[1] = parts[1];
  }

  return parts.join("-");
}

function pickBestLanguage(availableLangs, navigatorLanguages) {
  // Matching strategy (ComfyUI-aligned: zh = Simplified, zh-TW = Traditional):
  // 1) Exact match (e.g. "zh-TW", "es", "ko")
  // 2) Chinese-friendly mapping:
  //    - zh-TW / zh-HK / zh-MO / zh-Hant → zh-TW (Traditional)
  //    - zh-CN / zh-SG / zh-MY / zh-Hans → zh    (Simplified)
  //    - bare "zh" → zh (Simplified)
  // 3) Base language match (e.g. "es" for "es-AR", "ko" for "ko-KR")
  // 4) Fallback to DEFAULT_LANG

  const available = new Set(
    Array.isArray(availableLangs) ? availableLangs : [],
  );
  const nav = Array.isArray(navigatorLanguages) ? navigatorLanguages : [];

  const has = (code) => available.has(code);

  // Traditional Chinese regions/scripts
  const ZH_TRADITIONAL = new Set(["TW", "HK", "MO", "Hant"]);
  // Simplified Chinese regions/scripts
  const ZH_SIMPLIFIED = new Set(["CN", "SG", "MY", "Hans"]);

  const pickChineseVariant = (tag) => {
    const parts = tag.split("-");
    const subtag = parts[1] || "";

    // Check script/region subtag
    if (ZH_TRADITIONAL.has(subtag)) return has("zh-TW") ? "zh-TW" : has("zh") ? "zh" : null;
    if (ZH_SIMPLIFIED.has(subtag)) return has("zh") ? "zh" : has("zh-TW") ? "zh-TW" : null;

    // Bare "zh" or unknown subtag → prefer Simplified (zh)
    return has("zh") ? "zh" : has("zh-TW") ? "zh-TW" : null;
  };

  for (const raw of nav) {
    const tag = normalizeTag(raw);
    if (!tag) continue;

    // 1) exact match
    if (has(tag)) return tag;

    const base = tag.split("-")[0];

    // 2) Chinese handling
    if (base === "zh") {
      const chosen = pickChineseVariant(tag);
      if (chosen) return chosen;
      continue;
    }

    // 3) base match (e.g. "es" for "es-AR", "ko" for "ko-KR")
    if (has(base)) return base;
  }

  return DEFAULT_LANG;
}

// ---------------------------------------------------------------------------
// Dictionary loader with caching
// ---------------------------------------------------------------------------
async function loadDict(lang) {
  if (dictCache.has(lang)) return dictCache.get(lang);

  const url = `${BASE_URL}/${lang}/ui.json?v=${Date.now()}`;
  try {
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const dict = await resp.json();
    dictCache.set(lang, dict);
    return dict;
  } catch (err) {
    console.warn(`[i18n] Failed to load ${url}:`, err.message);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Async initialization (deduplicated – safe to call multiple times)
// ---------------------------------------------------------------------------
export async function initI18n() {
  if (_initPromise) return _initPromise;
  _initPromise = _doInit();
  return _initPromise;
}

async function _doInit() {
  // Always load English fallback first
  fallbackEnDict = (await loadDict(DEFAULT_LANG)) || {};

  // Determine language
  const storedLang = normalizeTag(safeGet(STORAGE_KEY_LANG));
  const storedSource = safeGet(STORAGE_KEY_SOURCE);

  if (
    storedLang &&
    LANG_CODES.includes(storedLang) &&
    storedSource === "manual"
  ) {
    currentLang = storedLang;
    langSource = "manual";
  } else {
    const navLangs =
      typeof navigator !== "undefined" && navigator.languages
        ? navigator.languages
        : [];
    currentLang = pickBestLanguage(LANG_CODES, navLangs);
    langSource = "auto";
    safeSet(STORAGE_KEY_LANG, currentLang);
    safeSet(STORAGE_KEY_SOURCE, "auto");
  }

  // Load the current language dict
  if (currentLang !== DEFAULT_LANG) {
    currentDict = (await loadDict(currentLang)) || {};
  } else {
    currentDict = fallbackEnDict;
  }

  // Diagnostics
  const fetchUrl = `${BASE_URL}/${currentLang}/ui.json`;
  const loaded = Object.keys(currentDict).length > 0;
  window.__openpose_i18n_debug = { lang: currentLang, url: fetchUrl, loaded };

  return currentLang;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------
export function getLang() {
  return currentLang;
}

export function getLangSource() {
  return langSource;
}

export function getAvailableLanguages() {
  return AVAILABLE_LANGS.map(({ code, label }) => ({ code, label }));
}

export async function setLangManual(lang) {
  const normalized = normalizeTag(lang);
  const next = LANG_CODES.includes(normalized) ? normalized : DEFAULT_LANG;
  if (next === currentLang && langSource === "manual") return;

  currentLang = next;
  langSource = "manual";
  safeSet(STORAGE_KEY_LANG, currentLang);
  safeSet(STORAGE_KEY_SOURCE, "manual");

  if (currentLang !== DEFAULT_LANG) {
    currentDict = (await loadDict(currentLang)) || {};
  } else {
    currentDict = fallbackEnDict;
  }

  for (const fn of listeners) {
    try {
      fn(currentLang);
    } catch {}
  }
}

export async function setLangAuto() {
  const navLangs =
    typeof navigator !== "undefined" && navigator.languages
      ? navigator.languages
      : [];
  const next = pickBestLanguage(LANG_CODES, navLangs);

  currentLang = next;
  langSource = "auto";
  safeSet(STORAGE_KEY_LANG, currentLang);
  safeSet(STORAGE_KEY_SOURCE, "auto");

  if (currentLang !== DEFAULT_LANG) {
    currentDict = (await loadDict(currentLang)) || {};
  } else {
    currentDict = fallbackEnDict;
  }

  for (const fn of listeners) {
    try {
      fn(currentLang);
    } catch {}
  }
}

export function onLangChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function formatParams(str, params) {
  if (!params) return str;
  return str.replace(/\{(\w+)\}/g, (_, k) => {
    const v = params[k];
    return v === 0 || v ? String(v) : `{${k}}`;
  });
}

export function t(key, params) {
  const value = currentDict[key] ?? fallbackEnDict[key] ?? key;
  return typeof value === "string"
    ? formatParams(value, params)
    : String(value);
}

// Start loading dictionaries immediately at module import time.
// By the time the user opens the editor panel, dicts will be ready.
// initI18n() deduplicates via _initPromise, so later calls are no-ops.
initI18n();
