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
        { bank: 'SNS', amount: 45_000, currency: 'EUR', isJoint: false },
        { bank: 'ASN Bank', amount: 40_000, currency: 'EUR', isJoint: false },
        { bank: 'RegioBank', amount: 30_000, currency: 'EUR', isJoint: false },
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
      [{ bank: 'Local Mystery Bank', amount: 200_000, currency: 'EUR', isJoint: true }],
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
      [{ bank: 'Local Mystery Bank', amount: 200_002, currency: 'EUR', isJoint: true }],
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
          currency: 'EUR',
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
          currency: 'EUR',
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

  test('resolves Australian aliases separately and excludes non-AUD deposits from FCS cover', () => {
    expect(resolveBankingEntity('ING', null, 'AU').entityId).toBe('ing-au');
    expect(resolveBankingEntity('ING', null, 'NL').entityId).toBe('ing-nl');

    const [covered] = aggregateDepositGuarantees(
      [{ bank: 'CommBank', amount: 250_000, currency: 'AUD', isJoint: false }],
      250_000,
      'Australian Financial Claims Scheme (AUD deposits only)',
      'AU',
      ['AUD'],
    );
    expect(covered).toMatchObject({ entityId: 'cba-au', cap: 250_000, excess: 0 });

    const [notCovered] = aggregateDepositGuarantees(
      [{ bank: 'Unknown ADI', amount: 10_000, currency: 'USD', isJoint: false }],
      250_000,
      'Australian Financial Claims Scheme (AUD deposits only)',
      'AU',
      ['AUD'],
    );
    expect(notCovered).toMatchObject({ total: 10_000, excess: 10_000 });
  });

  test('does not trust a saved known entity outside the user jurisdiction', () => {
    const [result] = aggregateDepositGuarantees(
      [
        {
          id: 44,
          bank: 'bunq',
          amount: 50_000,
          currency: 'EUR',
          isJoint: false,
          confirmedEntity: {
            entityId: 'bunq',
            entityName: 'bunq B.V.',
            scheme: 'Nederlandse Depositogarantie',
            cap: 100_000,
            currency: 'EUR',
          },
        },
      ],
      250_000,
      'Australian Financial Claims Scheme (AUD deposits only)',
      'AU',
      ['AUD'],
    );

    expect(result).toMatchObject({
      entityId: null,
      confidence: 'unverified',
      accountIds: [44],
    });
  });

  test('converts an Australian entity cap into the calculation currency', () => {
    const [result] = aggregateDepositGuarantees(
      [{ bank: 'CommBank', amount: 160_000, currency: 'AUD', isJoint: false }],
      150_000,
      'Australian Financial Claims Scheme (AUD deposits only)',
      'AU',
      ['AUD'],
      (amount, currency) => (currency === 'AUD' ? amount * 0.6 : amount),
    );

    expect(result.cap).toBe(150_000);
    expect(result.excess).toBe(10_000);
  });
});
