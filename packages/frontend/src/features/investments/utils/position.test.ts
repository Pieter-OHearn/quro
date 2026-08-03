/// <reference types="bun-types" />

import { expect, test } from 'bun:test';
import type { Property } from '@quro/shared';
import { getPropertyOwnershipShare } from './position';

const property = (isJoint: boolean): Property => ({ isJoint }) as Property;

test('uses a half share for joint properties', () => {
  expect(getPropertyOwnershipShare(property(true))).toBe(0.5);
});

test('uses the full share for individually owned properties', () => {
  expect(getPropertyOwnershipShare(property(false))).toBe(1);
});
