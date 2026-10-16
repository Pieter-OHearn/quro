import { useEffect, useRef, useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router';
import { Settings, ChevronLeft, ChevronRight, Menu, X, LogOut, User } from 'lucide-react';
import { useAuth } from '@/lib/AuthContext';
import { getUserDisplayName } from '@/lib/user';
import { cn } from '@/lib/utils';
import { IconButton, QuroLogo, useFocusTrap } from '@/components/ui';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { NotificationBell } from '@/components/notifications';
import { StaleRatesNotice } from '@/components/finance/StaleRatesNotice';
import { CurrencySelector } from './CurrencySelector';
import { navItems } from './navItems';
import { SidebarButton, SidebarLink } from './SidebarItem';
import { TabBar } from './TabBar';
import { useScrollMemory } from './useScrollMemory';

const SIDEBAR_ID = 'app-sidebar';
// From 1024px the sidebar is part of the page; below it is a drawer (Tailwind's `lg`).
const DESKTOP_MEDIA_QUERY = '(min-width: 1024px)';

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
  /** Whether the sidebar is the drawer (below 1024px) rather than part of the page. */
  isDrawer: boolean;
  mobileOpen: boolean;
  setCollapsed: (v: boolean) => void;
  setMobileOpen: (v: boolean) => void;
};

// From 1024px the sidebar is part of the page. Below that it is a drawer, opened by the header's
// menu button from 640px and by the tab bar's "More" below 640px. A closed drawer is off screen
// and out of the Tab order and the accessibility tree; visibility is transitioned too, so it only
// turns hidden once the drawer has slid away. An open drawer is modal: focus moves into it and
// stays there, Escape or its close button closes it, and focus returns to the control that opened
// it. The drawer is always the full width; only the page sidebar collapses to icons.
function Sidebar({
  collapsed: collapsedPreference,
  isDrawer,
  mobileOpen,
  setCollapsed,
  setMobileOpen,
}: SidebarProps) {
  const collapsed = collapsedPreference && !isDrawer;
  const ToggleIcon = collapsed ? ChevronRight : ChevronLeft;
  const asideRef = useRef<HTMLElement>(null);
  useFocusTrap({
    containerRef: asideRef,
    active: isDrawer && mobileOpen,
    onEscape: () => setMobileOpen(false),
  });

  return (
    <aside
      ref={asideRef}
      id={SIDEBAR_ID}
      aria-label="Navigation"
      tabIndex={-1}
      className={cn(
        'fixed lg:relative z-50 h-full flex flex-col gap-2 p-2 max-lg:pt-[calc(0.5rem+env(safe-area-inset-top))] outline-none border-r border-border-default bg-surface-nav transition-[width,transform,visibility] duration-base ease-standard motion-reduce:transition-none',
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
        <IconButton
          icon={X}
          label="Close navigation"
          variant="subtle"
          size="md"
          className="ml-auto text-fg-muted lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
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
      <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full border border-brand bg-brand-soft text-brand-fg">
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
// tab bar opens the drawer. Below 360px the logo is dropped so the page title keeps its room.
function AppHeader({ mobileOpen, setMobileOpen, currentPageLabel, today }: AppHeaderProps) {
  return (
    <header className="flex h-[calc(3.5rem+env(safe-area-inset-top))] pt-[env(safe-area-inset-top)] sm:h-12 sm:pt-0 flex-shrink-0 items-center justify-between gap-2 border-b border-border-default bg-surface-sunken px-4 sm:px-6">
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
        <QuroLogo size={20} className="flex-shrink-0 sm:hidden max-[359px]:hidden" />
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
  const mainRef = useRef<HTMLElement>(null);
  const isDrawer = !useMediaQuery(DESKTOP_MEDIA_QUERY);
  const drawerOpen = isDrawer && mobileOpen;
  const location = useLocation();
  useScrollMemory(mainRef, location.pathname);
  const today = new Date().toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  // A drawer left open while the window grows to the sidebar layout would reappear open when it
  // shrinks again.
  useEffect(() => {
    if (!isDrawer) setMobileOpen(false);
  }, [isDrawer]);

  const currentPage = navItems.find((item) =>
    item.path === '/' ? location.pathname === '/' : location.pathname.startsWith(item.path),
  );
  const currentPageLabel = location.pathname.startsWith('/settings')
    ? 'Settings'
    : (currentPage?.label ?? 'Dashboard');

  // The page scrolls inside `main`. Below 640px it is padded by the tab bar's height (60px tabs,
  // a 1px top border and the safe area) so nothing ends behind the bar, and `h-dvh` keeps the bar
  // on the visible viewport while a phone browser shows its toolbars. While the drawer is open
  // everything behind it is inert.
  return (
    <div className="flex h-dvh bg-surface-sunken overflow-hidden">
      <div inert={drawerOpen}>
        <TabBar
          moreOpen={mobileOpen}
          moreControls={SIDEBAR_ID}
          onMore={() => setMobileOpen(!mobileOpen)}
        />
      </div>
      {drawerOpen && (
        <div
          aria-hidden="true"
          className="fixed inset-0 bg-scrim z-40"
          onClick={() => setMobileOpen(false)}
        />
      )}
      <Sidebar
        collapsed={collapsed}
        isDrawer={isDrawer}
        mobileOpen={mobileOpen}
        setCollapsed={setCollapsed}
        setMobileOpen={setMobileOpen}
      />
      <div inert={drawerOpen} className="flex-1 flex flex-col overflow-hidden min-w-0">
        <AppHeader
          mobileOpen={mobileOpen}
          setMobileOpen={setMobileOpen}
          currentPageLabel={currentPageLabel}
          today={today}
        />
        <StaleRatesNotice className="rounded-none border-x-0 border-t-0 sm:px-6" />
        <main
          ref={mainRef}
          className="flex-1 overflow-y-auto pb-[calc(61px+env(safe-area-inset-bottom))] sm:pb-0"
        >
          <Outlet />
        </main>
      </div>
    </div>
  );
}
