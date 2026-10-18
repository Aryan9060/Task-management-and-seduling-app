import { useCallback, useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import api from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useTheme } from '../context/ThemeContext.jsx';
import { formatDateTime } from '../utils/datetime.js';
import ThemeSelector from './ThemeSelector.jsx';

const NOTIF_LABELS = {
  assigned: 'Assigned to you',
  comment: 'New comment',
  reminder: 'Reminder',
  overdue: 'Overdue',
};

const NAV_ITEMS = [
  { to: '/', label: 'Dashboard', icon: '📊' },
  { to: '/tasks', label: 'Tasks', icon: '✅' },
  { to: '/calendar', label: 'Calendar', icon: '📅' },
  { to: '/board', label: 'Board', icon: '🎯' },
  { to: '/categories', label: 'Categories', icon: '📁' },
  { to: '/timer', label: 'Timer', icon: '⏱️' },
  { to: '/notifications', label: 'Notifications', icon: '𔔿' },
];

function BrandMark() {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 2L2 7l10 5 10-5-10-5z" />
      <path d="M2 17l10 5 10-5" />
      <path d="M12 12L2 17l10-5" />
    </svg>
  );
}

function MenuIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <line x1="3" y1="12" x2="21" y2="12" />
      <line x1="3" y1="6" x2="21" y2="6" />
      <line x1="3" y1="18" x2="21" y2="18" />
    </svg>
  );
}

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
  const { theme, setTheme, themes } = useTheme();
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [open, setOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const bellRef = useRef(null);
  const sidebarRef = useRef(null);

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

  useEffect(() => {
    if (!sidebarOpen) return undefined;
    const close = (event) => {
      if (sidebarRef.current && !sidebarRef.current.contains(event.target)) setSidebarOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [sidebarOpen]);

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
      <aside className={`sidebar ${sidebarOpen ? 'sidebar-open' : ''}`} ref={sidebarRef}>
        <div className="sidebar-header">
          <BrandMark />
          <span className="sidebar-brand">DaliTak</span>
          <button
            type="button"
            className="btn btn-ghost btn-sm sidebar-close"
            aria-label="Close sidebar"
            onClick={() => setSidebarOpen(false)}
          >
            ✕
          </button>
        </div>
        <nav className="sidebar-nav" aria-label="Main navigation">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                `sidebar-nav-link${isActive ? ' sidebar-nav-link-active' : ''}`
              }
              onClick={() => setSidebarOpen(false)}
            >
              <span className="sidebar-nav-icon">{item.icon}</span>
              <span className="sidebar-nav-label">{item.label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-footer">
          <ThemeSelector />
          <div className="sidebar-user">
            <span className="sidebar-user-name">{user?.name}</span>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={handleLogout}
            >
              Sign out
            </button>
          </div>
        </div>
      </aside>

      <div className="app-body">
        <header className="topbar">
          <div className="topbar-inner">
            <button
              type="button"
              className="btn btn-ghost btn-sm topbar-menu"
              aria-label="Open navigation"
              aria-expanded={sidebarOpen}
              onClick={() => setSidebarOpen((v) => !v)}
            >
              <MenuIcon />
            </button>
            <div className="brand">
              <BrandMark />
              <span className="brand-text">DaliTak</span>
            </div>
            <div className="topbar-spacer" />
            <ThemeSelector />
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
        </header>
        <main className="page">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
