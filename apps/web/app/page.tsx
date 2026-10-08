'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  ArrowRight,
  Award,
  HeartHandshake,
  Home,
  Music2,
  Radio,
  Sparkles,
  Stethoscope,
  UtensilsCrossed,
  Users,
  Youtube,
} from 'lucide-react';
import Reveal from '../components/Reveal';
import Assistant from '../components/Assistant';
import PublicShell from '../components/PublicShell';

const goldenTemple =
  'https://images.unsplash.com/photo-1757552529012-76b68fc93335?auto=format&fit=crop&fm=jpg&q=88&w=2200';

const stats = [
  ['2014', 'Established', 'A decade of seva'],
  ['1.5L+', 'People served daily', 'Through Langar'],
  ['500+', 'Kirtan centres', 'Daily relay network'],
  ['50M+', 'Digital views', 'Growing reach'],
];

const activities = [
  {
    title: 'Online Kirtan Relays',
    text: '500+ centres stream daily Kirtan programs on projectors from 2:30 AM to 5:30 AM.',
    image: 'https://images.unsplash.com/photo-1705924270480-fa3a82508bc5?auto=format&fit=crop&fm=jpg&q=88&w=1200',
    icon: Music2,
    tag: '2:30 AM — 5:30 AM',
  },
  {
    title: 'Daily Langar',
    text: 'Mobile vans and centres distribute food to around 1,50,000 people daily across all centres.',
    image: 'https://images.unsplash.com/photo-1776803166840-6bdc47ed04f7?auto=format&fit=crop&fm=jpg&q=88&w=1200',
    icon: UtensilsCrossed,
    tag: '1,50,000+ daily',
  },
  {
    title: 'Dharamshala',
    text: 'Free accommodation in Ulhasnagar for worldwide Sangat, connected with the 2:30 AM Sukhmani Saheb Path.',
    image: goldenTemple,
    icon: Home,
    tag: 'Ulhasnagar',
  },
  {
    title: 'Medical Camps',
    text: 'Blood donation, eye checking, thalassemia and eye donation pledge camps for community welfare.',
    image: 'https://images.unsplash.com/photo-1741769766414-188500c6d143?auto=format&fit=crop&fm=jpg&q=88&w=1200',
    icon: Stethoscope,
    tag: 'Healthcare',
  },
];

