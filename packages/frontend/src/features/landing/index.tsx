import { useState } from 'react';
import { useNavigate } from 'react-router';
import { QuroLogo } from '@/components/ui/QuroLogo';
import {
  X,
  Eye,
  EyeOff,
  ArrowRight,
  Check,
  BarChart2,
  PiggyBank,
  TrendingUp,
  Home,
  Target,
  Wallet,
  ShieldCheck,
  Briefcase,
  Globe,
  Lock,
  Sparkles,
  ChevronRight,
  Menu,
} from 'lucide-react';
import { useAuth } from '@/lib/AuthContext';

type ModalType = 'signin' | 'signup' | null;

// ─── Sign In Modal ────────────────────────────────────────────────────────────

function SignInModal({
  onClose,
  onSwitchToSignUp,
}: {
  onClose: () => void;
  onSwitchToSignUp: () => void;
}) {
  const navigate = useNavigate();
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const validate = () => {
    const e: Record<string, string> = {};
    if (!email.trim()) e.email = 'Email is required';
    else if (!/\S+@\S+\.\S+/.test(email)) e.email = 'Enter a valid email';
    if (!password.trim()) e.password = 'Password is required';
    return e;
  };

  const handleSignIn = async () => {
    const e = validate();
    if (Object.keys(e).length) {
      setErrors(e);
      return;
    }
    setLoading(true);
    try {
      await signIn(email, password);
      void navigate('/');
    } catch (err: any) {
      setErrors({ email: err?.response?.data?.error || 'Sign in failed' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden">
        <div className="bg-gradient-to-br from-[#0a0f1e] to-[#1a2550] px-8 pt-8 pb-10 text-center relative">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-2 rounded-xl hover:bg-white/10 text-slate-400 hover:text-white transition-colors"
          >
            <X size={16} />
          </button>
          <div className="flex justify-center mb-4">
            <QuroLogo size={52} showBg={false} />
          </div>
          <h2 className="font-black text-white text-2xl tracking-tight">Welcome back</h2>
          <p className="text-indigo-300 text-sm mt-1">Sign in to your Quro account</p>
        </div>

        <div className="px-8 py-7 space-y-4 text-slate-900">
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">
              Email address
            </label>
            <input
              type="email"
              autoFocus
              placeholder="you@example.com"
              className={`w-full rounded-xl border px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 transition-all ${errors.email ? 'border-rose-300 bg-rose-50' : 'border-slate-200 bg-slate-50'}`}
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                setErrors((x) => ({ ...x, email: '' }));
              }}
            />
            {errors.email && <p className="text-xs text-rose-500 mt-1">{errors.email}</p>}
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-xs font-semibold text-slate-600">Password</label>
            </div>
            <div className="relative">
              <input
                type={showPw ? 'text' : 'password'}
                placeholder="••••••••"
                className={`w-full rounded-xl border px-4 py-3 pr-11 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 transition-all ${errors.password ? 'border-rose-300 bg-rose-50' : 'border-slate-200 bg-slate-50'}`}
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setErrors((x) => ({ ...x, password: '' }));
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void handleSignIn();
                }}
              />
              <button
                onClick={() => setShowPw(!showPw)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            {errors.password && <p className="text-xs text-rose-500 mt-1">{errors.password}</p>}
          </div>

          <button
            onClick={() => {
              void handleSignIn();
            }}
            disabled={loading}
            className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white rounded-xl py-3 text-sm font-semibold transition-all flex items-center justify-center gap-2 mt-2"
          >
            {loading ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />{' '}
                Signing in…
              </>
            ) : (
              <>
                <span>Sign In</span>
                <ArrowRight size={15} />
              </>
            )}
          </button>

          <p className="text-center text-sm text-slate-500 pt-1">
            Don't have an account?{' '}
            <button
              onClick={onSwitchToSignUp}
              className="text-indigo-600 font-semibold hover:text-indigo-800 transition-colors"
            >
              Sign up free
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}

// ─── Sign Up Modal ────────────────────────────────────────────────────────────

