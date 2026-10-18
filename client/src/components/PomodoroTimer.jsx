import { useEffect, useState } from 'react';
import { formatClock } from '../utils/datetime.js';
import { playBeep } from '../utils/beep.js';

const WORK_SECONDS = 25 * 60;
const BREAK_SECONDS = 5 * 60;

export default function PomodoroTimer() {
  const [mode, setMode] = useState('work');
  const [secondsLeft, setSecondsLeft] = useState(WORK_SECONDS);
  const [running, setRunning] = useState(false);
  const [sessions, setSessions] = useState(0);

  useEffect(() => {
    if (!running) return undefined;
    const id = setInterval(() => {
      setSecondsLeft((s) => s - 1);
    }, 1000);
    return () => clearInterval(id);
  }, [running]);

  useEffect(() => {
    if (secondsLeft > 0) return;
    playBeep();
    if (mode === 'work') {
      setSessions((n) => n + 1);
      setMode('break');
      setSecondsLeft(BREAK_SECONDS);
    } else {
      setMode('work');
      setSecondsLeft(WORK_SECONDS);
    }
  }, [secondsLeft, mode]);

  const phaseTotal = mode === 'work' ? WORK_SECONDS : BREAK_SECONDS;

  const reset = () => {
    setRunning(false);
    setMode('work');
    setSecondsLeft(WORK_SECONDS);
  };

  return (
    <div className="widget-timer">
      <div className="timer-phase">{mode === 'work' ? 'Focus' : 'Break'}</div>
      <div className={`timer-display${running && mode === 'work' ? ' timer-display-active' : ''}`}>
        {formatClock(secondsLeft * 1000)}
      </div>
      <div className="progress-track">
        <div
          className={`progress-fill${mode === 'break' ? ' progress-fill-break' : ''}`}
          style={{ width: `${Math.round(((phaseTotal - secondsLeft) / phaseTotal) * 100)}%` }}
        />
      </div>
      <div className="timer-actions">
        <button type="button" className="btn btn-primary" onClick={() => setRunning((r) => !r)}>
          {running ? 'Pause' : 'Start'}
        </button>
        <button type="button" className="btn btn-ghost" onClick={reset}>
          Reset
        </button>
      </div>
      <p className="panel-hint">
        {sessions === 0
          ? 'No focus sessions completed yet.'
          : `${sessions} focus session${sessions === 1 ? '' : 's'} completed.`}
      </p>
    </div>
  );
}
