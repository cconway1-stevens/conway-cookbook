// Small helpers for the animations that need a nudge from script.
export const calm = () => matchMedia('(prefers-reduced-motion: reduce)').matches || document.documentElement.classList.contains('acc-pause-motion');
export const replay = (el: Element | null | undefined, name: string) => {
  if (!el || calm()) return;
  el.classList.remove(name);
  void (el as HTMLElement).offsetWidth;
  el.classList.add(name);
};
// Staggers: each child learns its place in line.
export const number = (list: Iterable<Element>) => { let i = 0; for (const el of list) (el as HTMLElement).style.setProperty('--i', String(i++)); };

export function confetti(into: HTMLElement) {
  if (calm() || into.querySelector('.confetti')) return;
  const box = document.createElement('div');
  box.className = 'confetti'; box.setAttribute('aria-hidden', 'true');
  const colors = ['--accent', '--second', '--highlight', '--third', '--blush'];
  for (let i = 0; i < 46; i++) {
    const bit = document.createElement('i');
    bit.style.cssText = `left:${Math.random() * 100}%;background:var(${colors[i % colors.length]});--x:${Math.random() * 160 - 80}px;--r:${Math.random() * 900 - 450}deg;animation-delay:${Math.random() * 0.7}s`;
    box.append(bit);
  }
  into.append(box);
  setTimeout(() => box.remove(), 3600);
}

// The search box types out dishes from the cookbook until someone takes over.
export function typeNames(input: HTMLInputElement, names: string[], bar: Element | null) {
  const rest = input.placeholder;
  if (!names.length) return;
  let last = '', timer = 0;
  const stop = () => { clearTimeout(timer); input.placeholder = rest; bar?.classList.remove('typing'); };
  const wait = (ms: number, fn: () => void) => { timer = window.setTimeout(fn, ms); };
  const idle = () => document.activeElement !== input && !input.value && !document.hidden && !calm();
  const start = () => {
    clearTimeout(timer);
    if (!idle()) { stop(); return wait(1500, start); }
    const name = names.filter((n) => n !== last || names.length === 1)[Math.floor(Math.random() * Math.max(1, names.length - 1))];
    last = name;
    bar?.classList.remove('typing'); void (bar as HTMLElement)?.offsetWidth; bar?.classList.add('typing');
    type(name, 1);
  };
  const type = (name: string, n: number) => {
    if (!idle()) { stop(); return wait(1500, start); }
    input.placeholder = `Search: ${name.slice(0, n)}${n < name.length ? '|' : ''}`;
    if (n < name.length) wait(55 + Math.random() * 75, () => type(name, n + 1));
    else wait(1900, () => erase(name, name.length));
  };
  const erase = (name: string, n: number) => {
    if (!idle()) { stop(); return wait(1500, start); }
    input.placeholder = `Search: ${name.slice(0, n)}`;
    if (n > 0) wait(26, () => erase(name, n - 1)); else wait(350, start);
  };
  input.addEventListener('focus', () => { stop(); wait(1500, start); });
  wait(1700, start);
}
