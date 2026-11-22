import { replay } from './motion';
import { decodeMenuPayload, encodeMenu, type Menu, type MenuItem } from '../lib/menu-link';
import { book, clean, load, save, toast } from './menu-store';

interface Dish { id: string; title: string; description: string; url: string; section: string;  }
const SECTIONS = book.sections;
const dishes: Dish[] = JSON.parse(document.querySelector('#menu-data')!.textContent!);
const byId = new Map(dishes.map((d) => [d.id, d]));
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const el = (tag: string, className = '', text = '') => { const node = document.createElement(tag); if (className) node.className = className; if (text) node.textContent = text; return node; };

// A shared menu opens for viewing and replaces yours only if you keep it.
function sharedMenu(): Menu | null {
  if (!location.hash.startsWith('#m=')) return null;
  try { return clean(decodeMenuPayload(location.hash.slice(3))); } catch { return null; }
}
let shared = sharedMenu();
let menu: Menu = shared ?? load();
const sectionOf = (item: MenuItem): string => item.section ?? byId.get(item.id)!.section;
const listed = () => menu.items.filter((item) => byId.has(item.id));

function commit(change: () => void) {
  change();
  if (shared) { shared = menu; history.replaceState(null, '', '#m=' + encodeMenu(menu)); render(); } else save(menu);
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
  document.querySelector<HTMLElement>(`[data-dish="${CSS.escape(id)}"] [data-by="${by}"]`)?.focus();
}

