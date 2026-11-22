// The floating reading helper. The panel is the open source AccessibleWeb Widget (MIT).
// It loads only when someone opens it, or has settings saved from before.
import dyslexic from '@fontsource/opendyslexic/files/opendyslexic-latin-400-normal.woff2?url';
import legible from '@fontsource/atkinson-hyperlegible/files/atkinson-hyperlegible-latin-400-normal.woff2?url';
import lexend from '@fontsource/lexend/files/lexend-latin-400-normal.woff2?url';
import { toast } from './menu-store';
import { chosen } from './voice';

const root = document.documentElement;
let loading: Promise<any> | undefined;

const load = () => (loading ??= (async () => {
  const voice = chosen()?.voice;
  (window as any).AccessibleWebWidgetOptions = {
    hideButton: true, lang: 'en',
    // Our own copies, so nothing is fetched from another site.
    readableFontUrls: { dyslexic, legible, lexend },
    // Read aloud with a voice that stays on this device.
    ...(voice && { ttsNativeVoiceName: voice.name, ttsNativeVoiceLang: voice.lang }),
  };
  // @ts-expect-error the package ships no types
  const { default: Widget } = await import('accessible-web-widget');
  const widget = Widget.instance;
  // The widget sizes text by pinning pixels on every element, which goes stale when the
  // theme changes. The whole site is in rem, so scale that instead.
  widget.ensureTextScaleObserver = () => {};
  widget.scaleText = (times = 1) => {
    const scale = Number(times) > 0 ? Number(times) : 1;
    widget.currentTextScaleMultiplier = scale;
    document.querySelectorAll<HTMLElement>('[data-acc-baseSize]').forEach((el) => { el.style.fontSize = ''; el.removeAttribute('data-acc-baseSize'); });
    scale === 1 ? root.style.removeProperty('--read-scale') : root.style.setProperty('--read-scale', String(scale));
  };
  const host = document.getElementById('acc-widget-host');
  if (host?.shadowRoot) {
    const sheet = new CSSStyleSheet();
    sheet.replaceSync('.acc-menu, .acc-menu * { font-family: var(--body) !important; }');
    host.shadowRoot.adoptedStyleSheets = [...host.shadowRoot.adoptedStyleSheets, sheet];
  }
  // Sizes it pinned while starting up, before the line above took over.
  const pinned = document.querySelector<HTMLElement>('[data-acc-baseSize]');
  if (pinned || widget.currentTextScaleMultiplier !== 1) widget.scaleText(widget.currentTextScaleMultiplier);
  return widget;
})());

/* ---------- Cook mode is a modal dialog, so the panel has to move inside it ---------- */
const cook = document.querySelector<HTMLDialogElement>('#cook');
const place = () => {
  const host = document.getElementById('acc-widget-host');
  if (!host) return;
  const home = cook?.open ? cook : document.body;
  if (host.parentElement !== home) home.append(host);
};
// Color filters are set on the page's own elements; a modal sits outside them.
const tint = () => { if (cook) cook.style.filter = cook.open ? getComputedStyle(document.querySelector('main')!).filter.replace('none', '') : ''; };
if (cook) {
  new MutationObserver(() => { place(); tint(); }).observe(cook, { attributes: true, attributeFilter: ['open'] });
  new MutationObserver(tint).observe(document.head, { childList: true, subtree: true });
}

// Open it and make sure it really is on screen. If the widget thinks it is open but
// nothing shows, close it properly and start over.
function show(widget: any) {
  const host: HTMLElement | null = widget.shadowHost;
  if (host && !host.isConnected) (cook?.open ? cook : document.body).append(host);
  const seen = () => !!(host?.shadowRoot?.querySelector('.acc-menu') as HTMLElement | null)?.getClientRects().length;
  widget.open();
  if (seen()) return;
  widget.close();
  widget.menuContainer?.remove();
  widget.menuContainer = null;
  widget.open();
  if (!seen()) throw new Error('Reading help did not open');
}

// The button must outlive every option, so leave it out of "reader mode" hiding.
document.querySelectorAll<HTMLButtonElement>('[data-reading-help]').forEach((button) => {
  button.hidden = false;
  button.addEventListener('click', async () => {
    button.setAttribute('aria-busy', 'true');
    try {
      const widget = await load();
      place();
      show(widget);
    } catch {
      loading = undefined;
      toast('Reading help couldn’t load. Reload the page and try again.');
    } finally { button.removeAttribute('aria-busy'); }
  });
});

let saved = false;
try { saved = !!localStorage.getItem('accweb'); } catch { /* storage blocked */ }
if (saved || matchMedia('(prefers-contrast: more)').matches) load().then(place, () => {});
