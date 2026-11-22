import { load, toggle, toast } from './menu-store';
import { number, replay } from './motion';

for (const list of document.querySelectorAll('.box > .cards, .recipe-heading .tapes')) number(list.children);
number(document.querySelectorAll('.panel'));

const sync = () => {
  const ids = new Set(load().items.map((item) => item.id));
  document.querySelectorAll<HTMLButtonElement>('[data-add]').forEach((button) => {
    const on = ids.has(button.dataset.add!);
    button.hidden = false;
    button.setAttribute('aria-pressed', String(on));
    const short = 'short' in button.dataset;
    button.textContent = on ? (short ? 'Added ✓' : 'On the menu ✓') : short ? 'Add' : 'Add to menu';
    button.setAttribute('aria-label', `${on ? 'On the menu' : 'Add to menu'}: ${button.dataset.title}`);
  });
  const count = document.querySelector<HTMLElement>('#menu-count');
  if (count) { count.textContent = String(ids.size); count.hidden = !ids.size; }
};
document.addEventListener('menu:change', sync);
window.addEventListener('storage', sync);
window.addEventListener('pageshow', sync);
document.addEventListener('click', (event) => {
  const button = (event.target as Element).closest<HTMLElement>('[data-add]');
  if (!button) return;
  const added = toggle(button.dataset.add!);
  replay(button, 'just');
  replay(document.querySelector('#menu-count'), 'bump');
  const href = document.querySelector<HTMLAnchorElement>('#menu-link')!.href;
  toast(`${button.dataset.title} ${added ? 'added to' : 'taken off'} your menu.`, location.pathname.endsWith('/menu/') ? undefined : { href, text: 'See the menu' });
});
sync();

// Pull a card: a random recipe from whatever is showing.
document.querySelectorAll<HTMLButtonElement>('[data-pull]').forEach((button) => {
  button.hidden = false;
  button.addEventListener('click', () => {
    const cards = [...document.querySelectorAll<HTMLElement>('.card:not([hidden])')];
    const card = cards[Math.floor(Math.random() * cards.length)];
    if (!card) return;
    const go = () => card.querySelector<HTMLAnchorElement>('.card-title a')!.click();
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return go();
    card.scrollIntoView({ block: 'center', behavior: 'smooth' });
    card.classList.add('pulled');
    setTimeout(go, 850);
  });
});
window.addEventListener('pageshow', () => document.querySelectorAll('.pulled').forEach((card) => card.classList.remove('pulled')));

// Follow a theme change made in another tab, or before a Back.
const wear = () => {
  let id: string | null = null;
  try { id = localStorage.getItem('conway-theme'); } catch { return; }
  const bars = JSON.parse(document.querySelector('#theme-bars')!.textContent!);
  if (!id || !Object.hasOwn(bars, id) || id === document.documentElement.dataset.theme) return;
  document.documentElement.dataset.theme = id;
  document.querySelector('meta[name=theme-color]')?.setAttribute('content', bars[id]);
};
window.addEventListener('storage', wear);
window.addEventListener('pageshow', wear);
