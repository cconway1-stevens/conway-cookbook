import { writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { decodeMenuPayload } from '../src/lib/menu-link.ts';

function menuFromLink(link) {
  const url = URL.parse(link ?? '');
  const payload = url?.hash.slice(3);
  if (url?.protocol !== 'https:' || url.username || url.password || !url.pathname.endsWith('/menu/') ||
      !url.hash.startsWith('#m=') || !payload || payload.length > 32_768 || !/^[A-Za-z0-9_-]+$/.test(payload)) {
    throw new Error('Paste the HTTPS link from Copy share link in the menu builder.');
  }
  try {
    const menu = decodeMenuPayload(payload);
    if (!menu || typeof menu !== 'object' || Array.isArray(menu)) throw new Error();
    return menu;
  } catch {
    throw new Error('The link does not contain a readable menu. Copy a new link from the builder.');
  }
}

function main() {
  const { values } = parseArgs({ options: { url: { type: 'string' }, description: { type: 'string' } } });
  const description = values.description?.trim() ?? '';
  if (!description || description.length > 160) throw new Error('Provide a library description of 1–160 characters.');

  const { title: rawTitle, note, paper, blurbs, items } = menuFromLink(values.url);
  const title = typeof rawTitle === 'string' ? rawTitle.trim() : '';
  if (!title || title.length > 60) throw new Error('Give the menu a name of 1–60 characters in the builder.');
  if (!Array.isArray(items) || items.length === 0) throw new Error('Add at least one recipe before sharing the menu.');
  const id = title.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  if (!id) throw new Error('Give the menu a name that includes a letter from A–Z or a number.');

  const path = `src/content/menus/${id}.json`;
  try {
    writeFileSync(path, JSON.stringify({ title, description, note, paper, blurbs, items }, null, 2) + '\n', { flag: 'wx' });
  } catch (error) {
    if (error.code === 'EEXIST') throw new Error(`A library menu named ${id} already exists. Use a different name in the builder.`);
    throw error;
  }
  console.log(path);
}

try {
  main();
} catch (error) {
  console.error(`draft-menu: ${error.message}`);
  process.exitCode = 1;
}
