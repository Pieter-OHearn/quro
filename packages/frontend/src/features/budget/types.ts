import type {
  BudgetCategory as SharedBudgetCategory,
  BudgetTransaction as SharedBudgetTransaction,
} from '@quro/shared';

export type BudgetCategory = Pick<
  SharedBudgetCategory,
  'id' | 'name' | 'budgeted' | 'spent' | 'color' | 'emoji'
>;

export type BudgetTx = Pick<
  SharedBudgetTransaction,
  'id' | 'description' | 'amount' | 'date' | 'categoryId'
> & {
  merchant?: string;
};

export type BudgetFormatFn = (n: number) => string;
export type BudgetFormatBaseFn = (n: number, u?: undefined, c?: boolean) => string;

export type NewCategoryForm = {
  name: string;
  budgeted: string;
};

export type PieEntry = {
  name: string;
  value: number;
  color: string;
};

export type RecentBudgetTx = {
  id: number;
  name: string;
  category: string;
  amount: number;
  date: string;
  emoji: string;
  color?: string;
};

export type BudgetStats = {
  totalBudgeted: number;
  totalSpent: number;
  remaining: number;
  savingsRate: number;
  overBudget: BudgetCategory[];
  pieData: PieEntry[];
};

export type CreateBudgetCategoryInput = Omit<SharedBudgetCategory, 'id'>;
export type UpdateBudgetCategoryInput = SharedBudgetCategory;
export type CreateBudgetTransactionInput = Omit<SharedBudgetTransaction, 'id'>;

export type BudgetPageData = {
  isLoading: boolean;
  fmt: BudgetFormatFn;
  fmtDec: BudgetFormatFn;
  baseCurrency: string;
  categories: BudgetCategory[];
  budgetTransactions: BudgetTx[];
  totalBudgeted: number;
  totalSpent: number;
  remaining: number;
  savingsRate: number;
  overBudget: BudgetCategory[];
  pieData: PieEntry[];
  recentTransactions: RecentBudgetTx[];
  showAdd: boolean;
  newCat: NewCategoryForm;
  toggleAdd: () => void;
  setNewCat: (value: NewCategoryForm) => void;
  handleAddCategory: () => void;
};
