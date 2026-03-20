

# UI Translation Guidelines (Universal)

This document defines a **repo-agnostic** process for adding and maintaining UI translations when your UI strings are stored in **flat JSON dictionaries** (e.g., `ui.json`) per locale.

The goals are:

1. Keep **English as the single source of truth**.
2. Ensure every locale file has **the exact same key set** as English.
3. Avoid breaking the UI with accidental reformatting, key renames, or placeholder damage.
4. Make it easy for agents to work consistently across all repos.

---

## Supported Languages (standard set)

From now on, assume these locales are supported (unless a repo explicitly differs):

* `en` English
* `es` Español
* `ja` 日本語
* `ko` 한국어
* `zh` 中文 (Simplified)
* `zh-TW` 繁體中文
* `ru` Русский
* `de` Deutsch
* `fr` Français
* `pt` Português

If a repo does not have all of these yet, you may add them only when the task explicitly says to create new locale folders/files.

---

## File layout conventions

Different repos may store locales in different roots. Common patterns:

* `web/locales/<lang>/ui.json`
* `locales/<lang>/ui.json`
* `src/locales/<lang>/ui.json`

Rules:

* The **English master** is always `.../en/ui.json`.
* Every other locale is `.../<lang>/ui.json`.
* Keep locale JSON as **flat key/value** pairs unless the repo already uses nesting.

---

## Non-negotiable rules

1. **English (`en/ui.json`) is authoritative.**
2. Every locale must end with **exactly the same keys** as English.

   * No missing keys.
   * No extra keys.
3. **Never rename keys.** Keys are case-sensitive and punctuation-sensitive.
4. **Never change placeholders.** Anything like `{count}`, `{name}`, `{path}`, `{0}` must remain identical.
5. **Preserve escape sequences exactly.** Keep `\\n`, `\\t`, `\\uXXXX` as they are written.
6. **Do not reformat JSON globally.**

   * No prettify, no key sorting, no normalization.
   * Only make minimal edits where needed.
7. **Do not add comments to JSON.** (JSON must not contain comments.)
8. **Do not change existing non-empty translations.**

   * Only fill missing/empty values, and add missing keys.

---

## What “sync” means (locale JSON parity)

For each target locale file:

* INSERT any key present in `en/ui.json` but missing in the target.
* FILL any key present but with empty value `""`.
* PRUNE any key present in the target but not in `en/ui.json`.

Placement rule:

* Insert new keys **near the closest surrounding keys** that exist in both files, following English ordering.
* Do not reorder existing keys.

---

## Emoji rule (important)

If the UI shows emojis next to text, the preferred approach is:

* Keep `ui.json` strings **emoji-free**, unless the repo explicitly stores emojis in translations.
* Add emojis in the **UI layer** (JS/TS/Python UI builder) so they’re consistent across languages and not duplicated.

In other words: translations should carry the *message*, the UI code can add the *decoration*.

---

## Adding new locales (when requested)

Only do this when the task explicitly says “add languages” or “create missing locales”.

Steps:

1. Create folder `.../locales/<lang>/` (if missing).
2. Create `ui.json` with the **same keys as English**, values initially translated (or temporarily copied from English if translation is not requested yet).
3. Keep JSON formatting consistent with the repo’s existing locale files.

---

## Recommended validation checklist

Minimum validation after edits:

* JSON parses for every edited locale file.
* Key set equality:

  * Count keys in `en/ui.json`.
  * Count keys in each locale.
  * Confirm identical key lists (same spelling/casing/punctuation).
* Placeholder audit:

  * Grep for `{` and check placeholder tokens match English.
* Quick UI smoke test (when feasible):

  * Switch language (if supported) and confirm major screens load without missing-key fallbacks.

---

## Agent prompt template (universal, copy/paste)

Use this as a generic prompt for a VS Code agent. Replace paths and locale list to match the repo.

```text
System / Context
You are a software localization specialist.
This repo uses flat JSON dictionaries for UI strings. English is the source of truth.

Objective
Synchronize all locale ui.json files to be STRUCTURALLY IDENTICAL to the English master:
- Master: <PATH>/locales/en/ui.json
- Targets: <PATH>/locales/<lang>/ui.json for: es, ja, ko, zh, zh-TW, ru, de, fr, pt

Hard Scope
- Edit ONLY the locale ui.json files.
- Do NOT create or rename folders unless explicitly instructed.
- Do NOT modify any other files.

Zero Tolerance: No rewrite / no reformat
- Do NOT regenerate JSON from scratch.
- Do NOT prettify/reindent/sort keys/normalize.
- Preserve all existing non-empty translations exactly.
- Preserve escape sequences exactly as literals (\\n, \\uXXXX, etc).
- JSON must not contain comments.

Strict Mirroring Protocol
For each target locale:
1) PRUNE: Delete any key not present in the English master.
2) INSERT: Add any key present in English but missing in target (translated).
3) FILL: If value is "" in target, translate and fill it.
Placement: Insert new keys near the closest surrounding keys (following English ordering). Do not reorder existing keys.

Critical Constraints
- Never rename keys (case/punctuation sensitive).
- Keep placeholders EXACT (e.g., {count}, {name}). Never translate content inside { }.
- Do not add emojis into ui.json unless the English master contains them. If emojis are needed, they must be added by the UI code, not translations.

Validation
- Ensure each ui.json parses.
- Ensure each locale has EXACTLY the same keys as English.

Final Report
For each locale:
- Keys added: N
- Keys pruned: N
- Empty values filled: N
- Key count matches English: Yes/No
```

---

## Terminology guidance (keep it repo-specific)

Avoid global “do-not-translate” lists unless the repo defines them, because different repos use different brand terms. If a repo has special terms (product name, node name, plugin name), define them in that repo’s README or a small “Terminology” section next to its localization files.

Universal rule that always applies:

* Do not translate placeholders, code identifiers, file paths, keyboard shortcuts, or literal tokens.

---

If you want, I can also rewrite this into a shorter “one-page” version that’s easier to paste into repos as `TRANSLATING.md` (same content, less verbosity).
