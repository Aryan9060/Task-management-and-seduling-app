import { useEffect, useState } from 'react';
import api, { errorMessage } from '../api/client.js';
import { toLocalInput, fromLocalInput, toDateInput } from '../utils/datetime.js';

const EMPTY = {
  title: '',
  description: '',
  categoryId: '',
  priority: 'medium',
  status: 'todo',
  startAt: '',
  dueAt: '',
  reminder: '',
  estimatedDurationMinutes: '',
  repeat: '',
  repeatInterval: '1',
  repeatDays: [],
  repeatUntil: '',
};

const WEEKDAYS = [
  { value: 0, label: 'Su' },
  { value: 1, label: 'Mo' },
  { value: 2, label: 'Tu' },
  { value: 3, label: 'We' },
  { value: 4, label: 'Th' },
  { value: 5, label: 'Fr' },
  { value: 6, label: 'Sa' },
];

function taskToForm(task) {
  const rule = task.recurrenceRule;
  return {
    title: task.title ?? '',
    description: task.description ?? '',
    categoryId: task.categoryId ?? '',
    priority: task.priority ?? 'medium',
    status: task.status ?? 'todo',
    startAt: toLocalInput(task.startAt),
    dueAt: toLocalInput(task.dueAt),
    reminder: task.reminderMinutesBefore != null ? String(task.reminderMinutesBefore) : '',
    estimatedDurationMinutes: task.estimatedDurationMinutes ?? '',
    repeat: rule?.frequency ?? '',
    repeatInterval: rule?.interval ? String(rule.interval) : '1',
    repeatDays: rule?.byWeekday ?? [],
    repeatUntil: toDateInput(rule?.until),
  };
}

