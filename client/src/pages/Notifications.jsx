import { useCallback, useEffect, useState } from 'react';
import api, { errorMessage } from '../api/client.js';
import { formatDateTime } from '../utils/datetime.js';

const NOTIF_LABELS = {
  assigned: 'Assigned to you',
  comment: 'New comment',
  reminder: 'Reminder',
  overdue: 'Overdue',
};

export default function Notifications() {
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadNotifications = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data } = await api.get('/notifications', { params: { limit: 100 } });
      setNotifications(data.notifications);
      setUnreadCount(data.unreadCount ?? 0);
    } catch (err) {
      setError(errorMessage(err, 'Unable to load notifications'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadNotifications();
  }, [loadNotifications]);

  const markRead = async (id) => {
    try {
      await api.patch(`/notifications/${id}/read`);
      setNotifications((prev) =>
        prev.map((n) =>
          n.id === id ? { ...n, readAt: new Date().toISOString() } : n
        )
      );
      setUnreadCount((c) => Math.max(0, c - 1));
    } catch (err) {
      setError(errorMessage(err, 'Unable to mark as read'));
    }
  };

  const markAllRead = async () => {
    try {
      await api.post('/notifications/read-all');
      const now = new Date().toISOString();
      setNotifications((prev) =>
        prev.map((n) => ({ ...n, readAt: now }))
      );
      setUnreadCount(0);
    } catch (err) {
      setError(errorMessage(err, 'Unable to mark all as read'));
    }
  };

  if (loading) {
    return (
      <div className="page-content">
        <div className="empty-state">Loading notifications...</div>
      </div>
    );
  }

  return (
    <div className="page-content">
      <div className="page-header">
        <div>
          <h1>Notifications</h1>
          <p className="page-subtitle">
            Task reminders, assignments, and updates.
          </p>
        </div>
        {unreadCount > 0 && (
          <button
            type="button"
            className="btn btn-ghost"
            onClick={markAllRead}
          >
            Mark all read ({unreadCount})
          </button>
        )}
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {notifications.length === 0 ? (
        <div className="empty-state">You are all caught up.</div>
      ) : (
        <ul className="notif-list">
          {notifications.map((notification) => (
            <li
              key={notification.id}
              className={`notif-item${
                notification.readAt === null ? ' notif-item-unread' : ''
              }`}
            >
              <div
                className="notif-item-body"
                onClick={() => markRead(notification.id)}
              >
                <span className="notif-type">
                  {NOTIF_LABELS[notification.type] ?? notification.type}
                </span>
                <span className="notif-title">
                  {notification.task?.title ?? 'Task'}
                </span>
                <span className="notif-time">
                  {formatDateTime(notification.scheduledAt ?? notification.createdAt)}
                </span>
              </div>
              {notification.readAt === null && <span className="notif-dot" />}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}