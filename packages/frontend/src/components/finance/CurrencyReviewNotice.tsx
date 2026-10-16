import { StateNotice } from '@/components/ui';

/** Budget amounts saved before currencies were recorded are read as EUR until someone checks them. */
export function CurrencyReviewNotice() {
  return (
    <StateNotice title="Some budget amounts are treated as EUR" testId="currency-review-notice">
      Older budget amounts have no recorded currency. Review these records against your statements
      before relying on spending or runway estimates.
    </StateNotice>
  );
}
