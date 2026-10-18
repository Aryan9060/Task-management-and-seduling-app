import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import api from '../api/client.js';
import { useAuth } from './AuthContext.jsx';

const TimerContext = createContext(null);

export function TimerProvider({ children }) {
  const { user } = useAuth();
  const [activeEntry, setActiveEntry] = useState(null);

  const refresh = useCallback(async () => {
    if (!user) {
      setActiveEntry(null);
      return;
    }
    try {
      const { data } = await api.get('/timer/active');
      setActiveEntry(data.entry);
    } catch {
      // The timer badge is non-critical; the next action re-syncs.
    }
  }, [user]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const start = useCallback(async (taskId) => {
    const { data } = await api.post(`/tasks/${taskId}/timer/start`);
    setActiveEntry(data.entry);
    return data;
  }, []);

  const stop = useCallback(async (taskId) => {
    const { data } = await api.post(`/tasks/${taskId}/timer/stop`);
    setActiveEntry(null);
    return data;
  }, []);

  const value = { activeEntry, start, stop, refresh };

  return <TimerContext.Provider value={value}>{children}</TimerContext.Provider>;
}

export function useTimer() {
  const context = useContext(TimerContext);
  if (!context) throw new Error('useTimer must be used within a TimerProvider');
  return context;
}
