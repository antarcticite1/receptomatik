import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const assets = join(root, 'app/src/main/assets');
const UA = 'ChtoPrigotovitBuild/1.0 (https://github.com; GitHub Actions build)';

const exists = p => access(p).then(() => true, () => false);

async function wikiThumb(source) {
  const [lang, title] = source.split(/:(.*)/s);
  const url = `https://${lang}.wikipedia.org/w/api.php?action=query&format=json&redirects=1&prop=pageimages&pithumbsize=900&titles=${encodeURIComponent(title)}`;
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) return null;
  const data = await res.json();
  const page = Object.values(data.query?.pages || {})[0];
  return page?.thumbnail?.source || null;
}

async function photos() {
  const sources = JSON.parse(await readFile(join(root, 'tools/photo-sources.json'), 'utf8'));
  await mkdir(join(assets, 'images'), { recursive: true });
  for (const [id, list] of Object.entries(sources)) {
    const target = join(assets, 'images', `${id}.jpg`);
    if (await exists(target)) continue;
    let saved = false;
    for (const source of list) {
      try {
        const thumb = await wikiThumb(source);
        if (!thumb) continue;
        const img = await fetch(thumb, { headers: { 'User-Agent': UA } });
        if (!img.ok) continue;
        await writeFile(target, Buffer.from(await img.arrayBuffer()));
        console.log(`photo ${id} <- ${source}`);
        saved = true;
        break;
      } catch (e) {
        console.log(`photo ${id}: ${source} failed (${e.message})`);
      }
    }
    if (!saved) console.log(`photo ${id}: not found, placeholder will be used`);
  }
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
