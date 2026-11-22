import { replay } from './motion';
import { book, load, save, encode, decode, toast, type Menu, type MenuItem } from './menu-store';

interface Dish { id: string; title: string; description: string; url: string; section: string; ingredients: { name: string; items: string[] }[] }
const SECTIONS = book.sections;
const dishes: Dish[] = JSON.parse(document.querySelector('#menu-data')!.textContent!);
const byId = new Map(dishes.map((d) => [d.id, d]));
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const el = (tag: string, className = '', text = '') => { const node = document.createElement(tag); if (className) node.className = className; if (text) node.textContent = text; return node; };

// A shared menu opens for viewing and replaces yours only if you keep it.
let shared: Menu | null = location.hash.startsWith('#m=') ? decode(location.hash.slice(3)) : null;
let menu: Menu = shared ?? load();
const sectionOf = (item: MenuItem): string => item.section ?? byId.get(item.id)!.section;
const listed = () => menu.items.filter((item) => byId.has(item.id));

function commit(change: () => void) {
  change();
  if (shared) { shared = menu; history.replaceState(null, '', '#m=' + encode(menu)); render(); } else save(menu);
}
function place(id: string, section: string, before?: string) {
  if (id === before) return;
  commit(() => {
    const item = menu.items.find((i) => i.id === id) ?? { id };
    const rest = menu.items.filter((i) => i.id !== id);
    item.section = section;
    const at = before ? rest.findIndex((i) => i.id === before) : rest.length;
    rest.splice(at, 0, item);
    menu.items = rest;
  });
}
function nudge(id: string, by: 1 | -1) {
  const item = menu.items.find((i) => i.id === id)!;
  const section = sectionOf(item);
  const row = listed().filter((i) => sectionOf(i) === section);
  const at = row.findIndex((i) => i.id === id), other = row[at + by];
  if (other) commit(() => {
    const a = menu.items.indexOf(item), b = menu.items.indexOf(other);
    [menu.items[a], menu.items[b]] = [menu.items[b], menu.items[a]];
  });
  else {
    const to = SECTIONS[SECTIONS.findIndex((s) => s.id === section) + by];
    if (to) place(id, to.id, by === 1 ? listed().find((i) => sectionOf(i) === to.id)?.id : undefined);
  }
  document.querySelector<HTMLElement>(`[data-dish="${id}"] [data-by="${by}"]`)?.focus();
}

