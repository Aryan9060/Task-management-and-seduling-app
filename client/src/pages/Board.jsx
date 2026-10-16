import { useCallback, useEffect, useMemo, useState } from 'react';
import api, { errorMessage } from '../api/client.js';
import TaskForm from '../components/TaskForm.jsx';
import { formatDate } from '../utils/datetime.js';

const COLUMNS = [
  { status: 'todo', label: 'To Do', emptyText: 'Nothing waiting. Add a task or drag one back here.' },
  { status: 'in_progress', label: 'In Progress', emptyText: 'Drag a card here when you start working on it.' },
  { status: 'completed', label: 'Done', emptyText: 'Completed tasks land here automatically.' },
  { status: 'cancelled', label: 'Cancelled', emptyText: 'Cancelled tasks are kept here for the record.' },
];

const MOVE_LABELS = {
  todo: 'To Do',
  in_progress: 'In Progress',
  completed: 'Done',
  cancelled: 'Cancelled',
};

const PRIORITY_CLASS = {
  low: 'prio-low',
  medium: 'prio-medium',
  high: 'prio-high',
  urgent: 'prio-urgent',
};

function Card({ task, onOpen, onMove, onDragStart, dragging }) {
  const moves = COLUMNS.filter((c) => c.status !== task.status);
  return (
    <article
      className={`board-card ${PRIORITY_CLASS[task.priority]}${dragging ? ' board-card-dragging' : ''}`}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData('text/plain', task.id);
        e.dataTransfer.effectAllowed = 'move';
        onDragStart(task.id);
      }}
    >
      <button type="button" className="board-card-title" onClick={() => onOpen(task)}>
        {task.title}
      </button>
      <div className="board-card-meta">
        <span className={`badge badge-priority-${task.priority}`}>{task.priority}</span>
        {task.isRecurring && <span className="badge badge-recurring">↻ Repeats</span>}
        {task.dueAt && (
          <span className={`board-due${task.isOverdue ? ' board-due-overdue' : ''}`}>
            {task.isOverdue ? 'Overdue · ' : 'Due '}
            {formatDate(task.dueAt)}
          </span>
        )}
        {task.completedAt && <span className="board-due">Done {formatDate(task.completedAt)}</span>}
      </div>
      {task.assignees?.length > 0 && (
        <div className="board-card-assignees">
          {task.assignees.slice(0, 4).map((a) => (
            <span key={a.id} className="avatar" title={a.name ?? 'Assignee'}>
              {(a.name ?? '?').trim().charAt(0).toUpperCase()}
            </span>
          ))}
          {task.assignees.length > 4 && (
            <span className="avatar avatar-more">+{task.assignees.length - 4}</span>
          )}
        </div>
      )}
      {task.subtaskProgress?.total > 0 && (
        <div className="board-card-progress">
          <div className="progress-track progress-track-sm">
            <div className="progress-fill" style={{ width: `${task.subtaskProgress.percent}%` }} />
          </div>
          <span className="board-progress-label">
            {task.subtaskProgress.completed}/{task.subtaskProgress.total} subtasks
          </span>
        </div>
      )}
      <div className="board-card-actions">
        {moves.map((move) => (
          <button
            key={move.status}
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => onMove(task, move.status)}
          >
            → {MOVE_LABELS[move.status]}
          </button>
        ))}
      </div>
    </article>
  );
}

