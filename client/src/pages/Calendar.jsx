import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import api, { errorMessage } from '../api/client.js';
import TaskForm from '../components/TaskForm.jsx';
import { formatDate } from '../utils/datetime.js';
import { VIEWS, addDays, buildRange, parseKey, timeLabel, toKey, todayUtc } from '../utils/calendar.js';

const STATUS_SHORT = {
  todo: 'To Do',
  in_progress: 'In Progress',
  completed: 'Done',
  cancelled: 'Cancelled',
};

const OCCURRENCE_LABELS = {
  pending: 'Pending',
  completed: 'Done',
  missed: 'Missed',
  skipped: 'Skipped',
};

const PRIORITY_CLASS = {
  low: 'prio-low',
  medium: 'prio-medium',
  high: 'prio-high',
  urgent: 'prio-urgent',
};

/** UTC day key for an ISO timestamp, using UTC parts (days never shift). */
function utcKeyOf(iso) {
  return new Date(iso).toISOString().slice(0, 10);
}

function OccurrenceActions({ occurrence, disabled, onSet }) {
  const stop = (fn) => (e) => {
    e.stopPropagation();
    fn();
  };
  return (
    <span className="occurrence-actions">
      {(occurrence.status === 'pending' || occurrence.status === 'missed') && (
        <>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            disabled={disabled}
            onClick={stop(() => onSet(occurrence, 'completed'))}
          >
            Complete
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            disabled={disabled}
            onClick={stop(() => onSet(occurrence, 'skipped'))}
          >
            Skip
          </button>
        </>
      )}
      {(occurrence.status === 'completed' || occurrence.status === 'skipped') && (
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          disabled={disabled}
          onClick={stop(() => onSet(occurrence, 'pending'))}
        >
          Reopen
        </button>
      )}
    </span>
  );
}

