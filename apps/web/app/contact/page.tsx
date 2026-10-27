import Link from 'next/link';
import { ArrowRight, Mail, MapPin, MessageCircle, Phone } from 'lucide-react';
import PublicShell from '../../components/PublicShell';

export default function Contact() {
  return (
    <PublicShell>
      <main>
        <section className="page-hero">
          <div className="container">
            <span className="section-kicker"><span>01</span> Contact</span>
            <h1>Connect with <em>Amrit Vela Trust.</em></h1>
            <p>For donations, seva information, collaboration or general enquiries, reach the Trust directly through the details below.</p>
          </div>
        </section>

        <section className="section">
          <div className="container contact-layout">
            <div className="contact-card">
              <span className="section-kicker"><span>02</span> Reach the Trust</span>
              <h2>Let&apos;s connect.</h2>
              <p>Choose the channel that works best for your enquiry. WhatsApp and phone are the quickest options for direct contact.</p>
              <div className="contact-list">
                <div><MapPin size={19} /><div><span>Location</span><strong>Amrit Vela Darbar, Section 26, Ulhasnagar-4, Maharashtra</strong></div></div>
                <div><Phone size={19} /><div><span>Phone / WhatsApp</span><strong>6913001300</strong></div></div>
                <div><Mail size={19} /><div><span>Email</span><strong>amritvelatrustlive@gmail.com</strong></div></div>
              </div>
              <div className="contact-actions">
                <a href="tel:6913001300" className="btn btn-primary"><Phone size={16} /> Call</a>
                <a href="https://wa.me/916913001300" target="_blank" rel="noreferrer" className="btn btn-secondary"><MessageCircle size={16} /> WhatsApp</a>
                <a href="mailto:amritvelatrustlive@gmail.com" className="btn btn-secondary"><Mail size={16} /> Email</a>
              </div>
            </div>

            <div className="contact-card contact-aside">
              <span className="section-kicker light"><span>03</span> Need support?</span>
              <h3>Have a question about donation, resources or seva?</h3>
              <p>If your question needs a person, contact the Trust directly. For online contributions, you can also use the secure donation journey.</p>
              <div className="contact-actions">
                <Link href="/donate" className="btn btn-gold">Donate <ArrowRight size={16} /></Link>
                <Link href="/shop" className="btn btn-glass">Explore resources <ArrowRight size={16} /></Link>
              </div>
              <div className="contact-note">Official contact details supplied for the Trust: 6913001300 · amritvelatrustlive@gmail.com · Ulhasnagar, Maharashtra.</div>
            </div>
          </div>
        </section>
      </main>
    </PublicShell>
  );
}
