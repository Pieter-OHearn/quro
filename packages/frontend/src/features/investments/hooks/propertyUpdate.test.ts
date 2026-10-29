/// <reference types="bun-types" />

import { expect, test } from 'bun:test';
import type { Property } from '@quro/shared';
import { propertyUpdate } from './useInvestmentActions';

const property: Property = {
  id: 7,
  userId: 3,
  address: '8 Sample Court',
  propertyType: 'Buy-to-Let',
  purchasePrice: 210000,
  currentValue: 178000,
  mortgageId: 2,
  monthlyRent: 950,
  currency: 'GBP',
  emoji: 'H',
  isJoint: false,
  archivedAt: null,
  debt: 191010.1,
  totalEquity: -13010.1,
  equity: -13010.1,
};

test('an update sends only the fields the property form edits', () => {
  // The read-only and server-derived fields of the row are never sent back.
  expect(propertyUpdate(property, 178000, 975, true)).toEqual({
    id: 7,
    monthlyRent: 975,
    isJoint: true,
  });
  expect(propertyUpdate(property, 180000, 950, false)).toEqual({
    id: 7,
    monthlyRent: 950,
    isJoint: false,
    currentValue: 180000,
  });
});