export default function Calendar() {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialDay = searchParams.get('day');
  const initialView = searchParams.get('view');
  const [view, setView] = useState(VIEWS.some((v) => v.value === initialView) ? initialView : 'month');
  const [cursor, setCursor] = useState(initialDay ? parseKey(initialDay) : todayUtc());
  const [selectedKey, setSelectedKey] = useState(initialDay ?? toKey(todayUtc()));
  const [tasks, setTasks] = useState([]);
  const [rangeTruncated, setRangeTruncated] = useState(false);
  const [occurrences, setOccurrences] = useState([]);
  const [noDueTasks, setNoDueTasks] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [mutatingId, setMutatingId] = useState(null);
  const [modalTask, setModalTask] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [showNoDue, setShowNoDue] = useState(false);
  const todayKey = toKey(todayUtc());

  const range = useMemo(() => buildRange(view, cursor), [view, cursor]);
  // The fetch effect keys off the serialized range so an equivalent new Date
  // instance from useMemo never triggers a redundant reload.
  const rangeKey = `${toKey(range.start)}..${toKey(range.end)}`;
  const rangeRef = useRef(range);
  rangeRef.current = range;

  const load = useCallback(
    async ({ silent = false } = {}) => {
      if (!silent) setLoading(true);
      setError('');
      const { start, end } = rangeRef.current;
      try {
        const [rangeRes, activeRes] = await Promise.all([
          api.get('/tasks', {
            params: {
              dueAfter: start.toISOString(),
              dueBefore: new Date(end.getTime() - 1).toISOString(),
              limit: 100,
            },
          }),
          api.get('/tasks', { params: { limit: 100 } }),
        ]);
        const taskList = rangeRes.data.tasks;

        // Recurring series don't need a due date, so the due-range query can
        // miss them — occurrences are fetched for every active recurring task.
        const recurrenceById = new Map();
        for (const task of [...taskList, ...activeRes.data.tasks]) {
          if (task.isRecurring) recurrenceById.set(task.id, task);
        }
        const recurring = [...recurrenceById.values()];
        const occurrenceResults = await Promise.all(
          recurring.map((t) =>
            api
              .get(`/tasks/${t.id}/occurrences`, {
                params: { from: start.toISOString(), to: end.toISOString() },
              })
              .catch(() => ({ data: { occurrences: [] } }))
          )
        );
        const flat = occurrenceResults.flatMap((res, i) =>
          res.data.occurrences.map((o) => ({ ...o, task: recurring[i] }))
        );

        setTasks(taskList);
        setRangeTruncated(rangeRes.data.total > taskList.length);
        setOccurrences(flat);
        setNoDueTasks(
          activeRes.data.tasks.filter((t) => !t.dueAt && !t.isRecurring)
        );
      } catch (err) {
        setError(errorMessage(err, 'Unable to load the calendar'));
      } finally {
        if (!silent) setLoading(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rangeKey]
  );

  useEffect(() => {
    load();
  }, [load]);

  const loadCategories = useCallback(async () => {
    try {
      const { data } = await api.get('/categories');
      setCategories(data.categories);
    } catch {
      // Labels are decorative here; the calendar works without them.
    }
  }, []);

  useEffect(() => {
    loadCategories();
  }, [loadCategories]);

  // Keep the URL shareable/refreshable: ?view=month&day=YYYY-MM-DD
  useEffect(() => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.set('view', view);
        next.set('day', selectedKey);
        return next;
      },
      { replace: true }
    );
  }, [view, selectedKey, setSearchParams]);

  const dayMap = useMemo(() => {
    const map = new Map();
    const push = (key, item) => {
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(item);
    };

    for (const task of tasks) {
      let hasDueChip = false;
      if (task.dueAt) {
        push(utcKeyOf(task.dueAt), { type: 'task', task, sortMs: new Date(task.dueAt).getTime() });
        hasDueChip = true;
      }
      if (task.startAt) {
        // Same-day start + due would render two chips for one task; the due
        // chip already carries the day's meaning, so skip the start chip then.
        if (hasDueChip && utcKeyOf(task.startAt) === utcKeyOf(task.dueAt)) continue;
        push(utcKeyOf(task.startAt), {
          type: 'task',
          task,
          sortMs: new Date(task.startAt).getTime(),
          isStart: true,
        });
      }
    }

    for (const occurrence of occurrences) {
      push(utcKeyOf(occurrence.scheduledFor), {
        type: 'occurrence',
        occurrence,
        task: occurrence.task,
        sortMs: new Date(occurrence.scheduledFor).getTime(),
      });
    }

    for (const list of map.values()) list.sort((a, b) => a.sortMs - b.sortMs);
    return map;
  }, [tasks, occurrences]);

  const navigate = (dir) => {
    if (view === 'day') setCursor((c) => addDays(c, dir));
    else if (view === 'week') setCursor((c) => addDays(c, dir * 7));
    else {
      setCursor((c) =>
        new Date(Date.UTC(c.getUTCFullYear(), c.getUTCMonth() + dir, Math.min(c.getUTCDate(), 28)))
      );
    }
  };

  const goToday = () => {
    setCursor(todayUtc());
    setSelectedKey(todayKey);
  };

  const setOccurrenceStatus = async (occurrence, status) => {
    setMutatingId(occurrence.id);
    try {
      await api.patch(`/occurrences/${occurrence.id}`, { status });
      await load({ silent: true });
    } catch (err) {
      setError(errorMessage(err, 'Unable to update the occurrence'));
    } finally {
      setMutatingId(null);
    }
  };

  const refresh = () => {
    load();
    loadCategories();
  };

  const openCreate = () => {
    setModalTask(null);
    setModalOpen(true);
  };

  const openEdit = (task) => {
    setModalTask(task);
    setModalOpen(true);
  };

  const selectedDate = parseKey(selectedKey);
  const selectedItems = dayMap.get(selectedKey) ?? [];

  return (
    <div className="page-content" id="calendar-page">
      <div className="page-header">
        <div>
          <h1>Calendar</h1>
          <p className="page-subtitle">Deadlines and recurring occurrences, planned by day, week, or month.</p>
        </div>
        <button type="button" className="btn btn-primary" onClick={openCreate}>
          New task
        </button>
      </div>

      {error && <div className="alert alert-error">{error}</div>}
      {rangeTruncated && (
        <div className="alert">
          This period has more tasks than the calendar can show at once (limit 100). Narrow the
          period or filter tasks on the Tasks page.
        </div>
      )}

      <div className="calendar-header">
        <div className="view-switch" role="group" aria-label="Calendar view">
          {VIEWS.map((v) => (
            <button
              key={v.value}
              type="button"
              className={`chip${view === v.value ? ' chip-active' : ''}`}
              aria-pressed={view === v.value}
              onClick={() => {
                setView(v.value);
                if (v.value !== 'day') setSelectedKey(todayKey);
              }}
            >
              {v.label}
            </button>
          ))}
        </div>
        <div className="calendar-nav">
          <button type="button" className="btn btn-ghost" onClick={() => navigate(-1)} aria-label="Previous period">
            ‹ Prev
          </button>
          <button type="button" className="btn btn-ghost" onClick={goToday}>
            Today
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => navigate(1)} aria-label="Next period">
            Next ›
          </button>
        </div>
        <span className="calendar-label">{range.label}</span>
      </div>

      {loading ? (
        <div className="empty-state">Loading calendar...</div>
      ) : (
        <>
          {view !== 'day' && (
            <div className={`calendar-grid calendar-grid-${view}`}>
              {view === 'month' &&
                ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
                  <div key={d} className="calendar-weekday">
                    {d}
                  </div>
                ))}
              {range.days.map((day) => {
                const key = toKey(day);
                const items = dayMap.get(key) ?? [];
                const inMonth = view !== 'month' || day.getUTCMonth() === cursor.getUTCMonth();
                const cls = [
                  'calendar-day',
                  key === todayKey ? 'calendar-day-today' : '',
                  key === selectedKey ? 'calendar-day-selected' : '',
                  inMonth ? '' : 'calendar-day-outside',
                ]
                  .filter(Boolean)
                  .join(' ');
                return (
                  <div
                    key={key}
                    className={cls}
                    role="button"
                    tabIndex={0}
                    aria-label={`Select ${key}`}
                    onClick={() => setSelectedKey(key)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') setSelectedKey(key);
                    }}
                  >
                    <div className="calendar-day-head">
                      {view === 'week' && (
                        <span className="calendar-weekday-inline">
                          {day.toLocaleDateString(undefined, { weekday: 'short', timeZone: 'UTC' })}
                        </span>
                      )}
                      <span className="calendar-daynum">
                        {day.toLocaleDateString(undefined, { day: 'numeric', timeZone: 'UTC' })}
                      </span>
                      {items.length > 0 && <span className="calendar-day-count">{items.length}</span>}
                    </div>
                    <div className="calendar-day-items">
                      {items.slice(0, 3).map((item, i) => (
                        <span
                          key={`${item.type}-${item.type === 'task' ? item.task.id : item.occurrence.id}-${i}`}
                          className={
                            item.type === 'task'
                              ? `calendar-chip ${PRIORITY_CLASS[item.task.priority]}`
                              : `calendar-chip calendar-chip-occ-${item.occurrence.status}`
                          }
                          title={item.type === 'task' ? item.task.title : `${item.task.title} (occurrence)`}
                        >
                          {item.type === 'occurrence' ? '↻ ' : ''}
                          {item.task.title}
                        </span>
                      ))}
                      {items.length > 3 && <span className="calendar-more">+{items.length - 3} more</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <section className="panel calendar-day-panel">
            <h2>
              {selectedDate.toLocaleDateString(undefined, {
                weekday: 'long',
                month: 'long',
                day: 'numeric',
                year: 'numeric',
                timeZone: 'UTC',
              })}
            </h2>
            {selectedItems.length === 0 ? (
              <p className="panel-hint">Nothing planned for this day.</p>
            ) : (
              <ul className="calendar-detail-list">
                {selectedItems.map((item, i) => (
                  <li
                    key={`${item.type}-${item.type === 'task' ? item.task.id : item.occurrence.id}-${i}`}
                    className="calendar-detail-item"
                  >
                    <div className="calendar-detail-main">
                      {item.type === 'task' ? (
                        <>
                          <button type="button" className="linklike" onClick={() => openEdit(item.task)}>
                            {item.task.title}
                          </button>
                          <span className="calendar-detail-meta">
                            <span className={`badge badge-status-${item.task.status}`}>
                              {STATUS_SHORT[item.task.status]}
                            </span>
                            <span className={`badge badge-priority-${item.task.priority}`}>
                              {item.task.priority}
                            </span>
                            {item.task.dueAt && (
                              <span className="calendar-detail-sub">
                                {item.isStart ? 'Starts' : 'Due'} {timeLabel(item.task.dueAt)}
                              </span>
                            )}
                          </span>
                        </>
                      ) : (
                        <>
                          <span className="calendar-detail-title">
                            <button type="button" className="linklike" onClick={() => openEdit(item.task)}>
                              ↻ {item.task.title}
                            </button>
                            <span className="badge badge-recurring">Repeats</span>
                          </span>
                          <span className="calendar-detail-meta">
                            <span className={`badge badge-occurrence-${item.occurrence.status}`}>
                              {OCCURRENCE_LABELS[item.occurrence.status]}
                            </span>
                            {item.occurrence.completedAt && (
                              <span className="calendar-detail-sub">
                                Completed {formatDate(item.occurrence.completedAt)}
                              </span>
                            )}
                          </span>
                        </>
                      )}
                    </div>
                    {item.type === 'occurrence' ? (
                      <OccurrenceActions
                        occurrence={item.occurrence}
                        disabled={mutatingId === item.occurrence.id}
                        onSet={setOccurrenceStatus}
                      />
                    ) : (
                      <button type="button" className="btn btn-ghost btn-sm" onClick={() => openEdit(item.task)}>
                        Edit
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="panel">
            <h2>
              <button type="button" className="linklike" onClick={() => setShowNoDue((v) => !v)}>
                Tasks without a due date ({noDueTasks.length}) {showNoDue ? '▾' : '▸'}
              </button>
            </h2>
            {showNoDue &&
              (noDueTasks.length === 0 ? (
                <p className="panel-hint">Every active task has a due date. Well planned.</p>
              ) : (
                <ul className="calendar-detail-list">
                  {noDueTasks.map((task) => (
                    <li key={task.id} className="calendar-detail-item">
                      <div className="calendar-detail-main">
                        <button type="button" className="linklike" onClick={() => openEdit(task)}>
                          {task.title}
                        </button>
                        <span className="calendar-detail-meta">
                          <span className={`badge badge-status-${task.status}`}>{STATUS_SHORT[task.status]}</span>
                          <span className={`badge badge-priority-${task.priority}`}>{task.priority}</span>
                        </span>
                      </div>
                      <button type="button" className="btn btn-ghost btn-sm" onClick={() => openEdit(task)}>
                        Edit
                      </button>
                    </li>
                  ))}
                </ul>
              ))}
          </section>
        </>
      )}

      {modalOpen && (
        <TaskForm
          task={modalTask}
          categories={categories}
          onClose={() => setModalOpen(false)}
          onSaved={() => {
            setModalOpen(false);
            refresh();
          }}
        />
      )}
    </div>
  );
}
