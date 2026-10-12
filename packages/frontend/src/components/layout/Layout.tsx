import { useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router';
import { Settings, ChevronLeft, ChevronRight, Menu, X, LogOut, User } from 'lucide-react';
import { useAuth } from '@/lib/AuthContext';
import { getUserDisplayName } from '@/lib/user';
import { cn } from '@/lib/utils';
import { IconButton, QuroLogo } from '@/components/ui';
import { NotificationBell } from '@/components/notifications';
import { CurrencySelector } from './CurrencySelector';
import { navItems } from './navItems';
import { SidebarButton, SidebarLink } from './SidebarItem';
import { TabBar } from './TabBar';

const SIDEBAR_ID = 'app-sidebar';

// ─── Sidebar ──────────────────────────────────────────────────────────────────

type NavItemsProps = { collapsed: boolean; onNavigate: () => void };

function SidebarNav({ collapsed, onNavigate }: NavItemsProps) {
  // The negative margin and padding leave room for the focus outline of the items at the edges,
  // which the scroll container would otherwise clip. The collapsed sidebar does not scroll,
  // because a scroll container would also clip the label tooltips beside the icons.
  return (
    <nav
      aria-label="Main"
      className={cn('-m-1 flex-1 p-1', collapsed ? 'overflow-visible' : 'overflow-y-auto')}
    >
      <div className="space-y-0.5">
        {navItems.map(({ label, path, icon }) => (
          <SidebarLink
            key={path}
            to={path}
            icon={icon}
            label={label}
            collapsed={collapsed}
            onNavigate={onNavigate}
          />
        ))}
      </div>
    </nav>
  );
}

function SidebarBottom({ collapsed, onNavigate }: NavItemsProps) {
  const { signOut } = useAuth();

  return (
    <div className="space-y-0.5 border-t border-border-subtle pt-2">
      <SidebarLink
        to="/settings"
        icon={Settings}
        label="Settings"
        collapsed={collapsed}
        onNavigate={onNavigate}
      />
      <SidebarButton
        icon={LogOut}
        label="Sign out"
        collapsed={collapsed}
        onClick={() => {
          void signOut();
        }}
      />
    </div>
  );
}

type SidebarProps = {
  collapsed: boolean;
  mobileOpen: boolean;
  setCollapsed: (v: boolean) => void;
  setMobileOpen: (v: boolean) => void;
};

// From 1024px the sidebar is part of the page. Below that it is a drawer, opened by the header's
// menu button from 640px and by the tab bar's "More" below 640px. A closed drawer is off screen
// and out of the Tab order and the accessibility tree; visibility is transitioned too, so it only
// turns hidden once the drawer has slid away.
function Sidebar({ collapsed, mobileOpen, setCollapsed, setMobileOpen }: SidebarProps) {
  const ToggleIcon = collapsed ? ChevronRight : ChevronLeft;

  return (
    <aside
      id={SIDEBAR_ID}
      className={cn(
        'fixed lg:relative z-50 h-full flex flex-col gap-2 p-2 border-r border-border-default bg-surface-nav transition-[width,transform,visibility] duration-base ease-standard motion-reduce:transition-none',
        collapsed ? 'w-[72px]' : 'w-52',
        !mobileOpen && 'max-lg:invisible max-lg:-translate-x-full',
      )}
    >
      <div
        className={cn(
          'flex h-10 flex-shrink-0 items-center gap-2 px-2',
          collapsed && 'justify-center',
        )}
      >
        <QuroLogo size={20} className="flex-shrink-0" />
        {!collapsed && <span className="text-title-section text-fg">Quro</span>}
      </div>
      <SidebarNav collapsed={collapsed} onNavigate={() => setMobileOpen(false)} />
      <SidebarBottom collapsed={collapsed} onNavigate={() => setMobileOpen(false)} />
      <button
        type="button"
        aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        onClick={() => setCollapsed(!collapsed)}
        className="hidden lg:flex absolute -right-3 top-4 h-6 w-6 items-center justify-center rounded-md border border-border-default bg-surface text-fg-muted transition-colors duration-fast hover:bg-surface-muted hover:text-fg active:bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus-ring"
      >
        <ToggleIcon size={14} aria-hidden="true" />
      </button>
    </aside>
  );
}

// ─── App Header ───────────────────────────────────────────────────────────────

function ProfileButton() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const userDisplayName = getUserDisplayName(user);

  return (
    <button
      type="button"
      onClick={() => {
        void navigate('/settings?tab=profile');
      }}
      className="flex h-8 max-sm:h-11 items-center gap-2 rounded-md pl-1 pr-2 max-sm:w-11 max-sm:justify-center max-sm:rounded-full max-sm:px-0 text-left transition-colors duration-fast hover:bg-surface-muted active:bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus-ring"
      aria-label="Open profile settings"
    >
      <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-brand-soft text-brand-fg">
        <User size={14} aria-hidden="true" />
      </span>
      <span className="hidden sm:block">
        <span className="block text-label text-fg">{userDisplayName}</span>
        <span className="block text-caption text-fg-subtle">{user?.email}</span>
      </span>
    </button>
  );
}

