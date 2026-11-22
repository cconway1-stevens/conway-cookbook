// The menu lives in this browser only. No account, no server.

// Menu sections, papers, and the starting title come from cookbook.json, by way of the page.
export const book: { title: string; sections: { id: string; label: string }[]; papers: { id: string }[] } = JSON.parse(document.querySelector('#menu-book')!.textContent!);

export interface MenuItem { id: string; section?: string }
export interface Menu { title: string; note: string; paper: string; blurbs: boolean; items: MenuItem[] }
export const blank = (): Menu => ({ title: book.title, note: '', paper: book.papers[0].id, blurbs: true, items: [] });

const KEY = 'conway-menu';
let memory: Menu | null = null;

export const clean = (raw: any): Menu => {
  const menu = blank();
  if (!raw || typeof raw !== 'object') return menu;
  if (typeof raw.title === 'string') menu.title = raw.title.slice(0, 60);
  if (typeof raw.note === 'string') menu.note = raw.note.slice(0, 120);
  if (book.papers.some((p) => p.id === raw.paper)) menu.paper = raw.paper;
  if (typeof raw.blurbs === 'boolean') menu.blurbs = raw.blurbs;
  const seen = new Set<string>();
  for (const item of Array.isArray(raw.items) ? raw.items.slice(0, 60) : []) {
    if (typeof item?.id !== 'string' || seen.has(item.id)) continue;
    seen.add(item.id);
    const section = book.sections.some((s) => s.id === item.section) ? item.section : undefined;
    menu.items.push({ id: item.id, section });
  }
  return menu;
};
export const load = (): Menu => {
  try { return clean(JSON.parse(localStorage.getItem(KEY) ?? 'null')); } catch { return memory ?? blank(); }
};
export const save = (menu: Menu) => {
  memory = menu;
  try { localStorage.setItem(KEY, JSON.stringify(menu)); } catch { /* private window: keep it for this page */ }
  document.dispatchEvent(new CustomEvent('menu:change'));
};
export const toggle = (id: string) => {
  const menu = load();
  const at = menu.items.findIndex((item) => item.id === id);
  at < 0 ? menu.items.push({ id }) : menu.items.splice(at, 1);
  save(menu);
  return at < 0;
};

export const encode = (menu: Menu) => {
  const bytes = new TextEncoder().encode(JSON.stringify(menu));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
export const decode = (text: string): Menu | null => {
  try {
    const bytes = Uint8Array.from(atob(text.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
    return clean(JSON.parse(new TextDecoder().decode(bytes)));
  } catch { return null; }
};

export function toast(message: string, link?: { href: string; text: string }) {
  const el = document.querySelector<HTMLElement>('#toast');
  if (!el) return;
  el.textContent = message + ' ';
  if (link) el.append(Object.assign(document.createElement('a'), { href: link.href, textContent: link.text }));
  el.classList.add('show');
  clearTimeout(Number(el.dataset.timer));
  el.dataset.timer = String(setTimeout(() => el.classList.remove('show'), 4500));
}