let dragged = '', known = new Set(listed().map((i) => i.id)), paper = menu.paper;
function render() {
  if (!shared) menu = load();
  $('shared').hidden = !shared;
  for (const [id, value] of [['m-title', menu.title], ['m-note', menu.note]] as const) if (document.activeElement !== $(id)) $<HTMLInputElement>(id).value = value;
  $<HTMLInputElement>('m-blurbs').checked = menu.blurbs;
  document.querySelectorAll<HTMLInputElement>('[name=paper]').forEach((r) => (r.checked = r.value === menu.paper));
  const card = $('menu-card');
  card.dataset.paper = menu.paper;
  if (paper !== menu.paper) { paper = menu.paper; replay(card, 'turned'); }
  let fresh = 0;
  const head = el('header');
  head.append(el('h2', '', menu.title || 'Menu'));
  if (menu.note) head.append(el('p', '', menu.note));
  card.replaceChildren(head);
  card.classList.toggle('blank', !listed().length);
  for (const s of SECTIONS) {
    const items = listed().filter((i) => sectionOf(i) === s.id);
    const section = el('section', items.length ? '' : 'bare');
    section.append(el('h3', '', s.label));
    const list = el('ul');
    section.addEventListener('dragover', (event) => { if (dragged) { event.preventDefault(); section.classList.add('over'); } });
    section.addEventListener('dragleave', (event) => { if (!section.contains(event.relatedTarget as Node)) section.classList.remove('over'); });
    section.addEventListener('drop', (event) => {
      event.preventDefault();
      const target = (event.target as Element).closest<HTMLElement>('[data-dish]');
      if (dragged) place(dragged, s.id, target?.dataset.dish);
    });
    if (!items.length) list.append(el('li', 'slot', 'Nothing here yet'));
    for (const item of items) {
      const dish = byId.get(item.id)!;
      const li = el('li', 'dish'); li.dataset.dish = item.id; li.draggable = true;
      if (!known.has(item.id)) { li.classList.add('fresh'); li.style.setProperty('--i', String(fresh++)); }
      li.addEventListener('dragstart', (event) => { dragged = item.id; event.dataTransfer!.setData('text/plain', dish.title); li.classList.add('lifting'); setTimeout(() => card.classList.add('lifting-any')); });
      li.addEventListener('dragend', () => { dragged = ''; card.classList.remove('lifting-any'); document.querySelectorAll('.over, .lifting').forEach((n) => n.classList.remove('over', 'lifting')); });
      const body = el('div'), link = el('a', 'dish-name', dish.title) as HTMLAnchorElement;
      link.href = dish.url; link.draggable = false; body.append(link);
      if (menu.blurbs) body.append(el('p', '', dish.description));
      const tools = el('div', 'dish-tools');
      for (const [text, name, by] of [['↑', 'Move up', -1], ['↓', 'Move down', 1]] as const) {
        const b = el('button', '', text) as HTMLButtonElement; b.type = 'button'; b.dataset.by = String(by); b.setAttribute('aria-label', `${name}: ${dish.title}`);
        b.addEventListener('click', () => nudge(item.id, by)); tools.append(b);
      }
      const x = el('button', '', '×') as HTMLButtonElement; x.type = 'button'; x.setAttribute('aria-label', `Take off the menu: ${dish.title}`);
      x.addEventListener('click', () => commit(() => { menu.items = menu.items.filter((i) => i.id !== item.id); }));
      tools.append(x); li.append(body, tools); list.append(li);
    }
    section.append(list); card.append(section);
  }
  known = new Set(listed().map((i) => i.id));
  const n = listed().length;
  for (const [id, label] of [['menu', 'Menu']] as const) $(`tab-${id}`).textContent = n ? `${label} (${n})` : label;
  shopping();
}
function shopping() {
  const box = $('shop'), items = listed(), ticked = new Set([...box.querySelectorAll<HTMLInputElement>('input:checked')].map((i) => i.value));
  box.replaceChildren();
  if (!items.length) box.append(el('p', '', 'Add a dish and its ingredients will show up here.'));
  for (const item of items) {
    const dish = byId.get(item.id)!, lines = dish.ingredients.flatMap((g) => g.items);
    if (!lines.length) continue;
    box.append(el('h3', '', dish.title));
    const ul = el('ul');
    lines.forEach((line, i) => {
      const li = el('li'), label = el('label'), input = el('input') as HTMLInputElement;
      input.type = 'checkbox'; input.value = `${dish.id}:${i}`; input.checked = ticked.has(input.value);
      label.append(input, el('span', '', line)); li.append(label); ul.append(li);
    });
    box.append(ul);
  }
}

/* ---------- Tabs ---------- */
const bench = $('bench'), tabs = [...document.querySelectorAll<HTMLButtonElement>('[role=tab]')];
function open(id: string, focus = false) {
  bench.dataset.tab = id;
  for (const tab of tabs) {
    const on = tab.dataset.tab === id;
    tab.setAttribute('aria-selected', String(on)); tab.tabIndex = on ? 0 : -1;
    const pane = document.getElementById(`pane-${tab.dataset.tab}`);
    if (pane) pane.hidden = !on;
    if (on && focus) tab.focus();
  }
}
tabs.forEach((tab) => {
  tab.addEventListener('click', () => open(tab.dataset.tab!));
  tab.addEventListener('keydown', (event) => {
    const step = { ArrowRight: 1, ArrowLeft: -1 }[event.key];
    if (!step) return;
    const seen = tabs.filter((t) => t.offsetParent);
    open(seen[(seen.indexOf(tab) + step + seen.length) % seen.length].dataset.tab!, true);
  });
});
// The Menu tab exists only on small screens, where the menu isn't already beside you.
matchMedia('(max-width: 900px)').addEventListener('change', (event) => { if (!event.matches && bench.dataset.tab === 'menu') open('dishes'); });

