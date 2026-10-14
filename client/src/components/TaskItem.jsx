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

export default function TaskItem({
  task,
  category,
  onStatusChange,
  onEdit,
  onArchive,
  onRestore,
}) {
  const archived = task.isArchived;

  return (
    <article className={`task-card${archived ? ' task-card-archived' : ''}`}>
      <div className="task-main">
        <div className="task-title-row">
          <h3 className={task.status === 'completed' ? 'task-title-done' : ''}>{task.title}</h3>
          {task.isOverdue && <span className="badge badge-overdue">Overdue</span>}
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
        {!archived && (
          <button type="button" className="btn btn-ghost" onClick={() => onEdit(task)}>
            Edit
          </button>
        )}
        {archived ? (
          <button type="button" className="btn btn-ghost" onClick={() => onRestore(task)}>
            Restore
          </button>
        ) : (
          <button type="button" className="btn btn-ghost btn-danger-text" onClick={() => onArchive(task)}>
            Archive
          </button>
        )}
      </div>
    </article>
  );
}
