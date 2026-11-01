# CLAUDE.md

Technical reference for the `efood-nutriscore.user.js` userscript (e-Food cart Nutri-Score ranking). The project owner communicates in Hungarian — reply in Hungarian, terse and technical.

## Files

- `efood-nutriscore.user.js` – the userscript (deliverable).
- `README.md` – user-facing documentation.

## Testing in this environment

The userscript extension (Tampermonkey etc.) **cannot be installed into the AI-driven browser
session**. So the script is tested by hand: drive `https://rendel.e-food.hu/` with the
chrome-devtools MCP, wait for the owner to log in by hand in that browser, then inject the script's
logic (or the whole IIFE) via `evaluate_script`. The `fetch` calls to the API work from page context
(CORS `*`); the live DOM (`table tr.data-row`, `.food.in-cart` cards) is the ground truth.

## e-Food API

CORS: `*`, works with a plain `fetch` / curl.

The script's **only** data source is the cart API (no menu download, no `current-week` query):

- **Cart:** `GET https://ea.e-food.hu/api/v2/carts/cart?anonymous_id=<localStorage._capuid>` with
  `Authorization: Bearer <localStorage.foodplusz-auth-token>` (both read from `localStorage`, page
  context). Response:

```json
{ "data": { "id": 123, "user_id": 456, "cart_items": [
  { "menu_item_id": 67117, "quantity": 1, "menu_item": { …full nutrition item… } }
] } }
```

Each `cart_item` already embeds the full `menu_item` (identical shape to a menu-API item — see below),
so `menu_item_id` + nutrition arrive together, no name→id round-trip through a menu download.
`menu_item.id` equals `menu_item_id`. This is the authoritative cart source: items disappear from it as
they are ordered, so its count shrinks over time.

### Nutrition fields (per menu item)

Every field exists both **per portion** (`_portion_`) and **per 100 g** (`_hundred_`), across up to
3 components (`food_one/two/three`; two/three are usually 0):

- `energy_*` – kcal
- `fat_*`, `saturated_fat_*` – fat, saturated fat (g)
- `carb_*`, `sugar_*` – carbs, sugar (g)
- `protein_*` – protein (g)
- `salt_*` – salt (g)
- `weight_food_one/two/three` – weight (g)
- + `id`, `price`, `date`, `description`, `food_name_one/two/three`, `food.name` (display name), last-minute / ordering fields

Note: `food.name` is the **display name** (correct accents + a trailing `*` on last-minute items,
e.g. `Zöldségleves*`). `food_name_*` can carry typos (`fõzelék` vs `főzelék`) and has **no** `*`, so
name matching must use `food.name`, not `food_name_*`.

Conversion: `sodium_mg = salt_g × 1000 / 2.5` (Nutri-Score uses sodium; the API gives salt).

**Missing for a full Nutri-Score:** **fiber** and **fruit/vegetable/legume ratio (%)** (FVNL).
The `description` does contain percentages (e.g. "potato (37%)"), but extracting them reliably is
messy — so the script takes both as **0** (slightly undervalues vegetable/fiber-rich dishes).

## Nutri-Score calculation (2017, per 100 g)

Negative points (N):
- **Energy:** `kJ = kcal × 4.184`; points = `min(10, floor(kJ / 335))`
- **Sugar:** thresholds `[4.5, 9, 13.5, 18, 22.5, 27, 31, 36, 40, 45, 54, 60, 63, 67.5, 72]` → 0–15
- **Saturated fat:** thresholds `[1, 2, …, 10]` → 0–10
- **Sodium (mg):** thresholds `[90, 180, …, 900, 1080, …, 2700]` → 0–20

Positive points (P):
- **Protein:** thresholds `[1.6, 3.2, 4.8, 6.4, 8.0]` → 0–5 — **only if** `N < 11`
- **Fiber = 0**, **FVNL = 0** (no data)

`score = N − P`, then:

| score | letter |
|-------|--------|
| ≤ 0 | A |
| 1–2 | B |
| 3–10 | C |
| 11–18 | D |
| ≥ 19 | E |

