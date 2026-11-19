import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import Icon from './Icon.tsx';
import Reveal from './Reveal.tsx';
import { api } from '../api.ts';
import { useAuth } from '../context/AuthContext.tsx';
import { useToast } from '../context/ToastContext.tsx';
import { useLang } from '../context/LanguageContext.tsx';
import type { FormEvent, TouchEvent } from 'react';

// Sample reviews (real reviews illaadhapodhu / koodave kaatta)
// Kaattura ovvoru review (real illa sample)
interface ShownReview {
  id?: string;
  name: string;
  role: string;
  color: string;
  rating: number;
  text: string;
  verified?: boolean;
}

const sampleReviews: ShownReview[] = [
  { name: 'Amara Perera', role: 'Engineering Lead, Lumen', color: '#818cf8', rating: 5, text: 'We replaced three different tools with Flowboard. Sprint planning went from two hours to twenty minutes, and everyone actually knows what is going on.' },
  { name: 'Daniel Okafor', role: 'Product Manager, Polaris', color: '#34d399', rating: 5, text: 'The automations are a game changer. Our backlog grooming practically runs itself, and the reports make stakeholder updates painless.' },
  { name: 'Sofia Martins', role: 'Design Director, Helix', color: '#f472b6', rating: 5, text: 'Finally a project tool that designers enjoy using. It is fast, beautiful and keeps our handoffs tidy.' },
  { name: 'Kenji Watanabe', role: 'CTO, Vertex', color: '#fbbf24', rating: 5, text: 'Security reviews were easy and our team of 120 onboarded in a single afternoon.' },
];

// 🆕 ⭐ Review ezhudhura form
interface MyReview {
  rating: number;
  text: string;
  role: string;
  approved: boolean;
}
interface PublicReview {
  id: string;
  name: string;
  role: string;
  rating: number;
  text: string;
  avatarColor: string;
}
interface ReviewFormProps {
  initial: MyReview | null;
  onDone: (saved: MyReview) => void;
  onCancel: () => void;
}

function ReviewForm({ initial, onDone, onCancel }: ReviewFormProps) {
  const { t } = useLang();
  const toast = useToast();
  const [rating, setRating] = useState(initial?.rating ?? 5);
  const [role, setRole] = useState(initial?.role ?? '');
  const [text, setText] = useState(initial?.text ?? '');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api('/api/reviews', 'POST', { rating, role, text });
      toast(t('testimonials.thanks'), 'success', { duration: 5000 });
      onDone({ rating, role, text, approved: false });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="card review-form" onSubmit={submit}>
      <h3>{t('testimonials.formTitle')}</h3>
      <div className="review-form__stars" role="radiogroup" aria-label={t('testimonials.rating')}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={rating === n}
            aria-label={`${n} star${n > 1 ? 's' : ''}`}
            className={n <= rating ? 'is-on' : ''}
            onClick={() => setRating(n)}
          >
            <Icon name="star" size={26} filled={n <= rating} strokeWidth={n <= rating ? 0 : 1.5} />
          </button>
        ))}
      </div>
      <input value={role} onChange={(e) => setRole(e.target.value)} placeholder={t('testimonials.role')} maxLength={60} aria-label={t('testimonials.role')} />
      <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder={t('testimonials.text')} rows={4} maxLength={400} aria-label={t('testimonials.text')} />
      {error && <p className="modal__error">{error}</p>}
      <div className="modal__actions modal__actions--start">
        <button type="button" className="btn btn--outline" onClick={onCancel}>{t('testimonials.cancel')}</button>
        <button type="submit" className="btn btn--primary" disabled={busy || text.trim().length < 10}>{t('testimonials.submit')}</button>
      </div>
    </form>
  );
}