type AppHeaderProps = {
  mobileOpen: boolean;
  setMobileOpen: (v: boolean) => void;
  currentPageLabel: string;
  today: string;
};

// 48px on desktop; 56px on phones, where the logo takes the place of the menu button because the
// tab bar opens the drawer.
function AppHeader({ mobileOpen, setMobileOpen, currentPageLabel, today }: AppHeaderProps) {
  return (
    <header className="flex h-14 sm:h-12 flex-shrink-0 items-center justify-between gap-2 border-b border-border-default bg-surface-sunken px-4 sm:px-6">
      <div className="flex min-w-0 items-center gap-2">
        <IconButton
          icon={mobileOpen ? X : Menu}
          label={mobileOpen ? 'Close navigation' : 'Open navigation'}
          variant="subtle"
          size="md"
          className="max-sm:hidden lg:hidden text-fg-muted"
          aria-controls={SIDEBAR_ID}
          aria-expanded={mobileOpen}
          onClick={() => setMobileOpen(!mobileOpen)}
        />
        <QuroLogo size={20} className="flex-shrink-0 sm:hidden" />
        <div className="flex min-w-0 items-baseline sm:gap-3">
          <h1 className="truncate text-title-page text-fg">{currentPageLabel}</h1>
          <p className="hidden truncate text-caption text-fg-subtle sm:block">{today}</p>
        </div>
      </div>
      <div className="flex flex-shrink-0 items-center gap-1 sm:gap-2">
        <CurrencySelector />
        <NotificationBell />
        <ProfileButton />
      </div>
    </header>
  );
}

// ─── Layout ───────────────────────────────────────────────────────────────────

export function Layout() {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();
  const today = new Date().toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  const currentPage = navItems.find((item) =>
    item.path === '/' ? location.pathname === '/' : location.pathname.startsWith(item.path),
  );
  const currentPageLabel = location.pathname.startsWith('/settings')
    ? 'Settings'
    : (currentPage?.label ?? 'Dashboard');

  // The page scrolls inside `main`. Below 640px it is padded by the tab bar's height (60px tabs,
  // a 1px top border and the safe area) so nothing ends behind the bar, and `h-dvh` keeps the bar
  // on the visible viewport while a phone browser shows its toolbars.
  return (
    <div className="flex h-dvh bg-surface-sunken overflow-hidden">
      <TabBar
        moreOpen={mobileOpen}
        moreControls={SIDEBAR_ID}
        onMore={() => setMobileOpen(!mobileOpen)}
      />
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-scrim z-40 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}
      <Sidebar
        collapsed={collapsed}
        mobileOpen={mobileOpen}
        setCollapsed={setCollapsed}
        setMobileOpen={setMobileOpen}
      />
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        <AppHeader
          mobileOpen={mobileOpen}
          setMobileOpen={setMobileOpen}
          currentPageLabel={currentPageLabel}
          today={today}
        />
        <main className="flex-1 overflow-y-auto pb-[calc(61px+env(safe-area-inset-bottom))] sm:pb-0">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
