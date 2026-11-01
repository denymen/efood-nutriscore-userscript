---
name: verify-contrast
description: Check WCAG colour contrast for the userscript's Nutri-Score palette. Use when adding or changing badge/row/text colours, or verifying a colour pair meets AA (≥ 4.5:1).
---

# Colour contrast (WCAG AA)

Text/foreground pairs must reach **≥ 4.5:1**. The header and muted text colour is `#707070`
(4.95:1 on white); value cells use `#333`.

## Current palette

| Letter | solid (badge bg) | text (on solid) | value (on tint) | contrast (solid + text) |
|--------|------------------|-----------------|-----------------|-------------------------|
| A | `#038141` | `#fff`    | `#037039` | 4.98:1 |
| B | `#85bb2f` | `#1a1a1a` | `#4c6a1b` | 7.58:1 |
| C | `#fecb02` | `#1a1a1a` | `#765e01` | 11.40:1 |
| D | `#ee8200` | `#1a1a1a` | `#935000` | 6.49:1 |
| E | `#c3350e` | `#fff`    | `#b4310d` | 5.47:1 |

`text` sits on `solid`; `value` sits on `tint` (a translucent wash on white).

## Compute the ratio

```js
function lum(hex) {
  const c = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4].map(i => parseInt(c.slice(i, i + 2), 16) / 255);
  const f = x => (x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4));
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}
function contrast(a, b) {
  const L1 = lum(a), L2 = lum(b);
  return (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
}
contrast('#038141', '#ffffff'); // → ~4.98
```

Run this in page context via the chrome-devtools `evaluate_script`, or with `node -e`.
