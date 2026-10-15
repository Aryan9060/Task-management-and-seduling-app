import { useCallback, useEffect, useState } from 'react';
import api, { errorMessage } from '../api/client.js';
import { formatDateTime } from '../utils/datetime.js';

const STATUS_LABELS = {
  todo: 'To Do',
  in_progress: 'In Progress',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

const PRIORITY_LABELS = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  urgent: 'Urgent',
};

const ACTIVITY_LABELS = {
  created: 'Created',
  status_changed: 'Status changed',
  priority_changed: 'Priority changed',
  due_at_changed: 'Due date changed',
  start_at_changed: 'Start date changed',
  category_changed: 'Category changed',
  assignee_added: 'Assignee added',
  assignee_removed: 'Assignee removed',
  archived: 'Archived',
  restored: 'Restored',
};

function activityDetail(entry) {
  const fmt = (value) => value ?? '—';
  switch (entry.action) {
    case 'created':
      return entry.newValue ? `“${entry.newValue}”` : '';
    case 'assignee_added':
      return fmt(entry.newValue);
    case 'assignee_removed':
      return fmt(entry.oldValue);
    case 'status_changed':
      return `${STATUS_LABELS[entry.oldValue] ?? fmt(entry.oldValue)} → ${STATUS_LABELS[entry.newValue] ?? fmt(entry.newValue)}`;
    case 'priority_changed':
      return `${PRIORITY_LABELS[entry.oldValue] ?? fmt(entry.oldValue)} → ${PRIORITY_LABELS[entry.newValue] ?? fmt(entry.newValue)}`;
    case 'due_at_changed':
    case 'start_at_changed':
      return `${formatDateTime(entry.oldValue)} → ${formatDateTime(entry.newValue)}`;
    case 'category_changed':
      return `${fmt(entry.oldValue)} → ${fmt(entry.newValue)}`;
    default:
      return '';
  }
}

