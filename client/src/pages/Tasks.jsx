import { useCallback, useEffect, useMemo, useState } from 'react';
import api, { errorMessage } from '../api/client.js';
import TaskForm from '../components/TaskForm.jsx';
import TaskItem from '../components/TaskItem.jsx';

const EMPTY_FILTERS = {
  search: '',
  status: '',
  priority: '',
  categoryId: '',
  sort: 'dueAt',
  view: 'active',
  overdueOnly: false,
};

export default function Tasks() {
  const [tasks, setTasks] = useState([]);
  const [total, setTotal] = useState(0);
  const [categories, setCategories] = useState([]);
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [searchInput, setSearchInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [modalTask, setModalTask] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);

  const loadCategories = useCallback(async () => {
    try {
      const { data } = await api.get('/categories');
      setCategories(data.categories);
    } catch {
      // Categories are only used for labels/filters; task list still works without them.
    }
  }, []);

  const loadTasks = useCallback(async (currentFilters, { silent = false } = {}) => {
    if (!silent) setLoading(true);
    setError('');
    try {
      const params = {
        sort: currentFilters.sort,
        archived: currentFilters.view === 'archived',
        limit: 100,
      };
      if (currentFilters.status) params.status = currentFilters.status;
      if (currentFilters.priority) params.priority = currentFilters.priority;
      if (currentFilters.categoryId) params.categoryId = currentFilters.categoryId;
      if (currentFilters.overdueOnly) params.overdue = 'true';
      if (currentFilters.search) params.search = currentFilters.search;

      const { data } = await api.get('/tasks', { params });
      setTasks(data.tasks);
      setTotal(data.total);
    } catch (err) {
      setError(errorMessage(err, 'Unable to load tasks'));
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCategories();
  }, [loadCategories]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setFilters((prev) => (prev.search === searchInput ? prev : { ...prev, search: searchInput }));
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    loadTasks(filters);
  }, [filters, loadTasks]);

  const categoryById = useMemo(
    () => new Map(categories.map((c) => [c.id, c])),
    [categories]
  );

  const refresh = () => {
    loadTasks(filters);
    loadCategories();
  };

  const setFilter = (field) => (event) => {
    const value = event.target.value;
    setFilters((prev) => ({ ...prev, [field]: value }));
  };

  const handleStatusChange = async (task, status) => {
    try {
      const { data } = await api.patch(`/tasks/${task.id}`, { status });
      setTasks((prev) => prev.map((t) => (t.id === task.id ? data.task : t)));
    } catch (err) {
      setError(errorMessage(err, 'Unable to update status'));
    }
  };

  const handleArchive = async (task) => {
    try {
      await api.delete(`/tasks/${task.id}`);
      refresh();
    } catch (err) {
      setError(errorMessage(err, 'Unable to archive the task'));
    }
  };

  const handleRestore = async (task) => {
    try {
      await api.post(`/tasks/${task.id}/restore`);
      refresh();
    } catch (err) {
      setError(errorMessage(err, 'Unable to restore the task'));
    }
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
          <h1>My Tasks</h1>
          <p className="page-subtitle">
            {total} task{total === 1 ? '' : 's'} {filters.view === 'archived' ? 'archived' : 'shown'}
          </p>
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
          placeholder="Search tasks..."
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
        />
        <select className="input" value={filters.status} onChange={setFilter('status')}>
          <option value="">All statuses</option>
          <option value="todo">To Do</option>
          <option value="in_progress">In Progress</option>
          <option value="completed">Completed</option>
          <option value="cancelled">Cancelled</option>
        </select>
        <select className="input" value={filters.priority} onChange={setFilter('priority')}>
          <option value="">All priorities</option>
          <option value="low">Low</option>
          <option value="medium">Medium</option>
          <option value="high">High</option>
          <option value="urgent">Urgent</option>
        </select>
        <select className="input" value={filters.categoryId} onChange={setFilter('categoryId')}>
          <option value="">All categories</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <select className="input" value={filters.sort} onChange={setFilter('sort')}>
          <option value="dueAt">Due date ↑</option>
          <option value="-dueAt">Due date ↓</option>
          <option value="-createdAt">Newest first</option>
          <option value="createdAt">Oldest first</option>
          <option value="title">Title A–Z</option>
        </select>
        <div className="filter-toggles">
          <button
            type="button"
            className={`chip${filters.overdueOnly ? ' chip-active' : ''}`}
            onClick={() => setFilters((prev) => ({ ...prev, overdueOnly: !prev.overdueOnly }))}
          >
            Overdue only
          </button>
          <button
            type="button"
            className={`chip${filters.view === 'archived' ? ' chip-active' : ''}`}
            onClick={() =>
              setFilters((prev) => ({
                ...prev,
                view: prev.view === 'archived' ? 'active' : 'archived',
              }))
            }
          >
            {filters.view === 'archived' ? 'Viewing archive' : 'Archived'}
          </button>
        </div>
      </div>

      {loading ? (
        <div className="empty-state">Loading tasks...</div>
      ) : tasks.length === 0 ? (
        <div className="empty-state">
          <p>No tasks match your filters.</p>
          <button type="button" className="btn btn-primary" onClick={openCreate}>
            Create your first task
          </button>
        </div>
      ) : (
        <div className="task-list">
          {tasks.map((task) => (
            <TaskItem
              key={task.id}
              task={task}
              category={categoryById.get(task.categoryId)}
              onStatusChange={handleStatusChange}
              onEdit={openEdit}
              onArchive={handleArchive}
              onRestore={handleRestore}
              onChanged={() => loadTasks(filters, { silent: true })}
            />
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
