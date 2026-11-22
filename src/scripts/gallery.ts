// The recipe's gallery and notes. What a visitor adds stays in their browser.
import { replay } from './motion';
import { toast } from './menu-store';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const recipe = $('photos').dataset.recipe!;
const gallery = $('gallery'), say = $('gallery-say');

/* ---------- My photos, in IndexedDB ---------- */
interface Mine { key?: number; recipe: string; blob: Blob; kind: 'photo' | 'video' | 'audio'; name: string; caption: string; added: number }
const db = () => new Promise<IDBDatabase>((done, fail) => {
  const ask = indexedDB.open('conway-cookbook', 1);
  ask.onupgradeneeded = () => ask.result.createObjectStore('media', { keyPath: 'key', autoIncrement: true }).createIndex('recipe', 'recipe');
  ask.onsuccess = () => done(ask.result); ask.onerror = () => fail(ask.error);
});
const store = async <T>(mode: IDBTransactionMode, work: (s: IDBObjectStore) => IDBRequest<T>) => {
  const open = await db();
  try {
    return await new Promise<T>((done, fail) => {
      const tx = open.transaction('media', mode), ask = work(tx.objectStore('media'));
      tx.oncomplete = () => done(ask.result); tx.onerror = tx.onabort = () => fail(tx.error ?? ask.error);
    });
  } finally { open.close(); }
};

