import { useState } from 'react';
import { Menu, X } from 'lucide-react';
import { Button, IconButton, QuroLogo } from '@/components/ui';
import { cn } from '@/lib/utils';
import { LANDING_NAV_LINKS } from '../utils/landing-data';
import { LANDING_CONTAINER_CLASS_NAME, LANDING_LINK_CLASS_NAME } from './landingStyles';

type NavbarProps = {
  onSignIn: () => void;
  onSignUp: () => void;
};

type NavMobileMenuProps = {
  onSignIn: () => void;
  onSignUp: () => void;
  onClose: () => void;
};

const MOBILE_MENU_ID = 'landing-mobile-menu';

function NavMobileMenu({ onSignIn, onSignUp, onClose }: Readonly<NavMobileMenuProps>) {
  return (
    <div
      id={MOBILE_MENU_ID}
      className="space-y-2 border-t border-border-default bg-surface-sunken px-4 py-3 md:hidden"
    >
      {LANDING_NAV_LINKS.map((link) => (
        <a
          key={link.id}
          href={`#${link.id}`}
          className={cn(LANDING_LINK_CLASS_NAME, 'flex min-h-11 items-center text-body')}
        >
          {link.label}
        </a>
      ))}
      <div className="flex flex-col gap-2 border-t border-border-default pt-3">
        <Button
          variant="secondary"
          fullWidth
          onClick={() => {
            onSignIn();
            onClose();
          }}
        >
          Sign in
        </Button>
        <Button
          variant="secondary"
          fullWidth
          onClick={() => {
            onSignUp();
            onClose();
          }}
        >
          Get started free
        </Button>
      </div>
    </div>
  );
}

export function Navbar({ onSignIn, onSignUp }: Readonly<NavbarProps>) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <nav className="sticky top-0 z-40 border-b border-border-default bg-surface-sunken">
      <div
        className={cn(LANDING_CONTAINER_CLASS_NAME, 'flex h-14 items-center justify-between gap-4')}
      >
        <div className="flex items-center gap-2">
          <QuroLogo size={24} />
          <span className="text-title-section text-fg">Quro</span>
        </div>
        <div className="hidden items-center gap-6 text-cell md:flex">
          {LANDING_NAV_LINKS.map((link) => (
            <a key={link.id} href={`#${link.id}`} className={LANDING_LINK_CLASS_NAME}>
              {link.label}
            </a>
          ))}
        </div>
        {/* The hero holds the one filled button of the first view, so these stay quiet. */}
        <div className="hidden items-center gap-2 md:flex">
          <Button variant="ghost" onClick={onSignIn}>
            Sign in
          </Button>
          <Button variant="secondary" onClick={onSignUp}>
            Get started
          </Button>
        </div>
        <IconButton
          icon={menuOpen ? X : Menu}
          label={menuOpen ? 'Close menu' : 'Open menu'}
          variant="subtle"
          size="lg"
          aria-expanded={menuOpen}
          aria-controls={MOBILE_MENU_ID}
          className="text-fg-muted md:hidden"
          onClick={() => setMenuOpen((current) => !current)}
        />
      </div>
      {menuOpen && (
        <NavMobileMenu onSignIn={onSignIn} onSignUp={onSignUp} onClose={() => setMenuOpen(false)} />
      )}
    </nav>
  );
}
