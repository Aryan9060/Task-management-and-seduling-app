import { useCallback, useEffect, useState } from 'react';
import api, { errorMessage } from '../api/client.js';

const DEFAULT_COLOR = '#6366f1';

export default function Categories() {
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [name, setName] = useState('');
  const [color, setColor] = useState(DEFAULT_COLOR);
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState('');
  const [editColor, setEditColor] = useState(DEFAULT_COLOR);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/categories');
      setCategories(data.categories);
    } catch (err) {
      setError(errorMessage(err, 'Unable to load categories'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleCreate = async (event) => {
    event.preventDefault();
    setError('');
    try {
      await api.post('/categories', { name: name.trim(), color });
      setName('');
      setColor(DEFAULT_COLOR);
      load();
    } catch (err) {
      setError(errorMessage(err, 'Unable to create the category'));
    }
  };

  const startEdit = (category) => {
    setEditingId(category.id);
    setEditName(category.name);
    setEditColor(category.color);
  };

  const handleUpdate = async (event) => {
    event.preventDefault();
    setError('');
    try {
      await api.patch(`/categories/${editingId}`, { name: editName.trim(), color: editColor });
      setEditingId(null);
      load();
    } catch (err) {
      setError(errorMessage(err, 'Unable to update the category'));
    }
  };

  const handleDelete = async (category) => {
    const confirmed = window.confirm(
      `Delete "${category.name}"? Tasks in this category will keep their data but lose the label.`
    );
    if (!confirmed) return;

    setError('');
    try {
      await api.delete(`/categories/${category.id}`);
      load();
    } catch (err) {
      setError(errorMessage(err, 'Unable to delete the category'));
    }
  };

  return (
    <div className="page-content">
      <div className="page-header">
        <div>
          <h1>Categories</h1>
          <p className="page-subtitle">Group tasks into Study, Development, Personal, and more.</p>
        </div>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      <section className="panel">
        <h2>New category</h2>
        <form className="inline-form" onSubmit={handleCreate}>
          <input
            type="text"
            className="input"
            placeholder="Category name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            minLength={2}
            maxLength={50}
            required
          />
          <input
            type="color"
            className="color-input"
            value={color}
            onChange={(e) => setColor(e.target.value)}
            aria-label="Category color"
          />
          <button type="submit" className="btn btn-primary">
            Add category
          </button>
        </form>
      </section>

      <section className="panel">
        <h2>Your categories</h2>
        {loading ? (
          <p className="panel-hint">Loading...</p>
        ) : categories.length === 0 ? (
          <p className="panel-hint">No categories yet. Create one above to organize your tasks.</p>
        ) : (
          <ul className="category-list">
            {categories.map((category) => (
              <li key={category.id} className="category-row">
                {editingId === category.id ? (
                  <form className="inline-form inline-form-grow" onSubmit={handleUpdate}>
                    <input
                      type="text"
                      className="input"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      minLength={2}
                      maxLength={50}
                      required
                    />
                    <input
                      type="color"
                      className="color-input"
                      value={editColor}
                      onChange={(e) => setEditColor(e.target.value)}
                      aria-label="Category color"
                    />
                    <button type="submit" className="btn btn-primary">
                      Save
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost"
                      onClick={() => setEditingId(null)}
                    >
                      Cancel
                    </button>
                  </form>
                ) : (
                  <>
                    <span className="category-name">
                      <span className="dot" style={{ backgroundColor: category.color }} />
                      {category.name}
                    </span>
                    <span className="category-count">
                      {category.taskCount} task{category.taskCount === 1 ? '' : 's'}
                    </span>
                    <span className="category-actions">
                      <button
                        type="button"
                        className="btn btn-ghost"
                        onClick={() => startEdit(category)}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        className="btn btn-ghost btn-danger-text"
                        onClick={() => handleDelete(category)}
                      >
                        Delete
                      </button>
                    </span>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
