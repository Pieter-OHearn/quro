import { useEffect } from 'react';
import type { ElementType } from 'react';
import { useSearchParams } from 'react-router';

import { Link2, Lock, ShieldCheck, SlidersHorizontal, User as UserIcon, Users } from 'lucide-react';
import { Badge, Card, ContentSection, PageStack, SegmentedControl } from '@/components/ui';
import { useAuth } from '@/lib/AuthContext';
import { getUserDisplayName, getUserInitials } from '@/lib/user';
import { cn } from '@/lib/utils';
import { PartnerSection } from '@/features/partner';

import { ProfileSection } from './components/ProfileSection';
import { SecuritySection } from './components/SecuritySection';
import { PreferencesSection } from './components/PreferencesSection';
import { ConnectionsSection } from './components/ConnectionsSection';
type TabKey = 'profile' | 'security' | 'preferences' | 'partner' | 'connections';

const TABS: ReadonlyArray<{ key: TabKey; label: string; icon: ElementType }> = [
  { key: 'profile', label: 'Profile', icon: UserIcon },
  { key: 'security', label: 'Security', icon: Lock },
  { key: 'preferences', label: 'Preferences', icon: SlidersHorizontal },
  { key: 'partner', label: 'Partner', icon: Users },
  { key: 'connections', label: 'Connections', icon: Link2 },
];

const DEFAULT_TAB: TabKey = 'profile';

function resolveActiveTab(value: string | null): TabKey {
  const candidate = TABS.find((tab) => tab.key === value);
  return candidate?.key ?? DEFAULT_TAB;
}

// A settings section row in the side list: 32px high, the current section a `brand-soft` tint.
const NAV_ITEM_CLASS_NAME =
  'flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-cell transition-colors duration-fast focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus-ring';
const NAV_ITEM_REST_CLASS_NAME =
  'text-fg-muted hover:bg-surface-muted hover:text-fg active:bg-surface-muted active:text-fg';
const NAV_ITEM_ACTIVE_CLASS_NAME = 'bg-brand-soft font-semibold text-brand-fg';

const PHONE_TAB_OPTIONS = TABS.map(({ key, label }) => ({ value: key, label }));

type SectionNavProps = {
  activeTab: TabKey;
  onSelect: (tab: TabKey) => void;
  appVersion: string;
};

/** Laptop: a list of sections beside the content. Narrower: underline tabs that scroll sideways. */
function SectionNav({ activeTab, onSelect, appVersion }: Readonly<SectionNavProps>) {
  return (
    <div className="lg:w-52 lg:flex-shrink-0">
      <nav aria-label="Settings sections" className="hidden lg:sticky lg:top-6 lg:block">
        <ul className="space-y-0.5">
          {TABS.map(({ key, label, icon: Icon }) => {
            const isActive = activeTab === key;
            return (
              <li key={key}>
                <button
                  type="button"
                  aria-current={isActive ? 'true' : undefined}
                  onClick={() => onSelect(key)}
                  className={cn(
                    NAV_ITEM_CLASS_NAME,
                    isActive ? NAV_ITEM_ACTIVE_CLASS_NAME : NAV_ITEM_REST_CLASS_NAME,
                  )}
                >
                  <Icon size={16} className="flex-shrink-0" aria-hidden="true" />
                  <span className="truncate">{label}</span>
                </button>
              </li>
            );
          })}
        </ul>
        <div className="mt-4 border-t border-border-default px-2 pt-3">
          <p className="text-label text-fg-muted">App version</p>
          <p className="mt-0.5 font-numeric text-cell text-fg">{appVersion}</p>
        </div>
      </nav>

      <SegmentedControl
        aria-label="Settings sections"
        variant="underline"
        options={PHONE_TAB_OPTIONS}
        value={activeTab}
        onChange={onSelect}
        className="overflow-x-auto lg:hidden"
        buttonClassName="flex-none"
      />
    </div>
  );
}

type AccountSummaryProps = {
  initials: string;
  fullName: string;
  details: string;
};

/** Who is signed in: avatar, name and the profile facts the planning uses. */
function AccountSummary({ initials, fullName, details }: Readonly<AccountSummaryProps>) {
  return (
    <Card className="flex flex-wrap items-center gap-3">
      <span
        className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-brand-soft text-label text-brand-fg"
        aria-hidden="true"
      >
        {initials}
      </span>
      <div className="min-w-0 flex-1">
        <h2 className="truncate text-title-section text-fg">{fullName}</h2>
        <p className="text-caption text-fg-subtle">{details}</p>
      </div>
      <Badge tone="brand" size="md">
        <ShieldCheck size={12} aria-hidden="true" />
        Secure account
      </Badge>
    </Card>
  );
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

  return (
    <PageStack className="mx-auto max-w-6xl">
      <ContentSection>
        <AccountSummary
          initials={initials}
          fullName={fullName}
          details={`${user.email} · Age ${user.age} · ${user.location || 'Location not set'}`}
        />
      </ContentSection>

      <ContentSection>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:gap-6">
          <SectionNav activeTab={activeTab} onSelect={setActiveTab} appVersion={appVersion} />

          <div className="min-w-0 flex-1">
            {activeTab === 'profile' ? (
              <ProfileSection user={user} replaceUser={replaceUser} />
            ) : null}
            {activeTab === 'security' ? (
              <SecuritySection user={user} replaceUser={replaceUser} />
            ) : null}
            {activeTab === 'preferences' ? (
              <PreferencesSection user={user} replaceUser={replaceUser} />
            ) : null}
            {activeTab === 'partner' ? (
              <Card>
                <PartnerSection />
              </Card>
            ) : null}
            {activeTab === 'connections' ? <ConnectionsSection /> : null}
          </div>
        </div>
      </ContentSection>
    </PageStack>
  );
}
