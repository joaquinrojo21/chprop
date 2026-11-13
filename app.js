/* CH.Prop — home y ficha de propiedad.
 *
 * Las propiedades salen del sistema propio (ch-prop-app). La forma de la
 * respuesta es la que quedó de la época de Tokko: objects[], operations[],
 * photos[].image, etc.
 *
 * Enlaces que se siguen atendiendo:
 *   /?propiedad=slug   → abre la ficha (es lo que se comparte hoy)
 *   /p/7503385-prop    → enlaces viejos de Tokko que siguen en WhatsApp
 */
(function () {
  'use strict';

  const API = 'https://ch-prop-app.vercel.app/api/publico';
  const WA = '5493518626653';
  const PAGE = 6;

  const $ = (s, el) => (el || document).querySelector(s);
  const $$ = (s, el) => Array.from((el || document).querySelectorAll(s));
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const arrow = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>';
  const check = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#D5121B" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7"/></svg>';
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  let ALL = [];
  let op = 'Venta';
  let type = 'Todas';
  let barrio = '';
  let shown = PAGE;

  /* ── utilidades de datos ── */

  function fetchT(url, ms) {
    const c = new AbortController();
    const t = setTimeout(() => c.abort(), ms || 12000);
    return fetch(url, { signal: c.signal }).finally(() => clearTimeout(t));
  }

  const opOf = (p) => (p.operations && p.operations[0] && p.operations[0].operation_type) || '';
  const photos = (p) => (p.photos || []).map((x) => x.image).filter(Boolean);
  const barrioOf = (p) => (p.location && p.location.name ? String(p.location.name).trim() : '');
  const num = (v) => (v != null && parseFloat(v) > 0 ? Math.round(parseFloat(v)) : 0);
  const area = (p) => num(p.roofed_surface) || num(p.total_surface) || num(p.surface);

  function price(p) {
    const o = p.operations && p.operations[0];
    const pr = o && o.prices && o.prices[0];
    if (!pr || !Number(pr.price)) return 'Consultar';
    const cur = pr.currency === 'USD' ? 'USD' : '$';
    return cur + ' ' + Number(pr.price).toLocaleString('es-AR') + (o.operation_type === 'Alquiler' ? ' /mes' : '');
  }

  // Muchas fichas llegaron de Tokko escritas en mayúsculas: se pasan a
  // minúsculas con la primera letra de cada oración en mayúscula.
  function isShout(s) {
    const letters = String(s || '').replace(/[^A-Za-zÁÉÍÓÚÑáéíóúñ]/g, '');
    return letters.length > 3 && letters.replace(/[^A-ZÁÉÍÓÚÑ]/g, '').length / letters.length >= 0.6;
  }
  function sentence(s) {
    s = String(s || '').replace(/\s+/g, ' ').trim();
    if (!isShout(s)) return s;
    s = s.toLowerCase();
    return s.replace(/(^|[.!?]\s+)([a-záéíóúñ])/g, (m, a, b) => a + b.toUpperCase());
  }
  // Para nombres de calles y barrios: cada palabra con mayúscula
  function proper(s) {
    s = String(s || '').replace(/\s+/g, ' ').trim();
    if (!isShout(s)) return s;
    return s.toLowerCase().replace(/(^|[\s(/-])([a-záéíóúñ])/g, (m, a, b) => a + b.toUpperCase())
      .replace(/\s(De|Del|La|Las|Los|Y|Al|En)\s/g, (m) => m.toLowerCase());
  }

  function typeLabel(p) {
    const t = p.type && p.type.name ? p.type.name : '';
    return { Casa: 'Casas', Departamento: 'Departamentos', Terreno: 'Terrenos', PH: 'PH' }[t] || 'Otros';
  }

  function locLine(p) {
    const b = barrioOf(p);
    let c = (p.address || '').replace(/\s+/g, ' ').trim();
    if (/^(s\/?n\.?|sin\s*n(u|ú)mero|sin\s*datos?|-+|\.*)$/i.test(c)) c = '';
    c = proper(c);
    const norm = (t) => t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
    if (c && b && (norm(c).includes(norm(b)) || norm(b).includes(norm(c)))) return c.length >= b.length ? c : b;
    return [c, b].filter(Boolean).join(' · ');
  }

  function factsHtml(p) {
    const f = [];
    if (num(p.suite_amount)) f.push(num(p.suite_amount) + ' dorm.');
    if (num(p.bathrooms_amount)) f.push(num(p.bathrooms_amount) + (num(p.bathrooms_amount) === 1 ? ' baño' : ' baños'));
    if (area(p)) f.push(area(p) + ' m²');
    if (!f.length && num(p.room_amount)) f.push(num(p.room_amount) + ' amb.');
    return f.map((x) => '<span>' + x + '</span>').join('');
  }

  /* ── aparición al bajar ── */

  const io = 'IntersectionObserver' in window && !reduced
    ? new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { rootMargin: '0px 0px -8% 0px' })
    : null;
  function reveal(root) {
    $$('.rv:not(.in)', root).forEach((el) => (io ? io.observe(el) : el.classList.add('in')));
  }
  // Red de seguridad: si se salta de golpe a una sección (un enlace del menú,
  // un scroll muy rápido), lo que quedó arriba nunca "entra" en pantalla y se
  // quedaría invisible. Todo lo que ya pasó se muestra.
  let ticking = false;
  window.addEventListener('scroll', () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      ticking = false;
      const h = window.innerHeight;
      $$('.rv:not(.in)').forEach((el) => { if (el.getBoundingClientRect().top < h) el.classList.add('in'); });
    });
  }, { passive: true });

  /* ── menú ── */

  const menu = $('#menu');
  function setMenu(on) {
    menu.classList.toggle('on', on);
    menu.setAttribute('aria-hidden', on ? 'false' : 'true');
    $('#burger').setAttribute('aria-expanded', on ? 'true' : 'false');
    document.body.style.overflow = on ? 'hidden' : '';
  }
  $('#burger').addEventListener('click', () => setMenu(true));
  $('#menu-x').addEventListener('click', () => setMenu(false));
  $$('#menu a').forEach((a) => a.addEventListener('click', () => setMenu(false)));

  // Botones que eligen venta o alquiler antes de bajar a la lista
  document.addEventListener('click', (e) => {
    const a = e.target.closest('[data-op]');
    if (a) setOp(a.getAttribute('data-op'));
    const c = e.target.closest('[data-consulta]');
    if (c) $('#f-c').value = c.getAttribute('data-consulta');
  });

  /* ── hero ── */

  let slideIdx = 0, slideTimer = null, slideList = [];
  function buildHero() {
    slideList = ALL.filter((p) => opOf(p) === 'Venta' && photos(p).length).slice(0, 5);
    if (!slideList.length) return;
    $('#slides').innerHTML = slideList.map((p, i) =>
      '<div class="slide"><img src="' + esc(photos(p)[0]) + '" alt="" ' + (i ? 'loading="lazy"' : 'fetchpriority="high"') + '></div>').join('');
    $('#segs').innerHTML = slideList.map((p, i) => '<button class="seg" type="button" aria-label="Ver propiedad ' + (i + 1) + '"><i></i></button>').join('');
    $$('#segs .seg').forEach((b, i) => b.addEventListener('click', () => { showSlide(i); startSlides(); }));
    $('#prog-t').textContent = String(slideList.length).padStart(2, '0');
    $('#now').hidden = false;
    $('#prog').hidden = false;
    $('#now').addEventListener('click', () => openFicha(slideList[slideIdx]));
    showSlide(0);
    startSlides();
  }
  function showSlide(i) {
    slideIdx = i;
    $$('#slides .slide').forEach((s, k) => s.classList.toggle('on', k === i));
    $$('#segs .seg').forEach((s, k) => { s.className = 'seg' + (k < i ? ' done' : k === i ? ' run' : ''); });
    const p = slideList[i];
    $('#now-k').textContent = 'En pantalla · ' + barrioOf(p);
    $('#now-t').textContent = shortTitle(p);
    $('#now-p').textContent = price(p) + (area(p) ? ' · ' + area(p) + ' m²' : '') + '  →';
    $('#prog-n').textContent = String(i + 1).padStart(2, '0');
  }
  function startSlides() {
    clearInterval(slideTimer);
    if (reduced) return;
    slideTimer = setInterval(() => { if (!document.hidden) showSlide((slideIdx + 1) % slideList.length); }, 5500);
  }
  function shortTitle(p) {
    const t = (p.type && p.type.name) || 'Propiedad';
    const b = barrioOf(p);
    return b ? t + ' en ' + b : t;
  }

  /* ── marquesina y fotos de servicios ── */

  function buildMarquee() {
    const seen = new Set();
    const names = [];
    ALL.forEach((p) => { const b = barrioOf(p); const k = b.toLowerCase(); if (b && !seen.has(k) && !/c[oó]rdoba capital/i.test(b)) { seen.add(k); names.push(b); } });
    const list = names.slice(0, 12);
    const roof = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5" aria-hidden="true"><path d="M3 12 12 4l9 8"/></svg>';
    const html = list.map((n) => '<span class="disp">' + esc(n) + roof + '</span>').join('');
    $('#marq').innerHTML = html + html;
  }

  function buildServicePics() {
    const sale = ALL.find((p) => opOf(p) === 'Venta' && photos(p).length);
    const rents = ALL.filter((p) => opOf(p) === 'Alquiler' && photos(p).length);
    const set = (k, p) => { const img = $('[data-pic="' + k + '"]'); if (img && p) { img.src = photos(p)[0]; img.alt = shortTitle(p); } };
    set('Venta', sale);
    set('Alquiler', rents[0] || sale);
    set('Alquiler2', rents[1] || rents[0] || sale);
    const bg = ALL.filter((p) => photos(p).length)[3];
    if (bg) $('#contact-bg').src = photos(bg)[0];
  }

  /* ── lista de propiedades ── */

  function setOp(o) {
    if (o !== 'Venta' && o !== 'Alquiler') return;
    op = o; type = 'Todas'; barrio = ''; shown = PAGE;
    $$('.seg2 button').forEach((b) => { const on = b.getAttribute('data-tab') === o; b.classList.toggle('on', on); b.setAttribute('aria-selected', on); });
    $('#list-title').innerHTML = 'Propiedades<br>' + (o === 'Venta' ? 'en venta' : 'en alquiler');
    renderList();
  }
  $$('.seg2 button').forEach((b) => b.addEventListener('click', () => setOp(b.getAttribute('data-tab'))));
  $('#more').addEventListener('click', () => { shown += PAGE; renderList(true); });

  function current() {
    return ALL.filter((p) => opOf(p) === op)
      .filter((p) => type === 'Todas' || typeLabel(p) === type)
      .filter((p) => !barrio || barrioOf(p) === barrio);
  }

  function renderChips() {
    const base = ALL.filter((p) => opOf(p) === op);
    const types = ['Casas', 'Departamentos', 'PH', 'Terrenos', 'Otros'].filter((t) => base.some((p) => typeLabel(p) === t));
    let html = ['Todas'].concat(types.length > 1 ? types : []).map((t) =>
      '<button type="button" class="flt' + (t === type && !barrio ? ' on' : '') + '" data-type="' + t + '">' + t + '</button>').join('');
    if (barrio) html = '<button type="button" class="flt on" data-clear="1">' + esc(barrio) + ' <span aria-hidden="true">✕</span><span class="sr">Quitar barrio</span></button>' + html;
    $('#chips').innerHTML = html;
    $$('#chips [data-type]').forEach((b) => b.addEventListener('click', () => { type = b.getAttribute('data-type'); barrio = ''; shown = PAGE; renderList(); }));
    const c = $('#chips [data-clear]');
    if (c) c.addEventListener('click', () => { barrio = ''; renderList(); });
  }

  function cardHtml(p) {
    const ph = photos(p)[0];
    const img = ph ? '<img src="' + esc(ph) + '" alt="' + esc(sentence(p.title)) + '" loading="lazy">' : '';
    return '<a class="card rv" href="/?propiedad=' + encodeURIComponent(p.id) + '" data-id="' + esc(p.id) + '">' +
      '<div class="ph">' + img + (barrioOf(p) ? '<span class="tag">' + esc(barrioOf(p)) + '</span>' : '') + '</div>' +
      '<div style="display:flex;flex-direction:column;gap:10px;padding:0 4px">' +
      '<div class="row"><span class="disp price">' + esc(price(p)) + '</span><span class="go">Ver' + arrow + '</span></div>' +
      '<span class="t">' + esc(sentence(p.title || p.address || 'Propiedad')) + '</span>' +
      '<span class="facts">' + factsHtml(p) + '</span></div></a>';
  }

  function bindCards(root) {
    $$('.card[data-id]', root).forEach((a) => a.addEventListener('click', (e) => {
      if (e.metaKey || e.ctrlKey) return;
      e.preventDefault();
      const p = ALL.find((x) => x.id === a.getAttribute('data-id'));
      if (p) openFicha(p);
    }));
  }

  function renderList(keepScroll) {
    renderChips();
    const list = current();
    const g = $('#grid');
    g.innerHTML = list.length ? list.slice(0, shown).map(cardHtml).join('') : '<p class="empty">No hay propiedades para este filtro por ahora.</p>';
    bindCards(g);
    reveal(g);
    $('#more').hidden = list.length <= shown;
    $('#more').textContent = 'Ver más propiedades (' + (list.length - shown) + ')';
    if (!keepScroll && !list.length) return;
  }

  /* ── barrios ── */

  function buildBarrios() {
    const seen = new Set(), picks = [];
    ALL.forEach((p) => { const b = barrioOf(p); if (b && photos(p).length && !seen.has(b) && !/c[oó]rdoba capital/i.test(b)) { seen.add(b); picks.push(p); } });
    const five = picks.slice(0, 5);
    if (!five.length) { $('#barrios').hidden = true; return; }
    $('#bars').innerHTML = five.map((p, i) => {
      const b = barrioOf(p);
      const n = ALL.filter((x) => barrioOf(x) === b).length;
      return '<button type="button" class="bar' + (i ? '' : ' open') + '" data-b="' + esc(b) + '" aria-label="' + esc(b) + '">' +
        '<img src="' + esc(photos(p)[0]) + '" alt="" loading="lazy"><span class="shade"></span>' +
        '<span class="lab disp">' + esc(b) + '</span>' +
        '<span class="info"><b class="disp">' + esc(b) + '</b><span>' + n + (n === 1 ? ' propiedad' : ' propiedades') + ' · ' + esc(price(p)) + '</span>' +
        '<em>Ver propiedades en ' + esc(b) + arrow + '</em></span></button>';
    }).join('');
    $$('#bars .bar').forEach((btn) => {
      const open = () => $$('#bars .bar').forEach((x) => x.classList.toggle('open', x === btn));
      btn.addEventListener('mouseenter', () => { if (window.matchMedia('(hover: hover)').matches) open(); });
      btn.addEventListener('click', () => {
        if (!btn.classList.contains('open')) { open(); return; }
        const b = btn.getAttribute('data-b');
        const p = ALL.find((x) => barrioOf(x) === b);
        if (p) setOp(opOf(p));
        barrio = b; type = 'Todas'; shown = PAGE;
        renderList();
        $('#propiedades').scrollIntoView({ behavior: reduced ? 'auto' : 'smooth' });
      });
    });
  }

  /* ── ficha ── */

  const ficha = $('#ficha');
  let fp = null, lbIdx = 0;

  function splitDescription(text) {
    const lines = String(text || '').split(/\r?\n/).map((l) => l.trim());
    const bullets = [], paras = [];
    let buf = [], first = true;
    const flush = () => { if (buf.length) { paras.push(sentence(buf.join(' '))); buf = []; } };
    lines.forEach((l) => {
      if (!l) { flush(); return; }
      const m = l.match(/^[-•*·✔✓▪►]\s*(.+)$/);
      if (m) { flush(); bullets.push(sentence(m[1]).replace(/[.;]$/, '')); return; }
      // Encabezados sueltos ("CARACTERÍSTICAS:", "CASA EN VENTA | CINCO LOMAS")
      // repiten el título o anuncian una lista: no aportan
      if (/:$/.test(l) && l.length < 40) { flush(); return; }
      if (isShout(l) && l.length < 80 && !/[.!?]$/.test(l) && (first || /\|/.test(l))) { first = false; flush(); return; }
      first = false;
      buf.push(l);
    });
    flush();
    return { paras: paras.filter((p) => p.length > 2), bullets };
  }

  function ytId(v) {
    if (!v) return '';
    if (v.id) return v.id;
    const m = String(v.player_url || v.url || '').match(/(?:embed\/|v=|youtu\.be\/)([\w-]{6,})/);
    return m ? m[1] : '';
  }

  function waLink(p, kind) {
    const t = sentence(p.title || 'la propiedad');
    const msg = kind === 'visita'
      ? 'Hola, quiero coordinar una visita a: ' + t + ' — ' + location.origin + '/?propiedad=' + p.id
      : 'Hola, me interesa: ' + t + ' (' + price(p) + ') — ' + location.origin + '/?propiedad=' + p.id;
    return 'https://wa.me/' + WA + '?text=' + encodeURIComponent(msg);
  }

  function renderFicha(p) {
    const ph = photos(p);
    const d = splitDescription(p.description);
    const opL = opOf(p);
    const t = (p.type && p.type.name) || 'Propiedad';
    const stats = [];
    if (num(p.suite_amount)) stats.push([num(p.suite_amount), 'Dormitorios']);
    if (num(p.bathrooms_amount)) stats.push([num(p.bathrooms_amount), num(p.bathrooms_amount) === 1 ? 'Baño' : 'Baños']);
    if (num(p.roofed_surface)) stats.push([num(p.roofed_surface) + '<small> m²</small>', 'Cubiertos']);
    if (num(p.total_surface) && num(p.total_surface) !== num(p.roofed_surface)) stats.push([num(p.total_surface) + '<small> m²</small>', 'Totales']);
    else if (!num(p.roofed_surface) && num(p.surface)) stats.push([num(p.surface) + '<small> m²</small>', 'Superficie']);
    if (num(p.parking_lot_amount)) stats.push([num(p.parking_lot_amount), num(p.parking_lot_amount) === 1 ? 'Cochera' : 'Cocheras']);
    if (!num(p.suite_amount) && num(p.room_amount)) stats.unshift([num(p.room_amount), 'Ambientes']);
    const vid = (p.videos || []).map(ytId).find(Boolean);
    const sim = ALL.filter((x) => x.id !== p.id && opOf(x) === opL && photos(x).length)
      .sort((a, b) => (typeLabel(b) === typeLabel(p)) - (typeLabel(a) === typeLabel(p))).slice(0, 3);
    const title = sentence(p.title || t);

    $('#f-content').innerHTML =
      '<section class="wrap f-head">' +
        '<div style="display:flex;flex-direction:column;gap:16px;min-width:0">' +
          '<div class="pills"><span>' + esc(opL || 'Propiedad') + '</span><span>' + esc(t) + '</span></div>' +
          '<h1 class="disp">' + esc(title) + '</h1>' +
          (locLine(p) ? '<span class="f-loc"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#D5121B" stroke-width="2" aria-hidden="true"><path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/></svg>' + esc(locLine(p)) + '</span>' : '') +
        '</div>' +
        '<div class="f-price"><small>Precio</small><b class="disp">' + esc(price(p)) + '</b></div>' +
      '</section>' +
      (ph.length ? '<div class="strip" id="strip">' + ph.map((src, i) =>
        '<button class="shot" type="button" data-i="' + i + '" aria-label="Ampliar foto ' + (i + 1) + '"><img src="' + esc(src) + '" alt="Foto ' + (i + 1) + '" ' + (i > 2 ? 'loading="lazy"' : '') + '></button>').join('') + '</div>' +
        '<div class="wrap strip-n"><span>Deslizá para ver más · tocá una foto para ampliarla</span><button type="button" id="all-ph">Ver las ' + ph.length + ' fotos</button></div>' : '') +
      '<section class="wrap f-body">' +
        '<div class="f-main">' +
          (stats.length ? '<div class="stats">' + stats.map((s) => '<div class="stat"><b class="disp">' + s[0] + '</b><span>' + s[1] + '</span></div>').join('') + '</div>' : '') +
          (d.paras.length ? '<div class="f-sec"><h2 class="disp">Sobre la propiedad</h2><div class="desc" id="desc">' + d.paras.map((x) => '<p>' + esc(x) + '</p>').join('') + '</div><button type="button" class="more" id="desc-more" hidden>Leer más</button></div>' : '') +
          (d.bullets.length >= 2 ? '<div class="f-sec"><h2 class="disp">Lo que tiene</h2><div class="feats">' + d.bullets.map((b) => '<div class="feat">' + check + esc(b) + '</div>').join('') + '</div></div>' : '') +
          (vid ? '<div class="f-sec"><h2 class="disp">Recorrido en video</h2><div class="video"><iframe src="https://www.youtube-nocookie.com/embed/' + esc(vid) + '" title="Recorrido en video" loading="lazy" allow="accelerometer; encrypted-media; picture-in-picture" allowfullscreen></iframe></div></div>' : '') +
        '</div>' +
        '<aside class="side">' +
          '<div class="box"><b class="disp">' + esc(price(p)) + '</b><span style="color:var(--muted);font-size:15px">' + esc([t, area(p) ? area(p) + ' m²' : '', barrioOf(p)].filter(Boolean).join(' · ')) + '</span>' +
            '<a class="btn red" href="' + waLink(p) + '" target="_blank" rel="noopener">Consultar por WhatsApp</a>' +
            '<a class="btn dark" href="' + waLink(p, 'visita') + '" target="_blank" rel="noopener">Coordinar una visita</a>' +
            '<button type="button" class="btn line" id="f-copy">Copiar enlace para compartir</button></div>' +
          '<div class="box2"><span class="kicker" style="color:#FF8A8F;font-size:12px">¿Tenés algo para vender?</span><span style="font:500 17px/1.45 Inter,sans-serif">Te lo tasamos sin cargo y podés usarlo para tu próxima compra.</span>' +
            '<a href="https://wa.me/' + WA + '?text=' + encodeURIComponent('Hola, quiero tasar mi propiedad') + '" target="_blank" rel="noopener" style="color:#fff;font-weight:600;font-size:14px;padding:8px 0;display:inline-flex;gap:8px;align-items:center">Pedir tasación' + arrow + '</a></div>' +
        '</aside>' +
      '</section>' +
      (sim.length ? '<section style="background:#fff"><div class="wrap" style="padding-top:80px;padding-bottom:96px;display:flex;flex-direction:column;gap:36px"><h2 class="disp h2" style="font-size:clamp(40px,5vw,72px)">También te puede interesar</h2><div class="grid" id="sim">' + sim.map(cardHtml).join('') + '</div></div></section>' : '') +
      '<div class="mbar"><b class="disp">' + esc(price(p)) + '</b><a class="btn red" href="' + waLink(p) + '" target="_blank" rel="noopener"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a9 9 0 0 1-13.5 7.8L3 21l1.2-4.5A9 9 0 1 1 21 12z"/></svg>Consultar</a></div>';

    $$('#strip .shot').forEach((b) => b.addEventListener('click', () => openLb(+b.getAttribute('data-i'))));
    const all = $('#all-ph'); if (all) all.addEventListener('click', () => openLb(0));
    const desc = $('#desc'), more = $('#desc-more');
    if (desc && desc.scrollHeight > 320) {
      desc.classList.add('clip'); more.hidden = false;
      more.addEventListener('click', () => { const c = desc.classList.toggle('clip'); more.textContent = c ? 'Leer más' : 'Leer menos'; });
    }
    $('#f-copy').addEventListener('click', share);
    bindCards($('#sim'));
    reveal($('#f-content'));
    $$('#f-content .rv').forEach((el) => el.classList.add('in'));
  }

  function openFicha(p, fromUrl) {
    if (!p) return;
    fp = p;
    renderFicha(p);
    ficha.scrollTop = 0;
    ficha.classList.add('on');
    ficha.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
    document.title = sentence(p.title || 'Propiedad') + ' – CH.Prop';
    if (!fromUrl) history.pushState({ propiedad: p.id }, '', '/?propiedad=' + encodeURIComponent(p.id));
    setTimeout(() => $('#f-close').focus({ preventScroll: true }), 50);
  }

  function closeFicha(fromPop) {
    if (!ficha.classList.contains('on')) return;
    ficha.classList.remove('on');
    ficha.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
    document.title = 'CH.Prop – Propiedades en Córdoba';
    closeLb();
    if (!fromPop) {
      if (history.state && history.state.propiedad && history.length > 1 && sessionStorage.getItem('chp-entro')) history.back();
      else history.replaceState({}, '', '/');
    }
  }
  $('#f-close').addEventListener('click', () => closeFicha());
  $('#f-share').addEventListener('click', share);

  function share() {
    if (!fp) return;
    const url = location.origin + '/?propiedad=' + encodeURIComponent(fp.id);
    const title = sentence(fp.title || 'Propiedad');
    if (navigator.share) { navigator.share({ title: title, text: title + ' — CH.Prop', url: url }).catch(() => {}); return; }
    const done = () => { const b = $('#f-copy'); if (b) b.textContent = 'Enlace copiado'; };
    if (navigator.clipboard) navigator.clipboard.writeText(url).then(done, done); else done();
  }

  /* visor de fotos */
  const lb = $('#lb');
  function openLb(i) {
    if (!fp) return;
    lbIdx = i;
    lb.classList.add('on');
    showLb();
  }
  function showLb() {
    const ph = photos(fp);
    lbIdx = (lbIdx + ph.length) % ph.length;
    const img = $('#lb-img');
    img.style.animation = 'none'; void img.offsetWidth; img.style.animation = '';
    img.src = ph[lbIdx];
    img.alt = 'Foto ' + (lbIdx + 1) + ' de ' + ph.length;
    $('#lb-n').textContent = (lbIdx + 1) + ' / ' + ph.length;
  }
  function closeLb() { lb.classList.remove('on'); }
  $('#lb-x').addEventListener('click', closeLb);
  $('#lb-p').addEventListener('click', () => { lbIdx--; showLb(); });
  $('#lb-nx').addEventListener('click', () => { lbIdx++; showLb(); });
  let tx = null;
  $('#lb-mid').addEventListener('touchstart', (e) => { tx = e.touches[0].clientX; }, { passive: true });
  $('#lb-mid').addEventListener('touchend', (e) => {
    if (tx == null) return;
    const dx = e.changedTouches[0].clientX - tx; tx = null;
    if (Math.abs(dx) > 40) { lbIdx += dx < 0 ? 1 : -1; showLb(); }
  });
  document.addEventListener('keydown', (e) => {
    if (lb.classList.contains('on')) {
      if (e.key === 'Escape') closeLb();
      if (e.key === 'ArrowRight') { lbIdx++; showLb(); }
      if (e.key === 'ArrowLeft') { lbIdx--; showLb(); }
    } else if (e.key === 'Escape') {
      if (menu.classList.contains('on')) setMenu(false); else closeFicha();
    }
  });

  /* enlaces directos */
  function idFromUrl() {
    const u = new URL(location.href);
    const q = u.searchParams.get('propiedad');
    if (q) return q;
    const old = u.pathname.match(/^\/p\/(\d+)-prop\/?$/);
    return old ? old[1] : null;
  }
  function openFromUrl() {
    const id = idFromUrl();
    if (!id) { closeFicha(true); return; }
    const known = ALL.find((p) => p.id === id);
    if (known) { openFicha(known, true); fixUrl(known); return; }
    fetchT(API + '/propiedades/' + encodeURIComponent(id))
      .then((r) => { if (!r.ok) throw new Error('no'); return r.json(); })
      .then((p) => { openFicha(p, true); fixUrl(p); })
      .catch(() => { if (!new URL(location.href).searchParams.has('propiedad')) history.replaceState({}, '', '/'); });
  }
  // Si llegó por un enlace viejo, en la barra queda el nuevo
  function fixUrl(p) {
    if (!new URL(location.href).searchParams.has('propiedad')) history.replaceState({ propiedad: p.id }, '', '/?propiedad=' + encodeURIComponent(p.id));
  }
  window.addEventListener('popstate', () => { if (idFromUrl()) openFromUrl(); else closeFicha(true); });
  sessionStorage.setItem('chp-entro', '');

  /* ── formulario ── */

  const form = $('#contact-form');
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!form.reportValidity()) return;
    const send = $('#f-send');
    $('#f-err').hidden = true;
    send.disabled = true; send.textContent = 'Enviando…';
    fetch('https://api.web3forms.com/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(Object.fromEntries(new FormData(form))),
    }).then((r) => r.json()).then((d) => {
      if (!d.success) throw new Error('x');
      $$('.fld, #f-send', form).forEach((el) => (el.hidden = true));
      $('#f-ok').hidden = false;
    }).catch(() => {
      $('#f-err').hidden = false;
      send.disabled = false; send.textContent = 'Enviar consulta';
    });
  });

  /* ── arranque ── */

  $('#year').textContent = new Date().getFullYear();
  reveal(document);

  function load(retry) {
    const q = encodeURIComponent(JSON.stringify({ operation_types: [], property_types: [], price_from: 0, price_to: 0, currency: 'USD' }));
    return fetchT(API + '/propiedades?data=' + q)
      .then((r) => { if (!r.ok) throw new Error('api'); return r.json(); })
      .catch((e) => { if (retry) return load(false); throw e; });
  }

  load(true).then((d) => {
    ALL = d.objects || [];
    buildHero();
    buildMarquee();
    buildServicePics();
    renderList();
    buildBarrios();
    reveal(document);
    if (idFromUrl()) { sessionStorage.setItem('chp-entro', ''); openFromUrl(); }
  }).catch(() => {
    $('#grid').innerHTML = '<p class="empty">No pudimos cargar las propiedades. Recargá la página o escribinos por WhatsApp.</p>';
    $('#barrios').hidden = true;
    if (idFromUrl()) openFromUrl();
  });

  // Cuando se abre una ficha desde la página, "volver" usa el historial
  const _push = history.pushState.bind(history);
  history.pushState = function (s, t, u) { sessionStorage.setItem('chp-entro', '1'); return _push(s, t, u); };
})();
