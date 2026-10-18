import { useCallback, useEffect, useState } from 'react';
import api, { errorMessage } from '../api/client.js';
import { useTimer } from '../context/TimerContext.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { formatDateTime, formatDuration } from '../utils/datetime.js';

export default function Timer() {
  const { user } = useAuth();
  const { activeEntry, start: startTimer, stop: stopTimer, refresh } = useTimer();
  const [tasks, setTasks] = useState([]);
  const [selectedTaskId, setSelectedTaskId] = useState('');
  const [manualMinutes, setManualMinutes] = useState('');
  const [manualNotes, setManualNotes] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const loadTasks = useCallback(async () => {
    try {
      const { data } = await api.get('/tasks', {
        params: { sort: 'title', limit: 200, status: undefined },
      });
      setTasks(
        data.tasks.filter(
          (t) => !t.isArchived && !['completed', 'cancelled'].includes(t.status)
        )
      );
    } catch (err) {
      setError(errorMessage(err, 'Unable to load tasks'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTasks();
    refresh();
  }, [loadTasks, refresh]);

  const handleStart = async (taskId) => {
    setError('');
    try {
      await startTimer(taskId);
      refresh();
    } catch (err) {
      setError(errorMessage(err, 'Unable to start timer'));
    }
  };

  const handleStop = async (taskId) => {
    setError('');
    try {
      await stopTimer(taskId);
      refresh();
    } catch (err) {
      setError(errorMessage(err, 'Unable to stop timer'));
    }
  };

  const handleManualEntry = async (event) => {
    event.preventDefault();
    setError('');
    if (!selectedTaskId) {
      setError('Please select a task');
      return;
    }
    const minutes = Number(manualMinutes);
    if (!Number.isFinite(minutes) || minutes < 1) {
      setError('Enter a valid number of minutes');
      return;
    }
    setSubmitting(true);
    try {
      await api.post(`/tasks/${selectedTaskId}/time-entries`, {
        minutes,
        notes: manualNotes,
      });
      setManualMinutes('');
      setManualNotes('');
      setSelectedTaskId('');
      refresh();
      loadTasks();
    } catch (err) {
      setError(errorMessage(err, 'Unable to log time entry'));
    } finally {
      setSubmitting(false);
    }
  };

  const isRunning = (taskId) => activeEntry?.taskId === taskId;

  if (loading) {
    return (
      <div className="page-content">
        <div className="empty-state">Loading timer...</div>
      </div>
    );
  }

  return (
    <div className="page-content">
      <div className="page-header">
        <div>
          <h1>Time Tracking</h1>
          <p className="page-subtitle">
            Start and stop timers on tasks, or log time manually.
          </p>
        </div>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      <section className="panel">
        <div className="panel-head">
          <h2>Active Timer</h2>
          <button
            type="button"
            className="btn btn-ghost btn-small"
            onClick={refresh}
          >
            Refresh
          </button>
        </div>
        {activeEntry ? (
          <div className="timer-active-card">
            <div>
              <span className="timer-active-task">
                {activeEntry.task?.title ?? 'Task'}
              </span>
              <span className="timer-active-source">
                {activeEntry.source === 'timer' ? 'Running' : 'Manual entry'}
              </span>
            </div>
            <div className="timer-active-meta">
              <span>{formatDateTime(activeEntry.startedAt)}</span>
              {activeEntry.durationMinutes != null && (
                <span>· {formatDuration(activeEntry.durationMinutes)}</span>
              )}
            </div>
            <button
              type="button"
              className="btn btn-danger"
              onClick={() => handleStop(activeEntry.taskId)}
            >
              Stop timer
            </button>
          </div>
        ) : (
          <div className="empty-state">No timer is currently running.</div>
        )}
      </section>

      <section className="panel">
        <div className="panel-head">
          <h2>Start Timer on a Task</h2>
        </div>
        {tasks.length === 0 ? (
          <p className="panel-hint">
            No active tasks available. Create a task first.
          </p>
        ) : (
          <div className="task-grid">
            {tasks.map((task) => (
              <div key={task.id} className="timer-task-card">
                <div className="timer-task-info">
                  <span className="timer-task-title">{task.title}</span>
                  {task.category && (
                    <span className="timer-task-category">{task.category.name}</span>
                  )}
                </div>
                <button
                  type="button"
                  className={`btn ${isRunning(task.id) ? 'btn-ghost' : 'btn-primary'}`}
                  disabled={isRunning(task.id)}
                  onClick={() => handleStart(task.id)}
                >
                  {isRunning(task.id) ? 'Running' : 'Start'}
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="panel">
        <div className="panel-head">
          <h2>Log Time Manually</h2>
        </div>
        <form onSubmit={handleManualEntry} className="form-grid">
          <div className="field">
            <span>Task</span>
            <select
              className="input"
              value={selectedTaskId}
              onChange={(e) => setSelectedTaskId(e.target.value)}
            >
              <option value="">Select a task</option>
              {tasks.map((task) => (
                <option key={task.id} value={task.id}>
                  {task.title}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <span>Minutes</span>
            <input
              type="number"
              min="1"
              className="input"
              value={manualMinutes}
              onChange={(e) => setManualMinutes(e.target.value)}
              placeholder="e.g. 45"
            />
          </div>
          <div className="field">
            <span>Notes (optional)</span>
            <textarea
              className="input"
              rows={2}
              value={manualNotes}
              onChange={(e) => setManualNotes(e.target.value)}
              placeholder="What did you work on?"
            />
          </div>
          <div className="field field-full">
            <button
              type="submit"
              className="btn btn-primary"
              disabled={submitting || !selectedTaskId || !manualMinutes}
            >
              {submitting ? 'Logging...' : 'Log time'}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}