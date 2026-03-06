import { db } from './client';
import {
  savingsAccounts,
  savingsTransactions,
  holdings,
  holdingPriceHistory,
  holdingTransactions,
  properties,
  propertyTransactions,
  pensionPots,
  pensionTransactions,
  mortgages,
  mortgageTransactions,
  payslips,
  goals,
  budgetCategories,
  budgetTransactions,
  currencyRates,
  dashboardTransactions,
} from './schema';

console.log('Clearing all data...');
await db.delete(budgetTransactions);
await db.delete(budgetCategories);
await db.delete(dashboardTransactions);
await db.delete(currencyRates);
await db.delete(savingsTransactions);
await db.delete(savingsAccounts);
await db.delete(holdingTransactions);
await db.delete(holdingPriceHistory);
await db.delete(holdings);
await db.delete(propertyTransactions);
await db.delete(properties);
await db.delete(pensionTransactions);
await db.delete(pensionPots);
await db.delete(mortgageTransactions);
await db.delete(mortgages);
await db.delete(payslips);
await db.delete(goals);
console.log('All tables cleared.');
process.exit(0);