export default function Testimonials() {
  const { user } = useAuth();
  const { t } = useLang();
  const [realReviews, setRealReviews] = useState<PublicReview[]>([]); // 🆕 approve aana user reviews
  const [mine, setMine] = useState<MyReview | null>(null); // 🆕 en review (status ku)
  const [formOpen, setFormOpen] = useState(false);
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const touchX = useRef<number | null>(null);

  // 🆕 ⭐ Real reviews edu (public)
  useEffect(() => {
    api('/api/reviews')
      .then(setRealReviews)
      .catch(() => {});
  }, []);

  // 🆕 Login aagirundhaa en review status
  useEffect(() => {
    if (!user) {
      setMine(null);
      return;
    }
    api('/api/reviews/mine')
      .then((d) => setMine(d.review))
      .catch(() => {});
  }, [user]);

  // Real reviews mudhalla, apram samples
  const reviews: ShownReview[] = [
    ...realReviews.map((r) => ({ ...r, color: r.avatarColor, verified: true })),
    ...sampleReviews,
  ];
  const count = reviews.length;

  const go = useCallback((dir: number) => setIndex((i) => (i + dir + count) % count), [count]);

  useEffect(() => {
    if (paused) return;
    const id = setInterval(() => go(1), 5500);
    return () => clearInterval(id);
  }, [paused, go]);

  return (
    <section className="section section--alt" id="testimonials">
      <div className="container">
        <Reveal className="section__head">
          <span className="eyebrow">{t('testimonials.eyebrow')}</span>
          <h2>{t('testimonials.title')}</h2>
        </Reveal>

        <Reveal
          className="carousel"
          onMouseEnter={() => setPaused(true)}
          onMouseLeave={() => setPaused(false)}
          onTouchStart={(e: TouchEvent) => (touchX.current = e.touches[0].clientX)}
          onTouchEnd={(e: TouchEvent) => {
            if (touchX.current == null) return;
            const dx = e.changedTouches[0].clientX - touchX.current;
            if (Math.abs(dx) > 50) go(dx < 0 ? 1 : -1);
            touchX.current = null;
          }}
        >
          <div className="carousel__viewport">
            <div className="carousel__track" style={{ transform: `translateX(-${(index % count) * 100}%)` }}>
              {reviews.map((r, i) => (
                <figure key={r.id ?? r.name} className="review" aria-hidden={i !== index % count}>
                  <div className="review__stars" role="img" aria-label={`${r.rating} out of 5 stars`}>
                    {Array.from({ length: 5 }).map((_, s) => (
                      <Icon key={s} name="star" size={18} filled={s < r.rating} strokeWidth={s < r.rating ? 0 : 1.5} />
                    ))}
                  </div>
                  <blockquote>“{r.text}”</blockquote>
                  <figcaption>
                    <span className="review__avatar" style={{ background: r.color }}>
                      {r.name.split(' ').filter(Boolean).slice(0, 2).map((w: string) => w[0].toUpperCase()).join('')}
                    </span>
                    <span>
                      <strong>{r.name}</strong>
                      <small>
                        {r.role}
                        {r.verified && <span className="review__verified"> ✅ {t('testimonials.verified')}</span>}
                      </small>
                    </span>
                  </figcaption>
                </figure>
              ))}
            </div>
          </div>

          <div className="carousel__controls">
            <button className="icon-btn" onClick={() => go(-1)} aria-label="Previous review">
              <Icon name="left" />
            </button>
            <div className="carousel__dots">
              {reviews.map((r, i) => (
                <button
                  key={r.id ?? r.name}
                  className={i === index % count ? 'is-active' : ''}
                  onClick={() => setIndex(i)}
                  aria-label={`Show review ${i + 1}`}
                />
              ))}
            </div>
            <button className="icon-btn" onClick={() => go(1)} aria-label="Next review">
              <Icon name="right" />
            </button>
          </div>
        </Reveal>

        {/* 🆕 ⭐ Review ezhudhu */}
        <div className="review-cta">
          {!user && (
            <Link to="/signin" className="btn btn--outline">{t('testimonials.loginToReview')}</Link>
          )}
          {user && !formOpen && (
            <>
              <button type="button" className="btn btn--outline" onClick={() => setFormOpen(true)}>
                {mine ? t('testimonials.edit') : t('testimonials.write')}
              </button>
              {mine && <small className="muted">{mine.approved ? t('testimonials.live') : t('testimonials.pending')}</small>}
            </>
          )}
          {user && formOpen && (
            <ReviewForm
              initial={mine}
              onDone={(saved: MyReview) => {
                setMine(saved);
                setFormOpen(false);
              }}
              onCancel={() => setFormOpen(false)}
            />
          )}
        </div>
      </div>
    </section>
  );
}
