import { useState } from 'react';
import { Menu, X } from 'lucide-react';
import { QuroLogo } from '@/components/ui';
import { LANDING_NAV_LINKS } from '../utils/landing-data';

type NavbarProps = {
  onSignIn: () => void;
  onSignUp: () => void;
};

type NavMobileMenuProps = {
  onSignIn: () => void;
  onSignUp: () => void;
  onClose: () => void;
};

function NavMobileMenu({ onSignIn, onSignUp, onClose }: Readonly<NavMobileMenuProps>) {
  return (
    <div className="md:hidden border-t border-white/10 bg-[#0a0f1e] px-6 py-4 space-y-3">
      {LANDING_NAV_LINKS.map((link) => (
        <a
          key={link.id}
          href={`#${link.id}`}
          className="block text-sm text-slate-400 hover:text-white py-1 transition-colors"
        >
          {link.label}
        </a>
      ))}
      <div className="flex flex-col gap-2 pt-2 border-t border-white/10">
        <button
          onClick={() => {
            onSignIn();
            onClose();
          }}
          className="text-sm font-medium text-white border border-white/20 py-2.5 rounded-xl hover:bg-white/5 transition-all"
        >
          Sign In
        </button>
        <button
          onClick={() => {
            onSignUp();
            onClose();
          }}
          className="text-sm font-semibold bg-indigo-600 hover:bg-indigo-500 text-white py-2.5 rounded-xl transition-all"
        >
          Get Started Free
        </button>
      </div>
    </div>
  );
}

export function Navbar({ onSignIn, onSignUp }: Readonly<NavbarProps>) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <nav className="sticky top-0 z-40 border-b border-white/10 bg-[#0a0f1e]/90 backdrop-blur-md">
      <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <QuroLogo size={32} showBg={false} />
          <span className="font-black text-white text-lg tracking-tight">Quro</span>
        </div>
        <div className="hidden md:flex items-center gap-6 text-sm text-slate-400">
          {LANDING_NAV_LINKS.map((link) => (
            <a key={link.id} href={`#${link.id}`} className="hover:text-white transition-colors">
              {link.label}
            </a>
          ))}
        </div>
        <div className="hidden md:flex items-center gap-3">
          <button
            onClick={onSignIn}
            className="text-sm font-medium text-slate-300 hover:text-white px-4 py-2 rounded-xl hover:bg-white/5 transition-all"
          >
            Sign In
          </button>
          <button
            onClick={onSignUp}
            className="text-sm font-semibold bg-indigo-600 hover:bg-indigo-500 text-white px-5 py-2 rounded-xl transition-all shadow-lg shadow-indigo-600/30"
          >
            Get Started
          </button>
        </div>
        <button
          onClick={() => setMenuOpen((current) => !current)}
          className="md:hidden p-2 rounded-xl hover:bg-white/5 text-slate-400 hover:text-white"
        >
          {menuOpen ? <X size={20} /> : <Menu size={20} />}
        </button>
      </div>
      {menuOpen && (
        <NavMobileMenu onSignIn={onSignIn} onSignUp={onSignUp} onClose={() => setMenuOpen(false)} />
      )}
    </nav>
  );
}
