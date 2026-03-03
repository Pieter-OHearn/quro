import type {
  BrandAnatomyItem,
  BrandContextVariant,
  BrandLogoSize,
  BrandPaletteColor,
} from '../types';

export const palette: readonly BrandPaletteColor[] = [
  { name: 'Midnight', hex: '#0d1627', role: 'Background', text: 'text-white' },
  { name: 'Deep Navy', hex: '#1b2550', role: 'Background grad.', text: 'text-white' },
  { name: 'Indigo', hex: '#6366f1', role: 'Tail start', text: 'text-white' },
  { name: 'Violet', hex: '#818cf8', role: 'Tail mid', text: 'text-white' },
  { name: 'Purple', hex: '#c084fc', role: 'Tail tip', text: 'text-white' },
  { name: 'White', hex: '#ffffff', role: 'Mark stroke', text: 'text-slate-700', border: true },
];

export const sizes: readonly BrandLogoSize[] = [
  { label: 'App icon', px: 192 },
  { label: 'Card', px: 96 },
  { label: 'Button', px: 48 },
  { label: 'Favicon', px: 32 },
  { label: 'Sidebar', px: 22 },
];

export const donts: readonly string[] = [
  "Don't rotate the mark",
  "Don't recolour the arc white in light contexts — use the inverted variant",
  "Don't add drop-shadows directly to the SVG mark",
  "Don't stretch or distort proportions",
  "Don't place on busy photographic backgrounds",
];

export const anatomyItems: readonly BrandAnatomyItem[] = [
  { dot: 'bg-white/80', label: 'Q Arc', desc: '315° clockwise ring — the letterform anchor' },
  {
    dot: 'bg-white/10 border border-white/30',
    label: 'Ghost ring',
    desc: 'Full circle at low opacity — depth layer',
  },
  { dot: 'bg-indigo-400', label: 'Tail', desc: 'Bezier sweep, tangent-smooth to arc end' },
  { dot: 'bg-purple-400', label: 'Tail tip', desc: 'Gradient endpoint — growth accent' },
  { dot: 'bg-white/50', label: 'Centre dot', desc: 'Grounds the composition visually' },
];

export const contextVariants: readonly BrandContextVariant[] = [
  { bg: 'bg-[#0d1627]', label: 'Midnight', showBg: false, inverted: false },
  {
    bg: 'bg-gradient-to-br from-indigo-600 to-purple-700',
    label: 'Brand gradient',
    showBg: false,
    inverted: false,
  },
  { bg: 'bg-white border border-slate-100', label: 'White', showBg: true, inverted: false },
  { bg: 'bg-slate-100', label: 'Slate', showBg: false, inverted: true },
];

export const heroTags: readonly string[] = ['Abstract', 'Geometric', 'Finance', 'Growth'];
