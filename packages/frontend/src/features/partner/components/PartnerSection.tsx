import { TEXT_FIELD_LIMITS } from '@quro/shared';
import { useState } from 'react';
import type { PartnerLink } from '@quro/shared';
import { Check, Heart, Send, Unlink, X } from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  FormField,
  LoadingState,
  PanelHeader,
  TextInput,
} from '@/components/ui';
import { resolveApiErrorMessage } from '@/lib/api';
import { getUserDisplayName, getUserInitials } from '@/lib/user';
import {
  useAcceptPartner,
  useDeclinePartner,
  useInvitePartner,
  usePartner,
  useUnlinkPartner,
} from '../hooks';

function SectionError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p
      role="alert"
      className="rounded-md border border-danger bg-danger-soft px-3 py-2 text-cell text-danger"
    >
      {message}
    </p>
  );
}

// Each state is a plain row inside the section card: identity and status on the left, its
// actions on the right, one line of explanation under it.
const STATE_ROW_CLASS_NAME = 'flex flex-wrap items-center justify-between gap-3';
const STATE_NOTE_CLASS_NAME = 'text-cell text-fg-muted';

function InviteForm() {
  const invite = useInvitePartner();
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleInvite = async () => {
    setError(null);
    try {
      await invite.mutateAsync(email);
    } catch (e: unknown) {
      setError(resolveApiErrorMessage(e, 'Failed to send invitation'));
    }
  };

  return (
    <div className="space-y-3">
      <SectionError message={error} />
      <div>
        <p className="text-body font-medium text-fg">Invite your partner</p>
        <p className={STATE_NOTE_CLASS_NAME}>
          Enter the email of their Quro account on this server. Once they accept, you can mark
          savings accounts, your home, and mortgages as joint.
        </p>
      </div>
      <div className="flex flex-wrap items-end gap-2 max-sm:flex-col max-sm:items-stretch">
        <div className="min-w-0 flex-1">
          <FormField label="Partner's email">
            <TextInput
              type="email"
              value={email}
              maxLength={TEXT_FIELD_LIMITS.partnerInvite.email}
              placeholder="partner@example.com"
              onChange={setEmail}
            />
          </FormField>
        </div>
        <Button
          variant="primary"
          size="md"
          leadingIcon={<Send size={14} />}
          loading={invite.isPending}
          disabled={!email.trim()}
          onClick={() => {
            void handleInvite();
          }}
        >
          Send invite
        </Button>
      </div>
    </div>
  );
}

function PartnerIdentity({ link }: { link: PartnerLink }) {
  return (
    <div className="flex items-center gap-3">
      {/* A brand edge on the brand-soft fill keeps the avatar visible on any surface. */}
      <div
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-brand bg-brand-soft text-label text-brand-fg"
        aria-hidden="true"
      >
        {getUserInitials(link.partner)}
      </div>
      <div>
        <p className="text-body font-medium text-fg">{getUserDisplayName(link.partner)}</p>
        <p className="text-caption text-fg-subtle">{link.partner.email}</p>
      </div>
    </div>
  );
}

function IncomingInvite({ link }: { link: PartnerLink }) {
  const accept = useAcceptPartner();
  const decline = useDeclinePartner();
  const [error, setError] = useState<string | null>(null);

  const run = async (action: () => Promise<unknown>, fallback: string) => {
    setError(null);
    try {
      await action();
    } catch (e: unknown) {
      setError(resolveApiErrorMessage(e, fallback));
    }
  };

  return (
    <div className="space-y-3">
      <SectionError message={error} />
      <div className={STATE_ROW_CLASS_NAME}>
        <div className="flex items-center gap-3">
          <PartnerIdentity link={link} />
          <Badge tone="brand">Invitation</Badge>
        </div>
        <div className="flex items-center gap-2 max-sm:w-full max-sm:*:flex-1">
          <Button
            variant="primary"
            size="sm"
            leadingIcon={<Check size={14} />}
            loading={accept.isPending}
            onClick={() => {
              void run(() => accept.mutateAsync(), 'Failed to accept invitation');
            }}
          >
            Accept
          </Button>
          <Button
            variant="secondary"
            size="sm"
            leadingIcon={<X size={14} />}
            loading={decline.isPending}
            onClick={() => {
              void run(() => decline.mutateAsync(), 'Failed to decline invitation');
            }}
          >
            Decline
          </Button>
        </div>
      </div>
      <p className={STATE_NOTE_CLASS_NAME}>
        {getUserDisplayName(link.partner)} wants to link accounts with you to share joint assets.
      </p>
    </div>
  );
}

