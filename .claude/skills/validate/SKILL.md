---
name: validate
description: Quick sanity checks on the userscript before committing. Use to validate JS syntax and confirm project invariants are intact after an edit.
---

# Validate the userscript

## 1. Syntax check

```bash
node --check efood-nutriscore.user.js
```

## 2. Invariant checks

- **No menu download / ISO-week / daily cache** — the only fetch must be the cart API
  (`/api/v2/carts/cart`). No `current-week`, no `dayKey`.
- **`norm()`** accent-stripping line contains raw U+0300–U+036F characters — do not rewrite to escapes.
- **`ensureHeader()`** must `return` early when `document.querySelector('table')` is null
  (menu `/` has no table; only `/checkout` does).
- **Rows are never reordered** — "in-place numbering" is intentional.
- **Nutri-Score is per 100 g** — the code must use the per-100 g values (`per100`), not portion fields.
- **`food.name`** is used for name matching, never `food_name_*`.

## 3. Version/README consistency

- `@version` in the script matches the newest `README.md` `## Version history` entry.
- Any behaviour change is reflected in `README.md`, `CLAUDE.md`, and the memory files.
