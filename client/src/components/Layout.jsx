import { useCallback, useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import api from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { formatDateTime } from '../utils/datetime.js';

const NOTIF_LABELS = {
  assigned: 'Assigned to you',
  comment: 'New comment',
  reminder: 'Reminder',
  overdue: 'Overdue',
};

function BellIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.7 21a2 2 0 0 1-3.4 0" />
    </svg>
  );
}

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [open, setOpen] = useState(false);
  const bellRef = useRef(null);

  const loadNotifications = useCallback(async () => {
    try {
      const { data } = await api.get('/notifications', { params: { limit: 20 } });
      setNotifications(data.notifications);
      setUnreadCount(data.unreadCount);
    } catch {
      // The bell is non-critical; the next poll re-syncs.
    }
  }, []);

  useEffect(() => {
    loadNotifications();
    const timer = setInterval(loadNotifications, 60000);
    window.addEventListener('focus', loadNotifications);
    return () => {
      clearInterval(timer);
      window.removeEventListener('focus', loadNotifications);
    };
  }, [loadNotifications]);

  useEffect(() => {
    if (!open) return undefined;
    const close = (event) => {
      if (bellRef.current && !bellRef.current.contains(event.target)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  const openNotification = async (notification) => {
    setOpen(false);
    if (notification.readAt === null) {
      const now = new Date().toISOString();
      setNotifications((prev) =>
        prev.map((n) => (n.id === notification.id ? { ...n, readAt: now } : n))
      );
      setUnreadCount((count) => Math.max(0, count - 1));
      try {
        await api.patch(`/notifications/${notification.id}/read`);
      } catch {
        loadNotifications();
      }
    }
    navigate('/tasks');
  };

  const markAllRead = async () => {
    try {
      await api.post('/notifications/read-all');
      const now = new Date().toISOString();
      setNotifications((prev) => prev.map((n) => (n.readAt === null ? { ...n, readAt: now } : n)));
      setUnreadCount(0);
    } catch {
      loadNotifications();
    }
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="topbar-inner">
          <div className="brand">
            <span className="brand-mark" />
            TaskFlow
          </div>
          <nav className="nav">
            <NavLink to="/" end>
              Dashboard
            </NavLink>
            <NavLink to="/tasks">Tasks</NavLink>
            <NavLink to="/calendar">Calendar</NavLink>
            <NavLink to="/board">Board</NavLink>
            <NavLink to="/categories">Categories</NavLink>
            <NavLink to="/timer">Timer</NavLink>
            <NavLink to="/notifications">Notifications</NavLink>
          </nav>
          <div className="user-area">
            <div className="notif-bell" ref={bellRef}>
              <button
                type="button"
                className="btn btn-ghost notif-bell-button"
                onClick={() => setOpen((value) => !value)}
                aria-label={
                  unreadCount > 0 ? `Notifications, ${unreadCount} unread` : 'Notifications'
                }
                aria-expanded={open}
              >
                <BellIcon />
                {unreadCount > 0 && (
                  <span className="notif-badge">{unreadCount > 9 ? '9+' : unreadCount}</span>
                )}
              </button>
              {open && (
                <div className="notif-panel">
                  <div className="notif-panel-head">
                    <span>Notifications</span>
                    {unreadCount > 0 && (
                      <button
                        type="button"
                        className="btn btn-ghost btn-small"
                        onClick={markAllRead}
                      >
                        Mark all read
                      </button>
                    )}
                  </div>
                  {notifications.length === 0 ? (
                    <div className="notif-empty">You are all caught up.</div>
                  ) : (
                    <ul className="notif-list">
                      {notifications.map((notification) => (
                        <li key={notification.id}>
                          <button
                            type="button"
                            className={`notif-item${notification.readAt === null ? ' notif-item-unread' : ''}`}
                            onClick={() => openNotification(notification)}
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
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
            <span className="user-name">{user?.name}</span>
            <button type="button" className="btn btn-ghost" onClick={handleLogout}>
              Log out
            </button>
          </div>
        </div>
      </header>
      <main className="page">
        <Outlet />
      </main>
    </div>
  );
}