function OutgoingInvite({ link }: { link: PartnerLink }) {
  const cancel = useUnlinkPartner();
  const [error, setError] = useState<string | null>(null);

  const handleCancel = async () => {
    setError(null);
    try {
      await cancel.mutateAsync();
    } catch (e: unknown) {
      setError(resolveApiErrorMessage(e, 'Failed to cancel invitation'));
    }
  };

  return (
    <div className="space-y-3">
      <SectionError message={error} />
      <div className={STATE_ROW_CLASS_NAME}>
        <div className="flex items-center gap-3">
          <PartnerIdentity link={link} />
          <Badge tone="info">Invite sent</Badge>
        </div>
        <Button
          variant="secondary"
          size="sm"
          leadingIcon={<X size={14} />}
          loading={cancel.isPending}
          onClick={() => {
            void handleCancel();
          }}
        >
          Cancel invite
        </Button>
      </div>
      <p className={STATE_NOTE_CLASS_NAME}>
        Waiting for {getUserDisplayName(link.partner)} to accept in their settings.
      </p>
    </div>
  );
}

function LinkedPartner({ link }: { link: PartnerLink }) {
  const unlink = useUnlinkPartner();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleUnlink = async () => {
    setError(null);
    try {
      await unlink.mutateAsync();
    } catch (e: unknown) {
      setError(resolveApiErrorMessage(e, 'Failed to unlink partner'));
    }
  };

  return (
    <div className="space-y-3">
      <SectionError message={error} />
      <div className={STATE_ROW_CLASS_NAME}>
        <div className="flex items-center gap-3">
          <PartnerIdentity link={link} />
          <Badge tone="success">
            <Heart size={12} aria-hidden="true" />
            Linked
          </Badge>
        </div>
        {confirming ? (
          <div className="flex items-center gap-2 max-sm:w-full max-sm:*:flex-1">
            <Button variant="secondary" size="sm" onClick={() => setConfirming(false)}>
              Keep linked
            </Button>
            <Button
              variant="dangerSolid"
              size="sm"
              leadingIcon={<Unlink size={14} />}
              loading={unlink.isPending}
              onClick={() => {
                void handleUnlink();
              }}
            >
              Unlink partner
            </Button>
          </div>
        ) : (
          <Button
            variant="danger"
            size="sm"
            leadingIcon={<Unlink size={14} />}
            onClick={() => setConfirming(true)}
          >
            Unlink partner
          </Button>
        )}
      </div>
      {confirming ? (
        <p className="text-cell text-danger">
          Unlinking removes the joint flag from every shared asset — each asset stays with whoever
          created it. This does not delete any data.
        </p>
      ) : (
        <p className={STATE_NOTE_CLASS_NAME}>
          You can mark savings accounts, properties, and mortgages as joint. Joint assets are
          visible and editable by both of you, and count 50/50 in each dashboard.
        </p>
      )}
    </div>
  );
}

function PartnerLinkState({ link }: { link: PartnerLink | null }) {
  if (!link) return <InviteForm />;
  if (link.status === 'accepted') return <LinkedPartner link={link} />;
  return link.role === 'addressee' ? (
    <IncomingInvite link={link} />
  ) : (
    <OutgoingInvite link={link} />
  );
}

/** Settings → Partner: one section card like the other settings sections. */
export function PartnerSection() {
  const { data: link, isLoading } = usePartner();

  return (
    <Card padding="none">
      <PanelHeader
        title="Partner"
        subtitle="Link your account with your partner's to track joint assets together."
      />
      <div className="p-4">
        {isLoading ? (
          <LoadingState compact className="min-h-0 py-8" label="Loading partner" />
        ) : (
          <PartnerLinkState link={link ?? null} />
        )}
      </div>
    </Card>
  );
}
