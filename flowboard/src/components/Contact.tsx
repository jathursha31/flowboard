import { useState } from 'react';
import Icon from './Icon.tsx';
import Reveal from './Reveal.tsx';
import { useLang } from '../context/LanguageContext.tsx'; // 🆕 🌐
import type { ChangeEvent, FocusEvent, FormEvent } from 'react';

const initial = { name: '', email: '', team: '', message: '' };

interface Values {
  name: string;
  email: string;
  team: string;
  message: string;
}
type Field = keyof Values;

function validate(v: Values): Partial<Record<Field, string>> {
  const e: Partial<Record<Field, string>> = {};
  if (v.name.trim().length < 2) e.name = 'Please enter your name.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.email)) e.email = 'Please enter a valid email address.';
  if (!v.team) e.team = 'Please choose your team size.';
  if (v.message.trim().length < 10) e.message = 'Message should be at least 10 characters.';
  return e;
}

export default function Contact() {
  const [values, setValues] = useState(initial);
  const [touched, setTouched] = useState<Partial<Record<Field, boolean>>>({});
  const [status, setStatus] = useState('idle'); // idle | sending | sent
  const [serverError, setServerError] = useState(''); // 🆕 server thappu message
  const { t } = useLang();

  const errors = validate(values);
  const show = (field: Field) => touched[field] && errors[field];

  const onChange = (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setValues((v) => ({ ...v, [e.target.name]: e.target.value }));
  const onBlur = (e: FocusEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setTouched((t) => ({ ...t, [e.target.name]: true }));

  // 🆕 Naadagam illa, unmaiyaa server ku anuppum
  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setTouched({ name: true, email: true, team: true, message: true });
    if (Object.keys(errors).length) return;

    setStatus('sending');
    setServerError('');

    try {
      // 🚀 Server ku message anuppu
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      });

      // ❌ Server "thappu" nu sonnaa
      if (!res.ok) {
        const data = await res.json();
        setServerError(data.error || 'Edho thappu nadandhuduchu');
        setStatus('idle');
        return;
      }

      // ✅ Server "vaangiten" nu sonnaa
      setStatus('sent');
      setValues(initial);
      setTouched({});
    } catch {
      // 🔌 Server odave illana
      setServerError('Server ku connect panna mudiyala');
      setStatus('idle');
    }
  };

  return (
    <section className="section section--alt" id="contact">
      <div className="container contact">
        <Reveal className="contact__info">
          <span className="eyebrow">{t('contact.eyebrow')}</span>
          <h2>{t('contact.title')}</h2>
          <p>{t('contact.subtitle')}</p>
          <ul className="contact__list">
            <li><span><Icon name="mail" size={18} /></span> hello@flowboard.io</li>
            <li><span><Icon name="phone" size={18} /></span> +44 20 7946 0000</li>
            <li><span><Icon name="pin" size={18} /></span> Birmingham, United Kingdom</li>
          </ul>
        </Reveal>

        <Reveal delay={120} className="card form-card">
          {status === 'sent' ? (
            <div className="success">
              <span className="success__icon"><Icon name="check" size={32} /></span>
              <h3>{t('contact.thanksTitle')}</h3>
              <p>{t('contact.thanksText')}</p>
              <button className="btn btn--outline" onClick={() => setStatus('idle')}>{t('contact.another')}</button>
            </div>
          ) : (
            <form onSubmit={onSubmit} noValidate>
              <div className="form-row">
                <div className={`field ${show('name') ? 'has-error' : ''}`}>
                  <label htmlFor="name">{t('contact.name')}</label>
                  <input id="name" name="name" value={values.name} onChange={onChange} onBlur={onBlur} placeholder="Jane Doe" autoComplete="name" />
                  {show('name') && <small>{errors.name}</small>}
                </div>
                <div className={`field ${show('email') ? 'has-error' : ''}`}>
                  <label htmlFor="email">{t('contact.email')}</label>
                  <input id="email" name="email" type="email" value={values.email} onChange={onChange} onBlur={onBlur} placeholder="jane@company.com" autoComplete="email" />
                  {show('email') && <small>{errors.email}</small>}
                </div>
              </div>
              <div className={`field ${show('team') ? 'has-error' : ''}`}>
                <label htmlFor="team">{t('contact.team')}</label>
                <select id="team" name="team" value={values.team} onChange={onChange} onBlur={onBlur}>
                  <option value="">{t('contact.select')}</option>
                  <option>1–10</option>
                  <option>11–50</option>
                  <option>51–200</option>
                  <option>200+</option>
                </select>
                {show('team') && <small>{errors.team}</small>}
              </div>
              <div className={`field ${show('message') ? 'has-error' : ''}`}>
                <label htmlFor="message">{t('contact.message')}</label>
                <textarea id="message" name="message" rows={4} value={values.message} onChange={onChange} onBlur={onBlur} placeholder={t('contact.messagePlaceholder')} maxLength={500} />
                <div className="field__meta">
                  {show('message') ? <small>{errors.message}</small> : <span />}
                  <span className="counter">{values.message.length}/500</span>
                </div>
              </div>
              {/* 🆕 Server thappu sonnaa sivappu la kaattu */}
              {serverError && <p style={{ color: 'var(--danger)' }}>{serverError}</p>}
              <button className="btn btn--primary btn--block btn--lg" type="submit" disabled={status === 'sending'}>
                {status === 'sending' ? <span className="spinner" aria-label="Sending" /> : <>{t('contact.send')} <Icon name="arrow" size={18} /></>}
              </button>
            </form>
          )}
        </Reveal>
      </div>
    </section>
  );
}