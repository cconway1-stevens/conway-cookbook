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
