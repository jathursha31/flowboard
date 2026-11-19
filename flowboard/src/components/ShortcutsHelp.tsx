// ⌨️ "?" amukkinaa varra shortcuts list
export const SHORTCUTS: [keys: string[], what: string][] = [
  [['N'], 'New task'],
  [['/'], 'Search this board'],
  [['Ctrl', 'K'], 'Search everything'],
  [['B'], 'Board view'],
  [['C'], 'Calendar view'],
  [['T'], 'Timeline view'],
  [['A'], 'Ask AI about your tasks'],
  [['M'], 'Team chat'],
  [['H'], 'Activity history'],
  [['P'], 'Plan my day'],
  [['Esc'], 'Close the open panel or popup'],
  [['?'], 'Show this list'],
];

export default function ShortcutsHelp({ onClose }: { onClose: () => void }) {
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="shortcuts-title">
        <div className="plan-day__head">
          <h3 id="shortcuts-title">⌨️ Keyboard shortcuts</h3>
          <button type="button" className="icon-x" onClick={onClose} aria-label="Close" autoFocus>×</button>
        </div>
        <dl className="shortcut-list">
          {SHORTCUTS.map(([keys, what]) => (
            <div key={what}>
              <dt>
                {keys.map((k, i) => (
                  <span key={k}>
                    {i > 0 && ' + '}
                    <kbd>{k}</kbd>
                  </span>
                ))}
              </dt>
              <dd>{what}</dd>
            </div>
          ))}
        </dl>
        <p className="muted small">📱 On a phone: press and hold a card for a moment, then drag it. The page scrolls by itself near the top and bottom edge.</p>
      </div>
    </div>
  );
}
