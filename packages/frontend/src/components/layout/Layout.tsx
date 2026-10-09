import { useState, useRef, useEffect } from 'react';
import { Outlet, NavLink, useLocation, useNavigate } from 'react-router';
import {
  LayoutDashboard,
  PiggyBank,
  TrendingUp,
  Home,
  Banknote,
  Briefcase,
  Target,
  Wallet,
  Settings,
  ChevronLeft,
  ChevronRight,
  Menu,
  X,
  LogOut,
  User,
  ShieldCheck,
  ChevronDown,
  Check,
  Compass,
} from 'lucide-react';
import { useCurrency, CURRENCY_META, CURRENCY_CODES } from '@/lib/CurrencyContext';
import type { CurrencyCode } from '@/lib/CurrencyContext';
import { useAuth } from '@/lib/AuthContext';
import { getUserDisplayName } from '@/lib/user';
import { QuroLogo } from '@/components/ui';
import { NotificationBell } from '@/components/notifications';

const navItems = [
  { label: 'Dashboard', path: '/', icon: LayoutDashboard },
  { label: 'Plan', path: '/plan', icon: Compass },
  { label: 'Savings', path: '/savings', icon: PiggyBank },
  { label: 'Investments', path: '/investments', icon: TrendingUp },
  { label: 'Pension', path: '/pension', icon: ShieldCheck },
  { label: 'Mortgage', path: '/mortgage', icon: Home },
  { label: 'Debts', path: '/debts', icon: Banknote },
  { label: 'Salary', path: '/salary', icon: Briefcase },
  { label: 'Goals', path: '/goals', icon: Target },
  { label: 'Budget', path: '/budget', icon: Wallet },
];

// ─── Currency Selector ────────────────────────────────────────────────────────

type CurrencyDropdownProps = {
  baseCurrency: CurrencyCode;
  onSelect: (code: CurrencyCode) => void;
};

function formatRatesUpdatedAt(updatedAt: string | null): string {
  if (!updatedAt) return 'Synced FX rates';

  const parsed = new Date(updatedAt);
  if (Number.isNaN(parsed.getTime())) return 'Synced FX rates';

  return `Rates updated ${parsed.toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })}`;
}

type CurrencyDropdownWithRatesProps = CurrencyDropdownProps & {
  ratesUpdatedAt: string | null;
};

function CurrencyDropdown({
  baseCurrency,
  onSelect,
  ratesUpdatedAt,
}: CurrencyDropdownWithRatesProps) {
  return (
    <div className="absolute right-0 top-full mt-2 w-56 bg-surface rounded-2xl border border-border-default shadow-xl z-50 overflow-hidden">
      <div className="px-3 py-2.5 border-b border-border-subtle">
        <p className="text-[10px] font-semibold text-fg-faint uppercase tracking-widest">
          Base Currency
        </p>
        <p className="text-xs text-fg-subtle mt-0.5">All totals convert to this currency</p>
      </div>
      <div className="py-1.5 max-h-72 overflow-y-auto">
        {CURRENCY_CODES.map((code: CurrencyCode) => {
          const m = CURRENCY_META[code];
          const isSelected = code === baseCurrency;
          return (
            <button
              key={code}
              onClick={() => onSelect(code)}
              className={`w-full flex items-center gap-3 px-3 py-2 text-sm hover:bg-surface-sunken transition-colors ${isSelected ? 'text-brand' : 'text-fg-strong'}`}
            >
              <span className="text-base">{m.flag}</span>
              <span className="flex-1 text-left">
                <span className="font-medium">{code}</span>
                <span className="text-fg-faint ml-2 text-xs">{m.name}</span>
              </span>
              {isSelected && <Check size={14} className="text-brand" />}
            </button>
          );
        })}
      </div>
      <div className="border-t border-border-subtle px-3 py-2 text-[11px] text-fg-faint">
        {formatRatesUpdatedAt(ratesUpdatedAt)}
      </div>
    </div>
  );
}

function CurrencySelector() {
  const { baseCurrency, setBaseCurrency, ratesUpdatedAt } = useCurrency();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const meta = CURRENCY_META[baseCurrency];

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-xl border border-border-default hover:bg-surface-sunken text-sm font-medium text-fg-strong transition-colors"
      >
        <span className="text-base leading-none">{meta.flag}</span>
        <span>{baseCurrency}</span>
        <ChevronDown
          size={13}
          className={`text-fg-faint transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {open && (
        <CurrencyDropdown
          baseCurrency={baseCurrency}
          ratesUpdatedAt={ratesUpdatedAt}
          onSelect={(code) => {
            setBaseCurrency(code);
            setOpen(false);
          }}
        />
      )}
    </div>
  );
}

// ─── Sidebar ──────────────────────────────────────────────────────────────────

type NavItemsProps = { collapsed: boolean; pathname: string; onNavigate: () => void };

function SidebarNav({ collapsed, pathname, onNavigate }: NavItemsProps) {
  return (
    <nav className="flex-1 py-4 px-2 space-y-1 overflow-y-auto">
      {!collapsed && (
        <p className="px-3 text-[10px] font-semibold tracking-widest text-fg-subtle uppercase mb-2">
          Menu
        </p>
      )}
      {navItems.map(({ label, path, icon: Icon }) => {
        const isActive = path === '/' ? pathname === '/' : pathname.startsWith(path);
        return (
          <NavLink
            key={path}
            to={path}
            onClick={onNavigate}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-150 relative group
              ${isActive ? 'bg-brand text-fg-inverted shadow-lg shadow-brand-accent/30' : 'text-fg-faint hover:bg-surface/5 hover:text-fg-inverted'}
              ${collapsed ? 'justify-center' : ''}`}
          >
            <Icon size={18} className="flex-shrink-0" />
            {!collapsed && <span className="text-sm font-medium">{label}</span>}
            {collapsed && (
              <div className="absolute left-14 bg-fg-emphasis text-fg-inverted text-xs px-2 py-1 rounded-md opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap z-50 transition-opacity shadow-lg">
                {label}
              </div>
            )}
          </NavLink>
        );
      })}
    </nav>
  );
}

