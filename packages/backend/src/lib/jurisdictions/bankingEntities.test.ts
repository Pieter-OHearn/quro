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

  test('attributes half of a joint balance to the current depositor', () => {
    const [result] = aggregateDepositGuarantees(
      [{ bank: 'Local Mystery Bank', amount: 200_000, isJoint: true }],
      100_000,
      'EU deposit guarantee',
    );
    expect(result).toMatchObject({
      entityId: null,
      total: 100_000,
      excess: 0,
      confidence: 'unverified',
    });
  });

  test('reports only the depositor share above the joint-account boundary', () => {
    const [result] = aggregateDepositGuarantees(
      [{ bank: 'Local Mystery Bank', amount: 200_002, isJoint: true }],
      100_000,
      'EU deposit guarantee',
    );
    expect(result).toMatchObject({ total: 100_001, excess: 1 });
  });

  test('groups user-confirmed manual entities and exposes their account ids', () => {
    const result = aggregateDepositGuarantees(
      [
        {
          id: 11,
          bank: 'Brand One',
          amount: 60_000,
          isJoint: false,
          confirmedEntity: {
            entityId: 'manual:examplegroup',
            entityName: 'Example Banking Group Ltd',
            scheme: 'Example protection scheme',
            cap: 140_000,
            currency: 'EUR',
          },
        },
        {
          id: 12,
          bank: 'Brand Two',
          amount: 50_000,
          isJoint: false,
          confirmedEntity: {
            entityId: 'manual:examplegroup',
            entityName: 'Example Banking Group Ltd',
            scheme: 'Example protection scheme',
            cap: 140_000,
            currency: 'EUR',
          },
        },
      ],
      100_000,
      'Fallback scheme',
    );
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      entityId: 'manual:examplegroup',
      total: 110_000,
      cap: 140_000,
      excess: 0,
      confidence: 'verified',
      accountIds: [11, 12],
    });
  });
});
