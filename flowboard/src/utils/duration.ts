// ⏱️ Seconds → "1h 05m" / "4m 12s" (timer + reports ku)
export function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h) return `${h}h ${String(m).padStart(2, '0')}m`;
  if (m) return `${m}m ${String(s % 60).padStart(2, '0')}s`;
  return `${s}s`;
}

// Motham neram (timer oadikittu irundhaa adhuvum serththu)
export function totalSeconds(task: { timeSpent?: number; timerStartedAt?: string | null }, now = Date.now()): number {
  const running = task.timerStartedAt ? Math.max(0, (now - Date.parse(task.timerStartedAt)) / 1000) : 0;
  return (task.timeSpent ?? 0) + running;
}
