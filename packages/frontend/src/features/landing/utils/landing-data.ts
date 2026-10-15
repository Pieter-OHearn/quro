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

// Chart colours follow the asset class: viz-1 savings, viz-2 investments, viz-3 pension,
// viz-4 property.
export const PREVIEW_STATS: readonly LandingPreviewStat[] = [
  { label: 'Savings', value: 42600, dotClassName: 'bg-viz-1' },
  { label: 'Investments', value: 128400, dotClassName: 'bg-viz-2' },
  { label: 'Property equity', value: 143400, dotClassName: 'bg-viz-4' },
  { label: 'Pension', value: 89250, dotClassName: 'bg-viz-3' },
];

export const LANDING_FEATURES: readonly LandingFeature[] = [
  {
    icon: BarChart2,
    label: 'Dashboard',
    desc: 'Your entire financial picture in one beautiful, real-time overview.',
  },
  {
    icon: PiggyBank,
    label: 'Savings',
    desc: 'Track Easy Access accounts and Term Deposits across multiple banks.',
  },
  {
    icon: TrendingUp,
    label: 'Investments',
    desc: 'Monitor your brokerage portfolio and property investments with P&L tracking.',
  },
  {
    icon: Home,
    label: 'Mortgage',
    desc: 'Track mortgage balances, repayments, property-linked leverage, and rate changes.',
  },
  {
    icon: Banknote,
    label: 'Debts',
    desc: 'Track student loans, credit cards, personal loans, car finance, overdrafts, and more.',
  },
  {
    icon: ShieldCheck,
    label: 'Pension',
    desc: 'Manage multiple pension pots across countries — ABP, Australian Super, personal pension.',
  },
  {
    icon: Briefcase,
    label: 'Salary',
    desc: 'Record monthly payslips and track gross-to-net across your career.',
  },
  {
    icon: Target,
    label: 'Goals',
    desc: 'Set savings targets and watch your progress towards each milestone.',
  },
  {
    icon: Wallet,
    label: 'Budget',
    desc: 'Plan monthly spending by category and see where every euro goes.',
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
  },
  {
    step: '02',
    title: 'Add your assets',
    desc: 'Enter your savings, investments, mortgage, debts, salary and pension details.',
    icon: BarChart2,
  },
  {
    step: '03',
    title: 'Watch your wealth grow',
    desc: 'Get a live view of your net worth, goals progress, and spending trends.',
    icon: TrendingUp,
  },
];

export const LANDING_PILLARS: readonly LandingPillar[] = [
  {
    icon: Globe,
    title: 'Multi-currency',
    desc: 'Track assets in EUR, AUD, USD, GBP and more. Set your base currency and every figure converts automatically.',
  },
  {
    icon: Lock,
    title: 'Secure by design',
    desc: 'Session-based authentication with hashed passwords. Your financial data is protected behind your personal account.',
  },
  {
    icon: Sparkles,
    title: 'Beautifully crafted',
    desc: "Clean, fast, and responsive. A personal finance tool that you'll actually enjoy opening every day.",
  },
];
