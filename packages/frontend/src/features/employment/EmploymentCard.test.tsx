import { describe, expect, test } from 'bun:test';
import type { Employment } from '@quro/shared';
import { renderToStaticMarkup } from 'react-dom/server';
import { EmploymentCard, selectCurrentEmployment } from './EmploymentCard';

function employment(overrides: Partial<Employment>): Employment {
  return {
    id: 1,
    employerName: 'Former BV',
    employmentType: 'employed',
    serviceStartDate: '2020-01-01',
    endDate: '2022-01-01',
    noticePeriodMonths: 1,
    isPrimary: true,
    createdAt: '2020-01-01T00:00:00.000Z',
    updatedAt: '2022-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('employment selection and tenure display', () => {
  test('selects an active fallback when the stored primary role has ended', () => {
    const endedPrimary = employment({});
    const activeSecondary = employment({
      id: 2,
      employerName: 'Current BV',
      serviceStartDate: '2023-01-01',
      endDate: null,
      isPrimary: false,
    });
    expect(selectCurrentEmployment([endedPrimary, activeSecondary], '2026-08-11')?.id).toBe(2);
  });

  test('caps tenure at the employment end date and labels the role as ended', () => {
    const markup = renderToStaticMarkup(
      <EmploymentCard employment={employment({})} asOf="2026-08-11" />,
    );
    expect(markup).toContain('2y 0m');
    expect(markup).toContain('Ended 2022-01-01');
    expect(markup).not.toContain('6y 7m');
  });
});
