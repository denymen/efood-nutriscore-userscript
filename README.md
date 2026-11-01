# e-Food – Cart Nutrition Ranking (Nutri-Score)

Tampermonkey userscript for the **rendel.e-food.hu /checkout** cart: evaluates and ranks cart items by nutrition using **Nutri-Score (A–E)**.

Last updated: 2026-11-01

## About

The goal: look beyond calories and get a broader, **Nutri-Score (A–E)** picture to make mindful choices easier.

The script affects **only the cart items** and **does not reorder** the cards/rows (so-called "in-place numbering"): every row stays in place, only the `#` column shows the rank.

## Files

- `efood-nutriscore.user.js` – the userscript itself (the deliverable to download/install).
- `CLAUDE.md` – technical reference (API, algorithm, structure) for development.

## What it does

1. Fetches the cart from the cart API (authoritative source; each item already carries its full nutrition).
2. Matches cart rows to cart items by `food.name` (accent-normalized) or `data-menu-item-id`.
3. Computes a **Nutri-Score** (A–E) for each dish, per 100 g.
4. Inserts into the cart table:
   - a **`#`** column (rank, best = 1) – first,
   - a **`Nutri-Score`** column (colored A–E badge),
   - 4 nutrition columns: **Kcal, Carbs (g), Protein (g), Fat (g)** – with decimals.
5. Colors rows by **Nutri-Score letter** (A green → E red), with a colored stripe on the left edge.
6. Re-runs via MutationObserver on re-render/expansion (with loop protection).
7. Shows a small **"Nutri-Score betöltése…"** loading pill (spinner) in the bottom-right corner while the
   cart fetch is in flight, and hides it only after the new colors/ranks have actually been painted.

Works on the **/checkout** table **and** on the menu's "in cart" cards (`/`): on the cards it prepends a
`#rank · Letter` chip and appends the nutrition summary instead of inserting table columns.

### Column layout

```
# | Nutri-Score | [image] | Dish name | Kcal | Carbs (g) | Protein (g) | Fat (g) | Price | Qty | Total
```

Day and summary rows have `colspan` `3 → 9` (so "N pc" / "N Ft" lands under Qty / Total).

### Colors

| Letter | Background | Meaning |
|--------|-----------|---------|
| A | `#038141` | dark green |
| B | `#85bb2f` | light green |
| C | `#fecb02` | yellow |
| D | `#ee8200` | orange |
| E | `#c3350e` | red |

The full color set (foreground/background/value colors + WCAG contrast ratios) is in `CLAUDE.md`.

## Install / update (Tampermonkey)

1. Open the existing script in Tampermonkey (Edit).
2. **Ctrl+A** → paste (the contents of `efood-nutriscore.user.js`) → **Ctrl+S**.
3. Reload `https://rendel.e-food.hu/checkout`.

## Version history

- **1.0.0** – 4 nutrition columns; inline `#rank` chip; kcal-based coloring.
- **1.1.0** – keep decimals (`fmt`); rank in a separate `#` column, first.
- **1.2.0** – Nutri-Score (A–E) based ranking + coloring + `Nutri-Score` column; fiber/FVNL = 0.
- **1.2.1** – contrast fixes (≥ 4.5:1, `value` foreground colors), header `#707070`,
  next week's menu download, ISO week handling, daily cache (`dayKey`).
- **1.3.0** – data source switched to the cart API (no menu download / ISO-week / daily cache);
  index by `food.name` (fixes the `food_name_*` typo + `*` mismatches).
- **1.4.0** – bottom-right "Nutri-Score betöltése…" loading pill (hidden only after paint);
  fixes a crash on the menu's card view (`ensureHeader` guarded against a missing `<table>`).

## Known limitations

- Fiber + fruit/vegetable ratio missing from the API → veggie/fiber-rich dishes are slightly undervalued.
- Nutri-Score is per 100 g, not per portion → a large portion isn't necessarily a bad score.
- Rows are not reordered (intentional – "in-place numbering").
