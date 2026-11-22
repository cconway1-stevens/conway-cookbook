import { setIcon } from './icon';
import { calm } from './motion';

const rolodex = document.querySelector<HTMLElement>('[data-rolodex]');
const current = rolodex?.querySelector<HTMLElement>('[data-current-card]');
const button = rolodex?.querySelector<HTMLButtonElement>('[data-flip]');
const status = rolodex?.querySelector<HTMLElement>('[data-flip-status]');

if (rolodex && current && button && status) {
  const cards = [
    current.firstElementChild!.cloneNode(true) as HTMLAnchorElement,
    ...Array.from(rolodex.querySelectorAll<HTMLTemplateElement>('[data-recipe-card]'), (template) =>
      template.content.firstElementChild as HTMLAnchorElement),
  ];
  let active = 0;
  let animation: Animation | undefined;

  if (cards.length > 1) {
    button.hidden = false;
    button.addEventListener('click', () => {
      active = (active + 1 + Math.floor(Math.random() * (cards.length - 1))) % cards.length;
      const card = cards[active].cloneNode(true) as HTMLAnchorElement;
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
    });
  }
}
