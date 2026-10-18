/**
 * Plays a short 880 Hz beep when a timer finishes. Best-effort: browsers may
 * block audio without a prior user gesture, and AudioContext may be missing
 * entirely, so failures are swallowed.
 */
export function playBeep() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.value = 880;
    gain.gain.value = 0.15;
    oscillator.connect(gain);
    gain.connect(ctx.destination);
    oscillator.start();
    oscillator.stop(ctx.currentTime + 0.35);
    oscillator.onended = () => ctx.close();
  } catch {
    // Audio is a nice-to-have; never break the timer UI over it.
  }
}
