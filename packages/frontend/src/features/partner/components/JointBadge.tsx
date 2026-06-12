import { Users } from 'lucide-react';
import { Badge } from '@/components/ui';
import { useAuth } from '@/lib/AuthContext';

type JointBadgeProps = {
  isJoint: boolean;
  ownerUserId?: number;
  size?: 'xs' | 'sm' | 'md';
};

// Marks a joint asset; adds "Partner's" when the row belongs to the partner.
export function JointBadge({ isJoint, ownerUserId, size = 'sm' }: JointBadgeProps) {
  const { user } = useAuth();
  if (!isJoint) return null;

  const ownedByPartner = ownerUserId !== undefined && user !== null && ownerUserId !== user.id;

  return (
    <Badge tone="brand" size={size}>
      <Users size={11} />
      {ownedByPartner ? "Joint · Partner's" : 'Joint'}
    </Badge>
  );
}