const card = $('menu-card'), courses = $('menu-courses');
let dragged = '', known = new Set(listed().map((i) => i.id)), paper = menu.paper;
function endDrag() {
  dragged = '';
  card.classList.remove('lifting-any');
  for (const node of courses.querySelectorAll('.over, .lifting')) node.classList.remove('over', 'lifting');
}
function render() {
  if (!shared) menu = load();
  $('shared').hidden = !shared;
  for (const [id, value] of [['m-title', menu.title], ['m-note', menu.note]] as const) if (document.activeElement !== $(id)) $<HTMLInputElement>(id).value = value;
  $<HTMLInputElement>('m-blurbs').checked = menu.blurbs;
  document.querySelectorAll<HTMLInputElement>('[name=paper]').forEach((r) => (r.checked = r.value === menu.paper));
  const items = listed();
  $('menu-card-title').textContent = menu.title || 'Menu';
  const note = $('menu-card-note');
  note.hidden = !menu.note;
  note.textContent = menu.note;
  $('menu-empty').hidden = !!items.length;
  $('browse-dishes').hidden = !items.length;
  $('menu-hint').hidden = !items.length;
  $<HTMLButtonElement>('empty').disabled = !menu.items.length;
  card.dataset.paper = menu.paper;
  if (paper !== menu.paper) { paper = menu.paper; replay(card, 'turned'); }
  let fresh = 0;
  const groups = new Map<string, MenuItem[]>();
  for (const item of items) {
    const section = sectionOf(item), group = groups.get(section);
    if (group) group.push(item);
    else groups.set(section, [item]);
  }
  const sections = document.createDocumentFragment();
  for (const s of items.length ? SECTIONS : []) {
    const group = groups.get(s.id) ?? [];
    const section = el('section', group.length ? '' : 'bare');
    section.dataset.course = s.id;
    section.append(el('h3', '', s.label));
    const list = el('ul');
    section.addEventListener('dragover', (event) => { if (dragged) { event.preventDefault(); section.classList.add('over'); } });
    section.addEventListener('dragleave', (event) => { if (!section.contains(event.relatedTarget as Node)) section.classList.remove('over'); });
    section.addEventListener('drop', (event) => {
      event.preventDefault();
      const target = (event.target as Element).closest<HTMLElement>('[data-dish]');
      const id = dragged;
      endDrag();
      if (id) place(id, s.id, target?.dataset.dish);
    });
    if (!group.length) list.append(el('li', 'slot', 'Drop a dish here'));
    for (const item of group) {
      const dish = byId.get(item.id)!;
      const li = el('li', 'dish'); li.dataset.dish = item.id; li.draggable = true;
      if (!known.has(item.id)) { li.classList.add('fresh'); li.style.setProperty('--i', String(fresh++)); }
      li.addEventListener('dragstart', (event) => {
        dragged = item.id;
        event.dataTransfer!.effectAllowed = 'move';
        event.dataTransfer!.setData('text/plain', dish.title);
        setTimeout(() => {
          if (dragged !== item.id) return;
          li.classList.add('lifting');
          card.classList.add('lifting-any');
        });
      });
      li.addEventListener('dragend', endDrag);
      const body = el('div'), link = el('a', 'dish-name', dish.title) as HTMLAnchorElement;
      link.href = dish.url; link.draggable = false; body.append(link);
      if (menu.blurbs) body.append(el('p', '', dish.description));
      const tools = el('div', 'dish-tools');
      for (const [text, name, by] of [['↑', 'Move up', -1], ['↓', 'Move down', 1]] as const) {
        const b = el('button', '', text) as HTMLButtonElement; b.type = 'button'; b.dataset.by = String(by); b.setAttribute('aria-label', `${name}: ${dish.title}`);
        b.addEventListener('click', () => nudge(item.id, by)); tools.append(b);
      }
      const x = el('button', '', '×') as HTMLButtonElement; x.type = 'button'; x.dataset.remove = ''; x.setAttribute('aria-label', `Take off the menu: ${dish.title}`);
      x.addEventListener('click', () => {
        const rows = [...courses.querySelectorAll<HTMLElement>('[data-dish]')];
        const at = rows.indexOf(li), neighbor = (rows[at + 1] ?? rows[at - 1])?.dataset.dish;
        replaceItems(menu.items.filter(i => i.id !== item.id), 'Dish removed.');
        if (neighbor) courses.querySelector<HTMLElement>(`[data-dish="${CSS.escape(neighbor)}"] [data-remove]`)?.focus();
        else $('menu-pick').focus();
      });
      tools.append(x); li.append(body, tools); list.append(li);
    }
    section.append(list); sections.append(section);
  }
  courses.replaceChildren(sections);
  known = new Set(items.map((i) => i.id));
  $('tab-menu').textContent = items.length ? `Menu (${items.length})` : 'Menu';
  $('picker-done').textContent = `Done · ${items.length} ${items.length === 1 ? 'dish' : 'dishes'}`;
  const missing = menu.items.filter(item => !byId.has(item.id));
  $('missing-dishes').hidden = !missing.length;
  $('missing-dishes').textContent = missing.map(item => `Recipe unavailable: ${item.id}`).join(' · ');
  if (!$('pane-shop').hidden) void shopping(items);
}
interface Detail {
  lines: string[];
  measures: { line: string; ingredient: string; unit: string; quantity: number }[];
}
const details = new Map<string, Promise<Detail>>();
function detail(id: string) {
  let pending = details.get(id);
  if (!pending) {
    pending = fetch(new URL('../dish-data/' + encodeURIComponent(id) + '.json', location.href)).then(response => {
      if (!response.ok) throw Error('Ingredient list unavailable');
      return response.json() as Promise<Detail>;
    }).catch(error => { details.delete(id); throw error; });
    details.set(id, pending);
  }
  return pending;
}
let shoppingRevision = 0;
let shoppingText = '';
async function shopping(items: MenuItem[]) {
  const revision = ++shoppingRevision;
  const box = $('shop');
  const ticked = new Set([...box.querySelectorAll<HTMLInputElement>('input:checked')].map(input => input.value));
  const buttons = ['print-shop', 'copy-shop'].map(id => $<HTMLButtonElement>(id));
  buttons.forEach(button => button.disabled = true);
  box.textContent = items.length ? 'Gathering ingredients…' : 'Add a dish to start your shopping list.';
  if (!items.length) return;
  try {
    const data = await Promise.all(items.map(item => detail(item.id)));
    if (revision !== shoppingRevision) return;
    box.replaceChildren();
    const groups = new Map<string, { key: string; text: string }[]>();
    const combined = new Map<string, { quantity: number; ingredient: string; unit: string; dishes: Set<string> }>();
    data.forEach(({ lines, measures }, index) => {
      const dish = byId.get(items[index].id)!;
      const individual: { key: string; text: string }[] = [];
      lines.forEach((text, line) => {
        const measure = measures.find(m => m.line === text);
        if (!measure) { individual.push({ key: dish.id + ':' + line, text }); return; }
        const key = JSON.stringify([measure.ingredient, measure.unit]);
        const entry = combined.get(key) ?? { ...measure, quantity: 0, dishes: new Set<string>() };
        entry.quantity += measure.quantity;
        entry.dishes.add(dish.title);
        combined.set(key, entry);
      });
      if (individual.length) groups.set(dish.id, individual);
    });
    const sections = [...groups].map(([id, rows]) => ({ title: byId.get(id)!.title, rows }));
    if (combined.size) sections.unshift({ title: 'Measured ingredients', rows: [...combined].map(([key, m]) => ({
      key, text: `${Number(m.quantity.toFixed(4))} ${m.unit} ${m.ingredient} (${[...m.dishes].join(', ')})`,
    })) });
    shoppingText = sections.map(s => [s.title, ...s.rows.map(row => '- ' + row.text)].join('\n')).join('\n\n');
    for (const section of sections) {
      box.append(el('h3', '', section.title));
      const ul = el('ul');
      for (const row of section.rows) {
        const li = el('li'), label = el('label'), input = document.createElement('input');
        input.type = 'checkbox'; input.value = row.key; input.checked = ticked.has(row.key);
        label.append(input, el('span', '', row.text)); li.append(label); ul.append(li);
      }
      box.append(ul);
    }
    buttons.forEach(button => button.disabled = false);
  } catch {
    if (revision !== shoppingRevision) return;
    box.textContent = 'Couldn’t load the ingredient list. ';
    const retry = document.createElement('button');
    retry.textContent = 'Try again'; retry.onclick = () => void shopping(listed()); box.append(retry);
  }
}