export default function HomePage() {
  return (
    <PublicShell>
      <main>
        <section className="home-hero">
          <div className="home-hero-bg" style={{ backgroundImage: `url("${goldenTemple}")` }} />
          <div className="home-hero-overlay" />
          <div className="home-hero-orb orb-one" />
          <div className="home-hero-orb orb-two" />

          <div className="container home-hero-grid">
            <Reveal>
              <div className="hero-copy-block">
                <span className="eyebrow eyebrow-light">
                  <Sparkles size={14} /> Faith · Seva · Humanity
                </span>
                <h1>
                  Seva that begins <em>before sunrise.</em>
                </h1>
                <p>
                  Amrit Vela Trust brings spiritual practice and practical service
                  together — food for the hungry, care for the sick, spaces for
                  the Sangat and opportunities for education.
                </p>
                <div className="hero-actions">
                  <Link href="/donate" className="btn btn-gold">
                    Support the mission <HeartHandshake size={17} />
                  </Link>
                  <Link href="/about" className="btn btn-glass">
                    Discover our story <ArrowRight size={17} />
                  </Link>
                </div>
                <div className="hero-proof-row">
                  <div><strong>04 Sep 2014</strong><span>Established</span></div>
                  <div><strong>12A / 80G</strong><span>Recognition</span></div>
                  <div><strong>Ulhasnagar</strong><span>Maharashtra</span></div>
                </div>
              </div>
            </Reveal>

            <Reveal delay={0.12}>
              <div className="guruji-stage">
                <div className="guruji-frame">
                  <div className="guruji-frame-image" />
                  <div className="guruji-vignette" />
                  <img src="/assets/trust-chairman.png" alt="Amrit Vela Trust spiritual leader" />
                  <div className="guruji-caption">
                    <span>Spiritual inspiration</span>
                    <strong>Bhai Sahib Gurpreetsinghji (Rinkuji)</strong>
                    <small>Gurbani-based Katha & Kirtan</small>
                  </div>
                </div>
                <motion.div
                  className="hero-float-card hero-float-top"
                  animate={{ y: [0, -8, 0] }}
                  transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut' }}
                >
                  <span>Reach</span><strong>1,500+</strong><small>WhatsApp groups</small>
                </motion.div>
                <motion.div
                  className="hero-float-card hero-float-bottom"
                  animate={{ y: [0, 8, 0] }}
                  transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}
                >
                  <span>Daily Langar</span><strong>1.5L+</strong><small>people served</small>
                </motion.div>
              </div>
            </Reveal>
          </div>

          <div className="container hero-scroll-note">
            <span>Scroll to explore the Trust</span><span className="scroll-line" />
          </div>
        </section>

        <section className="impact-strip">
          <div className="container impact-grid">
            {stats.map(([number, title, sub]) => (
              <div className="impact-item" key={title}>
                <strong>{number}</strong>
                <span>{title}</span>
                <small>{sub}</small>
              </div>
            ))}
          </div>
        </section>

        <section className="section intro-section">
          <div className="container intro-grid">
            <Reveal>
              <div className="section-kicker"><span>01</span> The Trust</div>
              <h2>A decade of turning faith into <em>service.</em></h2>
            </Reveal>
            <Reveal delay={0.08}>
              <div className="intro-copy">
                <p>
                  Established on 04 September 2014, Amrit Vela Trust is a public
                  charitable trust registered under the Bombay Public Trust Act,
                  1950 and the Income Tax Act, 1961.
                </p>
                <p>
                  Its mission is rooted in spiritual awakening, hunger eradication,
                  healthcare, emergency relief and vocational education — with
                  Amrit Vela at the heart of its community work.
                </p>
                <Link href="/about" className="text-link">
                  Read the Trust story <ArrowRight size={16} />
                </Link>
              </div>
            </Reveal>
          </div>
        </section>

        <section className="section service-section">
          <div className="container">
            <div className="section-heading-row">
              <div>
                <div className="section-kicker"><span>02</span> What we do</div>
                <h2>Service with a <em>daily rhythm.</em></h2>
              </div>
              <p>
                From Amrit Vela in the early hours to Langar, medical camps and
                community support through the day, every initiative is designed
                around people.
              </p>
            </div>

            <div className="activity-grid-home">
              {activities.map((item, index) => {
                const Icon = item.icon;
                return (
                  <Reveal key={item.title} delay={index * 0.06} className="activity-card-home">
                    <div className="activity-image-home">
                      <img src={item.image} alt={item.title} />
                      <span className="activity-image-tag"><Icon size={14} /> {item.tag}</span>
                    </div>
                    <div className="activity-card-body">
                      <span className="card-number">0{index + 1}</span>
                      <h3>{item.title}</h3>
                      <p>{item.text}</p>
                      <Link href="/activities">Explore <ArrowRight size={15} /></Link>
                    </div>
                  </Reveal>
                );
              })}
            </div>
          </div>
        </section>

        <section className="section mission-section">
          <div className="container mission-layout">
            <Reveal>
              <div className="mission-visual">
                <img src="/assets/trust-chairman.png" alt="Amrit Vela Trust" />
                <div className="mission-visual-badge">
                  <Award size={18} />
                  <span>12A / 80G recognition</span>
                </div>
              </div>
            </Reveal>
            <Reveal delay={0.1}>
              <div className="mission-content">
                <div className="section-kicker"><span>03</span> Mission & vision</div>
                <h2>Practical compassion, <em>spiritual roots.</em></h2>
                <p className="lead-copy">
                  The Trust works to make spiritual values visible in everyday life:
                  a meal when someone is hungry, a medical camp when care is needed,
                  education when opportunity is limited and a place for the Sangat to
                  reconnect with Amrit Vela.
                </p>
                <div className="mission-list">
                  <div><span>01</span><div><strong>Spiritual awakening</strong><p>Encouraging devotees to observe Amrit Vela and connect with Gurbani.</p></div></div>
                  <div><span>02</span><div><strong>Hunger eradication</strong><p>Growing Langar and Nanak Roti distribution infrastructure.</p></div></div>
                  <div><span>03</span><div><strong>Healthcare & education</strong><p>Building accessible support systems for communities in need.</p></div></div>
                </div>
                <Link href="/about" className="btn btn-primary">Know the Trust <ArrowRight size={16} /></Link>
              </div>
            </Reveal>
          </div>
        </section>

        <section className="section impact-story-section">
          <div className="container">
            <div className="impact-story-head">
              <div>
                <div className="section-kicker light"><span>04</span> Impact & recognition</div>
                <h2>When seva reaches <em>scale.</em></h2>
              </div>
              <Link href="/achievements" className="btn btn-glass">View all milestones <ArrowRight size={16} /></Link>
            </div>
            <div className="impact-story-grid">
              <div className="impact-story-main">
                <div className="big-stat">50,000</div>
                <h3>Silent Kirtan on headphones</h3>
                <p>World Book of Records recognition for a silent Kirtan gathering at Goalmaidan, Ulhasnagar.</p>
              </div>
              <div className="impact-story-side">
                <div><Radio size={20} /><strong>2.5L</strong><span>Prabhat Pheri gathering</span></div>
                <div><Users size={20} /><strong>20K+</strong><span>People served daily during COVID-19 relief</span></div>
                <div><Youtube size={20} /><strong>10L+</strong><span>YouTube subscribers</span></div>
              </div>
            </div>
          </div>
        </section>

        <section className="section future-preview-section">
          <div className="container">
            <div className="section-heading-row">
              <div>
                <div className="section-kicker"><span>05</span> Looking ahead</div>
                <h2>Building the next chapter of <em>seva.</em></h2>
              </div>
              <Link href="/future-plans" className="text-link">See future plans <ArrowRight size={16} /></Link>
            </div>
            <div className="future-preview-grid">
              <Link href="/future-plans" className="future-preview-card future-large">
                <img src={goldenTemple} alt="Future Amritsar initiative" />
                <div><span>Amritsar</span><strong>150 free-rent rooms + Langar hall near Harmandir Sahib</strong></div>
              </Link>
              <Link href="/future-plans" className="future-preview-card">
                <div className="future-icon"><UtensilsCrossed size={20} /></div>
                <span>Food infrastructure</span><strong>113 Dukh Nivaran Isthans & Global Kitchen</strong>
              </Link>
              <Link href="/future-plans" className="future-preview-card">
                <div className="future-icon"><Stethoscope size={20} /></div>
                <span>Healthcare</span><strong>Free medical hospital for people in need</strong>
              </Link>
              <Link href="/future-plans" className="future-preview-card">
                <div className="future-icon"><Users size={20} /></div>
                <span>Empowerment</span><strong>School, junior college & women’s vocational centre</strong>
              </Link>
            </div>
          </div>
        </section>

        <section className="section home-cta-section">
          <div className="container">
            <div className="home-cta">
              <div>
                <div className="section-kicker light"><span>06</span> Join the seva</div>
                <h2>Your support can become someone&apos;s <em>meal, care or hope.</em></h2>
                <p>Choose to donate, explore Trust resources or connect directly with the team.</p>
              </div>
              <div className="home-cta-actions">
                <Link href="/donate" className="btn btn-gold">Donate now <HeartHandshake size={17} /></Link>
                <Link href="/contact" className="btn btn-glass">Contact the Trust <ArrowRight size={17} /></Link>
              </div>
            </div>
          </div>
        </section>
      </main>
      <Assistant floating />
    </PublicShell>
  );
}
