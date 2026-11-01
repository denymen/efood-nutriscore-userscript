---
name: test-userscript
description: Test the efood-nutriscore userscript on the live e-food site. Use when the user asks to test, verify, or debug the userscript against rendel.e-food.hu — inject the script via the chrome-devtools MCP and check the live cart DOM.
---

# Test the userscript (live site)

Tampermonkey cannot be installed into the AI-driven browser session, so the script is
verified by hand against `https://rendel.e-food.hu/` using the chrome-devtools MCP.

## Workflow

1. **Open the site** with the chrome-devtools MCP:
   - `mcp__chrome-devtools__navigate_page` → `https://rendel.e-food.hu/` (menu / cards view)
     or `https://rendel.e-food.hu/checkout` (table view).
2. **Wait for the owner to log in by hand** in that browser, then confirm they are done.
3. **Confirm auth** by reading `localStorage` from page context
   (`mcp__chrome-devtools__evaluate_script`):
   ```js
   JSON.stringify({
     capuid: localStorage._capuid,
     token: localStorage['foodplusz-auth-token']
   })
   ```
   Both must be non-empty, otherwise the cart API call will fail.
4. **Inject the script** via `mcp__chrome-devtools__evaluate_script`. Pass either the whole
   IIFE or its inner logic. The `fetch` calls work from page context (the API sends CORS `*`).
5. **Verify against the live DOM** (ground truth):
   - checkout table: `table tr.data-row`
   - menu cards: `.food.in-cart [data-menu-item-id]`
   - Expected output: a `#` rank column, a `Nutri-Score` badge column, 4 nutrition columns
     (Kcal / Szénh. / Fehérje / Zsír), row colors by letter, and the "Nutri-Score betöltése…"
     loading pill appearing then disappearing.
6. **Check the console** with `mcp__chrome-devtools__list_console_messages` for errors.
7. **Screenshot** with `mcp__chrome-devtools__take_screenshot` to confirm visuals, if needed.

## Gotchas

- The menu page (`/`) has **no `<table>`** — only `/checkout` does. `ensureHeader()` must
  no-op there or `apply()` throws. Test both views.
- Rows are numbered **in place**, never reordered.
- Cart items disappear from the API as they are ordered, so the cart count shrinks over time.
- The chrome-devtools MCP tools are deferred — load their schemas via ToolSearch first
  (e.g. `select:mcp__chrome-devtools__navigate_page,mcp__chrome-devtools__evaluate_script`).
