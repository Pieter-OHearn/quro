import { useState } from 'react';
import type { PartnerLink } from '@quro/shared';
import { Check, Heart, Send, Unlink, X } from 'lucide-react';
import { Badge, Button, FormField, TextInput } from '@/components/ui';
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
    <div className="rounded-md border border-danger bg-danger-soft px-3 py-2 text-cell text-danger">
      {message}
    </div>
  );
}

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
    <div className="space-y-4">
      <SectionError message={error} />
      <div className="rounded-lg border border-border-default p-4">
        <p className="text-title-section text-fg">Invite your partner</p>
        <p className="mt-1 text-cell text-fg-subtle">
          Enter the email of their Quro account on this server. Once they accept, you can mark
          savings accounts, your home, and mortgages as joint.
        </p>
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <div className="min-w-0 flex-1">
            <FormField label="Partner's email">
              <TextInput
                type="email"
                value={email}
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
    </div>
  );
}

function PartnerIdentity({ link }: { link: PartnerLink }) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-soft text-cell font-semibold text-brand-fg">
        {getUserInitials(link.partner)}
      </div>
      <div>
        <p className="text-cell font-medium text-fg">{getUserDisplayName(link.partner)}</p>
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
    <div className="space-y-4">
      <SectionError message={error} />
      <div className="rounded-lg border border-brand bg-brand-soft p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <PartnerIdentity link={link} />
            <p className="mt-2 text-cell text-fg-muted">
              wants to link accounts with you to share joint assets.
            </p>
          </div>
          <div className="flex items-center gap-2">
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
      </div>
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
    <div className="space-y-4">
      <SectionError message={error} />
      <div className="rounded-lg border border-border-default p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
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
        <p className="mt-2 text-cell text-fg-subtle">
          Waiting for {getUserDisplayName(link.partner)} to accept in their Settings.
        </p>
      </div>
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
    <div className="space-y-4">
      <SectionError message={error} />
      <div className="rounded-lg border border-border-default p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <PartnerIdentity link={link} />
            <Badge tone="success">
              <Heart size={12} />
              Linked
            </Badge>
          </div>
          {confirming ? (
            <div className="flex items-center gap-2">
              <Button
                variant="danger"
                size="sm"
                leadingIcon={<Unlink size={14} />}
                loading={unlink.isPending}
                onClick={() => {
                  void handleUnlink();
                }}
              >
                Confirm unlink
              </Button>
              <Button variant="secondary" size="sm" onClick={() => setConfirming(false)}>
                Keep linked
              </Button>
            </div>
          ) : (
            <Button
              variant="danger"
              size="sm"
              leadingIcon={<Unlink size={14} />}
              onClick={() => setConfirming(true)}
            >
              Unlink
            </Button>
          )}
        </div>
        {confirming ? (
          <p className="mt-2 text-cell text-danger">
            Unlinking removes the joint flag from every shared asset — each asset stays with whoever
            created it. This does not delete any data.
          </p>
        ) : (
          <p className="mt-2 text-cell text-fg-subtle">
            You can mark savings accounts, properties, and mortgages as joint. Joint assets are
            visible and editable by both of you, and count 50/50 in each dashboard.
          </p>
        )}
      </div>
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

export function PartnerSection() {
  const { data: link, isLoading } = usePartner();

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-title-section text-fg">Partner</h3>
        <p className="mt-1 text-cell text-fg-subtle">
          Link your account with your partner&apos;s to track joint assets together.
        </p>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12 text-cell text-fg-subtle">
          Loading...
        </div>
      ) : (
        <PartnerLinkState link={link ?? null} />
      )}
    </div>
  );
}
