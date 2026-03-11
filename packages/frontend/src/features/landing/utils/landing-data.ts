import {
  BarChart2,
  Banknote,
  Briefcase,
  Check,
  Globe,
  Home,
  Lock,
  PiggyBank,
  ShieldCheck,
  Sparkles,
  Target,
  TrendingUp,
  Wallet,
} from 'lucide-react';
import type {
  LandingFeature,
  LandingHowItWorksStep,
  LandingNavLink,
  LandingPillar,
  LandingPreviewBar,
  LandingPreviewStat,
  LandingTrustBadge,
} from '../types';

export const PREVIEW_BARS: readonly LandingPreviewBar[] = [
  { id: 'mar-25', height: 38 },
  { id: 'apr-25', height: 52 },
  { id: 'may-25', height: 47 },
  { id: 'jun-25', height: 63 },
  { id: 'jul-25', height: 68 },
  { id: 'aug-25', height: 75 },
  { id: 'sep-25', height: 72 },
  { id: 'oct-25', height: 84 },
  { id: 'nov-25', height: 80 },
  { id: 'dec-25', height: 91 },
  { id: 'jan-26', height: 96 },
  { id: 'feb-26', height: 100 },
];

export const PREVIEW_STATS: readonly LandingPreviewStat[] = [
  { label: 'Savings', value: '€42,600', color: 'text-emerald-400' },
  { label: 'Investments', value: '€128,400', color: 'text-indigo-400' },
  { label: 'Property Equity', value: '€143,400', color: 'text-violet-400' },
  { label: 'Pension', value: '€89,250', color: 'text-amber-400' },
];

export const LANDING_FEATURES: readonly LandingFeature[] = [
  {
    icon: BarChart2,
    label: 'Dashboard',
    desc: 'Your entire financial picture in one beautiful, real-time overview.',
    color: 'bg-indigo-50 text-indigo-600',
    border: 'hover:border-indigo-200',
  },
  {
    icon: PiggyBank,
    label: 'Savings',
    desc: 'Track Easy Access accounts and Term Deposits across multiple banks.',
    color: 'bg-emerald-50 text-emerald-600',
    border: 'hover:border-emerald-200',
  },
  {
    icon: TrendingUp,
    label: 'Investments',
    desc: 'Monitor your brokerage portfolio and property investments with P&L tracking.',
    color: 'bg-violet-50 text-violet-600',
    border: 'hover:border-violet-200',
  },
  {
    icon: Home,
    label: 'Mortgage',
    desc: 'Track mortgage balances, repayments, property-linked leverage, and rate changes.',
    color: 'bg-sky-50 text-sky-600',
    border: 'hover:border-sky-200',
  },
  {
    icon: Banknote,
    label: 'Debts',
    desc: 'Track student loans, credit cards, personal loans, car finance, overdrafts, and more.',
    color: 'bg-rose-50 text-rose-600',
    border: 'hover:border-rose-200',
  },
  {
    icon: ShieldCheck,
    label: 'Pension',
    desc: 'Manage multiple pension pots across countries — ABP, Australian Super, personal pension.',
    color: 'bg-amber-50 text-amber-600',
    border: 'hover:border-amber-200',
  },
  {
    icon: Briefcase,
    label: 'Salary',
    desc: 'Record monthly payslips and track gross-to-net across your career.',
    color: 'bg-rose-50 text-rose-600',
    border: 'hover:border-rose-200',
  },
  {
    icon: Target,
    label: 'Goals',
    desc: 'Set savings targets and watch your progress towards each milestone.',
    color: 'bg-teal-50 text-teal-600',
    border: 'hover:border-teal-200',
  },
  {
    icon: Wallet,
    label: 'Budget',
    desc: 'Plan monthly spending by category and see where every euro goes.',
    color: 'bg-orange-50 text-orange-600',
    border: 'hover:border-orange-200',
  },
];

export const LANDING_NAV_LINKS: readonly LandingNavLink[] = [
  { id: 'features', label: 'Features' },
  { id: 'how-it-works', label: 'How it works' },
];

export const HERO_TRUST_BADGES: readonly LandingTrustBadge[] = [
  { icon: Lock, text: 'Secure authentication' },
  { icon: Globe, text: '10+ currencies supported' },
  { icon: Check, text: 'No credit card required' },
];

export const HOW_IT_WORKS_STEPS: readonly LandingHowItWorksStep[] = [
  {
    step: '01',
    title: 'Create your account',
    desc: 'Sign up in seconds — no credit card, no subscriptions, no nonsense.',
    icon: Sparkles,
    color: 'text-indigo-600 bg-indigo-50',
  },
  {
    step: '02',
    title: 'Add your assets',
    desc: 'Enter your savings, investments, mortgage, debts, salary and pension details.',
    icon: BarChart2,
    color: 'text-violet-600 bg-violet-50',
  },
  {
    step: '03',
    title: 'Watch your wealth grow',
    desc: 'Get a live view of your net worth, goals progress, and spending trends.',
    icon: TrendingUp,
    color: 'text-emerald-600 bg-emerald-50',
  },
];

export const LANDING_PILLARS: readonly LandingPillar[] = [
  {
    icon: Globe,
    title: 'Multi-currency',
    desc: 'Track assets in EUR, AUD, USD, GBP and more. Set your base currency and every figure converts automatically.',
    color: 'bg-indigo-600',
  },
  {
    icon: Lock,
    title: 'Secure by design',
    desc: 'Session-based authentication with hashed passwords. Your financial data is protected behind your personal account.',
    color: 'bg-violet-600',
  },
  {
    icon: Sparkles,
    title: 'Beautifully crafted',
    desc: "Clean, fast, and responsive. A personal finance tool that you'll actually enjoy opening every day.",
    color: 'bg-purple-600',
  },
];
