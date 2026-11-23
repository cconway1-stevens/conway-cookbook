const ALARM_INTERVAL = 6000;
const MAX_DURATION = 24 * 60 * 60;

interface Timer {
  label: string;
  duration: number;
  deadline: number;
  remaining: number;
  card: HTMLElement;
  dial: HTMLElement;
  display: HTMLElement;
  read: HTMLButtonElement;
  end: HTMLButtonElement;
}

function timeText(seconds: number) {
  const values = [Math.floor(seconds / 3600), Math.floor(seconds / 60) % 60, seconds % 60];
  return values[0] ? values.map((value, i) => i ? String(value).padStart(2, '0') : String(value)).join(':')
    : values.slice(1).map((value, i) => i ? String(value).padStart(2, '0') : String(value)).join(':');
}

function spokenTime(seconds: number) {
  const values = [
    [Math.floor(seconds / 3600), 'hour'],
    [Math.floor(seconds / 60) % 60, 'minute'],
    [seconds % 60, 'second'],
  ] as const;
  return values.filter(([amount]) => amount > 0)
    .map(([amount, unit]) => `${amount} ${unit}${amount === 1 ? '' : 's'}`).join(', ');
}

export function setupKitchenTimers({
  dialog,
  announce,
}: {
  dialog: HTMLDialogElement;
  announce: (text: string, expired?: boolean) => void;
}) {
  const tray = document.getElementById('kitchen-timers')!;
  const list = document.getElementById('timer-list')!;
  const status = document.getElementById('timer-announcements')!;
  const template = document.querySelector<HTMLTemplateElement>('#timer-card-template')!;
  const inCook = document.getElementById('cook-timer-mount')!;
  const onPage = document.getElementById('page-timer-mount')!;
  const timers = new Set<Timer>();
  let clock: number | undefined;
  let nextBell = 0;
  let sound: AudioContext | undefined;
  let bellOutput: GainNode | undefined;

  function enableSound() {
    try {
      sound ??= new AudioContext();
      if (sound.state !== 'running') {
        void sound.resume().then(() => { if (hasAlarm()) nextBell = 0; }).catch(() => {});
      }
    } catch { /* The countdown and acknowledgment remain available. */ }
  }

  const hasAlarm = () => [...timers].some(({ remaining }) => remaining === 0);
  function stopBell() {
    bellOutput?.disconnect();
    bellOutput = undefined;
  }

  function ringBell() {
    if (!sound || sound.state !== 'running') return;
    stopBell();
    const audio = sound;
    const output = audio.createGain();
    output.gain.value = .5;
    output.connect(audio.destination);
    bellOutput = output;
    // Two inharmonic partials make a simple struck-metal bell. There is no audio download.
    for (const offset of [0, .21, .67, .88]) {
      for (const [frequency, volume] of [[790, .36], [1437, .13]]) {
        const note = audio.createOscillator();
        const envelope = audio.createGain();
        const at = audio.currentTime + offset;
        note.frequency.value = frequency;
        envelope.gain.setValueAtTime(.001, at);
        envelope.gain.exponentialRampToValueAtTime(volume, at + .009);
        envelope.gain.exponentialRampToValueAtTime(.001, at + .52);
        note.connect(envelope).connect(output);
        note.start(at);
        note.stop(at + .53);
      }
    }
  }

  function tick() {
    const now = Date.now();
    const expired: string[] = [];
    for (const timer of timers) {
      const remaining = Math.max(0, Math.ceil((timer.deadline - now) / 1000));
      if (timer.remaining === remaining) continue;
      timer.remaining = remaining;
      timer.display.textContent = remaining ? timeText(remaining) : 'Time’s up';
      timer.dial.style.setProperty('--hand', `${360 * remaining / timer.duration}deg`);
      if (!remaining) {
        expired.push(timer.label);
        timer.card.dataset.ringing = '';
        timer.read.hidden = true;
        timer.end.textContent = 'Stop alarm';
        timer.end.setAttribute('aria-label', `Stop alarm for ${timer.label}`);
      }
    }
    if (expired.length) {
      const message = `Time is up for ${expired.join(' and ')}.`;
      status.textContent = message;
      announce(message, true);
      nextBell = 0;
    }
    if (hasAlarm() && now >= nextBell) {
      ringBell();
      nextBell = now + ALARM_INTERVAL;
    }
  }

  function remove(timer: Timer) {
    const focus = timer.card.contains(document.activeElement);
    timers.delete(timer);
    timer.card.remove();
    status.textContent = '';
    if (!hasAlarm()) {
      nextBell = 0;
      stopBell();
    }
    tray.hidden = !timers.size;
    if (!timers.size) {
      window.clearInterval(clock);
      clock = undefined;
    }
    if (focus) {
      const next = list.querySelector<HTMLButtonElement>('[data-ringing] [data-end-timer], [data-end-timer]');
      (next ?? (dialog.open ? document.querySelector<HTMLElement>('#timer-tools summary') : document.querySelector<HTMLElement>('[data-cook]')))?.focus();
    }
  }

  function readTime(timer: Timer) {
    const seconds = Math.max(0, Math.ceil((timer.deadline - Date.now()) / 1000));
    announce(seconds ? `${timer.label}. ${spokenTime(seconds)} remaining.` : `Time is up for ${timer.label}.`, !seconds);
  }

  function start(minutes: number, label: string) {
    const duration = Math.round(minutes * 60);
    if (!Number.isFinite(duration) || duration < 1 || duration > MAX_DURATION) return;
    enableSound();
    const card = template.content.firstElementChild!.cloneNode(true) as HTMLElement;
    card.querySelector('.timer-name')!.textContent = label;
    card.setAttribute('aria-label', label);
    const timer = {
      label, duration, deadline: Date.now() + duration * 1000, remaining: -1, card,
      dial: card.querySelector<HTMLElement>('.timer-dial')!,
      display: card.querySelector<HTMLElement>('.timer-display')!,
      read: card.querySelector<HTMLButtonElement>('[data-hear-timer]')!,
      end: card.querySelector<HTMLButtonElement>('[data-end-timer]')!,
    };
    timer.read.setAttribute('aria-label', `Read time for ${label}`);
    timer.end.setAttribute('aria-label', `Cancel ${label}`);
    timer.read.addEventListener('click', () => readTime(timer));
    timer.end.addEventListener('click', () => remove(timer));
    timers.add(timer);
    list.append(card);
    tray.hidden = false;
    tick();
    clock ??= window.setInterval(tick, 250);
  }

  function place() {
    (dialog.open ? inCook : onPage).append(tray);
    tick();
  }
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') tick();
  });
  return { start, place };
}
