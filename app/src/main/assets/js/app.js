(() => {
  const P = window.PANTRY, R = window.RECIPES, PHOTOS = window.PHOTOS || {}, CREDITS = window.CREDITS || {}, SP = window.STEP_PHOTOS || {}, CATS = window.CATEGORIES;
  const { STEP, ICON, stepKind } = window.ART;
  const M = {};
  for (const row of window.MEASURES) if (row[0]) M[row[0]] = row;

  const CUISINES = [...new Set(R.map(r => r.cuisine))].sort((a, b) => a.localeCompare(b, 'ru'));
  const GROUPS = [...new Set(Object.values(P).map(p => p[1]))].filter(g => g !== 'Базовое');
  const SAMPLE = ['egg', 'milk', 'onion', 'potato', 'carrot', 'garlic', 'tomato', 'chicken', 'cheese', 'flour', 'rice', 'butter', 'sourcream', 'pasta', 'soysauce', 'bread', 'mince'];
  const KEY = 'what-to-cook:v1';
  const DIFF = ['', 'легко', 'средне', 'сложно'];
  const app = window.AndroidApp || null;

  const $ = id => document.getElementById(id);
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const isBase = k => P[k] && P[k][1] === 'Базовое';
  const parse = row => { const opt = row[0][0] === '?'; return { key: opt ? row[0].slice(1) : row[0], qty: row[1], unit: row[2] || '', note: row[3] || '', opt }; };
  const fmtTime = m => m < 60 ? `${m} мин` : `${Math.floor(m / 60)} ч${m % 60 ? ' ' + (m % 60) + ' мин' : ''}`;
  const plural = (n, a, b, c) => { const m10 = n % 10, m100 = n % 100; return m10 === 1 && m100 !== 11 ? a : m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20) ? b : c; };
  const icon = name => ICON[name] || '';
  document.querySelectorAll('[data-icon]').forEach(el => { el.innerHTML = icon(el.dataset.icon); });

  const store = {
    load() { try { return JSON.parse(localStorage.getItem(KEY)) || null; } catch { return null; } },
    save() {
      try {
        localStorage.setItem(KEY, JSON.stringify({
          have: [...state.have], base: state.base, cat: state.cat, cuisines: [...state.cuisines], time: state.time,
          diff: state.diff, diet: [...state.diet], fav: [...state.fav], shop: state.shop, tab: state.tab,
          plan: state.plan, speak: state.speak, seen: state.seen,
          timer: timer.end ? { end: timer.end, label: timer.label, recipe: timer.recipe, step: timer.step } : null,
        }));
      } catch {}
    },
  };
  const saved = store.load();
  const state = {
    have: new Set(saved ? saved.have : SAMPLE),
    base: saved ? saved.base !== false : true,
    cat: saved && saved.cat || 'Все',
    cuisines: new Set(saved && saved.cuisines || []),
    time: saved && saved.time || 0,
    diff: saved && saved.diff || 0,
    diet: new Set(saved && saved.diet || (saved && saved.veg ? ['meat', 'fish'] : [])),
    fav: new Set(saved && saved.fav || []),
    shop: saved && saved.shop || {},
    plan: saved && saved.plan || [],
    speak: !!(saved && saved.speak),
    seen: saved && saved.seen || [],
    tab: saved && saved.tab || 'menu',
    ingQuery: '', dishQuery: '', showRest: false,
  };

  const RB = Object.fromEntries(R.map(r => [r.id, r]));
  for (const k of Object.keys(state.shop)) {
    const it = state.shop[k];
    it.r = (it.r || []).map(x => typeof x === 'string' ? { id: x, serv: RB[x] ? RB[x].serv : 1 } : x).filter(x => RB[x.id]);
  }
  const dayKey = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const today = () => dayKey(new Date());
  state.plan = state.plan.filter(p => p.d >= today() && RB[p.id]);

  let toastTimer;
  function toast(msg) {
    const t = $('toast'); t.textContent = msg; t.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 2400);
  }

  function analyze(r) {
    const req = new Set();
    for (const row of r.ing) {
      const it = parse(row);
      if (it.opt || (state.base && isBase(it.key))) continue;
      req.add(it.key);
    }
    const keys = [...req];
    const missing = keys.filter(k => !state.have.has(k));
    return { total: keys.length, have: keys.length - missing.length, missing };
  }
  const FISH = ['herring', 'fish', 'shrimp', 'fishsauce'];
  const DIETS = [
    ['meat', 'Без мяса', new Set(Object.keys(P).filter(k => P[k][1] === 'Мясо и рыба' && !FISH.includes(k)))],
    ['fish', 'Без рыбы и морепродуктов', new Set(FISH)],
    ['lactose', 'Без лактозы', new Set(Object.keys(P).filter(k => P[k][1] === 'Молочное и яйца' && k !== 'egg'))],
  ];
  const DIET = Object.fromEntries(DIETS.map(d => [d[0], d[2]]));
  const fitsDiet = r => ![...state.diet].some(d => DIET[d] && r.ing.some(row => { const it = parse(row); return !it.opt && DIET[d].has(it.key); }));

  const TABS = [
    ['menu', 'Меню', 'menu', 'Что <em>приготовить</em>?'],
    ['fridge', 'Холодильник', 'fridge', 'Мой <em>холодильник</em>'],
    ['plan', 'Неделя', 'calendar', 'Меню на <em>неделю</em>'],
    ['fav', 'Избранное', 'heart', '<em>Избранное</em>'],
    ['shop', 'Покупки', 'basket', 'Список <em>покупок</em>'],
  ];
  function renderTabbar() {
    const shopN = shopKeys().filter(k => !state.shop[k].done).length;
    $('tabbar').innerHTML = TABS.map(([id, label, ic]) => {
      const badge = id === 'shop' && shopN ? `<b class="badge">${shopN}</b>` : id === 'fav' && state.fav.size ? `<b class="badge soft">${state.fav.size}</b>` : id === 'plan' && state.plan.length ? `<b class="badge soft">${state.plan.length}</b>` : '';
      return `<button type="button" data-tab="${id}" aria-current="${state.tab === id ? 'page' : 'false'}"><span class="ico">${icon(ic)}${badge}</span><span>${label}</span></button>`;
    }).join('');
  }
  function renderHeader() {
    const t = TABS.find(x => x[0] === state.tab);
    $('title').innerHTML = t[3];
    let k = '';
    if (state.tab === 'menu') k = `Домашняя кухня · ${R.length} ${plural(R.length, 'рецепт', 'рецепта', 'рецептов')} · ${CUISINES.length} ${plural(CUISINES.length, 'кухня', 'кухни', 'кухонь')}`;
    if (state.tab === 'fridge') { const n = haveCount(); k = `Отмечено ${n} ${plural(n, 'продукт', 'продукта', 'продуктов')}`; }
    if (state.tab === 'plan') { const n = state.plan.length; k = n ? `${n} ${plural(n, 'блюдо', 'блюда', 'блюд')} на 7 дней` : 'Ближайшие 7 дней'; }
    if (state.tab === 'fav') k = `${state.fav.size} ${plural(state.fav.size, 'блюдо', 'блюда', 'блюд')}`;
    if (state.tab === 'shop') { const n = shopKeys().length; k = `${n} ${plural(n, 'позиция', 'позиции', 'позиций')}`; }
    $('kicker').textContent = k;
  }
  function setTab(tab) {
    state.tab = tab; store.save();
    for (const [id] of TABS) $('view-' + id).hidden = id !== tab;
    renderTabbar(); renderHeader();
    if (tab === 'menu') renderResults();
    if (tab === 'fridge') renderPantry();
    if (tab === 'fav') renderFav();
    if (tab === 'shop') renderShop();
    if (tab === 'plan') renderPlan();
    window.scrollTo(0, 0);
  }
  $('tabbar').addEventListener('click', e => { const b = e.target.closest('[data-tab]'); if (b) setTab(b.dataset.tab); });

  const haveCount = () => [...state.have].filter(k => P[k] && (!state.base || !isBase(k))).length;
  function groupCount(g) {
    const keys = Object.keys(P).filter(k => P[k][1] === g);
    return `<b>${keys.filter(k => state.have.has(k)).length}</b> / ${keys.length}`;
  }
  function renderPantry() {
    const q = state.ingQuery.trim().toLowerCase();
    const groups = state.base ? GROUPS : [...GROUPS, 'Базовое'];
    $('groups').innerHTML = groups.map(g => {
      const items = Object.entries(P).filter(([, v]) => v[1] === g && (!q || v[0].toLowerCase().includes(q)));
      if (!items.length) return '';
      return `<div class="group" data-group="${esc(g)}"><div class="group-head"><h3>${esc(g)}</h3><span class="gcount">${groupCount(g)}</span></div>
        <div class="chips">${items.map(([k, v]) => `<button type="button" class="chip" data-ing="${k}" aria-pressed="${state.have.has(k)}">${esc(v[0])}</button>`).join('')}</div></div>`;
    }).join('') || '<p class="empty">Такого продукта в списке нет.</p>';
    renderHeader();
  }
  $('groups').addEventListener('click', e => {
    const b = e.target.closest('[data-ing]'); if (!b) return;
    const k = b.dataset.ing;
    state.have.has(k) ? state.have.delete(k) : state.have.add(k);
    b.setAttribute('aria-pressed', state.have.has(k));
    b.closest('.group').querySelector('.gcount').innerHTML = groupCount(P[k][1]);
    store.save(); renderHeader();
  });
  $('ingSearch').addEventListener('input', e => { state.ingQuery = e.target.value; renderPantry(); });
  let clearArmedFridge = false;
  $('clearAll').addEventListener('click', e => {
    if (!clearArmedFridge) { clearArmedFridge = true; e.target.textContent = 'Точно снять все?'; setTimeout(() => { clearArmedFridge = false; e.target.textContent = 'Снять все'; }, 3000); return; }
    clearArmedFridge = false; e.target.textContent = 'Снять все';
    state.have.clear(); store.save(); renderPantry();
  });
  $('baseToggle').checked = state.base;
  $('baseToggle').addEventListener('change', e => { state.base = e.target.checked; store.save(); renderPantry(); });

  function renderMeals() {
    $('meals').innerHTML = ['Все', ...CATS].map(c => `<button type="button" data-cat="${c}" aria-pressed="${state.cat === c}">${c === 'Все' ? 'Всё' : c}</button>`).join('');
    const n = state.cuisines.size + (state.time ? 1 : 0) + (state.diff ? 1 : 0) + state.diet.size;
    $('filterCount').hidden = !n; $('filterCount').textContent = n;
  }
  $('meals').addEventListener('click', e => { const b = e.target.closest('[data-cat]'); if (!b) return; state.cat = b.dataset.cat; store.save(); renderMeals(); renderResults(); });
  $('dishSearch').addEventListener('input', e => { state.dishQuery = e.target.value; renderResults(); });
  $('surpriseBtn').addEventListener('click', () => {
    const list = filtered();
    if (!list.length) { toast('Под эти фильтры нечего предложить'); return; }
    if (list.length === 1) { toast('Под фильтры подходит только одно блюдо'); openRecipe(list[0].r.id); return; }
    const tiers = [list.filter(x => !x.a.missing.length), list.filter(x => x.a.missing.length > 0 && x.a.missing.length <= 2), list.filter(x => x.a.missing.length > 2)];
    const last = state.seen[state.seen.length - 1];
    let seen = new Set(state.seen);
    let tier = tiers.findIndex(t => t.some(x => !seen.has(x.r.id)));
    if (tier < 0) {
      const ids = new Set(list.map(x => x.r.id));
      state.seen = state.seen.filter(id => !ids.has(id) || id === last);
      seen = new Set(state.seen);
      tier = tiers.findIndex(t => t.some(x => !seen.has(x.r.id)));
      toast('Показал всё подходящее, начинаю заново');
    } else if (tier > 0 && last && tiers.slice(0, tier).some(t => t.some(x => x.r.id === last))) {
      toast(tier === 1 ? 'Всё, что можно приготовить сейчас, уже было. Вот блюдо, где не хватает пары продуктов' : 'Вот что-то новенькое, но за продуктами придётся сходить');
    }
    const opts = tiers[tier].filter(x => !seen.has(x.r.id));
    const pick = opts[Math.floor(Math.random() * opts.length)].r;
    state.seen = state.seen.filter(id => id !== pick.id).concat(pick.id).slice(-400);
    store.save();
    openRecipe(pick.id);
  });

  function photoHTML(r, cls = '') {
    const p = PHOTOS[r.id];
    return p ? `<img class="${cls}" src="${esc(p.file)}" alt="" loading="lazy" data-ph="${esc(r.name[0])}">` : placeholder(r.name[0]);
  }
  const placeholder = () => `<div class="ph">${STEP.serve}</div>`;
  document.addEventListener('error', e => {
    const img = e.target;
    if (img.tagName === 'IMG' && img.dataset.ph != null) img.outerHTML = placeholder(img.dataset.ph);
  }, true);

  function card(r, a) {
    const dots = Array.from({ length: a.total }, (_, i) => `<i${i >= a.have ? ' class="no"' : ''}></i>`).join('');
    const miss = a.missing.map(k => P[k][0].toLowerCase());
    return `<article class="card" data-id="${r.id}">
      <button type="button" class="fav" data-fav="${r.id}" aria-pressed="${state.fav.has(r.id)}" aria-label="Избранное: ${esc(r.name)}">${icon('heart')}</button>
      <button type="button" class="card-open">
        <div class="photo">${photoHTML(r)}${a.missing.length ? '' : '<span class="stamp">всё есть</span>'}</div>
        <div class="cmeta mono"><span>${fmtTime(r.time)}</span><span>${esc(r.cuisine.toLowerCase())}</span></div>
        <h3>${esc(r.name)}</h3>
        <div class="tally"><span class="dots" aria-hidden="true">${dots}</span><span class="mono">${a.have}/${a.total}</span></div>
        ${a.missing.length ? `<div class="miss"><b>купить</b> ${esc(miss.join(', '))}</div>` : ''}
      </button>
    </article>`;
  }
  const grid = list => `<div class="grid">${list.map(x => card(x.r, x.a)).join('')}</div>`;
  function section(title, list, note) {
    return `<div class="shead"><h2>${title}</h2><span class="mono">${list.length}</span>${note ? `<p>${note}</p>` : ''}</div>${grid(list)}`;
  }
  function filtered() {
    const q = state.dishQuery.trim().toLowerCase();
    return R.filter(r =>
      (state.cat === 'Все' || r.cats.includes(state.cat)) &&
      (!state.cuisines.size || state.cuisines.has(r.cuisine)) &&
      (!state.time || r.time <= state.time) &&
      (!state.diff || r.diff === state.diff) &&
      fitsDiet(r) &&
      (!q || r.name.toLowerCase().includes(q) || r.ing.some(row => P[parse(row).key][0].toLowerCase().includes(q)))
    ).map(r => ({ r, a: analyze(r) }))
      .sort((x, y) => x.a.missing.length - y.a.missing.length || (y.a.have / (y.a.total || 1)) - (x.a.have / (x.a.total || 1)) || x.r.time - y.r.time);
  }
  function renderResults() {
    const list = filtered();
    const ready = list.filter(x => !x.a.missing.length);
    const near = list.filter(x => x.a.missing.length > 0 && x.a.missing.length <= 2);
    const rest = list.filter(x => x.a.missing.length > 2);
    const allReady = R.filter(r => !analyze(r).missing.length).length;
    $('readyLine').innerHTML = allReady
      ? `Из того, что есть дома, получится <b>${allReady} ${plural(allReady, 'блюдо', 'блюда', 'блюд')}</b>.`
      : `Отметьте продукты во вкладке «Холодильник», и здесь появится то, что можно приготовить прямо сейчас.`;
    let html = '';
    if (!list.length) html = `<div class="empty-art">${STEP.spoon}<p class="empty">Под эти фильтры ничего не нашлось. Попробуйте снять часть фильтров.</p></div>`;
    else {
      html += ready.length ? section('Можно готовить сейчас', ready)
        : `<div class="shead"><h2>Можно готовить сейчас</h2><span class="mono">0</span></div><p class="empty">Из отмеченного пока ничего не собирается целиком. Ниже — блюда, для которых не хватает одного-двух продуктов.</p>`;
      if (near.length) html += section('Докупить пару продуктов', near, 'Чего не хватает, отмечено оранжевым.');
      if (rest.length) html += state.showRest || state.dishQuery.trim() ? section('Остальное меню', rest, 'Здесь не хватает трёх и больше продуктов.')
        : `<div class="more"><button type="button" class="morebtn" id="showRest">Остальное меню · ${rest.length}</button></div>`;
    }
    $('results').innerHTML = html;
  }
  function onCardsClick(e) {
    if (e.target.id === 'showRest') { state.showRest = true; renderResults(); return; }
    const f = e.target.closest('[data-fav]'); if (f) { toggleFav(f.dataset.fav); return; }
    const c = e.target.closest('.card-open'); if (c) openRecipe(c.closest('.card').dataset.id);
  }
  $('results').addEventListener('click', onCardsClick);
  $('favList').addEventListener('click', onCardsClick);

  function toggleFav(id) {
    state.fav.has(id) ? state.fav.delete(id) : state.fav.add(id);
    store.save();
    document.querySelectorAll(`[data-fav="${id}"]`).forEach(b => b.setAttribute('aria-pressed', state.fav.has(id)));
    toast(state.fav.has(id) ? 'Добавлено в избранное' : 'Убрано из избранного');
    renderTabbar(); renderHeader();
    if (state.tab === 'fav') renderFav();
  }
  function renderFav() {
    const list = R.filter(r => state.fav.has(r.id)).map(r => ({ r, a: analyze(r) }));
    $('favList').innerHTML = list.length ? grid(list)
      : `<div class="empty-art">${STEP.serve}<p class="empty">Здесь будут блюда, которые вы отметили сердечком. Нажмите его на фото блюда в меню.</p></div>`;
  }

  function renderFilters() {
    const count = filteredWith().length;
    $('filters').innerHTML = `<div class="sheet-in">
      <div class="grab"></div>
      <div class="sheet-head"><h2>Фильтры</h2><button type="button" class="iconbtn" data-close aria-label="Закрыть">${icon('close')}</button></div>
      <div class="fgroup"><div class="kicker">Питание</div><div class="chips">
        ${DIETS.map(([id, label]) => `<button type="button" class="chip" data-diet="${id}" aria-pressed="${state.diet.has(id)}">${label}</button>`).join('')}</div>
        ${state.diet.has('lactose') ? '<p class="hint">Без молока, сливок, масла, сыра, творога и других молочных продуктов. Продукты «по желанию» не учитываются.</p>' : ''}</div>
      <div class="fgroup"><div class="kicker">Время</div><div class="chips">
        ${[[0, 'любое'], [30, 'до 30 минут'], [60, 'до часа']].map(([v, l]) => `<button type="button" class="chip" data-time="${v}" aria-pressed="${state.time === v}">${l}</button>`).join('')}</div></div>
      <div class="fgroup"><div class="kicker">Сложность</div><div class="chips">
        ${[[0, 'любая'], [1, 'легко'], [2, 'средне'], [3, 'сложно']].map(([v, l]) => `<button type="button" class="chip" data-diff="${v}" aria-pressed="${state.diff === v}">${l}</button>`).join('')}</div></div>
      <div class="fgroup"><div class="kicker">Кухня</div><div class="chips">
        ${CUISINES.map(c => `<button type="button" class="chip" data-cui="${esc(c)}" aria-pressed="${state.cuisines.has(c)}">${esc(c)}</button>`).join('')}</div></div>
      <div class="sheet-actions"><button type="button" class="btn" id="resetFilters">Сбросить</button><button type="button" class="btn primary" data-close>Показать ${count}</button></div>
    </div>`;
  }
  const filteredWith = () => filtered();
  $('filtersBtn').addEventListener('click', () => { renderFilters(); openSheet($('filters')); });
  $('filters').addEventListener('click', e => {
    const d = $('filters');
    if (e.target === d || e.target.closest('[data-close]')) { closeSheet(d); return; }
    const c = e.target.closest('[data-cui]'), t = e.target.closest('[data-time]'), df = e.target.closest('[data-diff]'), dt = e.target.closest('[data-diet]');
    if (dt) { const v = dt.dataset.diet; state.diet.has(v) ? state.diet.delete(v) : state.diet.add(v); }
    else if (c) { const v = c.dataset.cui; state.cuisines.has(v) ? state.cuisines.delete(v) : state.cuisines.add(v); }
    else if (t) state.time = +t.dataset.time;
    else if (df) state.diff = +df.dataset.diff;
    else if (e.target.id === 'resetFilters') { state.cuisines.clear(); state.time = 0; state.diff = 0; state.diet.clear(); }
    else return;
    store.save(); renderFilters(); renderMeals(); renderResults();
  });
  $('filters').addEventListener('close', () => { renderMeals(); renderResults(); });

  function openSheet(d) { if (!d.open) d.showModal(); d.classList.remove('closing'); }
  function closeSheet(d) {
    if (!d.open) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { d.close(); return; }
    d.classList.add('closing');
    setTimeout(() => { d.classList.remove('closing'); d.close(); }, 180);
  }

  const FRAC = { 0.25: '¼', 0.5: '½', 0.75: '¾', 0.33: '⅓', 0.67: '⅔' };
  function fmtNum(q) {
    const whole = Math.floor(q), f = Math.round((q - whole) * 100) / 100;
    const near = Object.keys(FRAC).map(Number).find(x => Math.abs(x - f) < 0.09);
    if (f < 0.09) return whole > 0 ? String(whole) : String(q.toFixed(1)).replace('.', ',');
    if (f > 0.91) return String(whole + 1);
    if (near != null) return (whole || '') + FRAC[near];
    return q.toFixed(1).replace('.', ',');
  }
  function fmtQty(q, unit) {
    if (q == null) return 'по вкусу';
    if (['г', 'мл'].includes(unit)) q = q >= 20 ? Math.round(q / 5) * 5 : Math.round(q);
    else q = fmtNum(q);
    return `${q} ${unit}`.trim();
  }
  function spoonHint(key, q, unit) {
    if (q == null || !M[key] || !['г', 'мл'].includes(unit)) return '';
    const [, , tsp, tbsp, , g250] = M[key];
    const vol = unit === 'мл';
    const t = vol ? 5 : tsp, T = vol ? 15 : tbsp, G = vol ? 250 : g250;
    const nT = q / T;
    if (nT < 0.75) { const n = Math.round((q / t) * 2) / 2; return n >= 0.5 ? `≈ ${fmtNum(n)} ч. л.` : ''; }
    if (nT <= 6) return `≈ ${fmtNum(Math.round(nT * 2) / 2)} ст. л.`;
    const g = q / G;
    return g <= 6 ? `≈ ${fmtNum(Math.round(g * 4) / 4)} стак.` : '';
  }

  let current = null, servings = 0;
  function openRecipe(id, serv) {
    const r = R.find(x => x.id === id); if (!r) return;
    current = r; servings = serv || r.serv;
    drawRecipe();
    const d = $('recipe');
    openSheet(d);
    d.scrollTop = 0;
    try { history.replaceState(null, '', '#' + id); } catch {}
  }
  const shopKeys = () => Object.keys(state.shop).filter(k => P[k]);
  const inShop = r => analyze(r).missing.every(k => state.shop[k] && state.shop[k].r.some(x => x.id === r.id));
  const stepPhoto = (id, i) => SP[id] && SP[id][i + 1] || '';
  function photoCredit(id) {
    const p = PHOTOS[id], c = CREDITS[id];
    if (c) {
      const author = c.file ? `<a href="${esc(c.file)}" target="_blank" rel="noopener">${esc(c.author)}</a>` : esc(c.author);
      const lic = c.licenseUrl ? `<a href="${esc(c.licenseUrl)}" target="_blank" rel="noopener">${esc(c.license)}</a>` : esc(c.license);
      return `<p class="credit">Фото: ${author} · ${lic} · Викисклад</p>`;
    }
    return p && p.page ? `<p class="credit">Фото: <a href="${esc(p.page)}" target="_blank" rel="noopener">из статьи Википедии</a></p>` : '';
  }
  function drawRecipe() {
    const r = current, k = servings / r.serv, a = analyze(r), p = PHOTOS[r.id];
    const rows = r.ing.map(row => {
      const it = parse(row), name = P[it.key][0];
      const base = isBase(it.key) && state.base;
      const has = state.have.has(it.key) || base;
      const cls = base ? 'base' : has ? '' : it.opt ? 'opt' : 'no';
      const extra = [it.note, it.opt ? 'по желанию' : ''].filter(Boolean).join(' · ');
      const q = it.qty == null ? null : it.qty * k;
      const hint = spoonHint(it.key, q, it.unit);
      return `<li class="${cls}"><span class="nm">${esc(name)}${!has && !it.opt ? '<span class="tag">купить</span>' : ''}${extra ? `<small>${esc(extra)}</small>` : ''}</span>
        <span class="lead" aria-hidden="true"></span><span class="amt">${esc(fmtQty(q, it.unit))}${hint ? `<small>${hint}</small>` : ''}</span></li>`;
    }).join('');
    const buy = !a.missing.length ? ''
      : inShop(r) ? `<button type="button" class="tile on" id="openShopBtn">${icon('basket')}<span>В покупках</span></button>`
      : `<button type="button" class="tile" id="addShopBtn">${icon('basket')}<span>Купить · ${a.missing.length}</span></button>`;
    $('recipe').innerHTML = `<div class="sheet-in recipe">
      <div class="grab"></div>
      <div class="hero">${p ? photoHTML(r) : placeholder(r.name[0])}
        <button type="button" class="iconbtn on-photo" data-close aria-label="Закрыть">${icon('close')}</button></div>
      <div class="rbody">
        <div class="kicker">${esc(r.cuisine)} кухня · ${r.cats.join(', ').toLowerCase()}</div>
        <h2 id="recipeTitle">${esc(r.name)}</h2>
        <p class="lede">${esc(r.desc)}</p>
        <div class="ticket">
          <div><small>Время</small><strong>${fmtTime(r.time)}</strong></div>
          <div><small>Порции</small><div class="stepper"><button type="button" id="servMinus" aria-label="Меньше порций">−</button><strong>${servings}</strong><button type="button" id="servPlus" aria-label="Больше порций">+</button></div></div>
          <div><small>Сложность</small><strong>${DIFF[r.diff]}</strong></div>
          <div><small>Есть дома</small><strong>${a.have} из ${a.total}</strong></div>
        </div>
        <div class="actions">
          <button type="button" class="btn primary" id="cookBtn">${icon('play')}Готовить по шагам</button>
          <div class="tiles">
            <button type="button" class="tile fav-btn" data-fav="${r.id}" aria-pressed="${state.fav.has(r.id)}">${icon('heart')}<span class="on">В избранном</span><span class="off">В избранное</span></button>
            <button type="button" class="tile" id="planBtn">${icon('calendar')}<span>На неделю</span></button>
            ${buy}
            <button type="button" class="tile" id="shareRecipe">${icon('share')}<span>Поделиться</span></button>
          </div>
        </div>
        <div class="cols">
          <section>
            <h3>Продукты <span>на ${servings} ${plural(servings, 'порцию', 'порции', 'порций')}</span></h3>
            <ul class="ing">${rows}</ul>
            <button type="button" class="textbtn" data-open-measures>Сколько граммов в ложке?</button>
          </section>
          <section>
            <h3>Как готовить</h3>
            <a class="photo-steps" href="https://yandex.ru/images/search?text=${encodeURIComponent(r.name + ' рецепт пошагово с фото')}" target="_blank" rel="noopener">${icon('search')}<span>Пошаговые фото этого блюда в интернете</span><span class="arrow">↗</span></a>
            <ol class="steps">${r.steps.map((s, i) => `<li${stepPhoto(r.id, i) ? ' class="has-photo"' : ''}>${stepPhoto(r.id, i) ? `<img class="sphoto" src="${esc(stepPhoto(r.id, i))}" alt="Шаг ${i + 1}" loading="lazy">` : `<span class="sart">${STEP[stepKind(s)]}</span>`}<span class="snum">${i + 1}</span><label><input type="checkbox"><span>${esc(s)}</span></label></li>`).join('')}</ol>
          </section>
        </div>
        ${photoCredit(r.id)}
      </div>
    </div>`;
  }
  $('recipe').addEventListener('click', e => {
    const d = $('recipe');
    if (e.target === d || e.target.closest('[data-close]')) { closeSheet(d); return; }
    const fb = e.target.closest('[data-fav]'); if (fb) { toggleFav(fb.dataset.fav); return; }
    if (e.target.closest('#addShopBtn')) { addMissing(current, servings); drawRecipe(); return; }
    if (e.target.closest('#openShopBtn')) { closeSheet(d); setTab('shop'); return; }
    if (e.target.closest('#cookBtn')) { startCook(current); return; }
    if (e.target.closest('#planBtn')) { openDayPick(); return; }
    if (e.target.closest('#shareRecipe')) { shareText(recipeText(current, servings), 'Рецепт скопирован'); return; }
    if (e.target.closest('[data-open-measures]')) { openMeasures(); return; }
    if (e.target.id === 'servMinus' && servings > 1) { servings--; drawRecipe(); }
    if (e.target.id === 'servPlus' && servings < 20) { servings++; drawRecipe(); }
  });
  function recipeText(r, serv) {
    const k = serv / r.serv;
    const ing = r.ing.map(parse).map(it => `— ${P[it.key][0]}${it.qty == null ? ', по вкусу' : ' — ' + fmtQty(it.qty * k, it.unit)}${it.opt ? ' (по желанию)' : ''}`);
    return `${r.name}\n${r.desc}\n\nПродукты на ${serv} ${plural(serv, 'порцию', 'порции', 'порций')}:\n${ing.join('\n')}\n\nКак готовить:\n${r.steps.map((s, i) => `${i + 1}. ${s}`).join('\n')}`;
  }
  $('recipe').addEventListener('close', () => {
    try { history.replaceState(null, '', location.pathname + location.search); } catch {}
    if (state.tab === 'menu') renderResults();
    if (state.tab === 'fav') renderFav();
    if (state.tab === 'plan') renderPlan();
  });

  function putMissing(r, serv) {
    const miss = analyze(r).missing;
    for (const k of miss) {
      const it = state.shop[k] || (state.shop[k] = { r: [], done: false });
      const ex = it.r.find(x => x.id === r.id);
      if (ex) ex.serv = serv; else it.r.push({ id: r.id, serv });
      it.done = false;
    }
    return miss.length;
  }
  function addMissing(r, serv) {
    const n = putMissing(r, serv || r.serv);
    store.save(); renderTabbar();
    toast(`В список покупок: ${n} ${plural(n, 'продукт', 'продукта', 'продуктов')}`);
  }
  function amounts(k, list) {
    const sum = {};
    let toTaste = false;
    for (const { id, serv } of list) {
      const r = RB[id];
      for (const it of r.ing.map(parse).filter(it => it.key === k)) {
        if (it.qty == null) { toTaste = true; continue; }
        sum[it.unit] = (sum[it.unit] || 0) + it.qty * serv / r.serv;
      }
    }
    const parts = Object.entries(sum).map(([u, q]) => fmtQty(q, u));
    if (!parts.length && toTaste) parts.push('по вкусу');
    return parts.join(' + ');
  }
  const total = k => amounts(k, state.shop[k].r);
  function usage(k) {
    const list = state.shop[k].r;
    if (list.length < 2) return list.map(x => `${RB[x.id].name}, ${x.serv} ${plural(x.serv, 'порция', 'порции', 'порций')}`).join('');
    return list.map(x => `${RB[x.id].name} — ${amounts(k, [x])}`).join('; ');
  }
  function shareText(text, done) {
    if (app && app.share) { try { app.share(text); return; } catch {} }
    if (navigator.share) { navigator.share({ text }).catch(() => {}); return; }
    try { navigator.clipboard.writeText(text).then(() => toast(done || 'Скопировано'), () => toast('Не получилось поделиться')); }
    catch { toast('Не получилось поделиться'); }
  }
  const shopText = () => 'Список покупок:\n' + shopKeys().filter(k => !state.shop[k].done).map(k => `— ${P[k][0]}${total(k) ? ' — ' + total(k) : ''}`).join('\n');
  let clearArmed = false;
  function renderShop() {
    const order = [...GROUPS, 'Базовое'];
    const keys = shopKeys().sort((a, b) => order.indexOf(P[a][1]) - order.indexOf(P[b][1]));
    const doneN = keys.filter(k => state.shop[k].done).length;
    $('shopList').innerHTML = keys.length ? `<ul class="shoplist">${keys.map(k => `<li class="${state.shop[k].done ? 'done' : ''}">
        <label><input type="checkbox" data-sk="${k}"${state.shop[k].done ? ' checked' : ''}><span class="nm">${esc(P[k][0])}<small>${esc(usage(k))}</small></span><span class="qty">${esc(total(k))}</span></label>
        <button type="button" class="iconbtn rm" data-rm="${k}" aria-label="Убрать ${esc(P[k][0])}">${icon('close')}</button></li>`).join('')}</ul>
      <div class="shop-actions">
        <button type="button" class="btn primary" id="toFridge"${doneN ? '' : ' disabled'}>Купленное — в холодильник${doneN ? ` · ${doneN}` : ''}</button>
        <button type="button" class="btn" id="shareShop">${icon('share')}Поделиться</button>
        <button type="button" class="btn" id="copyShop">Скопировать</button>
        <button type="button" class="btn" id="clearShop">${clearArmed ? 'Точно очистить?' : 'Очистить'}</button>
      </div>
      <p class="hint">Отмечайте купленное прямо в магазине, а дома нажмите «Купленное — в холодильник»: продукты отметятся как имеющиеся.</p>`
      : `<div class="empty-art">${STEP.chop}<p class="empty">Список пуст. Откройте рецепт и нажмите «Купить недостающее».</p></div>`;
    renderHeader(); renderTabbar();
  }
  $('shopList').addEventListener('change', e => {
    const k = e.target.dataset.sk; if (!k) return;
    state.shop[k].done = e.target.checked; store.save(); renderShop();
  });
  $('shopList').addEventListener('click', e => {
    const rm = e.target.closest('[data-rm]');
    if (rm) { delete state.shop[rm.dataset.rm]; store.save(); renderShop(); return; }
    if (e.target.closest('#toFridge')) {
      const done = shopKeys().filter(k => state.shop[k].done);
      if (!done.length) return;
      done.forEach(k => { state.have.add(k); delete state.shop[k]; });
      store.save(); renderShop();
      toast(`Теперь в холодильнике: ${done.length} ${plural(done.length, 'продукт', 'продукта', 'продуктов')}`);
      return;
    }
    if (e.target.closest('#shareShop')) { shareText(shopText(), 'Список скопирован'); return; }
    if (e.target.closest('#copyShop')) {
      const text = shopText();
      if (app && app.copy) { try { app.copy(text); toast('Список скопирован'); } catch { toast('Не получилось скопировать'); } return; }
      try { navigator.clipboard.writeText(text).then(() => toast('Список скопирован'), () => toast('Не получилось скопировать')); }
      catch { toast('Не получилось скопировать'); }
      return;
    }
    if (e.target.closest('#clearShop')) {
      if (!clearArmed) { clearArmed = true; renderShop(); setTimeout(() => { if (clearArmed) { clearArmed = false; if (state.tab === 'shop') renderShop(); } }, 3000); return; }
      state.shop = {}; clearArmed = false; store.save(); renderShop();
    }
  });

  const WD = ['воскресенье', 'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота'];
  const MON = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
  function week() {
    const out = [], d = new Date();
    for (let i = 0; i < 7; i++) {
      const x = new Date(d.getFullYear(), d.getMonth(), d.getDate() + i);
      const name = i === 0 ? 'Сегодня' : i === 1 ? 'Завтра' : WD[x.getDay()][0].toUpperCase() + WD[x.getDay()].slice(1);
      out.push({ key: dayKey(x), name, date: `${x.getDate()} ${MON[x.getMonth()]}`, short: i === 0 ? 'сегодня' : i === 1 ? 'завтра' : WD[x.getDay()] });
    }
    return out;
  }
  let pickDay = null;
  function renderPlan() {
    const days = week();
    const has = state.plan.length;
    $('planList').innerHTML = `<p class="ready-line">Разложите блюда по дням, и список покупок на всю неделю соберётся одной кнопкой.</p>
      <div class="days">${days.map(d => {
        const items = state.plan.map((p, i) => ({ ...p, i })).filter(p => p.d === d.key);
        return `<section class="day"><div class="day-head"><h3>${d.name}</h3><span class="mono">${d.date}</span></div>
          ${items.map(p => { const r = RB[p.id]; return `<div class="plan-item">
            <button type="button" class="pi-open" data-plan-open="${p.i}"><span class="pi-photo">${photoHTML(r)}</span><span class="pi-name">${esc(r.name)}<small>${fmtTime(r.time)}</small></span></button>
            <div class="stepper small"><button type="button" data-plan-minus="${p.i}" aria-label="Меньше порций">−</button><strong>${p.serv}</strong><button type="button" data-plan-plus="${p.i}" aria-label="Больше порций">+</button></div>
            <button type="button" class="iconbtn rm" data-plan-rm="${p.i}" aria-label="Убрать ${esc(r.name)}">${icon('close')}</button></div>`; }).join('')}
          <button type="button" class="add-dish" data-plan-add="${d.key}">${icon('plus')}Добавить блюдо</button></section>`;
      }).join('')}</div>
      ${has ? `<div class="shop-actions"><button type="button" class="btn primary" id="planToShop">${icon('basket')}Собрать список покупок</button><button type="button" class="btn" id="sharePlan">${icon('share')}Поделиться меню</button></div>
      <p class="hint">В список попадёт только то, чего нет в холодильнике. Количество посчитается на выбранное число порций.</p>` : ''}`;
    renderHeader(); renderTabbar();
  }
  $('planList').addEventListener('click', e => {
    const b = e.target.closest('[data-plan-open],[data-plan-minus],[data-plan-plus],[data-plan-rm],[data-plan-add]');
    if (b) {
      const ds = b.dataset;
      if (ds.planAdd) { pickDay = ds.planAdd; openPicker(); return; }
      const i = +(ds.planOpen ?? ds.planMinus ?? ds.planPlus ?? ds.planRm), p = state.plan[i];
      if (ds.planOpen != null) { openRecipe(p.id, p.serv); return; }
      if (ds.planMinus != null && p.serv > 1) p.serv--;
      if (ds.planPlus != null && p.serv < 20) p.serv++;
      if (ds.planRm != null) state.plan.splice(i, 1);
      store.save(); renderPlan(); return;
    }
    if (e.target.closest('#planToShop')) {
      const agg = {};
      for (const p of state.plan) agg[p.id] = (agg[p.id] || 0) + p.serv;
      let n = 0;
      const before = new Set(shopKeys());
      for (const [id, serv] of Object.entries(agg)) n += putMissing(RB[id], serv);
      store.save(); renderTabbar();
      const added = shopKeys().filter(k => !before.has(k)).length;
      toast(n ? `Список покупок обновлён${added ? `: +${added} ${plural(added, 'продукт', 'продукта', 'продуктов')}` : ''}` : 'Всё нужное уже есть в холодильнике');
      return;
    }
    if (e.target.closest('#sharePlan')) {
      const text = 'Меню на неделю:\n' + week().map(d => {
        const items = state.plan.filter(p => p.d === d.key);
        return items.length ? `${d.name}, ${d.date}: ${items.map(p => RB[p.id].name).join(', ')}` : '';
      }).filter(Boolean).join('\n');
      shareText(text, 'Меню скопировано');
    }
  });
  function addToPlan(id, d, serv) {
    state.plan.push({ d, id, serv });
    state.plan.sort((a, b) => a.d.localeCompare(b.d));
    store.save(); renderTabbar();
    const day = week().find(x => x.key === d);
    toast(`${RB[id].name} — ${day ? day.short : d}`);
  }
  function openDayPick() {
    $('daypick').innerHTML = `<div class="sheet-in">
      <div class="grab"></div>
      <div class="sheet-head"><h2>На какой день?</h2><button type="button" class="iconbtn" data-close aria-label="Закрыть">${icon('close')}</button></div>
      <p class="hint">${esc(current.name)}, ${servings} ${plural(servings, 'порция', 'порции', 'порций')}</p>
      <div class="daygrid">${week().map(d => `<button type="button" class="dayopt" data-day="${d.key}"><b>${d.name}</b><span>${d.date}</span><i>${state.plan.filter(p => p.d === d.key).length || ''}</i></button>`).join('')}</div>
    </div>`;
    openSheet($('daypick'));
  }
  $('daypick').addEventListener('click', e => {
    const d = $('daypick');
    if (e.target === d || e.target.closest('[data-close]')) { closeSheet(d); return; }
    const b = e.target.closest('[data-day]'); if (!b) return;
    addToPlan(current.id, b.dataset.day, servings);
    closeSheet(d); drawRecipe();
  });
  let pickQuery = '';
  function pickerList() {
    const q = pickQuery.trim().toLowerCase();
    let list = R.map(r => ({ r, a: analyze(r) })).filter(x => fitsDiet(x.r));
    if (q) list = list.filter(x => x.r.name.toLowerCase().includes(q) || x.r.ing.some(row => P[parse(row).key][0].toLowerCase().includes(q)));
    list.sort((x, y) => (state.fav.has(y.r.id) - state.fav.has(x.r.id)) || x.a.missing.length - y.a.missing.length || x.r.name.localeCompare(y.r.name, 'ru'));
    return list.slice(0, 40).map(({ r, a }) => `<button type="button" class="pick" data-pick="${r.id}"><span class="pi-photo">${photoHTML(r)}</span>
      <span class="pi-name">${esc(r.name)}<small>${state.fav.has(r.id) ? '♥ ' : ''}${a.missing.length ? `не хватает: ${a.missing.length}` : 'всё есть'} · ${fmtTime(r.time)}</small></span></button>`).join('')
      || '<p class="empty">Ничего не нашлось.</p>';
  }
  function openPicker() {
    pickQuery = '';
    const day = week().find(x => x.key === pickDay);
    $('picker').innerHTML = `<div class="sheet-in">
      <div class="grab"></div>
      <div class="sheet-head"><h2>${day ? day.name : 'Блюдо'}</h2><button type="button" class="iconbtn" data-close aria-label="Закрыть">${icon('close')}</button></div>
      <label class="search"><span class="ico">${icon('search')}</span><input id="pickSearch" type="search" placeholder="Блюдо или продукт" autocomplete="off"></label>
      <div class="picklist" id="pickList">${pickerList()}</div>
    </div>`;
    openSheet($('picker'));
  }
  $('picker').addEventListener('input', e => { if (e.target.id === 'pickSearch') { pickQuery = e.target.value; $('pickList').innerHTML = pickerList(); } });
  $('picker').addEventListener('click', e => {
    const d = $('picker');
    if (e.target === d || e.target.closest('[data-close]')) { closeSheet(d); return; }
    const b = e.target.closest('[data-pick]'); if (!b) return;
    addToPlan(b.dataset.pick, pickDay, RB[b.dataset.pick].serv);
    closeSheet(d); renderPlan();
  });

  function openMeasures() {
    $('measures').innerHTML = `<div class="sheet-in">
      <div class="grab"></div>
      <div class="sheet-head"><h2>Граммы без весов</h2><button type="button" class="iconbtn" data-close aria-label="Закрыть">${icon('close')}</button></div>
      <p class="hint">Сыпучее набирайте ложкой с небольшой горкой, жидкое — до краёв. Цифры примерные: многое зависит от того, как плотно набрано.</p>
      <div class="mtable-wrap"><table class="mtable">
        <thead><tr><th>Продукт</th><th>ч. л.</th><th>ст. л.</th><th>стакан<br>200 мл</th><th>стакан<br>250 мл</th></tr></thead>
        <tbody>${window.MEASURES.map(m => `<tr><td>${esc(m[1])}</td><td>${m[2]}</td><td>${m[3]}</td><td>${m[4]}</td><td>${m[5]}</td></tr>`).join('')}</tbody>
      </table></div>
      <ul class="facts">
        <li><b>1 ст. л.</b> = 3 ч. л. = 15 мл</li>
        <li><b>200 мл</b> — гранёный стакан до ободка</li>
        <li><b>250 мл</b> — тонкий чайный стакан до краёв</li>
      </ul>
      <p class="credit">Значения в граммах — по таблице мер «Комсомольской правды» (kp.ru).</p>
    </div>`;
    openSheet($('measures'));
  }
  $('measuresBtn').addEventListener('click', openMeasures);
  $('measures').addEventListener('click', e => { if (e.target === $('measures') || e.target.closest('[data-close]')) closeSheet($('measures')); });

  const cook = { r: null, i: 0 };
  const timer = { end: 0, label: '', done: false, id: 0, audio: null, recipe: null, step: 0 };
  function parseDuration(text) {
    const m = text.match(/(\d+(?:[,.]\d+)?)(?:\s*[–-]\s*\d+(?:[,.]\d+)?)?\s*(минут|мин\b|час|ч\b|секунд|сек\b)/i);
    if (!m) return 0;
    const n = parseFloat(m[1].replace(',', '.'));
    const u = m[2].toLowerCase();
    if (u.startsWith('час') || u === 'ч') return Math.round(n * 3600);
    if (u.startsWith('сек')) return Math.round(n);
    return Math.round(n * 60);
  }
  const fmtClock = s => { s = Math.max(0, Math.ceil(s)); const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), ss = s % 60; return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(ss).padStart(2, '0'); };
  const fmtDur = s => s >= 3600 ? `${fmtNum(s / 3600)} ч` : s >= 60 ? `${Math.round(s / 60)} мин` : `${s} сек`;

  function startCook(r) {
    cook.r = r; cook.i = 0;
    drawCook();
    $('cook').showModal();
    if (app && app.keepScreenOn) try { app.keepScreenOn(true); } catch {}
  }
  function drawCook() {
    const r = cook.r, i = cook.i, n = r.steps.length, s = r.steps[i];
    const dur = parseDuration(s);
    $('cook').innerHTML = `<div class="cook-in">
      <div class="cook-top">
        <button type="button" class="iconbtn" data-cook="close" aria-label="Закрыть">${icon('close')}</button>
        <div class="cook-name"><div class="kicker">Шаг ${i + 1} из ${n}</div><div class="nm">${esc(r.name)}</div></div>
        <div class="cook-clock" id="cookClock"${timer.end ? '' : ' hidden'}></div>
        ${canSpeak ? `<button type="button" class="iconbtn speak${state.speak ? ' on' : ''}" data-cook="speak" aria-pressed="${state.speak}" aria-label="${state.speak ? 'Не читать вслух' : 'Читать шаги вслух'}">${icon(state.speak ? 'speaker' : 'mute')}</button>` : ''}
      </div>
      <div class="progress">${r.steps.map((_, j) => `<i class="${j < i ? 'past' : j === i ? 'now' : ''}"></i>`).join('')}</div>
      <div class="cook-body" id="cookBody">
        ${stepPhoto(r.id, i) ? `<img class="cook-photo" src="${esc(stepPhoto(r.id, i))}" alt="Шаг ${i + 1}">` : `<div class="cook-art">${STEP[stepKind(s)]}</div>`}
        <div class="cook-num">${i + 1}</div>
        <p class="cook-text">${esc(s)}</p>
        ${dur ? `<button type="button" class="btn timer" data-cook="timer" data-dur="${dur}">${icon('timer')}Засечь ${fmtDur(dur)}</button>` : ''}
      </div>
      <div class="cook-nav">
        <button type="button" class="btn" data-cook="prev"${i ? '' : ' disabled'}>${icon('back')}Назад</button>
        <button type="button" class="btn primary" data-cook="next">${i === n - 1 ? 'Готово' : 'Дальше'}${i === n - 1 ? '' : icon('next')}</button>
      </div>
    </div>`;
    tick();
    if (state.speak) say(`Шаг ${i + 1}. ${s}`);
  }
  const canSpeak = !!(app && app.speak) || 'speechSynthesis' in window;
  function say(text) {
    if (app && app.speak) { try { app.speak(text); } catch {} return; }
    try {
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'ru-RU';
      speechSynthesis.speak(u);
    } catch {}
  }
  function hush() {
    if (app && app.stopSpeaking) { try { app.stopSpeaking(); } catch {} return; }
    try { speechSynthesis.cancel(); } catch {}
  }
  window.__ttsError = () => {
    state.speak = false; store.save();
    if ($('cook').open) drawCook();
    toast('На телефоне нет русского голоса. Включите его в настройках: Специальные возможности → Синтез речи');
  };
  function closeCook() {
    $('cook').close(); hush();
    if (app && app.keepScreenOn) try { app.keepScreenOn(false); } catch {}
  }
  function stepCook(d) {
    const n = cook.r.steps.length;
    if (cook.i + d >= n) { closeCook(); toast('Приятного аппетита!'); return; }
    if (cook.i + d < 0) return;
    cook.i += d; drawCook();
  }
  $('cook').addEventListener('click', e => {
    const b = e.target.closest('[data-cook]'); if (!b) return;
    const a = b.dataset.cook;
    if (a === 'close') closeCook();
    if (a === 'prev') stepCook(-1);
    if (a === 'next') stepCook(1);
    if (a === 'timer') startTimer(+b.dataset.dur, `${cook.r.name}, шаг ${cook.i + 1}`, cook.r.id, cook.i);
    if (a === 'speak') {
      state.speak = !state.speak; store.save();
      if (!state.speak) hush();
      toast(state.speak ? 'Буду читать шаги вслух' : 'Чтение вслух выключено');
      drawCook();
    }
  });
  $('cook').addEventListener('cancel', () => { hush(); if (app && app.keepScreenOn) try { app.keepScreenOn(false); } catch {} });
  let sx = 0, sy = 0;
  $('cook').addEventListener('touchstart', e => { sx = e.touches[0].clientX; sy = e.touches[0].clientY; }, { passive: true });
  $('cook').addEventListener('touchend', e => {
    const dx = e.changedTouches[0].clientX - sx, dy = e.changedTouches[0].clientY - sy;
    if (Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(dy) * 1.5) stepCook(dx < 0 ? 1 : -1);
  }, { passive: true });

  function startTimer(sec, label, recipe, step) {
    const replaced = timer.end && !timer.done;
    timer.end = Date.now() + sec * 1000; timer.label = label; timer.done = false; timer.recipe = recipe; timer.step = step;
    try { timer.audio = timer.audio || new (window.AudioContext || window.webkitAudioContext)(); timer.audio.resume(); } catch {}
    clearInterval(timer.id); timer.id = setInterval(tick, 500);
    if (app && app.scheduleTimer) try { app.scheduleTimer(timer.end, label); } catch {}
    store.save();
    toast(replaced ? `Новый таймер на ${fmtDur(sec)}, прежний остановлен` : `Таймер на ${fmtDur(sec)} запущен`);
    tick();
  }
  function beep() {
    try {
      const ctx = timer.audio; if (!ctx) return;
      [0, 0.35, 0.7].forEach(t => {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.frequency.value = 880; o.connect(g); g.connect(ctx.destination);
        g.gain.setValueAtTime(0.0001, ctx.currentTime + t);
        g.gain.exponentialRampToValueAtTime(0.3, ctx.currentTime + t + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + t + 0.25);
        o.start(ctx.currentTime + t); o.stop(ctx.currentTime + t + 0.3);
      });
    } catch {}
  }
  function tick() {
    const pill = $('timerPill'), clock = $('cookClock');
    if (!timer.end) { pill.hidden = true; if (clock) clock.hidden = true; return; }
    const left = (timer.end - Date.now()) / 1000;
    if (left <= 0 && !timer.done) {
      timer.done = true; clearInterval(timer.id);
      if (!(app && app.scheduleTimer)) {
        try { navigator.vibrate && navigator.vibrate([400, 200, 400, 200, 400]); } catch {}
        beep();
      }
      toast('Время вышло!');
    }
    const txt = timer.done ? 'Время вышло' : fmtClock(left);
    pill.hidden = $('cook').open; pill.classList.toggle('ring', timer.done);
    pill.innerHTML = `<button type="button" class="tp-open" data-timer="open">${icon('timer')}<span class="mono">${txt}</span><small>${esc(timer.label)}</small></button>
      <button type="button" class="tp-stop" data-timer="stop" aria-label="Остановить таймер">${icon('close')}</button>`;
    if (clock) {
      clock.hidden = false; clock.classList.toggle('ring', timer.done);
      clock.innerHTML = `${icon('timer')}<span class="mono">${txt}</span><button type="button" class="tp-stop" data-timer="stop" aria-label="Остановить таймер">${icon('close')}</button>`;
    }
  }
  function stopTimer(silent) {
    const was = timer.end && !timer.done;
    timer.end = 0; timer.done = false; clearInterval(timer.id);
    if (app && app.cancelTimer) try { app.cancelTimer(); } catch {}
    store.save(); tick();
    if (was && !silent) toast('Таймер остановлен');
  }
  function restoreTimer(t) {
    if (!t || !t.end) return;
    timer.end = t.end; timer.label = t.label || ''; timer.recipe = t.recipe; timer.step = t.step || 0; timer.done = false;
    if (Date.now() >= timer.end) timer.done = true;
    else { clearInterval(timer.id); timer.id = setInterval(tick, 500); }
    tick();
  }
  window.__appResume = () => {
    if (!(app && app.timerEnd)) return;
    let end = 0;
    try { end = +app.timerEnd(); } catch {}
    if (!end && timer.end) { timer.end = 0; timer.done = false; clearInterval(timer.id); store.save(); tick(); }
    else tick();
  };
  $('timerPill').addEventListener('click', e => {
    const b = e.target.closest('[data-timer]'); if (!b) return;
    if (b.dataset.timer === 'stop' || timer.done) { stopTimer(); return; }
    const r = R.find(x => x.id === timer.recipe);
    if (r) { cook.r = r; cook.i = timer.step; drawCook(); $('cook').showModal(); if (app && app.keepScreenOn) try { app.keepScreenOn(true); } catch {} }
  });
  $('cook').addEventListener('click', e => { if (e.target.closest('[data-timer="stop"]')) stopTimer(); });

  window.__appBack = () => {
    if ($('cook').open) { closeCook(); return true; }
    for (const id of ['measures', 'filters', 'daypick', 'picker', 'recipe']) if ($(id).open) { closeSheet($(id)); return true; }
    if (state.tab !== 'menu') { setTab('menu'); return true; }
    return false;
  };

  renderMeals();
  setTab(state.tab);
  if (saved && saved.timer) {
    let alive = true;
    if (app && app.timerEnd) { try { alive = +app.timerEnd() > 0; } catch {} }
    if (alive) restoreTimer(saved.timer);
  }
  const h = location.hash.slice(1);
  if (h && R.some(r => r.id === h)) openRecipe(h);
})();
