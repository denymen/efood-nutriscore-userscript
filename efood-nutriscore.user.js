// ==UserScript==
// @name         e-Food – Cart Nutri-Score Ranking
// @namespace    https://rendel.e-food.hu/
// @version      1.4.0
// @description  Ranks and color-codes cart items by Nutri-Score (A–E), showing the letter in its own column plus nutrition values with decimals (Kcal, Carbs, Protein, Fat). Fiber/fruit-vegetable ratio is not in the API, so it is taken as 0. Data comes from the cart API.
// @author       Claude
// @homepageURL  https://github.com/denymen/efood-nutriscore-userscript
// @supportURL   https://github.com/denymen/efood-nutriscore-userscript/issues
// @updateURL    https://raw.githubusercontent.com/denymen/efood-nutriscore-userscript/main/efood-nutriscore.user.js
// @downloadURL  https://raw.githubusercontent.com/denymen/efood-nutriscore-userscript/main/efood-nutriscore.user.js
// @match        https://rendel.e-food.hu/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  const CART_API = 'https://ea.e-food.hu/api/v2/carts/cart';
  const PREFIX = '[eFood Nutri-Score]';

  // Every user-facing string lives here so the language can be swapped in one place.
  const I18N = {
    colKcal: 'Kcal',
    colCarb: 'Szénh. (g)',
    colProtein: 'Fehérje (g)',
    colFat: 'Zsír (g)',
    headerRank: '#',
    headerNutriScore: 'Nutri-Score',
    chip: '#{rank} · {letter}',
    inline: '{energy} kcal, {carb}g szénh., {protein}g fehérje, {fat}g zsír',
    tag: ' ({nutrition})',
    tooltip: 'Nutri-Score {letter} (pont: {score})',
    loading: 'Nutri-Score betöltése…',
    missingValue: '–',
    missingLabel: ' (nincs tápérték)',
  };

  // Replace {placeholders} in a template string.
  const tpl = (template, vars) =>
    String(template).replace(/\{(\w+)\}/g, (m, key) => (vars && key in vars ? vars[key] : m));

  // `text` is the foreground on the solid badge; `value` is the darker foreground on the light `tint` (both ≥ 4.5:1 contrast).
  const NS = {
    A: { solid: '#038141', text: '#fff',    tint: 'rgba(3, 129, 65, 0.16)',  value: '#037039' },
    B: { solid: '#85bb2f', text: '#1a1a1a', tint: 'rgba(133, 187, 47, 0.16)', value: '#4c6a1b' },
    C: { solid: '#fecb02', text: '#1a1a1a', tint: 'rgba(254, 203, 2, 0.22)',  value: '#765e01' },
    D: { solid: '#ee8200', text: '#1a1a1a', tint: 'rgba(238, 130, 0, 0.18)',  value: '#935000' },
    E: { solid: '#c3350e', text: '#fff',    tint: 'rgba(195, 53, 14, 0.16)',  value: '#b4310d' },
  };

  // Compact square Nutri-Score mark: gray "NS" over a 5-color A–E strip (own design, no trademark).
  const nutriLogo = () => {
    const S = 20, letters = ['A', 'B', 'C', 'D', 'E'], band = S / letters.length;
    const sh = 4, sy = S - sh;
    const bands = letters.map((L, i) =>
      `<rect x="${i * band}" y="${sy}" width="${band}" height="${sh}" fill="${NS[L].solid}"/>`
    ).join('');
    return `<svg viewBox="0 0 ${S} ${S}" width="${S}" height="${S}" role="img"` +
      ` aria-label="${I18N.headerNutriScore}" style="display:block;margin:0 auto">` +
      `<title>${I18N.headerNutriScore}</title>` +
      `<defs><clipPath id="ns-square"><rect width="${S}" height="${S}" rx="4"/></clipPath></defs>` +
      `<g clip-path="url(#ns-square)">${bands}` +
      `<text x="10" y="8" text-anchor="middle" dominant-baseline="central"` +
      ` font-family="sans-serif" font-size="9" font-weight="700" fill="#707070">NS</text>` +
      `</g></svg>`;
  };

  // Rounds to one decimal, dropping the trailing ".0" (non-integer decimals are kept).
  const fmt = n => {
    const v = Number(n);
    if (!isFinite(v)) return '0';
    return String(Math.round(v * 10) / 10);
  };

  const COLS = [
    { label: I18N.colKcal,    val: it => fmt(it.energy_portion_food_one) },
    { label: I18N.colCarb,    val: it => fmt(it.carb_portion_food_one) },
    { label: I18N.colProtein, val: it => fmt(it.protein_portion_food_one) },
    { label: I18N.colFat,     val: it => fmt(it.fat_portion_food_one) },
  ];

  const norm = s => (s || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/\s+/g, ' ').trim();

  function num(v) { const n = Number(v); return isFinite(n) ? n : 0; }

  // Number of thresholds (ascending) that the value exceeds → points.
  function countAbove(v, thresholds) {
    let c = 0;
    for (const t of thresholds) { if (v > t) c++; else break; }
    return c;
  }

  // Per-100 g values derived from the full portion (components summed by weight).
  function per100(item) {
    const w1 = num(item.weight_food_one), w2 = num(item.weight_food_two), w3 = num(item.weight_food_three);
    const W = w1 + w2 + w3;
    const sum = f => num(item[f + '_portion_food_one']) + num(item[f + '_portion_food_two']) + num(item[f + '_portion_food_three']);
    if (W > 0) {
      const k = 100 / W;
      return {
        energy: sum('energy') * k,
        sugar: sum('sugar') * k,
        satfat: sum('saturated_fat') * k,
        protein: sum('protein') * k,
        salt: sum('salt') * k,
      };
    }
    return {
      energy: num(item.energy_hundred_food_one),
      sugar: num(item.sugar_hundred_food_one),
      satfat: num(item.saturated_fat_hundred_food_one),
      protein: num(item.protein_hundred_food_one),
      salt: num(item.salt_hundred_food_one),
    };
  }

  // Nutri-Score (2017, per 100 g); fiber and the fruit/vegetable share are taken as 0 (not in the API).
  function nutriScore(item) {
    const p = per100(item);
    const kj = p.energy * 4.184; // kcal → kJ
    let N = 0;
    N += Math.min(10, Math.floor(kj / 335));
    N += countAbove(p.sugar, [4.5, 9, 13.5, 18, 22.5, 27, 31, 36, 40, 45, 54, 60, 63, 67.5, 72]);
    N += countAbove(p.satfat, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    N += countAbove((p.salt * 1000) / 2.5, [90, 180, 270, 360, 450, 540, 630, 720, 810, 900, 1080, 1260, 1440, 1620, 1800, 1980, 2160, 2340, 2520, 2700]);
    let P = 0;
    if (N < 11) P = countAbove(p.protein, [1.6, 3.2, 4.8, 6.4, 8.0]);
    const score = N - P;
    let letter;
    if (score <= 0) letter = 'A';
    else if (score <= 2) letter = 'B';
    else if (score <= 10) letter = 'C';
    else if (score <= 18) letter = 'D';
    else letter = 'E';
    return { letter, score, N, P };
  }

  function fmtInline(item) {
    return tpl(I18N.inline, {
      energy: fmt(item.energy_portion_food_one),
      carb: fmt(item.carb_portion_food_one),
      protein: fmt(item.protein_portion_food_one),
      fat: fmt(item.fat_portion_food_one),
    });
  }

  // Fetch the cart (the authoritative source) and index its items by id and by display name.
  // Each cart_item already embeds the full `menu_item` (same nutrition shape as the menu API),
  // so no separate menu download is needed.
  async function loadCart() {
    const capuid = localStorage.getItem('_capuid');
    const token = localStorage.getItem('foodplusz-auth-token');
    if (!capuid || !token) throw new Error('cart API auth missing (_capuid / foodplusz-auth-token)');

    const json = await (await fetch(CART_API + '?anonymous_id=' + encodeURIComponent(capuid), {
      headers: { 'Authorization': 'Bearer ' + token },
    })).json();
    if (json.error) throw new Error('cart API error: ' + JSON.stringify(json.message || json.error));

    const byId = {};
    const byName = {};
    for (const ci of ((json.data || {}).cart_items || [])) {
      const item = ci.menu_item;
      if (!item) continue;
      byId[ci.menu_item_id] = item;
      byId[item.id] = item;
      // `food.name` is the site's display name (correct accents + the last-minute `*`);
      // it matches the checkout row name exactly.
      const key = norm(item.food && item.food.name);
      if (key && !byName[key]) byName[key] = item;
    }
    return { byId, byName };
  }

  // Unified target list: visible cart table rows, or "in cart" menu cards.
  function getTargets() {
    // The checkout table rows carry no menu-item id; the in-cart menu cards do
    // (`data-menu-item-id`), so map a row's dish name to that id to look items up by id.
    const nameToId = {};
    document.querySelectorAll('.food.in-cart[data-menu-item-id]').forEach(card => {
      const title = card.querySelector('.food-top-title');
      if (title) nameToId[norm(title.textContent)] = card.dataset.menuItemId;
    });

    const tableRows = Array.from(document.querySelectorAll('table tr.data-row'));
    if (tableRows.length) {
      return tableRows.map(tr => {
        const tds = Array.from(tr.querySelectorAll('td'));
        // Name cell: the td that contains the <b> code (e.g. "E4"). This stays findable
        // even after the # / nutrition cells are inserted (not a fixed index).
        const nameCell = tds.find(td => td.querySelector('b')) ||
          tds.find(td => !td.classList.contains('efood-col') && !td.classList.contains('efood-rank-col') && !td.classList.contains('efood-nutri-col') && (td.textContent || '').trim()) ||
          tds[1] || null;
        let name = (nameCell ? nameCell.textContent : '').trim();
        name = name.replace(/^[A-Z0-9ÁÉÍÓÖŐÚÜŰ]{1,3}\s+/, ''); // leading code, e.g. "E4 "
        return { kind: 'row', el: tr, tds, nameEl: nameCell, name, id: nameToId[norm(name)] || null };
      });
    }
    return Array.from(document.querySelectorAll('.food.in-cart[data-menu-item-id]')).map(card => ({
      kind: 'card',
      el: card,
      tds: null,
      nameEl: card.querySelector('.food-top-title'),
      name: (card.querySelector('.food-top-title') ? card.querySelector('.food-top-title').textContent : '').trim(),
      id: card.dataset.menuItemId,
    }));
  }

  function reset() {
    document.querySelectorAll('.efood-rank-chip, .efood-nutrition-tag').forEach(el => el.remove());
    document.querySelectorAll('.efood-col, .efood-rank-col, .efood-nutri-col').forEach(el => el.remove());
    document.querySelectorAll('table [colspan="9"]').forEach(c => { c.colSpan = 3; });
    document.querySelectorAll('[data-efood-rank]').forEach(el => {
      delete el.dataset.efoodRank;
      el.style.removeProperty('background-color');
      el.style.removeProperty('outline');
      el.style.removeProperty('outline-offset');
      el.style.removeProperty('border-radius');
      el.querySelectorAll('td').forEach(td => {
        td.style.removeProperty('background-color');
        td.style.removeProperty('box-shadow');
      });
    });
  }

  // The site labels the dish-name column header with the Hungarian "étel neve".
  const NAME_HEADER_RE = /étel\s*neve/i;

  // Insert the # and 4 nutrition-column headers, and widen the day/summary rows' colspan from 3 to 9.
  function ensureHeader() {
    const table = document.querySelector('table:has(tr.data-row)') || document.querySelector('table');
    if (!table) return; // cards view — no table, nothing to augment

    const headerRow = Array.from(table.querySelectorAll('thead tr'))
      .find(tr => NAME_HEADER_RE.test(tr.textContent));

    if (headerRow) {
      if (!headerRow.querySelector('.efood-rank-col')) {
        const rankTh = document.createElement('th');
        rankTh.className = 'efood-rank-col';
        rankTh.textContent = I18N.headerRank;
        rankTh.style.cssText =
          'text-align:center;font-size:11px;font-weight:600;color:#707070;' +
          'white-space:nowrap;padding:4px 4px;';
        headerRow.insertBefore(rankTh, headerRow.firstElementChild);
      }
      if (!headerRow.querySelector('.efood-nutri-col')) {
        const nutriTh = document.createElement('th');
        nutriTh.className = 'efood-nutri-col';
        nutriTh.innerHTML = nutriLogo();
        nutriTh.style.cssText = 'text-align:center;padding:3px 2px;white-space:nowrap;';
        const rankTh = headerRow.querySelector('.efood-rank-col');
        if (rankTh) rankTh.after(nutriTh);
        else headerRow.insertBefore(nutriTh, headerRow.firstElementChild);
      }
      if (!headerRow.querySelector('.efood-col')) {
        const nameTh = Array.from(headerRow.querySelectorAll('th,td'))
          .find(c => NAME_HEADER_RE.test(c.textContent));
        if (nameTh) {
          const ths = COLS.map(col => {
            const th = document.createElement('th');
            th.className = 'efood-col';
            th.textContent = col.label;
            th.style.cssText =
              'text-align:right;font-size:11px;font-weight:600;color:#707070;' +
              'white-space:nowrap;padding:4px 6px;';
            return th;
          });
          nameTh.after(...ths);
        }
      }
    }

    const widen = cells => cells.forEach(c => { if (c.colSpan === 3) c.colSpan = 9; });
    widen(Array.from(table.querySelectorAll('thead tr:first-child th:first-child, thead tr:first-child td:first-child')));
    widen(Array.from(table.querySelectorAll('tbody tr.day-row th:first-child, tbody tr.day-row td:first-child')));
  }

  function paint(target, col) {
    if (target.kind === 'row') {
      target.el.style.setProperty('background-color', col.tint, 'important');
      target.tds.forEach(td => td.style.setProperty('background-color', col.tint, 'important'));
      if (target.tds[0]) target.tds[0].style.setProperty('box-shadow', 'inset 3px 0 0 ' + col.solid, 'important');
    } else {
      target.el.style.setProperty('background-color', col.tint, 'important');
      target.el.style.setProperty('outline', '2px solid ' + col.solid, 'important');
      target.el.style.setProperty('outline-offset', '-2px', 'important');
      target.el.style.setProperty('border-radius', '8px', 'important');
    }
  }

  function addRankCell(t, rank, col) {
    const td = document.createElement('td');
    td.className = 'efood-rank-col';
    td.style.cssText = 'text-align:center;padding:4px 4px;';
    if (rank != null && col) {
      const b = document.createElement('span');
      b.textContent = String(rank);
      b.style.cssText =
        'display:inline-block;min-width:20px;background:' + col.solid + ';color:' + col.text + ';' +
        'font-size:11px;font-weight:700;line-height:1.6;border-radius:4px;' +
        'padding:0 5px;font-family:sans-serif;';
      td.appendChild(b);
    }
    t.el.insertBefore(td, t.el.firstElementChild);
    t.tds = Array.from(t.el.querySelectorAll('td'));
  }

  function addValueCells(t, item, col) {
    const tds = COLS.map((c, i) => {
      const td = document.createElement('td');
      td.className = 'efood-col';
      td.textContent = String(c.val(item));
      td.style.cssText =
        'text-align:right;font-size:12px;white-space:nowrap;padding:4px 6px;' +
        'font-variant-numeric:tabular-nums;color:#333;' +
        (i === 0 ? 'font-weight:700;color:' + col.value + ';' : '');
      return td;
    });
    t.nameEl.after(...tds);
    t.tds = Array.from(t.el.querySelectorAll('td'));
  }

  function addNutriCell(t, ns) {
    const td = document.createElement('td');
    td.className = 'efood-nutri-col';
    td.style.cssText = 'text-align:center;padding:4px 2px;';
    if (ns && ns.letter && NS[ns.letter]) {
      const col = NS[ns.letter];
      const b = document.createElement('span');
      b.textContent = ns.letter;
      b.title = tpl(I18N.tooltip, { letter: ns.letter, score: ns.score });
      b.style.cssText =
        'display:inline-block;min-width:22px;background:' + col.solid + ';color:' + col.text + ';' +
        'font-size:12px;font-weight:800;line-height:1.6;border-radius:4px;' +
        'padding:0 5px;font-family:sans-serif;';
      td.appendChild(b);
    }
    const first = t.el.firstElementChild;
    if (first) first.after(td); else t.el.appendChild(td);
    t.tds = Array.from(t.el.querySelectorAll('td'));
  }

  function apply(data) {
    reset();
    ensureHeader();

    const ranked = [];
    const missing = [];

    getTargets().forEach(t => {
      let item = t.id ? data.byId[t.id] : null;
      if (!item && t.name) item = data.byName[norm(t.name)];
      if (item && item.energy_portion_food_one != null) ranked.push({ t, item });
      else missing.push(t);
    });

    // By Nutri-Score: best (A) first; within the same letter, the score, then kcal, decide.
    ranked.forEach(e => { e.ns = nutriScore(e.item); });
    ranked.sort((a, b) =>
      (a.ns.score - b.ns.score) ||
      (a.item.energy_portion_food_one - b.item.energy_portion_food_one));

    ranked.forEach((e, i) => {
      const rank = i + 1;
      const ns = e.ns;
      const col = NS[ns.letter];
      const t = e.t;
      t.el.dataset.efoodRank = String(rank);

      if (t.kind === 'row') {
        addRankCell(t, rank, col);
        addNutriCell(t, ns);
        addValueCells(t, e.item, col);
      } else if (t.nameEl) {
        const chip = document.createElement('span');
        chip.className = 'efood-rank-chip';
        chip.textContent = tpl(I18N.chip, { rank: rank, letter: ns.letter });
        chip.style.cssText =
          'display:inline-block;background:' + col.solid + ';color:' + col.text + ';' +
          'font-size:11px;font-weight:700;line-height:1.4;border-radius:4px;' +
          'padding:1px 5px;margin-right:4px;vertical-align:middle;font-family:sans-serif;';
        t.nameEl.prepend(chip);
        const tag = document.createElement('span');
        tag.className = 'efood-nutrition-tag';
        tag.textContent = tpl(I18N.tag, { nutrition: fmtInline(e.item) });
        tag.style.cssText = 'font-size:10px;color:#555;font-weight:400;';
        t.nameEl.appendChild(tag);
      }

      paint(t, col);
    });

    missing.forEach(t => {
      if (t.kind === 'row' && t.nameEl) {
        addRankCell(t, null, null);
        addNutriCell(t, null);
        const tds = COLS.map(() => {
          const td = document.createElement('td');
          td.className = 'efood-col';
          td.textContent = I18N.missingValue;
          td.style.cssText = 'text-align:right;font-size:12px;color:#707070;padding:4px 6px;white-space:nowrap;';
          return td;
        });
        t.nameEl.after(...tds);
        t.tds = Array.from(t.el.querySelectorAll('td'));
      }
      if (t.nameEl) {
        const tag = document.createElement('span');
        tag.className = 'efood-nutrition-tag';
        tag.textContent = I18N.missingLabel;
        tag.style.cssText = 'font-size:10px;color:#707070;font-weight:400;';
        t.nameEl.appendChild(tag);
      }
    });

    return document.querySelectorAll('table tr.data-row .efood-rank-col').length;
  }

  function signature() {
    return getTargets().map(t => t.id || norm(t.name)).join('|');
  }

  // Fixed corner loading pill with a spinner, shown while the cart fetch is in flight.
  const loadingEl = document.createElement('div');
  loadingEl.style.cssText =
    'display:none;position:fixed;right:14px;bottom:14px;z-index:2147483647;' +
    'align-items:center;gap:8px;background:#fff;color:#333;' +
    'font:12px/1 sans-serif;padding:8px 12px;border-radius:8px;' +
    'box-shadow:0 2px 10px rgba(0,0,0,0.18);border:1px solid #e0e0e0;';
  const spinner = document.createElement('span');
  spinner.style.cssText =
    'width:14px;height:14px;border:2px solid #ddd;border-top-color:#707070;' +
    'border-radius:50%;animation:efood-spin 0.8s linear infinite;flex:none;';
  const loadingText = document.createElement('span');
  loadingText.textContent = I18N.loading;
  loadingEl.append(spinner, loadingText);
  document.body.appendChild(loadingEl);

  const style = document.createElement('style');
  style.textContent = '@keyframes efood-spin{to{transform:rotate(360deg)}}';
  document.head.appendChild(style);

  const showLoading = () => { loadingEl.style.display = 'flex'; };
  const hideLoading = () => { loadingEl.style.display = 'none'; };

  let lastSig = '';
  let expectedRank = 0;
  let running = false;
  let pendingRun = false;

  async function run() {
    if (running) { pendingRun = true; return; }
    running = true;
    showLoading();
    try {
      const data = await loadCart();
      expectedRank = apply(data);
      lastSig = signature();
    } catch (err) {
      console.error(PREFIX, err);
    } finally {
      running = false;
      if (pendingRun) { pendingRun = false; run(); }
      else {
        // Keep the pill until the browser has actually painted the new cells/colors
        // (hideLoading runs synchronously, so it would otherwise vanish a frame early).
        requestAnimationFrame(() => requestAnimationFrame(hideLoading));
      }
    }
  }

  let timer = null;
  new MutationObserver(() => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      const sig = signature();
      const rankCells = document.querySelectorAll('table tr.data-row .efood-rank-col').length;
      // Re-run when the cart contents changed or the rank cells disappeared (re-render).
      if (sig !== lastSig || rankCells !== expectedRank) run();
    }, 350);
  }).observe(document.body, { childList: true, subtree: true });

  run();
})();
