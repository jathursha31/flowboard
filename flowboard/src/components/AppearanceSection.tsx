import { ACCENTS, MODES, useTheme } from '../hooks/useTheme.ts';

// 🎨 Account page: light / dark / midnight / system + accent colour (indha device la save aagum)
export default function AppearanceSection() {
  const { mode, accent, setMode, setAccent } = useTheme();
  return (
    <section className="card account__card">
      <h2>🎨 Appearance</h2>
      <div className="appearance">
        <div className="mode-picker" role="group" aria-label="Theme">
          {MODES.map((m) => (
            <button key={m.id} type="button" aria-pressed={mode === m.id} onClick={() => setMode(m.id)}>
              {m.icon} {m.label}
            </button>
          ))}
        </div>
        <fieldset className="color-picker">
          <legend>Accent colour</legend>
          {ACCENTS.map((a) => (
            <button
              key={a.id}
              type="button"
              className={`color-swatch ${accent === a.id ? 'is-on' : ''}`}
              style={{ background: a.color }}
              onClick={() => setAccent(a.id)}
              aria-label={a.label}
              aria-pressed={accent === a.id}
              title={a.label}
            />
          ))}
        </fieldset>
        <p className="muted small">Saved on this device. &quot;System&quot; follows your computer&apos;s light / dark setting.</p>
      </div>
    </section>
  );
}
