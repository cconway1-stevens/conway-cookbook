// Rotate the recipe photo used as the browser tab icon.
const favicon = document.querySelector<HTMLLinkElement>('link[rel=icon]');
const urls: string[] = JSON.parse(favicon?.dataset.thumbs ?? '[]');

export function setIcon(thumb: string | undefined) {
  if (thumb && favicon) favicon.href = thumb;
}

if (urls.length) setIcon(urls[Math.floor(Math.random() * urls.length)]);
