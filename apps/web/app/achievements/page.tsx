import Link from 'next/link';
import { ArrowRight, Award, Eye, HeartHandshake, Radio, ShieldCheck, Youtube } from 'lucide-react';
import Reveal from '../../components/Reveal';
import PublicShell from '../../components/PublicShell';

const stats = [
  ['50,000', 'Silent Kirtan gathering', 'World Book of Records recognition'],
  ['2.5L', 'Prabhat Pheri gathering', 'One of the largest reported gatherings'],
  ['20K+', 'People served during COVID-19', 'Ready food distributed daily'],
  ['50M+', 'Digital views', 'Across the Trust digital reach'],
];

export default function Achievements() {
  return (
    <PublicShell>
      <main>
        <section className="page-hero">
          <div className="container">
            <span className="section-kicker"><span>01</span> Impact & recognition</span>
            <h1>Milestones that reflect <em>people served.</em></h1>
            <p>From record-setting gatherings to service during the pandemic and a growing digital community, the Trust's work has reached people at scale.</p>
          </div>
        </section>

        <section className="section">
          <div className="container">
            <div className="achievement-stat-grid">
              {stats.map(([number, title, text], index) => (
                <Reveal key={title} delay={index * .06} className="achievement-stat">
                  <strong>{number}</strong>
                  <span>{title}</span>
                  <small>{text}</small>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        <section className="section section-soft">
          <div className="container certificate-shell">
            <Reveal>
              <div className="certificate-card">
                <img src="/assets/certificate-14.png" alt="World Book of Records certificate" />
              </div>
            </Reveal>
            <Reveal delay={.1}>
              <div className="certificate-copy">
                <span className="section-kicker"><span>02</span> World Book of Records</span>
                <h2>Recognition for <em>collective effort.</em></h2>
                <p>
                  The Trust has been recognised twice by the World Book of Records. The supplied certificate is presented here as part of the Trust's public recognition archive.
                </p>
                <div className="recognition-list">
                  <div><Award size={18} /><span>Silent Kirtan on headphones for 50,000 Sangat at Goalmaidan, Ulhasnagar.</span></div>
                  <div><Radio size={18} /><span>Largest gathering in a Prabhat Pheri, reported at 2,50,000 Sangat.</span></div>
                  <div><ShieldCheck size={18} /><span>Recognition sits alongside the Trust's wider community service work.</span></div>
                </div>
              </div>
            </Reveal>
          </div>
        </section>

        <section className="section">
          <div className="container">
            <div className="inner-section-head">
              <span className="section-kicker"><span>03</span> Wider reach</span>
              <h2>A community that now lives <em>online too.</em></h2>
            </div>
            <div className="value-grid">
              <div className="value-card"><div className="value-icon"><Radio size={20} /></div><h3>1,500+ WhatsApp groups</h3><p>A broad community communication network supporting information and engagement.</p></div>
              <div className="value-card"><div className="value-icon"><Youtube size={20} /></div><h3>10 lakh+ YouTube subscribers</h3><p>Digital channels extend spiritual and community content beyond physical centres.</p></div>
              <div className="value-card"><div className="value-icon"><Eye size={20} /></div><h3>50 million+ views</h3><p>A growing digital footprint around the Trust's spiritual and service work.</p></div>
            </div>
          </div>
        </section>

        <section className="section section-soft">
          <div className="container">
            <div className="home-cta">
              <div>
                <div className="section-kicker light"><span>04</span> Keep the impact moving</div>
                <h2>Recognition matters. <em>Seva matters more.</em></h2>
                <p>Support the work behind the milestones and help the Trust continue serving communities.</p>
              </div>
              <div className="home-cta-actions">
                <Link href="/donate" className="btn btn-gold">Donate <HeartHandshake size={16} /></Link>
                <Link href="/activities" className="btn btn-glass">See the work <ArrowRight size={16} /></Link>
              </div>
            </div>
          </div>
        </section>
      </main>
    </PublicShell>
  );
}
