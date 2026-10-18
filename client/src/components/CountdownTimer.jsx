import { useEffect, useState } from 'react';
import useNow from '../hooks/useNow.js';
import { formatClock } from '../utils/datetime.js';
import { playBeep } from '../utils/beep.js';

const STORAGE_KEY = 'taskflow.countdownTarget';

function readStoredTarget() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (
      parsed &&
      typeof parsed.target === 'number' &&
      typeof parsed.totalMs === 'number' &&
      parsed.target > Date.now()
    ) {
      return parsed;
    }
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    localStorage.removeItem(STORAGE_KEY);
  }
  return null;
}

export default function CountdownTimer() {
  const [initial] = useState(readStoredTarget);
  const [target, setTarget] = useState(initial?.target ?? null);
  const [totalMs, setTotalMs] = useState(initial?.totalMs ?? null);
  const [pausedMs, setPausedMs] = useState(null);
  const [finished, setFinished] = useState(false);
  const [minutes, setMinutes] = useState(5);

  const now = useNow(500);

  const running = target != null;
  const paused = !running && pausedMs != null;

  const remainingMs = running
    ? Math.max(0, target - now.getTime())
    : paused
      ? pausedMs
      : Math.min(999, Math.max(1, Number(minutes) || 1)) * 60000;

  const progressTotal = running || paused ? totalMs : remainingMs;
  const progress =
    progressTotal > 0 ? Math.round(((progressTotal - remainingMs) / progressTotal) * 100) : 0;

  const expired = running && remainingMs <= 0;

  useEffect(() => {
    if (!expired) return;
    playBeep();
    setFinished(true);
    setTarget(null);
    setTotalMs(null);
    localStorage.removeItem(STORAGE_KEY);
  }, [expired]);

  const persist = (at, total) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ target: at, totalMs: total }));
    } catch {
      // Storage may be unavailable (private mode); the timer still works.
    }
  };

  const start = () => {
    const total = Math.min(999, Math.max(1, Number(minutes) || 1)) * 60000;
    const at = Date.now() + total;
    setFinished(false);
    setPausedMs(null);
    setTotalMs(total);
    setTarget(at);
    persist(at, total);
  };

  const pause = () => {
    setPausedMs(remainingMs);
    setTarget(null);
    localStorage.removeItem(STORAGE_KEY);
  };

  const resume = () => {
    const at = Date.now() + pausedMs;
    setTarget(at);
    setPausedMs(null);
    persist(at, totalMs);
  };

  const reset = () => {
    setTarget(null);
    setPausedMs(null);
    setTotalMs(null);
    setFinished(false);
    localStorage.removeItem(STORAGE_KEY);
  };

  const status = running ? 'Counting down' : paused ? 'Paused' : finished ? "Time's up!" : 'Ready';

  return (
    <div className="widget-timer">
      <div className="timer-phase">{status}</div>
      <div className={`timer-display${running ? ' timer-display-active' : ''}${finished ? ' timer-display-finished' : ''}`}>
        {formatClock(finished ? 0 : remainingMs)}
      </div>
      <div className="progress-track">
        <div className="progress-fill" style={{ width: `${Math.min(100, progress)}%` }} />
      </div>
      <label className="timer-minutes">
        <span>Minutes</span>
        <input
          type="number"
          min="1"
          max="999"
          value={minutes}
          disabled={running || paused}
          onChange={(e) => setMinutes(e.target.value)}
        />
      </label>
      <div className="timer-actions">
        {running ? (
          <>
            <button type="button" className="btn btn-primary" onClick={pause}>
              Pause
            </button>
            <button type="button" className="btn btn-ghost" onClick={reset}>
              Reset
            </button>
          </>
        ) : paused ? (
          <>
            <button type="button" className="btn btn-primary" onClick={resume}>
              Resume
            </button>
            <button type="button" className="btn btn-ghost" onClick={reset}>
              Reset
            </button>
          </>
        ) : (
          <>
            <button type="button" className="btn btn-primary" onClick={start}>
              {finished ? 'Start again' : 'Start'}
            </button>
            {finished && (
              <button type="button" className="btn btn-ghost" onClick={reset}>
                Reset
              </button>
            )}
          </>
        )}
      </div>
      {finished && <p className="panel-hint">Countdown finished. Start again or reset for a new one.</p>}
    </div>
  );
}
