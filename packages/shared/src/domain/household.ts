/**
 * How much of a row's money counts for one person. `personal` is the household attribution used
 * by net worth, contractual payments and deposit protection; `full` counts a joint row in full and
 * is used only by explicit liquidity scenarios.
 */
export type HouseholdWeight = 'personal' | 'full';

// Each partner of an accepted link owns an equal share of a joint row.
const JOINT_PERSONAL_SHARE = 0.5;

/** The share of a row's money that counts for one person of the household. */
export function householdShare(
  isJoint: boolean | null | undefined,
  weight: HouseholdWeight = 'personal',
): number {
  return isJoint && weight === 'personal' ? JOINT_PERSONAL_SHARE : 1;
}

/**
 * The person's attributed part of a money amount. The result keeps sub-cent precision (half of
 * an odd cent), so the two partners' parts add up to the whole; it is rounded once, where the
 * aggregate it feeds is summed in cents.
 */
export function householdAmount(
  amount: number,
  isJoint: boolean | null | undefined,
  weight: HouseholdWeight = 'personal',
): number {
  return amount * householdShare(isJoint, weight);
}
