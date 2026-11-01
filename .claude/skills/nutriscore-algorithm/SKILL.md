---
name: nutriscore-algorithm
description: Reference for the Nutri-Score (A–E) calculation used by the userscript. Use when editing, verifying, or debugging the scoring/ranking logic, or explaining why an item got a given letter.
---

# Nutri-Score algorithm (2017, per 100 g)

The score is computed **per 100 g** (never per portion). A `countAbove(v, thresholds)`
helper counts the ascending thresholds the value strictly exceeds (`v > t`).

## Per-100 g values (`per100`)

Sum the `_portion_` fields across the up-to-3 components and scale by `100 / totalWeight`:

```
W = weight_food_one + weight_food_two + weight_food_three
sum(f) = f_portion_food_one + f_portion_food_two + f_portion_food_three
per100(f) = sum(f) * (100 / W)          // when W > 0
```

When `W == 0`, fall back to the `_hundred_food_one` fields directly.

## Negative points (N)

- **Energy:** `kJ = energy_per100 × 4.184`; points = `min(10, floor(kJ / 335))`.
- **Sugar (g/100 g):** thresholds
  `[4.5, 9, 13.5, 18, 22.5, 27, 31, 36, 40, 45, 54, 60, 63, 67.5, 72]` → 0–15.
- **Saturated fat (g/100 g):** thresholds `[1, 2, 3, 4, 5, 6, 7, 8, 9, 10]` → 0–10.
- **Sodium (mg/100 g):** thresholds
  `[90, 180, 270, 360, 450, 540, 630, 720, 810, 900, 1080, 1260, 1440, 1620, 1800, 1980, 2160, 2340, 2520, 2700]` → 0–20.
  Convert from salt: `sodium_mg = salt_g × 1000 / 2.5`.

## Positive points (P)

- **Protein (g/100 g):** thresholds `[1.6, 3.2, 4.8, 6.4, 8.0]` → 0–5 — **only counted when `N < 11`**.
- **Fiber = 0**, **FVNL = 0** (fruit/vegetable/legume ratio is not in the API → slight undervaluation, accepted).

## Score → letter

`score = N − P`

| score | letter |
|-------|--------|
| ≤ 0   | A      |
| 1–2   | B      |
| 3–10  | C      |
| 11–18 | D      |
| ≥ 19  | E      |

Ranking is **ascending score** (best A first); kcal breaks ties.

## Notes

- The data source is the cart API's `cart_items[].menu_item` — see the `cart-api` skill.
- Do **not** reintroduce a menu download; `run()` fetches the cart once per invocation.
