'use client';

import Link from 'next/link';
import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowRight, HeartHandshake, Menu, ShoppingBag, X } from 'lucide-react';

const links = [
  ['About', '/about'],
  ['Our Work', '/activities'],
  ['Impact', '/achievements'],
  ['Future', '/future-plans'],
  ['Resources', '/shop'],
  ['Contact', '/contact'],
] as const;

export default function SiteNav() {
  const [open, setOpen] = useState(false);

  return (
    <header className="site-nav">
      <div className="nav-shell container">
        <Link href="/" className="brand" onClick={() => setOpen(false)}>
          <span className="brand-mark">
            <img src="/assets/amritvela-logo.png" alt="Amrit Vela Trust" />
          </span>
          <span className="brand-copy">
            <strong>AMRIT VELA</strong>
            <small>TRUST</small>
          </span>
        </Link>

        <nav className="desktop-nav" aria-label="Primary navigation">
          {links.map(([label, href]) => (
            <Link key={href} href={href}>
              {label}
            </Link>
          ))}
        </nav>

        <div className="nav-actions">
          <Link href="/shop" className="nav-icon-link" aria-label="Shop">
            <ShoppingBag size={18} />
          </Link>
          <Link href="/donate" className="btn btn-primary nav-donate">
            <HeartHandshake size={16} />
            Donate
          </Link>
          <button
            type="button"
            className="menu-btn"
            onClick={() => setOpen((value) => !value)}
            aria-label="Toggle navigation"
            aria-expanded={open}
          >
            {open ? <X size={23} /> : <Menu size={23} />}
          </button>
        </div>
      </div>

      <AnimatePresence>
        {open && (
          <motion.div
            className="mobile-nav"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
          >
            <div className="container mobile-nav-inner">
              {links.map(([label, href]) => (
                <Link key={href} href={href} onClick={() => setOpen(false)}>
                  <span>{label}</span>
                  <ArrowRight size={16} />
                </Link>
              ))}
              <Link
                href="/donate"
                className="mobile-donate"
                onClick={() => setOpen(false)}
              >
                <span>Support the Trust</span>
                <HeartHandshake size={17} />
              </Link>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}
