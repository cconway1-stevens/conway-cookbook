// A dish in the header and the browser tab. Any page picks one at random.
const mark = document.querySelector<HTMLElement>('#mark');
const urls: string[] = JSON.parse(mark?.dataset.thumbs ?? '[]');

export function setIcon(thumb: string | undefined, art?: Element | null) {
  if (!mark) return;
  if (thumb) {
    const img = document.createElement('img');
    img.src = thumb; img.alt = ''; img.width = img.height = 40;
    mark.replaceChildren(img);
    document.querySelector<HTMLLinkElement>('link[rel=icon]')?.setAttribute('href', thumb);
  } else if (art) mark.replaceChildren(art.cloneNode(true));
}
if (urls.length) setIcon(urls[Math.floor(Math.random() * urls.length)]);
