import {
  Banknote,
  Briefcase,
  Compass,
  Home,
  LayoutDashboard,
  PiggyBank,
  ShieldCheck,
  Target,
  TrendingUp,
  Wallet,
  type LucideIcon,
} from 'lucide-react';

export type NavItem = { label: string; path: string; icon: LucideIcon };

// The app's destinations, labelled as each page names itself. The sidebar lists all of them;
// the phone tab bar shows the paths in `TAB_BAR_PATHS` and reaches the rest through "More".
export const navItems: readonly NavItem[] = [
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

export const TAB_BAR_PATHS = ['/', '/savings', '/investments', '/budget'] as const;
