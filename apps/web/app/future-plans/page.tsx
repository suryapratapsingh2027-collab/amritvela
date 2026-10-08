import { ArrowUpRight, Building2, GraduationCap, Hospital, UtensilsCrossed, Users } from 'lucide-react';
import Reveal from '../../components/Reveal';
import PublicShell from '../../components/PublicShell';

const plans = [
  { title: 'Amritsar Building', text: 'A multi-story building near Harmandir Sahib with 150 free-rent rooms and a Langar hall for visiting Sangat.', image: 'https://images.unsplash.com/photo-1757552529012-76b68fc93335?auto=format&fit=crop&fm=jpg&q=88&w=1400', icon: Building2, tag: 'Accommodation + Langar' },
  { title: '113 Dukh Nivaran Isthans', text: 'A planned network of 113 locations to streamline food distribution through Nanak Roti.', image: 'https://images.unsplash.com/photo-1776803166840-6bdc47ed04f7?auto=format&fit=crop&fm=jpg&q=88&w=1400', icon: UtensilsCrossed, tag: 'Food infrastructure' },
  { title: 'Automated Global Kitchen', text: 'Developing an automated Global Kitchen to strengthen food preparation and distribution capacity.', image: 'https://images.unsplash.com/photo-1556910103-1c02745aae4d?auto=format&fit=crop&fm=jpg&q=88&w=1400', icon: UtensilsCrossed, tag: 'Scale & efficiency' },
  { title: 'Free Medical Hospital', text: 'Building dedicated healthcare infrastructure to make medical support more accessible to people in need.', image: 'https://images.unsplash.com/photo-1576091160399-112ba8d25d1d?auto=format&fit=crop&fm=jpg&q=88&w=1400', icon: Hospital, tag: 'Healthcare' },
  { title: 'Higher Secondary School & Junior College', text: 'Creating future educational institutions to expand learning opportunities for students and communities.', image: 'https://images.unsplash.com/photo-1580582932707-520aed937b7b?auto=format&fit=crop&fm=jpg&q=88&w=1400', icon: GraduationCap, tag: 'Education' },
  { title: 'Women’s Vocational Centre', text: 'A vocational training and empowerment centre focused on practical skills and opportunities for women.', image: 'https://images.unsplash.com/photo-1544717305-2782549b5136?auto=format&fit=crop&fm=jpg&q=88&w=1400', icon: Users, tag: 'Empowerment' },
];

export default function FuturePlans() {
  return (
    <PublicShell>
      <main>
        <section className="page-hero">
          <div className="container">
            <span className="section-kicker"><span>01</span> Looking ahead</span>
            <h1>Building the next chapter of <em>seva.</em></h1>
            <p>The Trust's future plans focus on scaling food distribution, accommodation, healthcare, education and women's empowerment.</p>
          </div>
        </section>

        <section className="section">
          <div className="container">
            <div className="inner-section-head">
              <span className="section-kicker"><span>02</span> Future initiatives</span>
              <h2>Big plans. <em>Human outcomes.</em></h2>
              <p>These initiatives are part of the Trust's stated future vision. They are presented here as planned projects, not as completed facilities.</p>
            </div>
            <div className="plan-grid">
              {plans.map((plan, index) => {
                const Icon = plan.icon;
                return (
                  <Reveal key={plan.title} delay={index * .05} className="plan-card">
                    <div className="plan-card-image"><img src={plan.image} alt={plan.title} /></div>
                    <div className="plan-card-body">
                      <div className="icon-pill"><Icon size={20} /></div>
                      <h2>{plan.title}</h2>
                      <p>{plan.text}</p>
                      <div className="card-footnote">{plan.tag} <ArrowUpRight size={14} /></div>
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
                <div className="section-kicker light"><span>03</span> Be part of what comes next</div>
                <h2>Help create infrastructure that can serve <em>for years.</em></h2>
                <p>Support the Trust's wider mission through donation or direct engagement.</p>
              </div>
              <div className="home-cta-actions">
                <a href="/donate" className="btn btn-gold">Donate <ArrowUpRight size={16} /></a>
              </div>
            </div>
          </div>
        </section>
      </main>
    </PublicShell>
  );
}
