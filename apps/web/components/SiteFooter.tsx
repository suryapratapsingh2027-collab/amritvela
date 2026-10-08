import Link from 'next/link';
import { ArrowUpRight, HeartHandshake, Mail, MapPin, Phone } from 'lucide-react';

export default function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="footer-glow footer-glow-one" />
      <div className="footer-glow footer-glow-two" />
      <div className="container footer-top">
        <div className="footer-lead">
          <div className="footer-brand-row">
            <img src="/assets/amritvela-logo.png" alt="Amrit Vela Trust" />
            <div>
              <strong>AMRIT VELA TRUST</strong>
              <span>Faith • Seva • Humanity</span>
            </div>
          </div>
          <h2>Service that starts with intention.</h2>
          <p>
            A public charitable trust established on 04 September 2014,
            working across spiritual awakening, Langar, healthcare, education
            and community welfare.
          </p>
          <Link href="/donate" className="btn btn-gold">
            Support the mission <HeartHandshake size={16} />
          </Link>
        </div>

        <div className="footer-links-column">
          <span className="footer-label">Explore</span>
          <Link href="/about">About the Trust <ArrowUpRight size={14} /></Link>
          <Link href="/activities">Our work <ArrowUpRight size={14} /></Link>
          <Link href="/achievements">Achievements <ArrowUpRight size={14} /></Link>
          <Link href="/future-plans">Future plans <ArrowUpRight size={14} /></Link>
        </div>

        <div className="footer-links-column">
          <span className="footer-label">Support</span>
          <Link href="/donate">Donate <ArrowUpRight size={14} /></Link>
          <Link href="/shop">Seva resources <ArrowUpRight size={14} /></Link>
          <Link href="/track">Track an order <ArrowUpRight size={14} /></Link>
          <Link href="/contact">Contact the Trust <ArrowUpRight size={14} /></Link>
        </div>

        <div className="footer-contact">
          <span className="footer-label">Connect</span>
          <a href="tel:6913001300"><Phone size={16} /> 6913001300</a>
          <a href="mailto:amritvelatrustlive@gmail.com"><Mail size={16} /> amritvelatrustlive@gmail.com</a>
          <div><MapPin size={16} /> Ulhasnagar, Maharashtra</div>
          <a
            href="https://wa.me/916913001300"
            target="_blank"
            rel="noreferrer"
            className="footer-whatsapp"
          >
            WhatsApp the Trust <ArrowUpRight size={15} />
          </a>
        </div>
      </div>

      <div className="container footer-bottom">
        <span>© {new Date().getFullYear()} Amrit Vela Trust. All rights reserved.</span>
        <div>
          <Link href="/legal/privacy">Privacy</Link>
          <Link href="/legal/terms">Terms</Link>
          <Link href="/legal/refund">Refund</Link>
          <Link href="/legal/donation">Donation Policy</Link>
          <Link href="/legal/shipping">Shipping</Link>
        </div>
      </div>
    </footer>
  );
}
