import Link from 'next/link';
import { ArrowRight, BadgeCheck, HeartHandshake, Sparkles, Stethoscope, GraduationCap, UtensilsCrossed } from 'lucide-react';
import Reveal from '../../components/Reveal';
import PublicShell from '../../components/PublicShell';

const values = [
  { title: 'Education', text: 'Promoting education for weaker sections and building pathways for future learning.', icon: GraduationCap },
  { title: 'Amrit Vela', text: 'Encouraging devotees to observe Amrit Vela and engage with Gurbani-based Katha & Kirtan.', icon: Sparkles },
  { title: 'Langar & food', text: 'Supporting hunger eradication through daily Langar, mobile vans and future Nanak Roti infrastructure.', icon: UtensilsCrossed },
  { title: 'Healthcare', text: 'Extending practical support through medical camps, diagnostics and future healthcare infrastructure.', icon: Stethoscope },
];

export default function About() {
  return (
    <PublicShell>
      <main>
        <section className="page-hero">
          <div className="container">
            <span className="section-kicker"><span>01</span> About the Trust</span>
            <h1>Faith that becomes <em>service.</em></h1>
            <p>
              Amrit Vela Trust is a prominent public charitable trust incorporated on
              04 September 2014, working across spiritual awakening, hunger eradication,
              healthcare, emergency relief and education.
            </p>
          </div>
        </section>

        <section className="section">
          <div className="container split">
            <Reveal>
              <div className="about-hero-card">
                <img src="/assets/trust-chairman.png" alt="Amrit Vela Trust spiritual leader" />
                <div className="about-hero-caption">
                  <span>Spiritual inspiration</span>
                  <strong>Bhai Sahib Gurpreetsinghji (Rinkuji)</strong>
                  <div>Gurbani-based Katha & Kirtan</div>
                </div>
              </div>
            </Reveal>
            <Reveal delay={0.1}>
              <div>
                <span className="section-kicker"><span>02</span> Our foundation</span>
                <h2>Rooted in faith. <em>Built for people.</em></h2>
                <p className="lead-copy">
                  The Trust is registered under the Bombay Public Trust Act, 1950 and
                  the Income Tax Act, 1961, and holds an 80G exemption certificate issued
                  by the Commissioner of Income Tax, Pune.
                </p>
                <p className="lead-copy">
                  Its work connects spiritual practice with practical compassion —
                  encouraging Amrit Vela, feeding people in need, supporting healthcare
                  and creating educational and community infrastructure.
                </p>
                <div className="about-meta-grid">
                  <div className="meta-card"><span>Established</span><strong>04 September 2014</strong></div>
                  <div className="meta-card"><span>Registration</span><strong>Bombay Public Trust Act, 1950</strong></div>
                  <div className="meta-card"><span>Income Tax recognition</span><strong>Section 12A / 80G</strong></div>
                  <div className="meta-card"><span>Base</span><strong>Ulhasnagar, Maharashtra</strong></div>
                </div>
              </div>
            </Reveal>
          </div>
        </section>

        <section className="section section-soft">
          <div className="container">
            <div className="inner-section-head">
              <span className="section-kicker"><span>03</span> Mission & vision</span>
              <h2>Make spiritual values visible in <em>everyday life.</em></h2>
              <p>
                The Trust's mission is to promote education for weaker sections, encourage
                devotees to observe Amrit Vela and provide essential food and healthcare
                infrastructure to people in need.
              </p>
            </div>
            <div className="value-grid">
              {values.map(({ title, text, icon: Icon }, index) => (
                <Reveal key={title} delay={index * 0.06} className="value-card">
                  <div className="value-icon"><Icon size={20} /></div>
                  <h3>{title}</h3>
                  <p>{text}</p>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        <section className="section">
          <div className="container">
            <div className="inner-section-head">
              <span className="section-kicker"><span>04</span> What the work looks like</span>
              <h2>From the early hours to <em>everyday care.</em></h2>
            </div>
            <div className="editorial-grid">
              <Reveal className="editorial-card tall">
                <img src="https://images.unsplash.com/photo-1705924270480-fa3a82508bc5?auto=format&fit=crop&fm=jpg&q=88&w=1400" alt="Community spiritual activity" />
                <div><span>Online Kirtan Relays</span><strong>500+ centres begin the day with Kirtan from 2:30 AM to 5:30 AM.</strong></div>
              </Reveal>
              <div className="editorial-grid" style={{ gridTemplateColumns: '1fr', gap: 15 }}>
                <Reveal className="editorial-card">
                  <img src="https://images.unsplash.com/photo-1776803166840-6bdc47ed04f7?auto=format&fit=crop&fm=jpg&q=88&w=1200" alt="Langar service" />
                  <div><span>Daily Langar</span><strong>Around 1,50,000 people served daily.</strong></div>
                </Reveal>
                <Reveal delay={0.08} className="editorial-card">
                  <img src="https://images.unsplash.com/photo-1741769766414-188500c6d143?auto=format&fit=crop&fm=jpg&q=88&w=1200" alt="Healthcare activity" />
                  <div><span>Medical Camps</span><strong>Blood donation, eye checking and thalassemia support.</strong></div>
                </Reveal>
              </div>
            </div>
          </div>
        </section>

        <section className="section section-soft">
          <div className="container">
            <div className="home-cta">
              <div>
                <div className="section-kicker light"><span>05</span> Continue the journey</div>
                <h2>Help turn a good intention into <em>real seva.</em></h2>
                <p>Support the Trust's ongoing work or connect with the team to learn more.</p>
              </div>
              <div className="home-cta-actions">
                <Link href="/donate" className="btn btn-gold">Donate <HeartHandshake size={16} /></Link>
                <Link href="/activities" className="btn btn-glass">Explore our work <ArrowRight size={16} /></Link>
              </div>
            </div>
          </div>
        </section>
      </main>
    </PublicShell>
  );
}