export default function TaskForm({ task, categories, onClose, onSaved }) {
  const isEdit = Boolean(task);
  const [form, setForm] = useState(isEdit ? taskToForm(task) : EMPTY);
  const [assignees, setAssignees] = useState(isEdit ? (task.assignees ?? []) : []);
  const [userQuery, setUserQuery] = useState('');
  const [userResults, setUserResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const query = userQuery.trim();
    if (!query) {
      setUserResults([]);
      return undefined;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const { data } = await api.get('/users', { params: { search: query } });
        if (!cancelled) setUserResults(data.users);
      } catch {
        if (!cancelled) setUserResults([]);
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [userQuery]);

  const setField = (field) => (event) => {
    setForm((prev) => ({ ...prev, [field]: event.target.value }));
  };

  const handleDueChange = (event) => {
    const value = event.target.value;
    setForm((prev) => ({ ...prev, dueAt: value, reminder: value ? prev.reminder : '' }));
  };

  const toggleWeekday = (day) => {
    setForm((prev) => ({
      ...prev,
      repeatDays: prev.repeatDays.includes(day)
        ? prev.repeatDays.filter((d) => d !== day)
        : [...prev.repeatDays, day].sort((a, b) => a - b),
    }));
  };

  const addAssignee = (user) => {
    setAssignees((prev) =>
      prev.some((a) => a.id === user.id) ? prev : [...prev, { id: user.id, name: user.name, email: user.email }]
    );
    setUserQuery('');
    setUserResults([]);
  };

  const removeAssignee = (id) => {
    setAssignees((prev) => prev.filter((a) => a.id !== id));
  };

  const visibleResults = userResults.filter((u) => !assignees.some((a) => a.id === u.id));

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');

    const payload = {
      title: form.title.trim(),
      description: form.description.trim(),
      categoryId: form.categoryId || null,
      priority: form.priority,
      status: form.status,
      startAt: fromLocalInput(form.startAt),
      dueAt: fromLocalInput(form.dueAt),
      reminderMinutesBefore: form.dueAt && form.reminder !== '' ? Number(form.reminder) : null,
      estimatedDurationMinutes:
        form.estimatedDurationMinutes === '' ? null : Number(form.estimatedDurationMinutes),
      assigneeIds: assignees.map((a) => a.id),
      recurrenceRule: form.repeat
        ? {
            frequency: form.repeat,
            interval: Number(form.repeatInterval) || 1,
            ...(form.repeat === 'weekly' ? { byWeekday: form.repeatDays } : {}),
            until: form.repeatUntil || null,
          }
        : null,
    };

    if (!payload.title) {
      setError('Title is required');
      return;
    }

    setSubmitting(true);
    try {
      if (isEdit) {
        await api.patch(`/tasks/${task.id}`, payload);
      } else {
        await api.post('/tasks', payload);
      }
      onSaved();
    } catch (err) {
      setError(errorMessage(err, 'Unable to save the task'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{isEdit ? 'Edit task' : 'New task'}</h2>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Close
          </button>
        </div>

        {error && <div className="alert alert-error">{error}</div>}

        <form onSubmit={handleSubmit} className="form">
          <label className="field">
            <span>Title</span>
            <input
              type="text"
              value={form.title}
              onChange={setField('title')}
              maxLength={200}
              required
              autoFocus
            />
          </label>

          <label className="field">
            <span>Description</span>
            <textarea
              value={form.description}
              onChange={setField('description')}
              rows={3}
              maxLength={5000}
            />
          </label>

          <div className="field">
            <span>Assignees</span>
            <div className="assignee-picker">
              {assignees.map((assignee) => (
                <span key={assignee.id} className="assignee-chip">
                  {assignee.name}
                  <button
                    type="button"
                    className="assignee-chip-remove"
                    onClick={() => removeAssignee(assignee.id)}
                    aria-label={`Remove ${assignee.name}`}
                  >
                    ×
                  </button>
                </span>
              ))}
              <input
                type="search"
                className="assignee-search"
                placeholder="Search people by name or email..."
                value={userQuery}
                onChange={(e) => setUserQuery(e.target.value)}
              />
            </div>
            {userQuery.trim() && (
              <div className="assignee-results">
                {searching ? (
                  <div className="assignee-empty">Searching...</div>
                ) : visibleResults.length > 0 ? (
                  visibleResults.map((user) => (
                    <button
                      type="button"
                      key={user.id}
                      className="assignee-result"
                      onClick={() => addAssignee(user)}
                    >
                      <span className="assignee-result-name">{user.name}</span>
                      <span className="assignee-result-email">{user.email}</span>
                    </button>
                  ))
                ) : (
                  <div className="assignee-empty">No matching users</div>
                )}
              </div>
            )}
          </div>

          <div className="form-grid">
            <label className="field">
              <span>Category</span>
              <select value={form.categoryId} onChange={setField('categoryId')}>
                <option value="">No category</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="field">
              <span>Priority</span>
              <select value={form.priority} onChange={setField('priority')}>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
            </label>

            <label className="field">
              <span>Status</span>
              <select value={form.status} onChange={setField('status')}>
                <option value="todo">To Do</option>
                <option value="in_progress">In Progress</option>
                <option value="completed">Completed</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </label>

            <label className="field">
              <span>Estimated duration (minutes)</span>
              <input
                type="number"
                min="0"
                step="5"
                value={form.estimatedDurationMinutes}
                onChange={setField('estimatedDurationMinutes')}
              />
            </label>

            <label className="field">
              <span>Start</span>
              <input type="datetime-local" value={form.startAt} onChange={setField('startAt')} />
            </label>

            <label className="field">
              <span>Due</span>
              <input type="datetime-local" value={form.dueAt} onChange={handleDueChange} />
            </label>

            <label className="field">
              <span>Reminder</span>
              <select value={form.reminder} onChange={setField('reminder')} disabled={!form.dueAt}>
                <option value="">No reminder</option>
                <option value="0">At due time</option>
                <option value="10">10 minutes before</option>
                <option value="60">1 hour before</option>
                <option value="1440">1 day before</option>
              </select>
            </label>
          </div>

          {!form.dueAt && <span className="field-hint">Set a due date to enable reminders.</span>}

          <div className="field">
            <span>Repeat</span>
            <div className="form-grid">
              <label className="field">
                <span>Frequency</span>
                <select value={form.repeat} onChange={setField('repeat')}>
                  <option value="">Does not repeat</option>
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                  <option value="monthly">Monthly</option>
                </select>
              </label>

              {form.repeat && (
                <>
                  <label className="field">
                    <span>Every</span>
                    <input
                      type="number"
                      min="1"
                      max="365"
                      value={form.repeatInterval}
                      onChange={setField('repeatInterval')}
                    />
                  </label>

                  <label className="field">
                    <span>Ends on (optional)</span>
                    <input type="date" value={form.repeatUntil} onChange={setField('repeatUntil')} />
                  </label>

                  {form.repeat === 'weekly' && (
                    <div className="field">
                      <span>On days</span>
                      <div className="weekday-picker">
                        {WEEKDAYS.map(({ value, label }) => (
                          <button
                            key={value}
                            type="button"
                            className={`weekday-toggle${
                              form.repeatDays.includes(value) ? ' weekday-toggle-active' : ''
                            }`}
                            aria-pressed={form.repeatDays.includes(value)}
                            onClick={() => toggleWeekday(value)}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
            {form.repeat === 'weekly' && form.repeatDays.length === 0 && (
              <span className="field-hint">Pick at least one weekday.</span>
            )}
          </div>

          <div className="modal-actions">
            <button type="button" className="btn btn-ghost" onClick={onClose}>
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={submitting || (form.repeat === 'weekly' && form.repeatDays.length === 0)}
            >
              {submitting ? 'Saving...' : isEdit ? 'Save changes' : 'Create task'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