type SidebarBottomProps = {
  collapsed: boolean;
  pathname: string;
  onNavigate: () => void;
};

function SidebarBottom({ collapsed, pathname, onNavigate }: SidebarBottomProps) {
  const { signOut } = useAuth();
  const settingsActive = pathname.startsWith('/settings');

  return (
    <div className="border-t border-fg-inverted/10 px-2 py-3 space-y-1">
      <NavLink
        to="/settings"
        onClick={onNavigate}
        className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all ${
          settingsActive
            ? 'bg-brand text-fg-inverted shadow-lg shadow-brand-accent/30'
            : 'text-fg-faint hover:bg-surface/5 hover:text-fg-inverted'
        } ${collapsed ? 'justify-center' : ''}`}
      >
        <Settings size={18} />
        {!collapsed && <span className="text-sm font-medium">Settings</span>}
      </NavLink>
      <button
        onClick={() => {
          void signOut();
        }}
        className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-fg-faint hover:bg-surface/5 hover:text-fg-inverted transition-all ${collapsed ? 'justify-center' : ''}`}
      >
        <LogOut size={18} />
        {!collapsed && <span className="text-sm font-medium">Sign out</span>}
      </button>
    </div>
  );
}

type SidebarProps = {
  collapsed: boolean;
  mobileOpen: boolean;
  setCollapsed: (v: boolean) => void;
  setMobileOpen: (v: boolean) => void;
  pathname: string;
};

function Sidebar({ collapsed, mobileOpen, setCollapsed, setMobileOpen, pathname }: SidebarProps) {
  return (
    <aside
      className={`fixed lg:relative z-50 h-full flex flex-col bg-surface-inverse text-fg-inverted transition-all duration-300
        ${collapsed ? 'w-[72px]' : 'w-64'}
        ${mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}
    >
      <div
        className={`flex items-center gap-3 px-4 py-5 border-b border-fg-inverted/10 ${collapsed ? 'justify-center' : ''}`}
      >
        <QuroLogo size={36} className="flex-shrink-0" />
        {!collapsed && (
          <div>
            <span className="text-xl font-bold tracking-tight text-fg-inverted">Quro</span>
            <span className="block text-[10px] text-brand-disabled tracking-widest uppercase">
              Finance
            </span>
          </div>
        )}
      </div>
      <SidebarNav
        collapsed={collapsed}
        pathname={pathname}
        onNavigate={() => setMobileOpen(false)}
      />
      <SidebarBottom
        collapsed={collapsed}
        pathname={pathname}
        onNavigate={() => setMobileOpen(false)}
      />
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="hidden lg:flex absolute -right-3 top-20 w-6 h-6 bg-brand rounded-full items-center justify-center shadow-md hover:bg-brand-accent transition-colors"
      >
        {collapsed ? (
          <ChevronRight size={12} className="text-fg-inverted" />
        ) : (
          <ChevronLeft size={12} className="text-fg-inverted" />
        )}
      </button>
    </aside>
  );
}

// ─── App Header ───────────────────────────────────────────────────────────────

type AppHeaderProps = {
  mobileOpen: boolean;
  setMobileOpen: (v: boolean) => void;
  currentPageLabel: string;
  today: string;
};

function AppHeader({ mobileOpen, setMobileOpen, currentPageLabel, today }: AppHeaderProps) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const userDisplayName = getUserDisplayName(user);

  return (
    <header className="bg-surface border-b border-border-default px-6 py-4 flex items-center justify-between flex-shrink-0">
      <div className="flex items-center gap-3">
        <button
          onClick={() => setMobileOpen(!mobileOpen)}
          className="lg:hidden p-2 rounded-lg hover:bg-surface-muted text-fg-muted"
        >
          {mobileOpen ? <X size={20} /> : <Menu size={20} />}
        </button>
        <div>
          <h1 className="font-bold text-fg">{currentPageLabel}</h1>
          <p className="text-xs text-fg-faint">{today}</p>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <CurrencySelector />
        <NotificationBell />
        <button
          type="button"
          onClick={() => {
            void navigate('/settings?tab=profile');
          }}
          className="group flex items-center gap-2 rounded-xl border-l border-border-default pl-3 text-left transition-colors hover:bg-surface-sunken"
          aria-label="Open profile settings"
        >
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-brand-accent to-accent-premium flex items-center justify-center">
            <User size={14} className="text-fg-inverted" />
          </div>
          <div className="hidden sm:block">
            <p className="text-xs font-semibold text-fg-emphasis transition-colors group-hover:text-brand">
              {userDisplayName}
            </p>
            <p className="text-[10px] text-fg-faint transition-colors group-hover:text-fg-subtle">
              {user?.email}
            </p>
          </div>
        </button>
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

  return (
    <div className="flex h-screen bg-surface-sunken overflow-hidden">
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-overlay/50 z-40 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}
      <Sidebar
        collapsed={collapsed}
        mobileOpen={mobileOpen}
        setCollapsed={setCollapsed}
        setMobileOpen={setMobileOpen}
        pathname={location.pathname}
      />
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        <AppHeader
          mobileOpen={mobileOpen}
          setMobileOpen={setMobileOpen}
          currentPageLabel={currentPageLabel}
          today={today}
        />
        <main className="flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
