import { useCallback, useEffect, useState } from 'react';
import api, { errorMessage } from '../api/client.js';
import { formatDateTime, formatDate } from '../utils/datetime.js';

const STATUS_LABELS = {
  todo: 'To Do',
  in_progress: 'In Progress',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

const OCCURRENCE_LABELS = {
  pending: 'Pending',
  completed: 'Completed',
  missed: 'Missed',
  skipped: 'Skipped',
};

const PRIORITY_LABELS = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  urgent: 'Urgent',
};

const ACTIVITY_LABELS = {
  created: 'Created',
  updated: 'Updated',
  status_changed: 'Status changed',
  priority_changed: 'Priority changed',
  due_at_changed: 'Due date changed',
  assigned: 'Assignees changed',
  archived: 'Archived',
  restored: 'Restored',
  subtask_created: 'Subtask created',
  recurrence_set: 'Recurrence set',
  recurrence_cleared: 'Recurrence cleared',
  occurrence_completed: 'Occurrence completed',
  occurrence_skipped: 'Occurrence skipped',
  occurrence_reopened: 'Occurrence reopened',
};

function activityDetail(entry) {
  const fmt = (value) => value ?? '—';
  switch (entry.action) {
    case 'created':
    case 'subtask_created':
      return entry.newValue ? `“${entry.newValue}”` : '';
    case 'assigned': {
      try {
        const ids = JSON.parse(entry.newValue ?? '[]');
        return `${ids.length} assignee(s)`;
      } catch {
        return fmt(entry.newValue);
      }
    }
    case 'occurrence_completed':
    case 'occurrence_skipped':
    case 'occurrence_reopened':
      return entry.newValue ? `on ${formatDate(entry.newValue)}` : '';
    case 'recurrence_set':
    case 'recurrence_cleared': {
      try {
        return JSON.parse(entry.newValue ?? 'null')?.frequency ?? '';
      } catch {
        return '';
      }
    }
    case 'status_changed':
      return `${STATUS_LABELS[entry.oldValue] ?? fmt(entry.oldValue)} → ${STATUS_LABELS[entry.newValue] ?? fmt(entry.newValue)}`;
    case 'priority_changed':
      return `${PRIORITY_LABELS[entry.oldValue] ?? fmt(entry.oldValue)} → ${PRIORITY_LABELS[entry.newValue] ?? fmt(entry.newValue)}`;
    case 'due_at_changed':
      return `${formatDateTime(entry.oldValue)} → ${formatDateTime(entry.newValue)}`;
    case 'updated':
      return entry.field ? `${entry.field}: ${fmt(entry.oldValue)} → ${fmt(entry.newValue)}` : '';
    default:
      return '';
  }
}

