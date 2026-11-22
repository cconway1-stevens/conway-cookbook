// Hover, focus, or tap an ingredient to see how much it takes and where else it is used.
// The same ingredient can be in more than one part of a recipe (the crumble and the filling
// both have cinnamon), so every answer says which part, and the other part is outlined.
interface Entry { g: string; name: string; line: string; steps: number[]; same: string[] }
interface Info { groups: { id: string; label: string; entries: string[]; steps: number[] }[]; entries: Record<string, Entry>; labelled: boolean }

const holder = document.getElementById('ing-data');
if (holder) start(JSON.parse(holder.textContent!) as Info);

function start(info: Info) {
  const groups = new Map(info.groups.map((g) => [g.id, g]));
  const tip = document.createElement('div');
  tip.id = 'ing-tip'; tip.className = 'ing-tip'; tip.setAttribute('role', 'tooltip');
  document.body.append(tip);
  let current: HTMLElement | null = null, pinned = false, showTimer = 0, hideTimer = 0;

  const ids = (el: HTMLElement, key: string) => (el.dataset[key] ?? '').split(' ').filter(Boolean);
  const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
  const stepWords = (n: number[]) => (n.length ? `${n.length > 1 ? 'Steps' : 'Step'} ${n.join(', ')}` : '');
  const make = (tag: string, className = '', text = '') => { const el = document.createElement(tag); if (className) el.className = className; if (text) el.textContent = text; return el; };
  const target = (node: EventTarget | null) => (node instanceof Element ? node.closest<HTMLElement>('.ing, .ing-line') : null);

  interface Row { g: string; where: string; line: string; note: string; now: boolean }
  const row = (id: string, now: boolean, showLine = true): Row => {
    const e = info.entries[id];
    return { g: e.g, where: groups.get(e.g)!.label, line: showLine ? e.line : '', note: e.steps.length ? stepWords(e.steps) : 'Not named in the steps', now };
  };
  interface Card { title: string; sub: string; tag: string; rows: Row[]; foot: string }
  function describe(el: HTMLElement): Card {
    if (el.dataset.gm) {
      const g = groups.get(el.dataset.gm)!;
      return { title: capital(el.textContent ?? g.label), sub: 'Everything that goes into it', tag: '', rows: g.entries.map((id) => ({ ...row(id, false), where: '' })), foot: g.steps.length ? `Used in ${stepWords(g.steps).toLowerCase()}` : '' };
    }
    if (el.classList.contains('ing-line')) {
      const id = el.dataset.e!, e = info.entries[id];
      return { title: capital(e.name), sub: '', tag: 'this one', rows: [row(id, true, false), ...e.same.map((s) => row(s, false))], foot: e.same.length ? 'Also used in another part of the recipe.' : '' };
    }
    const here = ids(el, 'e'), other = ids(el, 'o');
    return { title: capital(el.textContent ?? ''), sub: '', tag: 'this step', rows: [...here.map((id) => row(id, true)), ...other.map((id) => row(id, false))], foot: other.length ? 'Also in another part of the recipe. Dashed outlines show where.' : '' };
  }
  function render(d: Card) {
    // Part names only matter when the answer spans more than one part.
    const multi = new Set(d.rows.map((r) => r.g)).size > 1, list = make('ul');
    const sub = d.sub || (!multi && info.labelled ? d.rows[0]?.where ?? '' : '');
    for (const r of d.rows) {
      const li = make('li', r.now && multi ? 'now' : '');
      if (multi && r.where) li.append(make('span', 'where', r.where + (r.now && d.tag ? ` · ${d.tag}` : '')));
      if (r.line) li.append(make('span', 'amount', r.line));
      li.append(make('small', '', r.note));
      list.append(li);
    }
    tip.replaceChildren(make('p', 'ing-tip-title', d.title), ...(sub ? [make('p', 'ing-tip-sub', sub)] : []), list, ...(d.foot ? [make('p', 'ing-tip-foot', d.foot)] : []));
  }

  const clearMarks = () => document.querySelectorAll('.here, .lit, .lit-other').forEach((n) => n.classList.remove('here', 'lit', 'lit-other'));
  function mark(el: HTMLElement) {
    clearMarks();
    const same = new Set<string>(), other = new Set<string>();
    const group = el.dataset.gm ?? '';
    if (group) groups.get(group)!.entries.forEach((id) => same.add(id));
    else if (el.classList.contains('ing-line')) { const id = el.dataset.e!; same.add(id); info.entries[id].same.forEach((s) => other.add(s)); }
    else { ids(el, 'e').forEach((id) => same.add(id)); ids(el, 'o').forEach((id) => other.add(id)); }
    for (const t of document.querySelectorAll<HTMLElement>('.ing, .ing-line')) {
      const mine = ids(t, 'e');
      if (t === el) t.classList.add('here');
      else if ((group && t.dataset.gm === group) || mine.some((id) => same.has(id))) t.classList.add('lit');
      else if (mine.some((id) => other.has(id))) t.classList.add('lit-other');
    }
  }

  function place(el: HTMLElement) {
    const r = el.getBoundingClientRect(), t = tip.getBoundingClientRect();
    const x = Math.min(Math.max(8, r.left + r.width / 2 - t.width / 2), innerWidth - t.width - 8);
    let y = r.bottom + 8;
    if (y + t.height > innerHeight - 8 && r.top - t.height - 8 > 8) y = r.top - t.height - 8;
    tip.style.left = `${Math.round(x)}px`; tip.style.top = `${Math.round(y)}px`;
  }
  function show(el: HTMLElement, pin = false) {
    clearTimeout(hideTimer); clearTimeout(showTimer);
    if (current === el) { if (pin) pinned = true; return; }
    current?.removeAttribute('aria-describedby');
    current = el; pinned = pin;
    render(describe(el)); mark(el);
    // Inside cook mode (a modal), it has to live in the modal or it hides behind it.
    (document.querySelector('dialog[open]') ?? document.body).append(tip);
    el.setAttribute('aria-describedby', 'ing-tip');
    tip.classList.add('on'); place(el);
  }
  function hide() {
    clearTimeout(hideTimer); clearTimeout(showTimer);
    tip.classList.remove('on'); clearMarks();
    current?.removeAttribute('aria-describedby'); current = null; pinned = false;
  }
  const soon = (ms: number) => { clearTimeout(hideTimer); hideTimer = window.setTimeout(hide, ms); };

  // The mouse can move from the word onto the tip without it closing, and Escape closes it.
  document.addEventListener('pointerover', (e) => {
    if (e.pointerType !== 'mouse') return;
    const t = target(e.target);
    if (t) { clearTimeout(hideTimer); clearTimeout(showTimer); showTimer = window.setTimeout(() => show(t), current ? 0 : 90); }
    else if (e.target instanceof Node && tip.contains(e.target)) clearTimeout(hideTimer);
  });
  document.addEventListener('pointerout', (e) => {
    if (e.pointerType !== 'mouse') return;
    if (target(e.target) || (e.target instanceof Node && tip.contains(e.target))) { clearTimeout(showTimer); if (!pinned) soon(220); }
  });
  document.addEventListener('click', (e) => {
    const t = target(e.target);
    if (t) {
      if (t.closest('label')) e.preventDefault(); // in cook mode a word is inside a tick box
      current === t && pinned ? hide() : show(t, true);
    } else if (!(e.target instanceof Node && tip.contains(e.target)) && pinned) hide();
  });
  document.addEventListener('focusin', (e) => { const t = target(e.target); if (t?.matches(':focus-visible')) show(t); });
  document.addEventListener('focusout', (e) => { if (target(e.target) && !pinned) soon(120); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && current) { e.preventDefault(); e.stopPropagation(); hide(); } }, true);
  window.addEventListener('scroll', () => { if (current) hide(); }, true);
  window.addEventListener('resize', () => { if (current) hide(); });

  // One tab stop for the steps and one for the ingredient list. Arrow keys move between words.
  for (const region of document.querySelectorAll<HTMLElement>('.sec-directions, .sec-ingredients')) {
    // Words inside a closed "Why?" note can't take focus, so arrows skip them.
    const items = () => [...region.querySelectorAll<HTMLElement>('.ing, .ing-line')].filter((n) => !n.closest('details:not([open])') && n.getClientRects().length);
    const reset = () => {
      const keep = items().find((n) => n.tabIndex === 0) ?? items()[0];
      region.querySelectorAll<HTMLElement>('.ing, .ing-line').forEach((n) => { n.tabIndex = n === keep ? 0 : -1; });
    };
    reset();
    // Opening or closing a note changes which words can be reached.
    region.addEventListener('toggle', reset, true);
    region.addEventListener('keydown', (e) => {
      const t = target(e.target);
      if (!t) return;
      const all = items(), at = all.indexOf(t);
      const to = ({ ArrowRight: at + 1, ArrowDown: at + 1, ArrowLeft: at - 1, ArrowUp: at - 1, Home: 0, End: all.length - 1 } as Record<string, number>)[e.key];
      if (to === undefined) return;
      e.preventDefault();
      const next = all[Math.min(Math.max(to, 0), all.length - 1)];
      all.forEach((a) => { a.tabIndex = -1; }); next.tabIndex = 0; next.focus();
    });
  }
}