export default function Board() {
  const [columns, setColumns] = useState(() => Object.fromEntries(COLUMNS.map((c) => [c.status, []])));
  const [totals, setTotals] = useState(() => Object.fromEntries(COLUMNS.map((c) => [c.status, 0])));
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [movingId, setMovingId] = useState(null);
  const [modalTask, setModalTask] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [dragOver, setDragOver] = useState(null);
  const [draggingId, setDraggingId] = useState(null);

  const load = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    setError('');
    try {
      const results = await Promise.all(
        COLUMNS.map((col) =>
          api.get('/tasks', {
            params: {
              status: col.status,
              sort: col.status === 'completed' ? '-updatedAt' : 'dueAt',
              limit: col.status === 'completed' ? 30 : 100,
            },
          })
        )
      );
      const nextColumns = {};
      const nextTotals = {};
      COLUMNS.forEach((col, i) => {
        nextColumns[col.status] = results[i].data.tasks;
        nextTotals[col.status] = results[i].data.total;
      });
      setColumns(nextColumns);
      setTotals(nextTotals);
    } catch (err) {
      setError(errorMessage(err, 'Unable to load the board'));
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  const loadCategories = useCallback(async () => {
    try {
      const { data } = await api.get('/categories');
      setCategories(data.categories);
    } catch {
      // Categories only feed the edit form; the board works without them.
    }
  }, []);

  useEffect(() => {
    load();
    loadCategories();
  }, [load, loadCategories]);

  const moveTask = async (task, status) => {
    if (task.status === status) return;
    setMovingId(task.id);
    setError('');
    try {
      await api.patch(`/tasks/${task.id}`, { status });
      await load({ silent: true });
    } catch (err) {
      setError(errorMessage(err, 'Unable to move the task'));
    } finally {
      setMovingId(null);
    }
  };

  const handleDrop = (columnStatus) => async (e) => {
    e.preventDefault();
    setDragOver(null);
    // draggingId (React state) is reliable across browsers; the dataTransfer
    // copy is a fallback for drops that originated outside this tab.
    const taskId = draggingId || e.dataTransfer.getData('text/plain');
    setDraggingId(null);
    if (!taskId) return;
    const task = Object.values(columns)
      .flat()
      .find((t) => t.id === taskId);
    if (task) await moveTask(task, columnStatus);
  };

  const filterText = search.trim().toLowerCase();
  const visible = useMemo(() => {
    if (!filterText) return columns;
    const next = {};
    for (const col of COLUMNS) {
      next[col.status] = columns[col.status].filter((t) => t.title.toLowerCase().includes(filterText));
    }
    return next;
  }, [columns, filterText]);

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

  return (
    <div className="page-content">
      <div className="page-header">
        <div>
          <h1>Board</h1>
          <p className="page-subtitle">Drag cards between columns or use the arrow buttons to change status.</p>
        </div>
        <button type="button" className="btn btn-primary" onClick={openCreate}>
          New task
        </button>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      <div className="filter-bar">
        <input
          type="search"
          className="input"
          placeholder="Filter cards by title..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {loading ? (
        <div className="empty-state">Loading board...</div>
      ) : (
        <div className="board">
          {COLUMNS.map((col) => (
            <section
              key={col.status}
              className={`board-column${dragOver === col.status ? ' board-column-over' : ''}`}
              aria-label={`${col.label} column`}
              onDragOver={(e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                setDragOver(col.status);
              }}
              onDragLeave={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget)) setDragOver(null);
              }}
              onDrop={handleDrop(col.status)}
            >
              <header className="board-column-head">
                <h2>
                  {col.label}
                  <span className="board-count">{totals[col.status]}</span>
                </h2>
              </header>
              <div className="board-column-body">
                {visible[col.status].length === 0 ? (
                  <p className="board-empty">{filterText ? 'No cards match the filter.' : col.emptyText}</p>
                ) : (
                  visible[col.status].map((task) => (
                    <div key={task.id} className={movingId === task.id ? 'board-card-busy' : ''}>
                      <Card
                        task={task}
                        onOpen={openEdit}
                        onMove={moveTask}
                        onDragStart={setDraggingId}
                        dragging={draggingId === task.id}
                      />
                    </div>
                  ))
                )}
                {totals[col.status] > columns[col.status].length && (
                  <p className="board-more">
                    Showing the {columns[col.status].length} most recent of {totals[col.status]}.
                  </p>
                )}
              </div>
            </section>
          ))}
        </div>
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
