import { useLang } from '../context/LanguageContext.tsx'; // 🆕 🌐

const brands = ['Northwind', 'Lumen', 'Acme Labs', 'Polaris', 'Vertex', 'Quanta', 'Helix', 'Orbit'];

export default function Logos() {
  const { t } = useLang();
  // Duplicate the list so the marquee loops seamlessly
  const row = [...brands, ...brands];
  return (
    <section className="logos" aria-label="Teams using Flowboard">
      <p className="logos__title">{t('logos.title')}</p>
      <div className="marquee">
        <div className="marquee__track">
          {row.map((b, i) => (
            <span key={i} className="marquee__item" aria-hidden={i >= brands.length}>
              {b}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
