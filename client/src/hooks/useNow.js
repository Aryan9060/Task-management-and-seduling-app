import { useEffect, useState } from 'react';

/** Returns a Date that refreshes on an interval, for live clocks/countdowns. */
export default function useNow(intervalMs = 1000) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);

  return now;
}