function SignUpModal({
  onClose,
  onSwitchToSignIn,
}: {
  onClose: () => void;
  onSwitchToSignIn: () => void;
}) {
  const navigate = useNavigate();
  const { signUp } = useAuth();
  const [form, setForm] = useState({ name: '', email: '', password: '', confirm: '' });
  const [showPw, setShowPw] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const set = (field: string, val: string) => {
    setForm((f) => ({ ...f, [field]: val }));
    setErrors((e) => ({ ...e, [field]: '' }));
  };

  const validate = () => {
    const e: Record<string, string> = {};
    if (!form.name.trim()) e.name = 'Full name is required';
    if (!form.email.trim()) e.email = 'Email is required';
    else if (!/\S+@\S+\.\S+/.test(form.email)) e.email = 'Enter a valid email';
    if (!form.password) e.password = 'Password is required';
    else if (form.password.length < 8) e.password = 'At least 8 characters';
    if (form.confirm !== form.password) e.confirm = "Passwords don't match";
    return e;
  };

  const handleSignUp = async () => {
    const e = validate();
    if (Object.keys(e).length) {
      setErrors(e);
      return;
    }
    setLoading(true);
    try {
      await signUp(form.name, form.email, form.password);
      void navigate('/');
    } catch (err: any) {
      setErrors({ email: err?.response?.data?.error || 'Sign up failed' });
    } finally {
      setLoading(false);
    }
  };

  const strengthScore = [
    form.password.length >= 8,
    /[A-Z]/.test(form.password),
    /[0-9]/.test(form.password),
    /[^A-Za-z0-9]/.test(form.password),
  ].filter(Boolean).length;
  const strengthLabel = ['', 'Weak', 'Fair', 'Good', 'Strong'][strengthScore];
  const strengthColor = ['', 'bg-rose-400', 'bg-amber-400', 'bg-blue-400', 'bg-emerald-500'][
    strengthScore
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden max-h-[95vh] flex flex-col">
        <div className="bg-gradient-to-br from-[#0a0f1e] to-[#1a2550] px-8 pt-8 pb-10 text-center relative flex-shrink-0">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-2 rounded-xl hover:bg-white/10 text-slate-400 hover:text-white transition-colors"
          >
            <X size={16} />
          </button>
          <div className="flex justify-center mb-4">
            <QuroLogo size={52} showBg={false} />
          </div>
          <h2 className="font-black text-white text-2xl tracking-tight">Create your account</h2>
          <p className="text-indigo-300 text-sm mt-1">Start tracking your finances for free</p>
        </div>

        <div className="px-8 py-7 space-y-4 overflow-y-auto text-slate-900">
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">Full name</label>
            <input
              type="text"
              autoFocus
              placeholder="e.g. John Smith"
              className={`w-full rounded-xl border px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 transition-all ${errors.name ? 'border-rose-300 bg-rose-50' : 'border-slate-200 bg-slate-50'}`}
              value={form.name}
              onChange={(e) => set('name', e.target.value)}
            />
            {errors.name && <p className="text-xs text-rose-500 mt-1">{errors.name}</p>}
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">
              Email address
            </label>
            <input
              type="email"
              placeholder="you@example.com"
              className={`w-full rounded-xl border px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 transition-all ${errors.email ? 'border-rose-300 bg-rose-50' : 'border-slate-200 bg-slate-50'}`}
              value={form.email}
              onChange={(e) => set('email', e.target.value)}
            />
            {errors.email && <p className="text-xs text-rose-500 mt-1">{errors.email}</p>}
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">Password</label>
            <div className="relative">
              <input
                type={showPw ? 'text' : 'password'}
                placeholder="Min. 8 characters"
                className={`w-full rounded-xl border px-4 py-3 pr-11 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 transition-all ${errors.password ? 'border-rose-300 bg-rose-50' : 'border-slate-200 bg-slate-50'}`}
                value={form.password}
                onChange={(e) => set('password', e.target.value)}
              />
              <button
                onClick={() => setShowPw(!showPw)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            {errors.password && <p className="text-xs text-rose-500 mt-1">{errors.password}</p>}
            {form.password && (
              <div className="mt-2 flex items-center gap-2">
                <div className="flex gap-1 flex-1">
                  {[1, 2, 3, 4].map((i) => (
                    <div
                      key={i}
                      className={`h-1 flex-1 rounded-full transition-all ${i <= strengthScore ? strengthColor : 'bg-slate-200'}`}
                    />
                  ))}
                </div>
                <span
                  className={`text-[10px] font-semibold ${strengthScore <= 1 ? 'text-rose-500' : strengthScore === 2 ? 'text-amber-500' : strengthScore === 3 ? 'text-blue-500' : 'text-emerald-600'}`}
                >
                  {strengthLabel}
                </span>
              </div>
            )}
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">
              Confirm password
            </label>
            <div className="relative">
              <input
                type={showConfirm ? 'text' : 'password'}
                placeholder="Re-enter password"
                className={`w-full rounded-xl border px-4 py-3 pr-11 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 transition-all ${errors.confirm ? 'border-rose-300 bg-rose-50' : 'border-slate-200 bg-slate-50'}`}
                value={form.confirm}
                onChange={(e) => set('confirm', e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void handleSignUp();
                }}
              />
              <button
                onClick={() => setShowConfirm(!showConfirm)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                {showConfirm ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            {errors.confirm && <p className="text-xs text-rose-500 mt-1">{errors.confirm}</p>}
          </div>

          <button
            onClick={() => {
              void handleSignUp();
            }}
            disabled={loading}
            className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white rounded-xl py-3 text-sm font-semibold transition-all flex items-center justify-center gap-2 mt-2"
          >
            {loading ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />{' '}
                Creating account…
              </>
            ) : (
              <>
                <Sparkles size={15} />
                <span>Create Free Account</span>
              </>
            )}
          </button>

          <p className="text-center text-sm text-slate-500 pb-1">
            Already have an account?{' '}
            <button
              onClick={onSwitchToSignIn}
              className="text-indigo-600 font-semibold hover:text-indigo-800 transition-colors"
            >
              Sign in
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}

// ─── App Preview Mockup ───────────────────────────────────────────────────────

function AppPreview() {
  const bars = [38, 52, 47, 63, 68, 75, 72, 84, 80, 91, 96, 100];
  return (
    <div className="relative w-full max-w-sm mx-auto">
      <div className="absolute -inset-4 bg-indigo-600/20 rounded-3xl blur-2xl" />
      <div className="relative bg-[#0e1729] border border-white/10 rounded-2xl shadow-2xl overflow-hidden">
        <div className="flex items-center gap-1.5 px-4 pt-4 pb-3 border-b border-white/5">
          <div className="w-2.5 h-2.5 rounded-full bg-rose-500/70" />
          <div className="w-2.5 h-2.5 rounded-full bg-amber-400/70" />
          <div className="w-2.5 h-2.5 rounded-full bg-emerald-500/70" />
          <div className="flex-1 flex items-center justify-center gap-2 ml-2">
            <QuroLogo size={14} showBg={false} />
            <span className="text-[10px] font-bold text-white/60">Quro · Dashboard</span>
          </div>
        </div>

        <div className="p-4 space-y-3">
          <div className="bg-gradient-to-br from-indigo-600 to-purple-700 rounded-xl p-4">
            <p className="text-indigo-200 text-[10px] font-medium mb-1 uppercase tracking-wider">
              Total Net Worth
            </p>
            <p className="text-white text-2xl font-black tracking-tight">€487,250</p>
            <div className="flex items-center gap-1 mt-1">
              <span className="text-emerald-300 text-[10px] font-semibold">↑ +€12,340</span>
              <span className="text-indigo-300 text-[10px]">this month</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            {[
              { label: 'Savings', value: '€42,600', color: 'text-emerald-400' },
              { label: 'Investments', value: '€128,400', color: 'text-indigo-400' },
              { label: 'Property Equity', value: '€143,400', color: 'text-violet-400' },
              { label: 'Pension', value: '€89,250', color: 'text-amber-400' },
            ].map(({ label, value, color }) => (
              <div key={label} className="bg-white/5 rounded-xl p-3">
                <p className="text-slate-400 text-[9px] uppercase tracking-wide mb-1">{label}</p>
                <p className={`text-sm font-bold ${color}`}>{value}</p>
              </div>
            ))}
          </div>

          <div className="bg-white/5 rounded-xl p-3">
            <div className="flex items-center justify-between mb-2">
              <p className="text-slate-400 text-[9px] uppercase tracking-wide">Net Worth · 12m</p>
              <span className="text-emerald-400 text-[9px] font-semibold">+34.2%</span>
            </div>
            <div className="flex items-end gap-0.5 h-10">
              {bars.map((h, i) => (
                <div
                  key={i}
                  className="flex-1 rounded-sm"
                  style={{
                    height: `${h}%`,
                    background:
                      i === bars.length - 1
                        ? 'linear-gradient(to top, #6366f1, #a78bfa)'
                        : 'rgba(99,102,241,0.3)',
                  }}
                />
              ))}
            </div>
            <div className="flex justify-between mt-1.5">
              <span className="text-slate-500 text-[8px]">Mar 25</span>
              <span className="text-slate-500 text-[8px]">Feb 26</span>
            </div>
          </div>

          <div className="flex items-center gap-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl px-3 py-2.5">
            <div className="w-6 h-6 rounded-lg bg-emerald-500/20 flex items-center justify-center flex-shrink-0">
              <Check size={11} className="text-emerald-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-emerald-300 text-[10px] font-semibold">Budget on track</p>
              <p className="text-slate-400 text-[9px]">68% of monthly budget used</p>
            </div>
            <ChevronRight size={12} className="text-slate-500 flex-shrink-0" />
          </div>
        </div>
      </div>

      <div className="absolute -left-8 top-16 bg-white rounded-2xl shadow-xl px-3 py-2.5 border border-slate-100 hidden lg:block">
        <p className="text-[9px] text-slate-400 mb-0.5">Monthly Salary</p>
        <p className="text-sm font-bold text-slate-800">€4,495</p>
        <p className="text-[9px] text-emerald-500">↑ Take-home</p>
      </div>

      <div className="absolute -right-6 bottom-20 bg-white rounded-2xl shadow-xl px-3 py-2.5 border border-slate-100 hidden lg:block">
        <p className="text-[9px] text-slate-400 mb-0.5">LTV Ratio</p>
        <p className="text-sm font-bold text-slate-800">60.4%</p>
        <p className="text-[9px] text-indigo-500">Good — below 70%</p>
      </div>
    </div>
  );
}

// ─── Features ─────────────────────────────────────────────────────────────────

const features = [
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
    desc: 'Log repayments, valuations, and rate changes with a live amortisation view.',
    color: 'bg-sky-50 text-sky-600',
    border: 'hover:border-sky-200',
  },
  {
    icon: ShieldCheck,
    label: 'Pension',
    desc: 'Manage multiple pension pots across countries — ABP, Australian Super, SIPP.',
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

// ─── Navbar ───────────────────────────────────────────────────────────────────

function Navbar({ onSignIn, onSignUp }: { onSignIn: () => void; onSignUp: () => void }) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <nav className="sticky top-0 z-40 border-b border-white/10 bg-[#0a0f1e]/90 backdrop-blur-md">
      <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <QuroLogo size={32} showBg={false} />
          <span className="font-black text-white text-lg tracking-tight">Quro</span>
        </div>

        <div className="hidden md:flex items-center gap-6 text-sm text-slate-400">
          {['Features', 'How it works'].map((l) => (
            <a
              key={l}
              href={`#${l.toLowerCase().replace(/\s+/g, '-')}`}
              className="hover:text-white transition-colors"
            >
              {l}
            </a>
          ))}
        </div>

        <div className="hidden md:flex items-center gap-3">
          <button
            onClick={onSignIn}
            className="text-sm font-medium text-slate-300 hover:text-white px-4 py-2 rounded-xl hover:bg-white/5 transition-all"
          >
            Sign In
          </button>
          <button
            onClick={onSignUp}
            className="text-sm font-semibold bg-indigo-600 hover:bg-indigo-500 text-white px-5 py-2 rounded-xl transition-all shadow-lg shadow-indigo-600/30"
          >
            Get Started
          </button>
        </div>

        <button
          onClick={() => setMenuOpen(!menuOpen)}
          className="md:hidden p-2 rounded-xl hover:bg-white/5 text-slate-400 hover:text-white"
        >
          {menuOpen ? <X size={20} /> : <Menu size={20} />}
        </button>
      </div>

      {menuOpen && (
        <div className="md:hidden border-t border-white/10 bg-[#0a0f1e] px-6 py-4 space-y-3">
          {['Features', 'How it works'].map((l) => (
            <a
              key={l}
              href={`#${l.toLowerCase().replace(/\s+/g, '-')}`}
              className="block text-sm text-slate-400 hover:text-white py-1 transition-colors"
            >
              {l}
            </a>
          ))}
          <div className="flex flex-col gap-2 pt-2 border-t border-white/10">
            <button
              onClick={() => {
                onSignIn();
                setMenuOpen(false);
              }}
              className="text-sm font-medium text-white border border-white/20 py-2.5 rounded-xl hover:bg-white/5 transition-all"
            >
              Sign In
            </button>
            <button
              onClick={() => {
                onSignUp();
                setMenuOpen(false);
              }}
              className="text-sm font-semibold bg-indigo-600 hover:bg-indigo-500 text-white py-2.5 rounded-xl transition-all"
            >
              Get Started Free
            </button>
          </div>
        </div>
      )}
    </nav>
  );
}

// ─── Landing Page ─────────────────────────────────────────────────────────────

export function LandingPage() {
  const [modal, setModal] = useState<ModalType>(null);

  return (
    <div className="min-h-screen bg-[#0a0f1e] text-white">
      {modal === 'signin' && (
        <SignInModal onClose={() => setModal(null)} onSwitchToSignUp={() => setModal('signup')} />
      )}
      {modal === 'signup' && (
        <SignUpModal onClose={() => setModal(null)} onSwitchToSignIn={() => setModal('signin')} />
      )}

      <Navbar onSignIn={() => setModal('signin')} onSignUp={() => setModal('signup')} />

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-indigo-700/20 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 right-1/4 w-80 h-80 bg-purple-700/20 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-indigo-900/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative max-w-6xl mx-auto px-6 py-20 lg:py-28 grid lg:grid-cols-2 gap-16 items-center">
          <div>
            <div className="inline-flex items-center gap-2 bg-indigo-600/20 border border-indigo-500/30 rounded-full px-4 py-1.5 mb-8">
              <Sparkles size={13} className="text-indigo-400" />
              <span className="text-indigo-300 text-xs font-semibold">
                Personal finance, beautifully simplified
              </span>
            </div>

            <h1 className="font-black text-5xl lg:text-6xl tracking-tight leading-[1.05] mb-6">
              Your finances,{' '}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-purple-400">
                beautifully
              </span>{' '}
              organised.
            </h1>

            <p className="text-slate-400 text-lg leading-relaxed mb-8 max-w-lg">
              Quro unifies your savings, investments, mortgage, pension, salary and budget in one
              elegant dashboard — with full multi-currency support for wherever life takes you.
            </p>

            <div className="flex flex-col sm:flex-row gap-3 mb-10">
              <button
                onClick={() => setModal('signup')}
                className="inline-flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white px-7 py-3.5 rounded-xl font-semibold transition-all shadow-xl shadow-indigo-600/30 hover:shadow-indigo-500/40 hover:-translate-y-0.5"
              >
                <Sparkles size={16} />
                Get started free
                <ArrowRight size={16} />
              </button>
              <button
                onClick={() => setModal('signin')}
                className="inline-flex items-center justify-center gap-2 border border-white/20 hover:border-white/40 text-slate-300 hover:text-white px-7 py-3.5 rounded-xl font-medium transition-all hover:bg-white/5"
              >
                Sign in to your account
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-5 text-xs text-slate-500">
              {[
                { icon: Lock, text: 'Secure authentication' },
                { icon: Globe, text: '10+ currencies supported' },
                { icon: Check, text: 'No credit card required' },
              ].map(({ icon: Icon, text }) => (
                <div key={text} className="flex items-center gap-1.5">
                  <Icon size={12} className="text-indigo-400" />
                  <span>{text}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="flex justify-center lg:justify-end">
            <AppPreview />
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="bg-white text-slate-900 py-20">
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center mb-14">
            <p className="text-xs font-semibold text-indigo-600 uppercase tracking-widest mb-3">
              Everything you need
            </p>
            <h2 className="font-black text-4xl tracking-tight text-slate-900 mb-4">
              One app. Every financial category.
            </h2>
            <p className="text-slate-500 max-w-lg mx-auto">
              Stop juggling spreadsheets. Quro gives you a dedicated tracker for every part of your
              financial life.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {features.map(({ icon: Icon, label, desc, color, border }) => (
              <div
                key={label}
                className={`bg-white border border-slate-100 rounded-2xl p-5 hover:shadow-lg transition-all duration-200 cursor-default ${border}`}
              >
                <div
                  className={`w-10 h-10 rounded-xl flex items-center justify-center mb-4 ${color}`}
                >
                  <Icon size={18} />
                </div>
                <p className="font-bold text-slate-800 mb-1.5">{label}</p>
                <p className="text-sm text-slate-500 leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how-it-works" className="bg-slate-50 text-slate-900 py-20">
        <div className="max-w-5xl mx-auto px-6">
          <div className="text-center mb-14">
            <p className="text-xs font-semibold text-indigo-600 uppercase tracking-widest mb-3">
              Simple by design
            </p>
            <h2 className="font-black text-4xl tracking-tight text-slate-900">
              Up and running in minutes
            </h2>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {[
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
                desc: 'Enter your savings, investments, mortgage, salary and pension details.',
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
            ].map(({ step, title, desc, icon: Icon, color }) => (
              <div key={step}>
                <div
                  className={`w-12 h-12 rounded-2xl flex items-center justify-center mb-4 ${color}`}
                >
                  <Icon size={22} />
                </div>
                <p className="text-[10px] font-bold text-slate-400 tracking-widest uppercase mb-1.5">
                  Step {step}
                </p>
                <h3 className="font-bold text-slate-900 mb-2">{title}</h3>
                <p className="text-sm text-slate-500 leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pillars */}
      <section className="bg-white text-slate-900 py-20 border-t border-slate-100">
        <div className="max-w-5xl mx-auto px-6">
          <div className="grid md:grid-cols-3 gap-6">
            {[
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
            ].map(({ icon: Icon, title, desc, color }) => (
              <div
                key={title}
                className="rounded-2xl border border-slate-100 p-6 hover:shadow-md transition-shadow"
              >
                <div
                  className={`w-10 h-10 rounded-xl flex items-center justify-center mb-4 ${color}`}
                >
                  <Icon size={18} className="text-white" />
                </div>
                <h3 className="font-bold text-slate-900 mb-2">{title}</h3>
                <p className="text-sm text-slate-500 leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="relative bg-[#0a0f1e] py-24 overflow-hidden">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-0 left-1/3 w-96 h-96 bg-indigo-700/20 rounded-full blur-3xl" />
          <div className="absolute bottom-0 right-1/3 w-64 h-64 bg-purple-700/20 rounded-full blur-3xl" />
        </div>
        <div className="relative max-w-3xl mx-auto px-6 text-center">
          <div className="flex justify-center mb-8">
            <QuroLogo size={64} showBg />
          </div>
          <h2 className="font-black text-4xl lg:text-5xl tracking-tight mb-5">
            Take control of your{' '}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-purple-400">
              financial future
            </span>
          </h2>
          <p className="text-slate-400 text-lg mb-8 max-w-xl mx-auto">
            Join Quro and get the clarity your finances deserve — completely free.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <button
              onClick={() => setModal('signup')}
              className="inline-flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white px-8 py-4 rounded-xl font-semibold transition-all shadow-xl shadow-indigo-600/30 hover:-translate-y-0.5"
            >
              <Sparkles size={16} />
              Create free account
              <ArrowRight size={16} />
            </button>
            <button
              onClick={() => setModal('signin')}
              className="inline-flex items-center justify-center gap-2 border border-white/20 hover:border-white/40 text-slate-300 hover:text-white px-8 py-4 rounded-xl font-medium transition-all hover:bg-white/5"
            >
              Sign in
            </button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-[#060b17] border-t border-white/5 py-10">
        <div className="max-w-6xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <QuroLogo size={24} showBg={false} />
            <span className="font-bold text-white text-sm">Quro</span>
            <span className="text-slate-600 text-sm">· Personal Finance</span>
          </div>
          <div className="flex items-center gap-6 text-xs text-slate-600">
            {['Privacy', 'Terms'].map((l) => (
              <a key={l} href="#" className="hover:text-slate-400 transition-colors">
                {l}
              </a>
            ))}
          </div>
          <p className="text-xs text-slate-700">© 2026 Quro. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
