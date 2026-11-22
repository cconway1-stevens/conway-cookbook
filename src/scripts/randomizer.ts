import { setIcon } from './icon';
import { calm } from './motion';

const rolodex = document.querySelector<HTMLElement>('[data-rolodex]');
const current = rolodex?.querySelector<HTMLElement>('[data-current-card]');
const button = rolodex?.querySelector<HTMLButtonElement>('[data-flip]');
const status = rolodex?.querySelector<HTMLElement>('[data-flip-status]');
const tabs = rolodex?.querySelector<HTMLElement>('[data-rolodex-tabs]');

if (rolodex && current && button && status && tabs) {
  const templates = Array.from(rolodex.querySelectorAll<HTMLTemplateElement>('[data-recipe-card]'));
  const options = [
    current.firstElementChild!.cloneNode(true) as HTMLAnchorElement,
    ...templates.map((template) => template.content.firstElementChild as HTMLAnchorElement),
  ].map((card) => ({ card, filters: JSON.parse(card.dataset.filters ?? '[]') as string[] }));
  let active = options[0];
  let pool = options;
  let animation: Animation | undefined;

  function show(option: (typeof options)[number]) {
    if (!current || !status || option === active) return;
    active = option;
    const card = option.card.cloneNode(true) as HTMLAnchorElement;
    card.querySelector('img')?.removeAttribute('fetchpriority');
    current.replaceChildren(card);
    status.textContent = card.querySelector('h3')?.textContent ?? '';
    setIcon(card.dataset.thumb, card.querySelector('svg'));
    animation?.cancel();
    if (!calm()) {
      animation = card.animate([
        { transform: 'scaleY(.83) translateY(-12px)', opacity: .45 },
        { transform: 'scaleY(1) translateY(0)', opacity: 1 },
      ], { duration: 240, easing: 'cubic-bezier(.2,.7,.25,1)' });
    }
  }

  if (options.length > 1) {
    tabs.hidden = false;
    button.hidden = false;
    const filters = Array.from(tabs.querySelectorAll<HTMLButtonElement>('[data-card-filter]'));
    for (const filter of filters) {
      filter.addEventListener('click', () => {
        const key = filter.dataset.cardFilter ?? '';
        pool = key ? options.filter((option) => option.filters.includes(key)) : options;
        filters.forEach((tab) => tab.setAttribute('aria-pressed', String(tab === filter)));
        button.disabled = pool.length < 2;
        if (!pool.includes(active)) show(pool[0]);
      });
    }
    button.addEventListener('click', () => {
      const otherCards = pool.filter((option) => option !== active);
      if (otherCards.length) show(otherCards[Math.floor(Math.random() * otherCards.length)]);
    });
  }
}
