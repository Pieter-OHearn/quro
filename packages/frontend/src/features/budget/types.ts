import type {
  BudgetCategory as SharedBudgetCategory,
  BudgetTransaction as SharedBudgetTransaction,
} from '@quro/shared';

export type BudgetCategory = Pick<
  SharedBudgetCategory,
  'id' | 'name' | 'budgeted' | 'spent' | 'color' | 'emoji' | 'month' | 'year' | 'expenseClass'
>;

export type BudgetTx = Pick<
  SharedBudgetTransaction,
  | 'id'
  | 'description'
  | 'amount'
  | 'date'
  | 'categoryId'
  | 'bunqTransactionId'
  | 'sourceProvider'
  | 'sourceAccountId'
  | 'sourceAccountName'
  | 'sourceAccountType'
> & {
  merchant?: string;
};

export type BudgetFormatFn = (n: number) => string;
export type BudgetFormatBaseFn = (n: number, u?: undefined, c?: boolean) => string;

export type PieEntry = {
  name: string;
  value: number;
  color: string;
};

export type RecentBudgetTx = {
  id: number;
  name: string;
  category: string;
  categoryId?: number;
  amount: number;
  date: string;
  emoji: string;
  color?: string;
  bunqTransactionId?: string | null;
  sourceProvider?: string | null;
  sourceAccountId?: string | null;
  sourceAccountName?: string | null;
  sourceAccountType?: string | null;
};

export type BudgetStats = {
  totalBudgeted: number;
  totalSpent: number;
  remaining: number;
  savingsRate: number;
  overBudget: BudgetCategory[];
  pieData: PieEntry[];
};

export type CreateBudgetCategoryInput = Omit<SharedBudgetCategory, 'id' | 'expenseClass'>;
export type UpdateBudgetCategoryInput = { id: number } & Partial<Omit<SharedBudgetCategory, 'id'>>;

export type EditCategoryForm = {
  name: string;
  emoji: string;
  budgeted: string;
  color: string;
};
export type CreateBudgetTransactionInput = Omit<SharedBudgetTransaction, 'id'>;

export type BudgetPageData = {
  isLoading: boolean;
  fmt: BudgetFormatFn;
  fmtDec: BudgetFormatFn;
  categories: BudgetCategory[];
  budgetTransactions: BudgetTx[];
  totalBudgeted: number;
  totalSpent: number;
  remaining: number;
  savingsRate: number;
  overBudget: BudgetCategory[];
  pieData: PieEntry[];
  monthlyTransactions: RecentBudgetTx[];
  isAddingCategory: boolean;
  addCategoryDraft: BudgetCategory;
  openAddCategory: () => void;
  closeCategoryDialog: () => void;
  handleAddCategory: (form: EditCategoryForm) => Promise<void>;
};