/* ---------- Tabs ---------- */
const tabs = [...$('bench').querySelectorAll<HTMLButtonElement>('[role=tab]')];
const wide = matchMedia('(min-width: 900px)');
function open(id: string, focus = false) {
  for (const tab of tabs) {
    const on = tab.dataset.tab === id;
    tab.setAttribute('aria-selected', String(on)); tab.tabIndex = on ? 0 : -1;
    $(tab.getAttribute('aria-controls')!).hidden = !on;
  }
  const preview = id === 'style' || (wide.matches && id === 'dishes');
  if (preview) $('pane-menu').hidden = false;
  $('bench').dataset.view = id;
  if (id === 'shop') void shopping(listed());
  if (focus) $(`tab-${id}`).focus();
}
wide.addEventListener('change', () => open($('bench').dataset.view ?? 'menu'));
tabs.forEach((tab) => {
  tab.addEventListener('click', () => open(tab.dataset.tab!));
  tab.addEventListener('keydown', (event) => {
    const at = tabs.indexOf(tab);
    let next: number;
    switch (event.key) {
      case 'ArrowRight': next = (at + 1) % tabs.length; break;
      case 'ArrowLeft': next = (at - 1 + tabs.length) % tabs.length; break;
      case 'Home': next = 0; break;
      case 'End': next = tabs.length - 1; break;
      default: return;
    }
    event.preventDefault();
    open(tabs[next].dataset.tab!, true);
  });
});
for (const id of ['menu-pick', 'browse-dishes']) $(id).addEventListener('click', () => open('dishes', true));
$('picker-done').addEventListener('click', () => open('menu', true));

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
});
$('empty').addEventListener('click', () => { replaceItems([], 'Menu cleared.'); $('menu-pick').focus(); });
$('keep').addEventListener('click', () => {
  const kept = menu;
  undo = null; shared = null;
  history.replaceState(null, '', location.pathname);
  save(kept);
  tabs.find((tab) => tab.tabIndex === 0)?.focus();
  toast('It’s your menu now.');
});
$('mine').addEventListener('click', () => {
  undo = null; shared = null;
  history.replaceState(null, '', location.pathname);
  document.dispatchEvent(new CustomEvent('menu:change'));
  tabs.find((tab) => tab.tabIndex === 0)?.focus();
  toast('Back to your menu.');
});

const copy = async (text: string, ok: string) => {
  try { await navigator.clipboard.writeText(text); toast(ok); }
  catch { const area = el('textarea') as HTMLTextAreaElement; area.value = text; document.body.append(area); area.select(); const did = document.execCommand('copy'); area.remove(); toast(did ? ok : 'Couldn’t copy. Your browser blocked the clipboard.'); }
};
$('share').addEventListener('click', () => copy(location.origin + location.pathname + '#m=' + encodeMenu(menu), 'Link copied.'));
$('copy-shop').addEventListener('click', () => copy(shoppingText, 'Shopping list copied.'));
const print = (what: 'menu' | 'shop') => { document.body.dataset.print = what; window.print(); };
window.addEventListener('afterprint', () => { delete document.body.dataset.print; });
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
window.addEventListener('hashchange', () => {
  if (!location.hash.startsWith('#m=')) return;
  undo = null; shared = sharedMenu(); menu = shared ?? load();
  render();
});
render();
