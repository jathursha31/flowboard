import { lazy, Suspense, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import Hero from '../components/Hero.tsx';
import Logos from '../components/Logos.tsx';
import Features from '../components/Features.tsx';
import HowItWorks from '../components/HowItWorks.tsx'; // 🆕 🪜
import Stats from '../components/Stats.tsx';
import Pricing from '../components/Pricing.tsx';
import Testimonials from '../components/Testimonials.tsx';
import Updates from '../components/Updates.tsx'; // 🆕 📰
import FAQ from '../components/FAQ.tsx';
import Contact from '../components/Contact.tsx';
import Footer from '../components/Footer.tsx';
import { useScrollProgress } from '../hooks/useScrollProgress.ts';

// ⚡ Live demo board perusu (drag, AI, chat...): page mudhalla theriyura pakuthi ku apram load
const Demo = lazy(() => import('../components/Demo.tsx'));

// 🏠 "/" page: munnaadi App.jsx la irundha muzhu landing page
export default function HomePage() {
  const progress = useScrollProgress();
  const { hash } = useLocation();

  // 🎯 Vera page la irunthu "/#pricing" maari vandhaa, antha section ku scroll pannu
  useEffect(() => {
    if (!hash) return;
    const timer = setTimeout(
      () => document.getElementById(hash.slice(1))?.scrollIntoView({ behavior: 'instant' }),
      50
    );
    return () => clearTimeout(timer);
  }, [hash]);

  return (
    <>
      <div className="progress-bar" style={{ transform: `scaleX(${progress})` }} />
      <main>
        <Hero />
        <Logos />
        <Features />
        <HowItWorks />
        <Suspense fallback={<section className="section" id="demo" style={{ minHeight: 640 }} aria-busy="true" />}>
          <Demo />
        </Suspense>
        <Stats />
        <Pricing />
        <Testimonials />
        <Updates />
        <FAQ />
        <Contact />
      </main>
      <Footer />
    </>
  );
}
