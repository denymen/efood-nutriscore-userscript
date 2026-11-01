---
name: release
description: Bump the userscript version, update the README changelog, and commit + push. Use when the user asks to release, ship, version, bump, commit, or push the userscript.
---

# Release / version bump

## Steps

1. Read the current `@version` in `efood-nutriscore.user.js`.
2. Pick the next semver version from the change (patch/minor/major).
3. Update `@version` in `efood-nutriscore.user.js`.
4. Add a new entry at the top of the `## Version history` list in `README.md` (English),
   newest first, one line per version.
5. If behaviour or structure changed, update `CLAUDE.md` and the memory files too
   (project rule: keep the .md files in sync with the code).
6. Stage the relevant files, commit, and push:
   - commit message in **English**, ending with `Co-Authored-By: Claude Code <noreply@anthropic.com>`.
   - `git push` (force-push only when the owner explicitly asks).

## Rules

- Only chat replies to the owner are Hungarian; commit messages, PR descriptions, code and
  docs are always English.