function formatReminder(minutes) {
  if (minutes === 0) return 'at due time';
  if (minutes % 1440 === 0) {
    const days = minutes / 1440;
    return `${days} day${days > 1 ? 's' : ''} before`;
  }
  if (minutes % 60 === 0) {
    const hours = minutes / 60;
    return `${hours} hour${hours > 1 ? 's' : ''} before`;
  }
  return `${minutes} min before`;
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
  const [occurrences, setOccurrences] = useState([]);
  const [comments, setComments] = useState([]);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [detailError, setDetailError] = useState('');
  const [newSubtaskTitle, setNewSubtaskTitle] = useState('');
  const [newComment, setNewComment] = useState('');
  const [mutating, setMutating] = useState(false);

  const loadDetails = useCallback(async () => {
    setLoadingDetails(true);
    setDetailError('');
    try {
      const requests = [
        api.get(`/tasks/${task.id}`),
        api.get(`/tasks/${task.id}/activities`, { params: { limit: 20 } }),
        api.get(`/tasks/${task.id}/comments`),
      ];
      if (task.isRecurring) {
        requests.push(api.get(`/tasks/${task.id}/occurrences`));
      }
      const [detailRes, activityRes, commentRes, occurrenceRes] = await Promise.all(requests);
      setDetails({ task: detailRes.data.task, subtasks: detailRes.data.subtasks });
      setActivities(activityRes.data.activities);
      setComments(commentRes.data.comments);
      setOccurrences(occurrenceRes?.data.occurrences ?? []);
    } catch (err) {
      setDetailError(errorMessage(err, 'Unable to load task details'));
    } finally {
      setLoadingDetails(false);
    }
  }, [task.id, task.isRecurring]);

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

  const setOccurrenceStatus = (occurrence, status) =>
    withReload(
      () => api.patch(`/occurrences/${occurrence.id}`, { status }),
      'Unable to update the occurrence'
    );

  const postComment = (event) => {
    event.preventDefault();
    const body = newComment.trim();
    if (!body) return;
    withReload(async () => {
      await api.post(`/tasks/${task.id}/comments`, { body });
      setNewComment('');
    }, 'Unable to post the comment');
  };

  const deleteComment = (comment) =>
    withReload(
      () => api.delete(`/tasks/${task.id}/comments/${comment.id}`),
      'Unable to delete the comment'
    );

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
          {task.isRecurring && (
            <span className="badge badge-recurring">
              Repeats {task.recurrenceRule?.frequency ?? ''}
            </span>
          )}
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
          {task.reminderMinutesBefore != null && (
            <span className="badge badge-reminder">
              Reminder {formatReminder(task.reminderMinutesBefore)}
            </span>
          )}
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

              {detailsTask.isRecurring && (
                <section className="details-section">
                  <div className="details-heading">
                    <h4>Occurrences</h4>
                    <span className="task-meta-text">last 7 days through next 60</span>
                  </div>
                  {occurrences.length === 0 ? (
                    <p className="task-meta-text">No occurrences in this window.</p>
                  ) : (
                    <ul className="occurrence-list">
                      {occurrences.map((occurrence) => (
                        <li key={occurrence.id} className="occurrence-row">
                          <span className="occurrence-date">
                            {formatDate(occurrence.scheduledFor)}
                          </span>
                          <span
                            className={`badge badge-occurrence badge-occurrence-${occurrence.status}`}
                          >
                            {OCCURRENCE_LABELS[occurrence.status] ?? occurrence.status}
                          </span>
                          <span className="occurrence-actions">
                            {['pending', 'missed'].includes(occurrence.status) && (
                              <>
                                <button
                                  type="button"
                                  className="btn btn-ghost btn-small"
                                  disabled={mutating || archived}
                                  onClick={() => setOccurrenceStatus(occurrence, 'completed')}
                                >
                                  Complete
                                </button>
                                <button
                                  type="button"
                                  className="btn btn-ghost btn-small"
                                  disabled={mutating || archived}
                                  onClick={() => setOccurrenceStatus(occurrence, 'skipped')}
                                >
                                  Skip
                                </button>
                              </>
                            )}
                            {['completed', 'skipped'].includes(occurrence.status) && (
                              <button
                                type="button"
                                className="btn btn-ghost btn-small"
                                disabled={mutating || archived}
                                onClick={() => setOccurrenceStatus(occurrence, 'pending')}
                              >
                                Reopen
                              </button>
                            )}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              )}

              <section className="details-section">
                <div className="details-heading">
                  <h4>Comments</h4>
                </div>
                {comments.length === 0 ? (
                  <p className="task-meta-text">No comments yet.</p>
                ) : (
                  <ul className="comment-list">
                    {comments.map((comment) => (
                      <li key={comment.id} className="comment-item">
                        <div className="comment-head">
                          <span className="comment-author">{comment.author?.name ?? 'Unknown'}</span>
                          <span className="comment-meta">{formatDateTime(comment.createdAt)}</span>
                          {comment.canDelete && (
                            <button
                              type="button"
                              className="btn btn-ghost btn-danger-text btn-small"
                              disabled={mutating}
                              onClick={() => deleteComment(comment)}
                            >
                              Delete
                            </button>
                          )}
                        </div>
                        <p className="comment-body">{comment.body}</p>
                      </li>
                    ))}
                  </ul>
                )}
                {archived ? (
                  <p className="task-meta-text">Archived tasks are read-only.</p>
                ) : (
                  <form className="comment-form" onSubmit={postComment}>
                    <textarea
                      className="input"
                      rows={2}
                      maxLength={1000}
                      placeholder="Write a comment..."
                      value={newComment}
                      onChange={(e) => setNewComment(e.target.value)}
                    />
                    <button
                      type="submit"
                      className="btn btn-primary btn-small"
                      disabled={mutating || !newComment.trim()}
                    >
                      Comment
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