Ranking: **ascending score** (best A first), kcal breaks ties. Nutri-Score is **per 100 g**, not per portion.

## Technical structure

- **Loading:** `loadCart()` fetches `/api/v2/carts/cart` (token + `_capuid` from `localStorage`) and
  indexes every `cart_items[].menu_item` into `byId` (keyed by both `menu_item_id` and `item.id`) and
  `byName` (keyed by `food.name`). No menu download, no daily/week cache — the cart is fetched fresh
  on each `run()`.
- **Targets:** uses `table tr.data-row` if present; otherwise the menu's "in cart" cards. Table rows
  carry no menu-item id, so each row's `id` is resolved from the matching `.food.in-cart
  [data-menu-item-id]` card by name (`nameToId`), then looked up via `byId`; the `byName` fallback is
  indexed by `food.name`, so both paths match the row name exactly.
- **Name-cell detection:** the `<td>` containing a `<b>` code (e.g. `E4`) — stable even after inserted
  cells. Strips a leading 1–3 char code from names.
- **Rendering:** `reset()` (removes inserted cells, `colspan 9 → 3`) → `ensureHeader()` (headers,
  `colspan 3 → 9`; **no-ops when there is no `<table>`**, i.e. the cards view) → per-row rank + nutri +
  value cells → `paint()`.
- **Loading pill:** a fixed bottom-right `div` ("Nutri-Score betöltése…" + CSS spinner, keyframes
  `efood-spin`) shown via `showLoading()` at the start of `run()`. It is hidden with a **double
  `requestAnimationFrame(hideLoading)`** in the `finally` block, so it only disappears *after* the
  browser has painted the new cells/colors — not a frame early.
- **Observer:** `MutationObserver` with 350 ms debounce; re-runs if `signature()` changed or rank-cell
  count differs from expected. `running` / `pendingRun` reentrancy guard.
- **`norm(s)`:** NFD + accent removal.

## API call frequency

`run()` fetches the cart once per invocation. It fires on the initial load and again whenever the
MutationObserver (350 ms debounce) sees `signature()` change (cart contents changed) or the rank cells
disappear (re-render). That is one lightweight cart request per cart change / re-render — acceptable,
and the site itself fetches the cart at those same moments. There is no menu cache and no
`current-week` query.

## Colors (detailed)

Each letter has 4 color fields:

- `solid` – badge background
- `text` – badge foreground on `solid`
- `tint` – row background (translucent wash on white)
- `value` – dark text color on the light `tint` (the Kcal column uses this)

| Letter | solid | text | value | contrast (solid + text) |
|--------|-------|------|-------|-------------------------|
| A | `#038141` | `#fff` | `#037039` | 4.98:1 |
| B | `#85bb2f` | `#1a1a1a` | `#4c6a1b` | 7.58:1 |
| C | `#fecb02` | `#1a1a1a` | `#765e01` | 11.40:1 |
| D | `#ee8200` | `#1a1a1a` | `#935000` | 6.49:1 |
| E | `#c3350e` | `#fff` | `#b4310d` | 5.47:1 |

`text` and `value` are chosen for **≥ 4.5:1** (WCAG AA) contrast against their background. Header and
muted text color is `#707070` (4.95:1 on white); value cells use `#333`.

## Invariants / gotchas

- Rows are **not reordered** ("in-place numbering") — intentional, don't break it.
- The `norm()` accent-stripping line contains **raw U+0300–U+036F characters** — don't rewrite them to
  escapes.
- **Fiber** and **fruit/vegetable/legume ratio (FVNL)** are missing from the API → taken as 0
  (undervaluation, accepted approximation).
- The data source is the **cart API** (`_capuid` + `foodplusz-auth-token` from `localStorage`); there
  is no menu-API dependency — don't re-add a menu download for cart ranking.
- Nutri-Score is **per 100 g**, not per portion.
- **The menu page (`/`) has no `<table>`** — only the `/checkout` view does. `ensureHeader()` must
  `return` early when `document.querySelector('table')` is null, otherwise the whole `apply()` throws
  (`Cannot read properties of null (reading 'querySelectorAll')`) and nothing gets ranked on the cards.
