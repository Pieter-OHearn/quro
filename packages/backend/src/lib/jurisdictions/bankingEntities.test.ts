import { describe, expect, test } from 'bun:test';
import { aggregateDepositGuarantees } from '../runway';
import { normalizeBankName, resolveBankingEntity } from './bankingEntities';

describe('banking entity resolution', () => {
  test('normalizes legal suffixes and punctuation', () => {
    expect(normalizeBankName('Bunq N.V.')).toBe(normalizeBankName('bunq bank'));
    expect(resolveBankingEntity('Bunq N.V.').entityId).toBe('bunq');
  });

  test('aggregates shared de Volksbank brands under one guarantee', () => {
    const result = aggregateDepositGuarantees(
      [
        { bank: 'SNS', amount: 45_000, isJoint: false },
        { bank: 'ASN Bank', amount: 40_000, isJoint: false },
        { bank: 'RegioBank', amount: 30_000, isJoint: false },
      ],
      100_000,
      'Nederlandse Depositogarantie',
    );
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      entityId: 'de-volksbank',
      total: 115_000,
      excess: 15_000,
      confidence: 'verified',
    });
  });

  test('keeps unresolved banks explicit and counts a joint balance in full', () => {
    const [result] = aggregateDepositGuarantees(
      [{ bank: 'Local Mystery Bank', amount: 120_000, isJoint: true }],
      100_000,
      'EU deposit guarantee',
    );
    expect(result).toMatchObject({
      entityId: null,
      total: 120_000,
      excess: 20_000,
      confidence: 'unverified',
    });
  });
});
