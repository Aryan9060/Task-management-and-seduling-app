import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api, { errorMessage } from '../api/client.js';
import { formatDateTime, formatTrendDay } from '../utils/datetime.js';
import { useAuth } from '../context/AuthContext.jsx';

function SummaryCard({ label, value, tone }) {
  return (
    <div className={`stat-card${tone ? ` stat-card-${tone}` : ''}`}>
      <span className="stat-value">{value}</span>
      <span className="stat-label">{label}</span>
    </div>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  const [summary, setSummary] = useState(null);
  const [upcoming, setUpcoming] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const [summaryRes, tasksRes] = await Promise.all([
          api.get('/dashboard/summary'),
          api.get('/tasks', { params: { sort: 'dueAt', limit: 50, status: undefined } }),
        ]);

        if (cancelled) return;

        setSummary(summaryRes.data.summary);
        setUpcoming(
          tasksRes.data.tasks
            .filter(
              (t) =>
                t.dueAt &&
                !['completed', 'cancelled'].includes(t.status)
            )
            .slice(0, 5)
        );
      } catch (err) {
        if (!cancelled) setError(errorMessage(err, 'Unable to load your dashboard'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return <div className="page-content"><div className="empty-state">Loading dashboard...</div></div>;
  }

  if (error) {
    return (
      <div className="page-content">
        <div className="alert alert-error">{error}</div>
      </div>
    );
  }

  const trendMax = Math.max(1, ...summary.trend.map((t) => t.count));

  return (
    <div className="page-content">
      <div className="page-header">
        <div>
          <h1>Dashboard</h1>
          <p className="page-subtitle">Welcome back, {user?.name}. Here is where things stand.</p>
        </div>
        <Link className="btn btn-primary" to="/tasks">
          Go to tasks
        </Link>
      </div>

      <div className="stat-grid">
        <SummaryCard label="Active tasks" value={summary.total - summary.cancelled} />
        <SummaryCard label="To Do" value={summary.todo} />
        <SummaryCard label="In Progress" value={summary.inProgress} tone="info" />
        <SummaryCard label="Completed" value={summary.completed} tone="success" />
        <SummaryCard label="Overdue" value={summary.overdue} tone="danger" />
        <SummaryCard label="Due today" value={summary.dueToday} tone="warning" />
        {summary.missedOccurrences > 0 && (
          <SummaryCard label="Missed occurrences" value={summary.missedOccurrences} tone="danger" />
        )}
      </div>

      <div className="dashboard-grid">
        <section className="panel">
          <h2>Completion rate</h2>
          <div className="progress-track">
            <div className="progress-fill" style={{ width: `${summary.completionRate}%` }} />
          </div>
          <p className="panel-hint">
            {summary.completionRate}% of active tasks are completed
            {summary.cancelled > 0 ? ` (${summary.cancelled} cancelled excluded)` : ''}.
          </p>

          <h2>Completed in the last 7 days</h2>
          <div className="trend-chart">
            {summary.trend.map((day) => (
              <div key={day.date} className="trend-col">
                <span className="trend-count">{day.count}</span>
                <div
                  className="trend-bar"
                  style={{ height: `${Math.round((day.count / trendMax) * 100)}%` }}
                />
                <span className="trend-day">{formatTrendDay(day.date)}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="panel">
          <h2>Upcoming deadlines</h2>
          {upcoming.length === 0 ? (
            <p className="panel-hint">Nothing scheduled. Create a task with a due date to see it here.</p>
          ) : (
            <ul className="upcoming-list">
              {upcoming.map((task) => (
                <li key={task.id} className="upcoming-item">
                  <div>
                    <span className="upcoming-title">{task.title}</span>
                    <span className="upcoming-due">Due {formatDateTime(task.dueAt)}</span>
                  </div>
                  {task.isOverdue && <span className="badge badge-overdue">Overdue</span>}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
