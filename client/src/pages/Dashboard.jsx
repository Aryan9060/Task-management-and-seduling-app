import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api, { errorMessage } from '../api/client.js';
import { formatDateTime, formatDuration, formatCountdown } from '../utils/datetime.js';
import { useAuth } from '../context/AuthContext.jsx';
import useNow from '../hooks/useNow.js';
import { DonutChart, DonutLegend, TrendChart, MinutesChart, CategoryBars } from '../components/Charts.jsx';
import PomodoroTimer from '../components/PomodoroTimer.jsx';
import CountdownTimer from '../components/CountdownTimer.jsx';

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
  const now = useNow(1000);

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

  const segments = [
    { label: 'Completed', value: summary.completed, color: 'var(--success)' },
    { label: 'In Progress', value: summary.inProgress, color: 'var(--info)' },
    { label: 'To Do', value: summary.todo, color: 'var(--warning)' },
    { label: 'Cancelled', value: summary.cancelled, color: 'var(--muted)' },
  ];

  const timeProgress =
    summary.timeEstimatedMinutes > 0
      ? Math.min(100, Math.round((summary.timeLoggedMinutes / summary.timeEstimatedMinutes) * 100))
      : 0;

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
          <h2>Task mix</h2>
          <div className="donut-row">
            <DonutChart segments={segments} centerLabel={`${summary.completionRate}%`} centerSub="complete" />
            <DonutLegend segments={segments} />
          </div>
          <p className="panel-hint">
            {summary.completionRate}% of active tasks are completed
            {summary.cancelled > 0 ? ` (${summary.cancelled} cancelled excluded)` : ''}
            {summary.overdue > 0 ? ` · ${summary.overdue} overdue` : ''}
            {summary.dueToday > 0 ? ` · ${summary.dueToday} due today` : ''}.
          </p>
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
                    <span className="upcoming-due">
                      Due {formatDateTime(task.dueAt)}
                      <span className={`countdown${task.isOverdue ? ' countdown-overdue' : ''}`}>
                        {formatCountdown(task.dueAt, now)}
                      </span>
                    </span>
                  </div>
                  {task.isOverdue && <span className="badge badge-overdue">Overdue</span>}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="panel">
          <h2>Last 7 days</h2>
          <TrendChart days={summary.trend} />
          <div className="chart-legend">
            <span className="chart-legend-item">
              <span className="chart-dot chart-dot-created" /> Created
            </span>
            <span className="chart-legend-item">
              <span className="chart-dot chart-dot-completed" /> Completed
            </span>
          </div>
        </section>

        <section className="panel">
          <h2>Time logged (last 7 days)</h2>
          <MinutesChart days={summary.trend} />
          <div className="time-compare">
            <div className="time-compare-row">
              <span>Logged (active tasks)</span>
              <strong>{formatDuration(summary.timeLoggedMinutes)}</strong>
            </div>
            <div className="time-compare-row">
              <span>Estimated (active tasks)</span>
              <strong>{formatDuration(summary.timeEstimatedMinutes)}</strong>
            </div>
            {summary.timeEstimatedMinutes > 0 && (
              <div className="progress-track">
                <div className="progress-fill" style={{ width: `${timeProgress}%` }} />
              </div>
            )}
          </div>
        </section>

        <section className="panel">
          <h2>By category</h2>
          {summary.byCategory.length === 0 ? (
            <p className="panel-hint">No active tasks yet. Create tasks with categories to see the breakdown.</p>
          ) : (
            <CategoryBars items={summary.byCategory} />
          )}
        </section>

        <section className="panel">
          <h2>Focus timer</h2>
          <PomodoroTimer />
        </section>

        <section className="panel">
          <h2>Countdown</h2>
          <CountdownTimer />
        </section>
      </div>
    </div>
  );
}
