/* eslint-disable max-lines-per-function */
import { useEffect } from 'react';
import type { ElementType } from 'react';
import { useSearchParams } from 'react-router';

import {
  ChevronRight,
  Link2,
  Lock,
  SlidersHorizontal,
  User as UserIcon,
  Users,
} from 'lucide-react';
import { Card, ContentSection, PageStack } from '@/components/ui';
import { useAuth } from '@/lib/AuthContext';
import { getUserDisplayName, getUserInitials } from '@/lib/user';
import { cn } from '@/lib/utils';
import { PartnerSection } from '@/features/partner';

import { ProfileSection } from './components/ProfileSection';
import { SecuritySection } from './components/SecuritySection';
import { PreferencesSection } from './components/PreferencesSection';
import { ConnectionsSection } from './components/ConnectionsSection';
type TabKey = 'profile' | 'security' | 'preferences' | 'partner' | 'connections';

const TABS: ReadonlyArray<{ key: TabKey; label: string; icon: ElementType; subtitle: string }> = [
  { key: 'profile', label: 'Profile', icon: UserIcon, subtitle: 'Name, age, and location' },
  { key: 'security', label: 'Security', icon: Lock, subtitle: 'Password management' },
  {
    key: 'preferences',
    label: 'Preferences',
    icon: SlidersHorizontal,
    subtitle: 'Currency and display defaults',
  },
  {
    key: 'partner',
    label: 'Partner',
    icon: Users,
    subtitle: 'Share joint assets with your partner',
  },
  {
    key: 'connections',
    label: 'Connections',
    icon: Link2,
    subtitle: 'Bank account integrations',
  },
];

const DEFAULT_TAB: TabKey = 'profile';

function resolveActiveTab(value: string | null): TabKey {
  const candidate = TABS.find((tab) => tab.key === value);
  return candidate?.key ?? DEFAULT_TAB;
}

export function Settings() {
  const { user, replaceUser } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = resolveActiveTab(searchParams.get('tab'));
  const appVersion = __APP_VERSION__;

  const setActiveTab = (nextTab: TabKey): void => {
    setSearchParams({ tab: nextTab });
  };

  useEffect(() => {
    const bunqStatus = searchParams.get('bunq');
    if (bunqStatus === 'connected' || bunqStatus === 'error') {
      setSearchParams({ tab: 'connections' }, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!user) return null;

  const initials = getUserInitials(user);
  const fullName = getUserDisplayName(user);
  const activeTabConfig = TABS.find((tab) => tab.key === activeTab) ?? TABS[0]!;

  return (
    <PageStack className="mx-auto max-w-6xl">
      <ContentSection>
        <Card
          padding="none"
          className="overflow-hidden border-0 bg-gradient-to-r from-[#0a0f1e] via-[#172038] to-[#0f3b5f] text-white shadow-xl shadow-slate-300/40"
        >
          <div className="relative overflow-hidden px-6 py-7 lg:px-8">
            <div className="absolute right-0 top-0 h-56 w-56 -translate-y-1/3 translate-x-1/5 rounded-full bg-white/8 blur-3xl" />
            <div className="absolute bottom-0 left-24 h-40 w-40 translate-y-1/2 rounded-full bg-sky-400/10 blur-3xl" />
            <div className="relative z-10 flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
              <div className="flex items-center gap-4">
                <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-gradient-to-br from-indigo-400 to-sky-500 text-xl font-bold text-white shadow-lg shadow-black/20">
                  {initials}
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-sky-200">
                    Account Settings
                  </p>
                  <h2 className="mt-1 text-3xl font-semibold tracking-tight">{fullName}</h2>
                  <p className="mt-1 text-sm text-slate-300">
                    {user.email} · Age {user.age} · {user.location || 'Location not set'}
                  </p>
                </div>
              </div>
              <div className="rounded-3xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-200 backdrop-blur">
                <p className="font-medium text-white">{activeTabConfig.label}</p>
                <p className="mt-1 text-xs text-slate-300">{activeTabConfig.subtitle}</p>
              </div>
            </div>
          </div>
        </Card>
      </ContentSection>

      <ContentSection>
        <div className="flex flex-col gap-6 lg:flex-row">
          <div className="lg:w-64 lg:flex-shrink-0">
            <nav className="hidden lg:flex lg:flex-col lg:gap-2 lg:sticky lg:top-6">
              {TABS.map(({ key, label, icon: Icon, subtitle }) => {
                const isActive = activeTab === key;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setActiveTab(key)}
                    className={cn(
                      'flex w-full items-center gap-3 rounded-3xl border px-4 py-4 text-left transition-all',
                      isActive
                        ? 'border-indigo-600 bg-indigo-600 text-white shadow-md shadow-indigo-200'
                        : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50',
                    )}
                  >
                    <div
                      className={cn(
                        'flex h-10 w-10 items-center justify-center rounded-2xl',
                        isActive ? 'bg-white/15' : 'bg-slate-100',
                      )}
                    >
                      <Icon size={16} className={isActive ? 'text-white' : 'text-slate-500'} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold">{label}</p>
                      <p
                        className={cn(
                          'truncate text-xs',
                          isActive ? 'text-indigo-100' : 'text-slate-400',
                        )}
                      >
                        {subtitle}
                      </p>
                    </div>
                    {isActive ? <ChevronRight size={16} className="ml-auto text-white/70" /> : null}
                  </button>
                );
              })}

              <div className="mt-6 rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3">
                <p className="mb-1 text-[10px] uppercase tracking-widest text-slate-400">
                  App Version
                </p>
                <p className="font-mono text-sm font-semibold text-slate-700">{appVersion}</p>
              </div>
            </nav>

            <div className="flex gap-2 overflow-x-auto pb-1 lg:hidden">
              {TABS.map(({ key, label, icon: Icon }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setActiveTab(key)}
                  className={cn(
                    'flex flex-shrink-0 items-center gap-2 rounded-2xl border px-4 py-2.5 text-sm font-medium transition-colors',
                    activeTab === key
                      ? 'border-indigo-600 bg-indigo-600 text-white'
                      : 'border-slate-200 bg-white text-slate-600',
                  )}
                >
                  <Icon size={14} />
                  {label}
                </button>
              ))}
            </div>
          </div>

          <Card className="flex-1 p-6 lg:p-8">
            {activeTab === 'profile' ? (
              <ProfileSection user={user} replaceUser={replaceUser} initials={initials} />
            ) : null}
            {activeTab === 'security' ? (
              <SecuritySection user={user} replaceUser={replaceUser} />
            ) : null}
            {activeTab === 'preferences' ? (
              <PreferencesSection user={user} replaceUser={replaceUser} />
            ) : null}
            {activeTab === 'partner' ? <PartnerSection /> : null}
            {activeTab === 'connections' ? <ConnectionsSection /> : null}
          </Card>
        </div>
      </ContentSection>
    </PageStack>
  );
}
