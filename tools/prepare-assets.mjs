import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const assets = join(root, 'app/src/main/assets');
const UA = 'ChtoPrigotovitBuild/2.0 (open-source recipe app; GitHub Actions build)';

async function getJSON(url) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': UA } });
      if (res.ok) return await res.json();
    } catch {}
    await new Promise(r => setTimeout(r, 800 * (attempt + 1)));
  }
  return null;
}

async function loadPhotos() {
  const code = await readFile(join(assets, 'js/photos.js'), 'utf8');
  const ctx = { window: {} };
  vm.runInNewContext(code, ctx);
  return ctx.window.PHOTOS;
}

function sourceFromPage(page) {
  const m = page && page.match(/^https:\/\/([a-z-]+)\.wikipedia\.org\/wiki\/(.+)$/);
  return m ? `${m[1]}:${decodeURIComponent(m[2])}` : null;
}

function plainText(html) {
  return String(html || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'")
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ').trim();
}

async function lookup(source) {
  const [lang, title] = source.split(/:(.*)/s);
  const api = `https://${lang}.wikipedia.org/w/api.php?format=json&formatversion=2&action=query&redirects=1`;
  const pi = await getJSON(`${api}&prop=pageimages&piprop=thumbnail|name&pithumbsize=900&pilicense=free&titles=${encodeURIComponent(title)}`);
  const page = pi?.query?.pages?.[0];
  if (!page?.pageimage || !page?.thumbnail?.source) return null;
  const ii = await getJSON(`${api}&prop=imageinfo&iiprop=url|extmetadata&iiextmetadatafilter=Artist|Credit|LicenseShortName|LicenseUrl|UsageTerms&titles=${encodeURIComponent('File:' + page.pageimage)}`);
  const info = ii?.query?.pages?.[0]?.imageinfo?.[0];
  if (!info) return null;
  const meta = info.extmetadata || {};
  let author = plainText(meta.Artist?.value) || plainText(meta.Credit?.value);
  if (author.length > 90) author = author.slice(0, 87).trimEnd() + '…';
  const license = plainText(meta.LicenseShortName?.value) || plainText(meta.UsageTerms?.value);
  if (!license) return null;
  return {
    thumb: page.thumbnail.source,
    credit: {
      author: author || 'автор не указан',
      license,
      licenseUrl: meta.LicenseUrl?.value || '',
      file: info.descriptionurl || '',
    },
  };
}

async function photos() {
  const PHOTOS = await loadPhotos();
  const extra = JSON.parse(await readFile(join(root, 'tools/photo-sources.json'), 'utf8'));
  const credits = {};
  const ids = Object.keys(PHOTOS);
  let ok = 0;

  async function handle(id) {
    const list = extra[id] || [sourceFromPage(PHOTOS[id].page)].filter(Boolean);
    for (const source of list) {
      const found = await lookup(source);
      if (!found) continue;
      try {
        const img = await fetch(found.thumb, { headers: { 'User-Agent': UA } });
        if (!img.ok) continue;
        const target = join(assets, PHOTOS[id].file);
        await mkdir(dirname(target), { recursive: true });
        await writeFile(target, Buffer.from(await img.arrayBuffer()));
        credits[id] = found.credit;
        ok++;
        return;
      } catch {}
    }
    console.log(`photo ${id}: no free image with author info, keeping the stored one`);
  }

  const queue = [...ids];
  await Promise.all(Array.from({ length: 6 }, async () => { while (queue.length) await handle(queue.shift()); }));

  const sorted = Object.fromEntries(Object.keys(credits).sort().map(k => [k, credits[k]]));
  await writeFile(join(assets, 'js/credits.js'), `window.CREDITS = ${JSON.stringify(sorted, null, 2)};\n`);
  console.log(`photos with author and license: ${ok} of ${ids.length}`);
}

async function fonts() {
  const css = 'https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,600;0,700;1,500;1,600&family=Manrope:wght@400;500;700&family=IBM+Plex+Mono:wght@400;500&display=swap';
  const out = join(assets, 'css/fonts.css');
  try {
    const res = await fetch(css, { headers: { 'User-Agent': 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    const blocks = text.split('/* ').slice(1).filter(b => /^(cyrillic|latin) \*\//.test(b));
    await mkdir(join(assets, 'fonts'), { recursive: true });
    let result = '';
    let n = 0;
    for (const block of blocks) {
      const m = block.match(/url\((https:[^)]+\.woff2)\)/);
      if (!m) continue;
      const name = `f${++n}.woff2`;
      const font = await fetch(m[1]);
      await writeFile(join(assets, 'fonts', name), Buffer.from(await font.arrayBuffer()));
      result += '/* ' + block.replace(m[1], `../fonts/${name}`);
    }
    await writeFile(out, result.replace(/\/\*[^*]*\*\/\s*/g, ''));
    console.log(`fonts: ${n} files`);
  } catch (e) {
    console.log(`fonts skipped (${e.message})`);
    await writeFile(out, '');
  }
}

await photos();
await fonts();