export default function TaskItem({
  task,
  category,
  onStatusChange,
  onEdit,
  onArchive,
  onRestore,
  onChanged,
}) {
  const archived = task.isArchived;
  const isOwner = task.isOwner;
  const progress = task.subtaskProgress ?? { total: 0, completed: 0 };

  const [expanded, setExpanded] = useState(false);
  const [details, setDetails] = useState(null);
  const [activities, setActivities] = useState([]);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [detailError, setDetailError] = useState('');
  const [newSubtaskTitle, setNewSubtaskTitle] = useState('');
  const [mutating, setMutating] = useState(false);

  const loadDetails = useCallback(async () => {
    setLoadingDetails(true);
    setDetailError('');
    try {
      const [detailRes, activityRes] = await Promise.all([
        api.get(`/tasks/${task.id}`),
        api.get(`/tasks/${task.id}/activities`, { params: { limit: 20 } }),
      ]);
      setDetails({ task: detailRes.data.task, subtasks: detailRes.data.subtasks });
      setActivities(activityRes.data.activities);
    } catch (err) {
      setDetailError(errorMessage(err, 'Unable to load task details'));
    } finally {
      setLoadingDetails(false);
    }
  }, [task.id]);

  useEffect(() => {
    if (expanded) loadDetails();
  }, [expanded, loadDetails, task.updatedAt]);

  const withReload = async (action, fallbackMessage) => {
    setMutating(true);
    setDetailError('');
    try {
      await action();
      await loadDetails();
      onChanged?.();
    } catch (err) {
      setDetailError(errorMessage(err, fallbackMessage));
    } finally {
      setMutating(false);
    }
  };

  const toggleSubtask = (subtask) =>
    withReload(
      () =>
        api.patch(`/tasks/${subtask.id}`, {
          status: subtask.status === 'completed' ? 'todo' : 'completed',
        }),
      'Unable to update the subtask'
    );

  const addSubtask = (event) => {
    event.preventDefault();
    const title = newSubtaskTitle.trim();
    if (!title) return;
    withReload(async () => {
      await api.post(`/tasks/${task.id}/subtasks`, { title });
      setNewSubtaskTitle('');
    }, 'Unable to add the subtask');
  };

  const archiveSubtask = (subtask) =>
    withReload(() => api.delete(`/tasks/${subtask.id}`), 'Unable to archive the subtask');

  const detailsTask = details?.task ?? task;
  const detailProgress = detailsTask.subtaskProgress ?? progress;
  const percent =
    detailProgress.total > 0
      ? Math.round((detailProgress.completed / detailProgress.total) * 100)
      : 0;

  return (
    <article
      className={`task-card${archived ? ' task-card-archived' : ''}${expanded ? ' task-card-expanded' : ''}`}
    >
      <div className="task-main">
        <div className="task-title-row">
          <h3 className={task.status === 'completed' ? 'task-title-done' : ''}>{task.title}</h3>
          {task.isOverdue && <span className="badge badge-overdue">Overdue</span>}
          {progress.total > 0 && (
            <span className="badge badge-subtasks">
              {progress.completed}/{progress.total} subtasks
            </span>
          )}
        </div>

        {task.description && <p className="task-description">{task.description}</p>}

        <div className="task-meta">
          <span className={`badge badge-status badge-status-${task.status}`}>
            {STATUS_LABELS[task.status]}
          </span>
          <span className={`badge badge-priority badge-priority-${task.priority}`}>
            {PRIORITY_LABELS[task.priority]}
          </span>
          {category && (
            <span className="badge badge-category">
              <span className="dot" style={{ backgroundColor: category.color }} />
              {category.name}
            </span>
          )}
          <span className="task-meta-text">Due: {formatDateTime(task.dueAt)}</span>
          {task.estimatedDurationMinutes != null && (
            <span className="task-meta-text">{task.estimatedDurationMinutes} min</span>
          )}
          {task.assignees.length > 0 && (
            <span className="task-assignees">
              {task.assignees.slice(0, 4).map((assignee) => (
                <span key={assignee.id} className="badge badge-assignee" title={assignee.email}>
                  {assignee.name ?? 'Unknown'}
                </span>
              ))}
              {task.assignees.length > 4 && (
                <span className="badge badge-assignee">+{task.assignees.length - 4}</span>
              )}
            </span>
          )}
        </div>
      </div>

      <div className="task-actions">
        {!archived && (
          <select
            className="input-compact"
            value={task.status}
            onChange={(e) => onStatusChange(task, e.target.value)}
            aria-label="Update status"
          >
            <option value="todo">To Do</option>
            <option value="in_progress">In Progress</option>
            <option value="completed">Completed</option>
            <option value="cancelled">Cancelled</option>
          </select>
        )}
        <button type="button" className="btn btn-ghost" onClick={() => setExpanded((v) => !v)}>
          {expanded ? 'Hide details' : 'Details'}
        </button>
        {!archived && isOwner && (
          <button type="button" className="btn btn-ghost" onClick={() => onEdit(task)}>
            Edit
          </button>
        )}
        {isOwner &&
          (archived ? (
            <button type="button" className="btn btn-ghost" onClick={() => onRestore(task)}>
              Restore
            </button>
          ) : (
            <button
              type="button"
              className="btn btn-ghost btn-danger-text"
              onClick={() => onArchive(task)}
            >
              Archive
            </button>
          ))}
      </div>

      {expanded && (
        <div className="task-details">
          {loadingDetails && !details ? (
            <div className="task-details-loading">Loading details...</div>
          ) : (
            <>
              {detailError && <div className="alert alert-error">{detailError}</div>}

              <section className="details-section">
                <div className="details-heading">
                  <h4>Subtasks</h4>
                  {detailProgress.total > 0 && (
                    <div className="subtask-progress">
                      <div className="subtask-progress-bar">
                        <div className="subtask-progress-fill" style={{ width: `${percent}%` }} />
                      </div>
                      <span className="task-meta-text">
                        {detailProgress.completed}/{detailProgress.total} completed
                      </span>
                    </div>
                  )}
                </div>

                <ul className="subtask-list">
                  {(details?.subtasks ?? []).map((subtask) => (
                    <li
                      key={subtask.id}
                      className={`subtask-row${subtask.isArchived ? ' subtask-row-archived' : ''}`}
                    >
                      <label className="subtask-check">
                        <input
                          type="checkbox"
                          checked={subtask.status === 'completed'}
                          disabled={mutating || archived || subtask.isArchived}
                          onChange={() => toggleSubtask(subtask)}
                        />
                        <span
                          className={subtask.status === 'completed' ? 'task-title-done' : ''}
                        >
                          {subtask.title}
                        </span>
                      </label>
                      <span className="subtask-meta">
                        {subtask.dueAt ? `Due: ${formatDateTime(subtask.dueAt)}` : ''}
                      </span>
                      {isOwner && !subtask.isArchived && (
                        <button
                          type="button"
                          className="btn btn-ghost btn-danger-text btn-small"
                          disabled={mutating}
                          onClick={() => archiveSubtask(subtask)}
                        >
                          Remove
                        </button>
                      )}
                    </li>
                  ))}
                  {details && details.subtasks.length === 0 && (
                    <li className="subtask-empty">No subtasks yet.</li>
                  )}
                </ul>

                {isOwner && !archived && (
                  <form className="subtask-add" onSubmit={addSubtask}>
                    <input
                      type="text"
                      className="input"
                      placeholder="Add a subtask..."
                      value={newSubtaskTitle}
                      maxLength={200}
                      onChange={(e) => setNewSubtaskTitle(e.target.value)}
                    />
                    <button
                      type="submit"
                      className="btn btn-primary"
                      disabled={mutating || !newSubtaskTitle.trim()}
                    >
                      Add
                    </button>
                  </form>
                )}
              </section>

              <section className="details-section">
                <div className="details-heading">
                  <h4>Activity</h4>
                </div>
                {activities.length === 0 ? (
                  <p className="task-meta-text">No activity yet.</p>
                ) : (
                  <ul className="activity-list">
                    {activities.map((entry) => (
                      <li key={entry.id} className="activity-item">
                        <span className="activity-action">
                          {ACTIVITY_LABELS[entry.action] ?? entry.action}
                        </span>
                        {activityDetail(entry) && (
                          <span className="activity-detail">{activityDetail(entry)}</span>
                        )}
                        <span className="activity-meta">
                          {entry.actor?.name ?? 'Unknown'} · {formatDateTime(entry.createdAt)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </>
          )}
        </div>
      )}
    </article>
  );
}
