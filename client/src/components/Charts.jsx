import { formatTrendDay } from '../utils/datetime.js';

/**
 * SVG donut. Each segment is `{ label, value, color }`; colors may be CSS var
 * references like 'var(--success)'.
 */
export function DonutChart({ segments, centerLabel, centerSub }) {
  const total = segments.reduce((sum, s) => sum + s.value, 0);
  const size = 168;
  const stroke = 20;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;

  let offset = 0;
  return (
    <div className="donut-wrap">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label="Task status breakdown">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--border)"
          strokeWidth={stroke}
        />
        {total > 0 &&
          segments.map((segment) => {
            const dash = (segment.value / total) * circumference;
            const circle = (
              <circle
                key={segment.label}
                cx={size / 2}
                cy={size / 2}
                r={radius}
                fill="none"
                stroke={segment.color}
                strokeWidth={stroke}
                strokeDasharray={`${dash} ${circumference - dash}`}
                strokeDashoffset={-offset}
                transform={`rotate(-90 ${size / 2} ${size / 2})`}
              />
            );
            offset += dash;
            return circle;
          })}
      </svg>
      <div className="donut-center">
        <span className="donut-value">{centerLabel}</span>
        <span className="donut-sub">{centerSub}</span>
      </div>
    </div>
  );
}

export function DonutLegend({ segments }) {
  return (
    <ul className="donut-legend">
      {segments.map((segment) => (
        <li key={segment.label} className="donut-legend-item">
          <span className="donut-dot" style={{ backgroundColor: segment.color }} />
          <span className="donut-legend-label">{segment.label}</span>
          <span className="donut-legend-value">{segment.value}</span>
        </li>
      ))}
    </ul>
  );
}

/** Paired "created" / "completed" bars for the last 7 days. */
export function TrendChart({ days }) {
  const max = Math.max(1, ...days.map((d) => Math.max(d.created, d.completed)));
  return (
    <div className="bar-chart" role="img" aria-label="Tasks created and completed over the last 7 days">
      {days.map((day) => (
        <div key={day.date} className="bar-col">
          <div className="bar-stack">
            <div
              className="bar bar-created"
              style={{ height: `${Math.round((day.created / max) * 100)}%` }}
              title={`${day.created} created`}
            />
            <div
              className="bar bar-completed"
              style={{ height: `${Math.round((day.completed / max) * 100)}%` }}
              title={`${day.completed} completed`}
            />
          </div>
          <span className="bar-day">{formatTrendDay(day.date)}</span>
        </div>
      ))}
    </div>
  );
}

/** Single-series minutes-per-day bars for logged time. */
export function MinutesChart({ days }) {
  const max = Math.max(1, ...days.map((d) => d.minutes));
  return (
    <div className="bar-chart" role="img" aria-label="Minutes logged over the last 7 days">
      {days.map((day) => (
        <div key={day.date} className="bar-col">
          <span className="bar-value">{day.minutes > 0 ? day.minutes : ''}</span>
          <div className="bar-stack">
            <div
              className="bar bar-minutes"
              style={{ height: `${Math.round((day.minutes / max) * 100)}%` }}
              title={`${day.minutes} minutes`}
            />
          </div>
          <span className="bar-day">{formatTrendDay(day.date)}</span>
        </div>
      ))}
    </div>
  );
}

/** Horizontal category breakdown bars. */
export function CategoryBars({ items }) {
  const max = Math.max(1, ...items.map((item) => item.count));
  return (
    <ul className="category-bars">
      {items.map((item) => (
        <li key={item.categoryId ?? 'none'} className="category-bar-row">
          <span className="category-bar-label">{item.name ?? 'Uncategorized'}</span>
          <div className="category-bar-track">
            <div
              className="category-bar-fill"
              style={{
                width: `${Math.round((item.count / max) * 100)}%`,
                backgroundColor: item.color ?? 'var(--muted)',
              }}
            />
          </div>
          <span className="category-bar-count">{item.count}</span>
        </li>
      ))}
    </ul>
  );
}
