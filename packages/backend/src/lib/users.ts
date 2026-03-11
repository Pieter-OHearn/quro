import type { CurrencyCode } from '@quro/shared';
import { users } from '../db/schema';

export const DEFAULT_USER_AGE = 35;
export const DEFAULT_RETIREMENT_AGE = 67;
export const DEFAULT_BASE_CURRENCY: CurrencyCode = 'EUR';

export const publicUserColumns = {
  id: users.id,
  firstName: users.firstName,
  lastName: users.lastName,
  email: users.email,
  location: users.location,
  age: users.age,
  retirementAge: users.retirementAge,
  baseCurrency: users.baseCurrency,
  passwordUpdatedAt: users.passwordUpdatedAt,
  createdAt: users.createdAt,
};
