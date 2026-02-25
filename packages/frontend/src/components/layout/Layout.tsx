import { useState, useRef, useEffect } from "react";
import { Outlet, NavLink, useLocation } from "react-router";
import {
  LayoutDashboard,
  PiggyBank,
  TrendingUp,
  Home,
  Briefcase,
  Target,
  Wallet,
  Bell,
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
} from "lucide-react";
import { useCurrency, CURRENCY_META, CURRENCY_LIST, CurrencyCode } from "@/lib/CurrencyContext";
import { useAuth } from "@/lib/AuthContext";
import { QuroLogo } from "@/components/ui/QuroLogo";

const navItems = [
  { label: "Dashboard",   path: "/",            icon: LayoutDashboard },
  { label: "Savings",     path: "/savings",     icon: PiggyBank },
  { label: "Investments", path: "/investments", icon: TrendingUp },
  { label: "Pension",     path: "/pension",     icon: ShieldCheck },
  { label: "Mortgage",    path: "/mortgage",    icon: Home },
  { label: "Salary",      path: "/salary",      icon: Briefcase },
  { label: "Goals",       path: "/goals",       icon: Target },
  { label: "Budget",      path: "/budget",      icon: Wallet },
];

// ─── Currency Selector ────────────────────────────────────────────────────────

function CurrencySelector() {
  const { baseCurrency, setBaseCurrency } = useCurrency();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const meta = CURRENCY_META[baseCurrency];

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-xl border border-slate-200 hover:bg-slate-50 text-sm font-medium text-slate-700 transition-colors"
      >
        <span className="text-base leading-none">{meta.flag}</span>
        <span>{baseCurrency}</span>
        <ChevronDown size={13} className={`text-slate-400 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-56 bg-white rounded-2xl border border-slate-200 shadow-xl z-50 overflow-hidden">
          <div className="px-3 py-2.5 border-b border-slate-100">
            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest">Base Currency</p>
            <p className="text-xs text-slate-500 mt-0.5">All totals convert to this</p>
          </div>
          <div className="py-1.5 max-h-72 overflow-y-auto">
            {CURRENCY_LIST.map((code: CurrencyCode) => {
              const m = CURRENCY_META[code];
              const isSelected = code === baseCurrency;
              return (
                <button
                  key={code}
                  onClick={() => { setBaseCurrency(code); setOpen(false); }}
                  className={`w-full flex items-center gap-3 px-3 py-2 text-sm hover:bg-slate-50 transition-colors ${isSelected ? "text-indigo-600" : "text-slate-700"}`}
                >
                  <span className="text-base">{m.flag}</span>
                  <span className="flex-1 text-left">
                    <span className="font-medium">{code}</span>
                    <span className="text-slate-400 ml-2 text-xs">{m.name}</span>
                  </span>
                  {isSelected && <Check size={14} className="text-indigo-600" />}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Layout ───────────────────────────────────────────────────────────────────

export function Layout() {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();
  const { user, signOut } = useAuth();
  const today = new Date().toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const currentPage = navItems.find((item) =>
    item.path === "/" ? location.pathname === "/" : location.pathname.startsWith(item.path)
  );

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden">
      {mobileOpen && (
        <div className="fixed inset-0 bg-black/50 z-40 lg:hidden" onClick={() => setMobileOpen(false)} />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed lg:relative z-50 h-full flex flex-col bg-[#0a0f1e] text-white transition-all duration-300
          ${collapsed ? "w-[72px]" : "w-64"}
          ${mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}`}
      >
        {/* Logo */}
        <div className={`flex items-center gap-3 px-4 py-5 border-b border-white/10 ${collapsed ? "justify-center" : ""}`}>
          <QuroLogo
            size={36}
            showBg={false}
            className="flex-shrink-0"
          />
          {!collapsed && (
            <div>
              <span className="text-xl font-bold tracking-tight text-white">Quro</span>
              <span className="block text-[10px] text-indigo-400 tracking-widest uppercase">Finance</span>
            </div>
          )}
        </div>

        {/* Nav */}
        <nav className="flex-1 py-4 px-2 space-y-1 overflow-y-auto">
          {!collapsed && (
            <p className="px-3 text-[10px] font-semibold tracking-widest text-slate-500 uppercase mb-2">Menu</p>
          )}
          {navItems.map(({ label, path, icon: Icon }) => {
            const isActive = path === "/" ? location.pathname === "/" : location.pathname.startsWith(path);
            return (
              <NavLink
                key={path}
                to={path}
                onClick={() => setMobileOpen(false)}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-150 relative group
                  ${isActive ? "bg-indigo-600 text-white shadow-lg shadow-indigo-500/30" : "text-slate-400 hover:bg-white/5 hover:text-white"}
                  ${collapsed ? "justify-center" : ""}`}
              >
                <Icon size={18} className="flex-shrink-0" />
                {!collapsed && <span className="text-sm font-medium">{label}</span>}
                {collapsed && (
                  <div className="absolute left-14 bg-slate-800 text-white text-xs px-2 py-1 rounded-md opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap z-50 transition-opacity shadow-lg">
                    {label}
                  </div>
                )}
              </NavLink>
            );
          })}
        </nav>

        {/* Bottom */}
        <div className="border-t border-white/10 px-2 py-3 space-y-1">
          <button className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-slate-400 hover:bg-white/5 hover:text-white transition-all ${collapsed ? "justify-center" : ""}`}>
            <Settings size={18} />
            {!collapsed && <span className="text-sm font-medium">Settings</span>}
          </button>
          <button onClick={() => signOut()} className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-slate-400 hover:bg-white/5 hover:text-white transition-all ${collapsed ? "justify-center" : ""}`}>
            <LogOut size={18} />
            {!collapsed && <span className="text-sm font-medium">Sign out</span>}
          </button>
        </div>

        {/* Collapse toggle */}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="hidden lg:flex absolute -right-3 top-20 w-6 h-6 bg-indigo-600 rounded-full items-center justify-center shadow-md hover:bg-indigo-500 transition-colors"
        >
          {collapsed ? <ChevronRight size={12} className="text-white" /> : <ChevronLeft size={12} className="text-white" />}
        </button>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        {/* Header */}
        <header className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-3">
            <button onClick={() => setMobileOpen(!mobileOpen)} className="lg:hidden p-2 rounded-lg hover:bg-slate-100 text-slate-600">
              {mobileOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
            <div>
              <h1 className="font-bold text-slate-900">{currentPage?.label ?? "Dashboard"}</h1>
              <p className="text-xs text-slate-400">{today}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {/* Currency selector */}
            <CurrencySelector />

            <button className="relative p-2 rounded-xl hover:bg-slate-100 text-slate-500 hover:text-slate-700 transition-colors">
              <Bell size={18} />
              <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 bg-red-500 rounded-full" />
            </button>
            <div className="flex items-center gap-2 pl-3 border-l border-slate-200">
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
                <User size={14} className="text-white" />
              </div>
              <div className="hidden sm:block">
                <p className="text-xs font-semibold text-slate-800">{user?.name ?? "User"}</p>
                <p className="text-[10px] text-slate-400">{user?.email}</p>
              </div>
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