const filter = () => {
  const words = $<HTMLInputElement>('pick-q').value.toLowerCase().trim().split(/\s+/), meal = $<HTMLSelectElement>('pick-meal').value;
  let any = false;
  document.querySelectorAll<HTMLElement>('.pick-group').forEach((group) => {
    let some = false;
    group.querySelectorAll<HTMLElement>('[data-pick]').forEach((row) => {
      const ok = words.every((w) => row.dataset.search!.includes(w)) && (!meal || row.dataset.meal!.split('|').includes(meal));
      row.hidden = !ok; some ||= ok;
    });
    group.hidden = !some; any ||= some;
  });
  $('pick-none').hidden = any;
};
$('pick-q').addEventListener('input', filter);
$('pick-meal').addEventListener('change', filter);
$('m-title').addEventListener('input', (e) => commit(() => { menu.title = (e.target as HTMLInputElement).value; }));
$('m-note').addEventListener('input', (e) => commit(() => { menu.note = (e.target as HTMLInputElement).value; }));
$('m-blurbs').addEventListener('change', (e) => commit(() => { menu.blurbs = (e.target as HTMLInputElement).checked; }));
document.querySelectorAll<HTMLInputElement>('[name=paper]').forEach((r) => r.addEventListener('change', () => commit(() => { menu.paper = r.value; })));

let undo: MenuItem[] | null = null;
const replaceItems = (items: MenuItem[], message: string) => {
  undo = menu.items;
  commit(() => { menu.items = items; });
  toast(message);
  const back = el('button', 'linkish', 'Undo') as HTMLButtonElement;
  back.type = 'button';
  back.addEventListener('click', () => { if (undo) commit(() => { menu.items = undo!; }); toast('Put back.'); });
  $('toast').append(back);
};
$('deal').addEventListener('click', () => {
  const picks = SECTIONS.flatMap((s) => { const pool = dishes.filter((d) => d.section === s.id); return pool.length ? [{ id: pool[Math.floor(Math.random() * pool.length)].id }] : []; });
  replaceItems(picks, 'Dealt you a menu.');
  if (matchMedia('(max-width: 900px)').matches) open('menu');
});
$('empty').addEventListener('click', () => replaceItems([], 'Menu cleared.'));
$('keep').addEventListener('click', () => { const kept = menu; shared = null; history.replaceState(null, '', location.pathname); save(kept); toast('It’s your menu now.'); });
$('mine').addEventListener('click', () => { shared = null; history.replaceState(null, '', location.pathname); document.dispatchEvent(new CustomEvent('menu:change')); });

const copy = async (text: string, ok: string) => {
  try { await navigator.clipboard.writeText(text); toast(ok); }
  catch { const area = el('textarea') as HTMLTextAreaElement; area.value = text; document.body.append(area); area.select(); const did = document.execCommand('copy'); area.remove(); toast(did ? ok : 'Couldn’t copy. Your browser blocked the clipboard.'); }
};
$('share').addEventListener('click', () => copy(location.origin + location.pathname + '#m=' + encode(menu), 'Link copied.'));
$('copy-shop').addEventListener('click', () => copy(listed().map((i) => byId.get(i.id)!).map((d) => `${d.title}\n${d.ingredients.flatMap((g) => g.items).map((x) => `- ${x}`).join('\n')}`).join('\n\n'), 'Shopping list copied.'));
const print = (what: string) => { document.body.dataset.print = what; window.print(); delete document.body.dataset.print; };
$('print-menu').addEventListener('click', () => print('menu'));
$('print-shop').addEventListener('click', () => print('shop'));

// The picker edits your own menu, so hold it while someone else's is on the table.
document.addEventListener('click', (event) => {
  if (!shared || !(event.target as Element).closest('[data-add]')) return;
  event.stopPropagation();
  toast('Keep this menu first, then add to it.');
}, true);
document.addEventListener('menu:change', render);
window.addEventListener('storage', render);
window.addEventListener('hashchange', () => { if (location.hash.startsWith('#m=')) { shared = decode(location.hash.slice(3)); menu = shared ?? load(); render(); } });
render();
