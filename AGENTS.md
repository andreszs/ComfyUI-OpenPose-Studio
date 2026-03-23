# AGENTS.md

Operational Rules for AI Coding Agents

- Scope control: Make minimal, localized changes. Do not rewrite entire files unless explicitly instructed.
- Edit safety: Never leave files in a broken or incomplete state. Do not stop edits mid-file. Warn before any risky or large change.
- Style consistency: Preserve existing coding style, structure, naming, and architecture. Do not reformat code unnecessarily.
- No cosmetic refactors: Do not perform stylistic rewrites or “cleanup” changes disguised as refactors.
- Imports/layout/formatting: Do not change imports, formatting, or code layout unless required for correctness.
- Translation JSON encoding: Save translation JSON files as plain UTF-8 without BOM. This is a hard requirement for localized nodeDefs.json files in particular. Do not re-save them with BOM, and when editing translation JSON preserve valid JSON and avoid accidental encoding changes.
- File protection: Do not modify the following unless explicitly requested:
  - README.md
  - LICENSE
  - .git/
  - .claude/
  - nodes/
  - core/
- No hallucination: Do not invent APIs, features, config options, or behaviors not present in the codebase.
- Explicit intent: If a request is ambiguous or underspecified, ask for clarification before editing.
- Refactors: Keep refactors incremental, justified, and tightly scoped. No sweeping refactors.
- Testing & validation: When applicable, suggest how to validate changes. Do not claim tests were run unless you ran them.
- Communication: Briefly explain what changed and why.
- Failure handling: Do not abort silently. If you must continue later, say so clearly and indicate what remains.

## Version Tagging

- When a commit bumps the version in `pyproject.toml`, create and push the matching Git tag targeting that exact commit before doing anything else.
- The tag name must exactly match the version string in `pyproject.toml` (e.g., `1.0.0`, `1.0.1`, `1.2.3`). No `v` prefix, no other format.
- Do not create GitHub releases unless explicitly requested.
- Never move, overwrite, recreate, or retag an existing version tag to point to a different commit.
- Each version tag is immutable: it must permanently point to the commit where that version was published.
- If a version is pushed without the matching tag, the README version badge will become outdated or inconsistent.
