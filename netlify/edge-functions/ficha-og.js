// Vista previa al compartir una ficha (WhatsApp, Facebook, etc.).
// La página es estática y esos servicios no corren JavaScript: leen las
// etiquetas og:* del HTML. Esta función, cuando el enlace es de una
// propiedad (/?propiedad=slug o /p/7503385-prop), pide la ficha al sistema
// y reemplaza título, descripción (dirección · barrio · precio) y foto.
// Si algo falla, se sirve la página tal cual.

const API = 'https://ch-prop-app.vercel.app/api/publico';

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function isShout(s) {
  const l = String(s || '').replace(/[^A-Za-zÁÉÍÓÚÑáéíóúñ]/g, '');
  return l.length > 3 && l.replace(/[^A-ZÁÉÍÓÚÑ]/g, '').length / l.length >= 0.6;
}
function sentence(s) {
  s = String(s || '').replace(/\s+/g, ' ').trim();
  if (!isShout(s)) return s;
  return s.toLowerCase().replace(/(^|[.!?]\s+)([a-záéíóúñ])/g, (m, a, b) => a + b.toUpperCase());
}
function proper(s) {
  s = String(s || '').replace(/\s+/g, ' ').trim();
  if (!isShout(s)) return s;
  return s.toLowerCase().replace(/(^|[\s(/-])([a-záéíóúñ])/g, (m, a, b) => a + b.toUpperCase());
}
function price(p) {
  const o = p.operations && p.operations[0];
  const pr = o && o.prices && o.prices[0];
  if (!pr || !Number(pr.price)) return '';
  return (pr.currency === 'USD' ? 'USD ' : '$ ') + Number(pr.price).toLocaleString('es-AR') + (o.operation_type === 'Alquiler' ? ' /mes' : '');
}
function where(p) {
  const b = p.location && p.location.name ? String(p.location.name).trim() : '';
  let c = proper(p.address || '');
  if (/^(s\/?n\.?|sin\s*n(u|ú)mero|sin\s*datos?|-+|\.*)$/i.test(c)) c = '';
  if (c && b && c.toLowerCase().includes(b.toLowerCase())) return c;
  return [c, b].filter(Boolean).join(' · ');
}

function setMeta(html, attr, key, value) {
  const tag = '<meta ' + attr + '="' + key + '" content="' + esc(value) + '">';
  const re = new RegExp('<meta ' + attr + '="' + key.replace(/[.:]/g, '\\$&') + '" content="[^"]*">');
  return re.test(html) ? html.replace(re, tag) : html.replace('</head>', tag + '\n</head>');
}

export default async (request, context) => {
  const url = new URL(request.url);
  let id = url.searchParams.get('propiedad');
  if (!id) { const m = url.pathname.match(/^\/p\/(\d+)-prop\/?$/); if (m) id = m[1]; }
  if (!id) return context.next();

  const res = await context.next();
  try {
    const c = new AbortController();
    const t = setTimeout(() => c.abort(), 4000);
    const r = await fetch(API + '/propiedades/' + encodeURIComponent(id), { signal: c.signal });
    clearTimeout(t);
    if (!r.ok) return res;
    const p = await r.json();
    const title = sentence(p.title || 'Propiedad') + ' – CH.Prop';
    const desc = [where(p), price(p)].filter(Boolean).join(' · ') || 'Propiedad en Córdoba';
    const img = (p.photos || []).map((x) => x.image).find(Boolean);
    const link = url.origin + '/?propiedad=' + encodeURIComponent(p.id || id);

    let html = await res.text();
    html = html.replace(/<title>[^<]*<\/title>/, '<title>' + esc(title) + '</title>');
    html = setMeta(html, 'name', 'description', desc);
    html = setMeta(html, 'property', 'og:title', title);
    html = setMeta(html, 'property', 'og:description', desc);
    html = setMeta(html, 'property', 'og:url', link);
    if (img) {
      html = setMeta(html, 'property', 'og:image', img);
      html = setMeta(html, 'name', 'twitter:card', 'summary_large_image');
    }
    const h = new Headers(res.headers);
    h.delete('content-length');
    h.set('cache-control', 'public, max-age=0, must-revalidate');
    return new Response(html, { status: res.status, headers: h });
  } catch (e) {
    return res;
  }
};

export const config = { path: ['/', '/p/*'] };
