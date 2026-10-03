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
  { label: 'Savings', value: '€42,600', color: 'text-success-muted' },
  { label: 'Investments', value: '€128,400', color: 'text-brand-disabled' },
  { label: 'Property Equity', value: '€143,400', color: 'text-accent-creative-muted' },
  { label: 'Pension', value: '€89,250', color: 'text-warning-muted' },
];

export const LANDING_FEATURES: readonly LandingFeature[] = [
  {
    icon: BarChart2,
    label: 'Dashboard',
    desc: 'Your entire financial picture in one beautiful, real-time overview.',
    color: 'bg-brand-soft text-brand',
    border: 'hover:border-brand-tint',
  },
  {
    icon: PiggyBank,
    label: 'Savings',
    desc: 'Track Easy Access accounts and Term Deposits across multiple banks.',
    color: 'bg-success-soft text-success',
    border: 'hover:border-success-border',
  },
  {
    icon: TrendingUp,
    label: 'Investments',
    desc: 'Monitor your brokerage portfolio and property investments with P&L tracking.',
    color: 'bg-accent-creative-soft text-accent-creative',
    border: 'hover:border-accent-creative-border',
  },
  {
    icon: Home,
    label: 'Mortgage',
    desc: 'Track mortgage balances, repayments, property-linked leverage, and rate changes.',
    color: 'bg-info-soft text-info',
    border: 'hover:border-info-border',
  },
  {
    icon: Banknote,
    label: 'Debts',
    desc: 'Track student loans, credit cards, personal loans, car finance, overdrafts, and more.',
    color: 'bg-danger-soft text-danger-hover',
    border: 'hover:border-danger-border',
  },
  {
    icon: ShieldCheck,
    label: 'Pension',
    desc: 'Manage multiple pension pots across countries — ABP, Australian Super, personal pension.',
    color: 'bg-warning-soft text-warning',
    border: 'hover:border-warning-border',
  },
  {
    icon: Briefcase,
    label: 'Salary',
    desc: 'Record monthly payslips and track gross-to-net across your career.',
    color: 'bg-danger-soft text-danger-hover',
    border: 'hover:border-danger-border',
  },
  {
    icon: Target,
    label: 'Goals',
    desc: 'Set savings targets and watch your progress towards each milestone.',
    color: 'bg-accent-secondary-soft text-accent-secondary',
    border: 'hover:border-accent-secondary-border',
  },
  {
    icon: Wallet,
    label: 'Budget',
    desc: 'Plan monthly spending by category and see where every euro goes.',
    color: 'bg-accent-warm-soft text-accent-warm',
    border: 'hover:border-accent-warm-border',
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
    color: 'text-brand bg-brand-soft',
  },
  {
    step: '02',
    title: 'Add your assets',
    desc: 'Enter your savings, investments, mortgage, debts, salary and pension details.',
    icon: BarChart2,
    color: 'text-accent-creative bg-accent-creative-soft',
  },
  {
    step: '03',
    title: 'Watch your wealth grow',
    desc: 'Get a live view of your net worth, goals progress, and spending trends.',
    icon: TrendingUp,
    color: 'text-success bg-success-soft',
  },
];

export const LANDING_PILLARS: readonly LandingPillar[] = [
  {
    icon: Globe,
    title: 'Multi-currency',
    desc: 'Track assets in EUR, AUD, USD, GBP and more. Set your base currency and every figure converts automatically.',
    color: 'bg-brand',
  },
  {
    icon: Lock,
    title: 'Secure by design',
    desc: 'Session-based authentication with hashed passwords. Your financial data is protected behind your personal account.',
    color: 'bg-accent-creative',
  },
  {
    icon: Sparkles,
    title: 'Beautifully crafted',
    desc: "Clean, fast, and responsive. A personal finance tool that you'll actually enjoy opening every day.",
    color: 'bg-accent-premium',
  },
];
