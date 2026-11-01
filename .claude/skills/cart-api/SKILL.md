---
name: cart-api
description: Reference for the e-Food cart API (the userscript's only data source). Use when debugging or changing data fetching, or when the cart/nutrition values look wrong.
---

# e-Food cart API

The script's **only** data source. CORS is `*`, so a plain `fetch` from page context works.
There is no menu download and no `current-week` query.

## Endpoint

```
GET https://ea.e-food.hu/api/v2/carts/cart?anonymous_id=<localStorage._capuid>
Authorization: Bearer <localStorage.foodplusz-auth-token>
```

Both values are read from `localStorage` in page context.

## Response shape

```json
{ "data": { "id": 123, "user_id": 456, "cart_items": [
  { "menu_item_id": 67117, "quantity": 1, "menu_item": { "id": 67117, "food": { "name": "Zöldségleves*" }, "…": "…full nutrition item…" } }
] } }
```

Each `cart_item` already embeds the full `menu_item` (same shape as a menu-API item), so
`menu_item_id` and nutrition arrive together — no name→id round-trip. `menu_item.id == menu_item_id`.

## Nutrition fields (per item)

Each field exists **per portion** (`_portion_`) and **per 100 g** (`_hundred_`), across up to 3
components (`food_one/two/three`; two/three are usually 0):

- `energy_*` – kcal
- `fat_*`, `saturated_fat_*` – fat, saturated fat (g)
- `carb_*`, `sugar_*` – carbs, sugar (g)
- `protein_*` – protein (g)
- `salt_*` – salt (g)
- `weight_food_one/two/three` – weight (g)
- `id`, `price`, `date`, `description`, `food_name_one/two/three`, `food.name`, last-minute/ordering fields

## Gotchas

- `food.name` is the **display name** (correct accents, trailing `*` on last-minute items).
  `food_name_*` can carry typos (`fõzelék`) and has **no** `*` — always match on `food.name`.
- `sodium_mg = salt_g × 1000 / 2.5` (Nutri-Score uses sodium; the API gives salt).
- **Missing for a full Nutri-Score:** fiber and fruit/vegetable/legume ratio → both taken as 0.
- The cart is the authoritative source: items disappear from it as they are ordered, so the
  count shrinks over time.
