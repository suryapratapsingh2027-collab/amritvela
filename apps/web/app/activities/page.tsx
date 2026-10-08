import Link from 'next/link';
import { ArrowRight, HeartPulse, Home, Music2, UtensilsCrossed } from 'lucide-react';
import Reveal from '../../components/Reveal';
import PublicShell from '../../components/PublicShell';

const items = [
  { title: 'Online Kirtan Relays', text: '500+ centres stream daily Kirtan programs on projectors from 2:30 AM to 5:30 AM, helping communities begin the day in Amrit Vela.', image: 'https://images.unsplash.com/photo-1705924270480-fa3a82508bc5?auto=format&fit=crop&fm=jpg&q=88&w=1400', icon: Music2, tag: 'Spiritual awakening' },
  { title: 'Daily Langar', text: 'Mobile vans and centres distribute food to around 1,50,000 people daily across all centres as part of hunger eradication.', image: 'https://images.unsplash.com/photo-1776803166840-6bdc47ed04f7?auto=format&fit=crop&fm=jpg&q=88&w=1400', icon: UtensilsCrossed, tag: 'Food & seva' },
  { title: 'Amrit Vela Dharamshala', text: 'Free accommodation in Ulhasnagar for worldwide Sangat, with participation connected to the 2:30 AM Sukhmani Saheb Path.', image: 'https://images.unsplash.com/photo-1757552529012-76b68fc93335?auto=format&fit=crop&fm=jpg&q=88&w=1400', icon: Home, tag: 'Sangat support' },
  { title: 'Medical Camps', text: 'Blood donation, eye checking, thalassemia and eye donation pledge camps form part of the Trust’s healthcare and community support.', image: 'https://images.unsplash.com/photo-1741769766414-188500c6d143?auto=format&fit=crop&fm=jpg&q=88&w=1400', icon: HeartPulse, tag: 'Healthcare' },
];

export default function Activities() {
  return (
    <PublicShell>
      <main>
        <section className="page-hero">
          <div className="container">
            <span className="section-kicker"><span>01</span> Our work</span>
            <h1>Service, every <em>single day.</em></h1>
            <p>Four core areas bring the Trust's mission to life — spiritual community, food, shelter and healthcare.</p>
          </div>
        </section>

        <section className="section">
          <div className="container">
            <div className="inner-section-head">
              <span className="section-kicker"><span>02</span> The rhythm of seva</span>
              <h2>Work that meets people <em>where they are.</em></h2>
              <p>Each activity is designed around a clear community need, from spiritual connection before sunrise to food and healthcare during the day.</p>
            </div>
            <div className="activity-page-grid">
              {items.map((item, index) => {
                const Icon = item.icon;
                return (
                  <Reveal key={item.title} delay={index * .07} className="activity-page-card">
                    <div className="activity-page-card-image">
                      <img src={item.image} alt={item.title} />
                    </div>
                    <div className="activity-page-card-body">
                      <div className="icon-pill"><Icon size={20} /></div>
                      <h2>{item.title}</h2>
                      <p>{item.text}</p>
                      <div className="card-footnote">{item.tag}</div>
                    </div>
                  </Reveal>
                );
              })}
            </div>
          </div>
        </section>

        <section className="section section-soft">
          <div className="container">
            <div className="home-cta">
              <div>
                <div className="section-kicker light"><span>03</span> Support a cause</div>
                <h2>Every contribution helps keep the <em>seva moving.</em></h2>
                <p>Support the Trust's ongoing charitable work through a secure donation.</p>
              </div>
              <div className="home-cta-actions">
                <Link href="/donate" className="btn btn-gold">Support the mission <ArrowRight size={16} /></Link>
                <Link href="/contact" className="btn btn-glass">Talk to the Trust <ArrowRight size={16} /></Link>
              </div>
            </div>
          </div>
        </section>
      </main>
    </PublicShell>
  );
}
