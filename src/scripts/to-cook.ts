const key = 'conway-to-cook';
let saved = new Set<string>();

function load() {
  try {
    const value = JSON.parse(localStorage.getItem(key) ?? '[]');
    return new Set<string>(Array.isArray(value) ? value.filter(entry => typeof entry === 'string') : []);
  } catch {
    return saved;
  }
}

export const toCook = (id: string) => saved.has(id);

function sync() {
  document.querySelectorAll<HTMLButtonElement>('[data-to-cook]').forEach(button => {
    const selected = toCook(button.dataset.toCook!);
    button.hidden = false;
    button.setAttribute('aria-pressed', String(selected));
    button.setAttribute('aria-label', `To cook: ${button.dataset.title}`);
    button.textContent = selected ? '✓ To cook' : '+ To cook';
  });
}

saved = load();
sync();
document.addEventListener('click', event => {
  const button = (event.target as Element).closest<HTMLButtonElement>('[data-to-cook]');
  if (!button) return;
  const id = button.dataset.toCook!;
  if (saved.has(id)) saved.delete(id);
  else saved.add(id);
  try { localStorage.setItem(key, JSON.stringify([...saved])); } catch { /* Keep the selection in this tab. */ }
  sync();
  document.dispatchEvent(new Event('to-cook:change'));
});
window.addEventListener('storage', event => {
  if (event.key !== key && event.key !== null) return;
  saved = load();
  sync();
  document.dispatchEvent(new Event('to-cook:change'));
});
