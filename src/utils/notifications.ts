export type BrowserPushStatus = 'granted' | 'denied' | 'default' | 'unsupported';

export function isEmbeddedIframe(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
}

export function getBrowserPushStatus(): BrowserPushStatus {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'unsupported';
  }
  return Notification.permission as BrowserPushStatus;
}

export async function requestBrowserPushPermission(): Promise<BrowserPushStatus> {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'unsupported';
  }
  try {
    const result = await Notification.requestPermission();
    return result as BrowserPushStatus;
  } catch {
    return 'denied';
  }
}

export function dispatchBrowserPush(title: string, body: string, tag?: string): void {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return;
  }
  if (Notification.permission === 'granted') {
    try {
      new Notification(title, {
        body,
        tag: tag || 'suman-depot-order',
      });
    } catch {
      // Ignore if environment blocks Notification constructor
    }
  }
}

export async function playNewOrderChime(): Promise<void> {
  if (typeof window === 'undefined') return;
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!AudioCtx) return;

    const ctx = new AudioCtx();
    if (ctx.state === 'suspended') {
      await ctx.resume();
    }
    const now = ctx.currentTime;

    const notes = [
      { freq: 880, start: 0, dur: 0.18 },
      { freq: 1174.66, start: 0.16, dur: 0.3 },
    ];

    for (const note of notes) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(note.freq, now + note.start);

      gain.gain.setValueAtTime(0.001, now + note.start);
      gain.gain.exponentialRampToValueAtTime(0.24, now + note.start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, now + note.start + note.dur);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + note.start);
      osc.stop(now + note.start + note.dur + 0.02);
    }

    window.setTimeout(() => {
      ctx.close().catch(() => {});
    }, 900);
  } catch {
    // Ignore audio context restrictions before user interaction
  }
}