const MAX = 1600, LIMIT = 150 * 1024 * 1024;
// Redrawing a photo resizes it and leaves behind everything hidden in the file.
async function clean(file: File): Promise<Blob> {
  const picture = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const scale = Math.min(1, MAX / Math.max(picture.width, picture.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(picture.width * scale); canvas.height = Math.round(picture.height * scale);
  const pen = canvas.getContext('2d')!;
  pen.fillStyle = '#fff'; pen.fillRect(0, 0, canvas.width, canvas.height);
  pen.drawImage(picture, 0, 0, canvas.width, canvas.height);
  picture.close();
  return new Promise((done, fail) => canvas.toBlob((blob) => (blob ? done(blob) : fail(new Error('encode'))), 'image/jpeg', 0.86));
}
async function add(files: File[]) {
  const kept: string[] = [], failed: string[] = [];
  say.textContent = files.length > 1 ? `Adding ${files.length} files…` : 'Adding…';
  for (const file of files) {
    const kind = /\.(heic|heif)$/i.test(file.name) || file.type.startsWith('image/') ? 'photo' : file.type.startsWith('video/') ? 'video' : file.type.startsWith('audio/') ? 'audio' : null;
    try {
      if (!kind) throw new Error('isn’t a photo, video, or recording');
      if (file.size > LIMIT) throw new Error('is over 150 MB');
      const blob = kind === 'photo' ? await clean(file).catch(() => { throw new Error('can’t be opened by this browser. Try a JPEG'); }) : file;
      const item: Mine = { recipe, blob, kind, name: file.name, caption: '', added: Date.now() };
      item.key = (await store('readwrite', (s) => s.add(item) as IDBRequest<IDBValidKey>).catch(() => { throw new Error('couldn’t be saved. This browser may be private or out of space'); })) as number;
      draw(item, true); kept.push(file.name);
    } catch (error) { failed.push(`${file.name} ${(error as Error).message}.`); }
  }
  if (kept.length) (navigator as any).storage?.persist?.().catch(() => {});
  say.textContent = [kept.length && `Added ${kept.length} ${kept.length === 1 ? 'file' : 'files'}. Only you can see ${kept.length === 1 ? 'it' : 'them'}, in this browser.`, ...failed].filter(Boolean).join(' ');
  tidy();
}
const mine = new Map<HTMLElement, { item: Mine; url: string }>();
function draw(item: Mine, fresh = false) {
  const li = document.createElement('li'), url = URL.createObjectURL(item.blob);
  li.className = `shot ${item.kind} mine`;
  mine.set(li, { item, url });
  if (item.kind === 'photo') {
    const link = document.createElement('a'), img = document.createElement('img');
    link.className = 'shot-open'; link.href = url; link.dataset.kind = 'photo'; link.dataset.caption = item.caption;
    img.src = url; img.alt = item.caption || 'My photo'; link.append(img); li.append(link);
  } else {
    const player = document.createElement(item.kind) as HTMLMediaElement;
    player.controls = true; player.preload = 'metadata'; player.src = url; player.setAttribute('aria-label', item.caption || item.name);
    if (item.kind === 'video') player.setAttribute('playsinline', '');
    li.append(player);
  }
  const row = document.createElement('div'), words = document.createElement('input'), drop = document.createElement('button'), tag = document.createElement('small');
  row.className = 'shot-mine'; tag.textContent = 'Only on this device';
  words.value = item.caption; words.placeholder = 'Add a caption'; words.maxLength = 120; words.setAttribute('aria-label', `Caption for ${item.name}`);
  words.addEventListener('change', async () => {
    item.caption = words.value.trim();
    const link = li.querySelector<HTMLElement>('.shot-open'); if (link) link.dataset.caption = item.caption;
    await store('readwrite', (s) => s.put(item)).catch(() => { say.textContent = 'That caption couldn’t be saved.'; });
  });
  drop.type = 'button'; drop.className = 'linkish'; drop.textContent = 'Remove'; drop.setAttribute('aria-label', `Remove ${item.caption || item.name}`);
  drop.addEventListener('click', () => {
    li.hidden = true; tidy();
    // Nothing is deleted until the chance to undo has passed.
    const timer = setTimeout(async () => { await store('readwrite', (s) => s.delete(item.key!)).catch(() => {}); URL.revokeObjectURL(url); mine.delete(li); li.remove(); }, 6000);
    toast('Removed.');
    const undo = document.createElement('button'); undo.type = 'button'; undo.className = 'linkish'; undo.textContent = 'Undo';
    undo.addEventListener('click', () => { clearTimeout(timer); li.hidden = false; tidy(); toast('Put back.'); });
    $('toast').append(undo);
  });
  row.append(words, tag, drop); li.append(row); gallery.append(li);
  if (fresh) replay(li, 'fresh');
}
const shown = () => [...gallery.children].filter((li) => !(li as HTMLElement).hidden) as HTMLElement[];
function tidy() {
  $('gallery-empty').hidden = shown().length > 0;
  const any = shown().some((li) => mine.has(li));
  const button = document.getElementById('media-save');
  if (button) { button.hidden = !any; $('media-save-none').hidden = any; }
}
document.getElementById('media-save')?.addEventListener('click', async () => {
  let n = 0;
  for (const li of shown()) {
    const own = mine.get(li);
    if (!own) continue;
    const ext = own.item.kind === 'photo' ? 'jpg' : own.item.name.split('.').pop() || 'mp4';
    // The caption becomes the file name, and the file name becomes the caption once published.
    const base = (own.item.caption || own.item.name.replace(/\.[^.]+$/, '')).replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '') || 'photo';
    const a = document.createElement('a'); a.href = own.url; a.download = `${base}${++n > 1 ? `-${n}` : ''}.${ext}`; a.click();
    await new Promise((r) => setTimeout(r, 350));
  }
  toast(`Saved ${n} ${n === 1 ? 'file' : 'files'} to this device.`);
});

const picker = $<HTMLInputElement>('media-file');
if ('indexedDB' in window) {
  picker.closest('label')!.hidden = false;
  picker.addEventListener('change', () => { add([...picker.files!]); picker.value = ''; });
  const zone = $('photos');
  zone.addEventListener('dragover', (e) => { if (e.dataTransfer?.types.includes('Files')) { e.preventDefault(); zone.classList.add('over'); } });
  zone.addEventListener('dragleave', (e) => { if (!zone.contains(e.relatedTarget as Node)) zone.classList.remove('over'); });
  zone.addEventListener('drop', (e) => { if (!e.dataTransfer?.files.length) return; e.preventDefault(); zone.classList.remove('over'); add([...e.dataTransfer.files]); });
  store<Mine[]>('readonly', (s) => s.index('recipe').getAll(recipe) as IDBRequest<Mine[]>).then((items) => { items.forEach((i) => draw(i)); tidy(); }).catch(() => {});
}

/* ---------- Lightbox ---------- */
const box = $<HTMLDialogElement>('lightbox'), big = $<HTMLImageElement>('lb-img');
let at = 0, from: HTMLElement | null = null;
const photos = () => shown().map((li) => li.querySelector<HTMLAnchorElement>('.shot-open')).filter((a) => a !== null);
function view(to: number) {
  const all = photos();
  if (!all.length) return box.close();
  at = (to + all.length) % all.length;
  const link = all[at], { caption = '', by } = link.dataset;
  big.src = link.href; big.alt = link.querySelector('img')!.alt;
  $('lb-words').textContent = [caption, by, all.length > 1 && `${at + 1} of ${all.length}`].filter(Boolean).join(' · ');
  $('lb-prev').hidden = $('lb-next').hidden = all.length < 2;
  replay(big, 'arrive');
}
gallery.addEventListener('click', (event) => {
  const target = event.target as Element, link = target.closest<HTMLAnchorElement>('.shot-open');
  if (link && !event.metaKey && !event.ctrlKey && !event.shiftKey) { event.preventDefault(); from = link; box.showModal(); view(photos().indexOf(link)); return; }
  // Other sites' players load only when asked for.
  const play = target.closest<HTMLElement>('.shot-play');
  if (!play) return;
  const frame = document.createElement('iframe');
  frame.src = play.dataset.src!; frame.title = play.dataset.title || 'Video'; frame.allow = 'autoplay; fullscreen; picture-in-picture'; frame.allowFullscreen = true; frame.referrerPolicy = 'strict-origin-when-cross-origin';
  play.replaceWith(frame); frame.focus();
});
$('lb-close').addEventListener('click', () => box.close());
$('lb-prev').addEventListener('click', () => view(at - 1));
$('lb-next').addEventListener('click', () => view(at + 1));
box.addEventListener('close', () => from?.focus());
box.addEventListener('click', (event) => { if (event.target === box) box.close(); });
box.addEventListener('keydown', (event) => { if (event.key === 'ArrowLeft') view(at - 1); else if (event.key === 'ArrowRight') view(at + 1); });
let startX = 0;
box.addEventListener('touchstart', (e) => { startX = e.changedTouches[0].clientX; }, { passive: true });
box.addEventListener('touchend', (e) => { const by = e.changedTouches[0].clientX - startX; if (Math.abs(by) > 50) view(at + (by < 0 ? 1 : -1)); }, { passive: true });

/* ---------- My notes ---------- */
const KEY = `conway-notes-${recipe}`, pad = $<HTMLTextAreaElement>('my-notes'), noteSay = $('notes-say');
let timer = 0;
const keep = () => {
  clearTimeout(timer);
  try { pad.value.trim() ? localStorage.setItem(KEY, pad.value) : localStorage.removeItem(KEY); noteSay.textContent = 'Saved in this browser.'; }
  catch { noteSay.textContent = 'This browser blocked saving. Copy your notes before you leave.'; }
};
try { pad.value = localStorage.getItem(KEY) ?? ''; } catch { /* blank */ }
pad.closest<HTMLElement>('.my-notes')!.hidden = false;
pad.addEventListener('input', () => { noteSay.textContent = 'Saving…'; clearTimeout(timer); timer = window.setTimeout(keep, 500); });
pad.addEventListener('change', keep);
window.addEventListener('pagehide', () => { if (timer) keep(); });
$('notes-copy').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText(pad.value); toast('Notes copied.'); }
  catch { pad.select(); toast('Select all and copy. This browser blocked the clipboard.'); }
});
