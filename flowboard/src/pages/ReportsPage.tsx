import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api.ts';
import { useAuth } from '../context/AuthContext.tsx';
import { formatDuration } from '../utils/duration.ts';

// 📊 "/reports": kadaisi 7 / 30 naal progress. "Download PDF" = browser print → "Save as PDF"

interface Report {
  days: number;
  from: string;
  to: string;
  series: { day: string; completed: number; created: number }[];
  totals: { completed: number; created: number; open: number; overdue: number; timeSpent: number };
  byPriority: { high: number; medium: number; low: number };
  byBoard: { id: string; name: string; open: number; done: number; timeSpent: number }[];
  topTime: { id: string; title: string; board: string; seconds: number }[];
}

const shortDay = (day: string, days: number) =>
  new Date(`${day}T00:00`).toLocaleDateString(undefined, days === 7 ? { weekday: 'short' } : { day: 'numeric' });

export default function ReportsPage() {
  const { user, checking } = useAuth();
  const navigate = useNavigate();
  const [days, setDays] = useState<7 | 30>(7);
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!checking && !user) navigate('/signin', { replace: true });
  }, [checking, user, navigate]);

  useEffect(() => {
    if (!user) return;
    setReport(null);
    api<Report>(`/api/account/report?days=${days}`).then(setReport, (err) => setError((err as Error).message));
  }, [user, days]);

  if (!user) return <main className="page" />;
  const max = Math.max(1, ...(report?.series ?? []).flatMap((d) => [d.completed, d.created]));
  const priorityTotal = report ? report.byPriority.high + report.byPriority.medium + report.byPriority.low : 0;

  return (
    <main className="page reports-page">
      <div className="container account">
        <header className="reports__head">
          <div>
            <h1>📊 Reports</h1>
            <p className="muted">{report ? `${new Date(`${report.from}T00:00`).toLocaleDateString()} – ${new Date(`${report.to}T00:00`).toLocaleDateString()} · ${user.name}` : '…'}</p>
          </div>
          <div className="reports__actions no-print">
            <div className="mode-picker" role="group" aria-label="Period">
              <button type="button" aria-pressed={days === 7} onClick={() => setDays(7)}>7 days</button>
              <button type="button" aria-pressed={days === 30} onClick={() => setDays(30)}>30 days</button>
            </div>
            <button type="button" className="btn btn--primary" onClick={() => window.print()} disabled={!report}>🖨️ Download PDF</button>
          </div>
        </header>

        {error && <p className="modal__error">{error}</p>}
        {!report ? (
          <p className="muted">Loading…</p>
        ) : (
          <>
            <section className="card account__card">
              <div className="stat-tiles">
                <div className="stat-tile"><b>{report.totals.completed}</b><span>completed</span></div>
                <div className="stat-tile"><b>{report.totals.created}</b><span>created</span></div>
                <div className="stat-tile"><b>{report.totals.open}</b><span>open now</span></div>
                <div className={`stat-tile ${report.totals.overdue ? 'stat-tile--warn' : ''}`}><b>{report.totals.overdue}</b><span>overdue</span></div>
                <div className="stat-tile"><b>{formatDuration(report.totals.timeSpent)}</b><span>time tracked</span></div>
              </div>
            </section>

            <section className="card account__card">
              <h2>📈 Day by day</h2>
              <div className="legend-row" aria-hidden="true">
                <span className="legend-dot legend-dot--done" /> Completed <span className="legend-dot legend-dot--new" /> Created
              </div>
              <div className={`report-chart ${days === 30 ? 'report-chart--30' : ''}`} role="img" aria-label={`Tasks completed and created per day, last ${days} days`}>
                {report.series.map((d) => (
                  <div key={d.day} className="report-chart__day" title={`${d.day}: ${d.completed} completed, ${d.created} created`}>
                    <div className="report-chart__bars">
                      <span className="report-bar report-bar--done" style={{ height: `${(d.completed / max) * 100}%` }} />
                      <span className="report-bar report-bar--new" style={{ height: `${(d.created / max) * 100}%` }} />
                    </div>
                    <small>{shortDay(d.day, days)}</small>
                  </div>
                ))}
              </div>
            </section>

            <div className="reports__grid">
              <section className="card account__card">
                <h2>📋 Boards</h2>
                {report.byBoard.length === 0 ? (
                  <p className="muted">No boards yet.</p>
                ) : (
                  <table className="plan-table report-table">
                    <thead>
                      <tr><th scope="col">Board</th><th scope="col">Open</th><th scope="col">Done</th><th scope="col">Time</th></tr>
                    </thead>
                    <tbody>
                      {report.byBoard.map((b) => (
                        <tr key={b.id}>
                          <th scope="row"><Link to={`/app?board=${b.id}`}>{b.name}</Link></th>
                          <td>{b.open}</td>
                          <td>{b.done}</td>
                          <td>{b.timeSpent ? formatDuration(b.timeSpent) : '–'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </section>

              <section className="card account__card">
                <h2>🔥 Open by priority</h2>
                {(['high', 'medium', 'low'] as const).map((p) => (
                  <div key={p} className="priority-row">
                    <span>{p}</span>
                    <span className="priority-row__bar"><i className={`pbar pbar--${p}`} style={{ width: `${priorityTotal ? (report.byPriority[p] / priorityTotal) * 100 : 0}%` }} /></span>
                    <b>{report.byPriority[p]}</b>
                  </div>
                ))}
                <h2 className="reports__sub">⏱️ Most time spent</h2>
                {report.topTime.length === 0 ? (
                  <p className="muted small">Start the timer on a task to see where your time goes.</p>
                ) : (
                  <ol className="top-time">
                    {report.topTime.map((t) => (
                      <li key={t.id}>
                        <span>{t.title} <small className="muted">· {t.board}</small></span>
                        <b>{formatDuration(t.seconds)}</b>
                      </li>
                    ))}
                  </ol>
                )}
              </section>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
