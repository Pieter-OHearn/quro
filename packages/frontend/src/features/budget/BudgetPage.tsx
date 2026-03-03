import {
  BudgetCategoriesSection,
  BudgetChartsRow,
  BudgetLoadingState,
  BudgetSummaryCards,
  RecentTransactionsList,
} from './components';
import { useBudgetPage } from './hooks';

export function Budget() {
  const {
    isLoading,
    fmt,
    fmtDec,
    baseCurrency,
    categories,
    totalBudgeted,
    totalSpent,
    remaining,
    savingsRate,
    overBudget,
    pieData,
    recentTransactions,
    showAdd,
    newCat,
    toggleAdd,
    setNewCat,
    handleAddCategory,
  } = useBudgetPage();

  if (isLoading) return <BudgetLoadingState />;

  return (
    <div className="p-6 space-y-6">
      <BudgetSummaryCards
        totalBudgeted={totalBudgeted}
        totalSpent={totalSpent}
        remaining={remaining}
        savingsRate={savingsRate}
        fmt={fmt}
      />
      <BudgetChartsRow pieData={pieData} categories={categories} fmtDec={fmtDec} fmt={fmt} />
      <BudgetCategoriesSection
        categories={categories}
        overBudget={overBudget}
        showAdd={showAdd}
        newCat={newCat}
        baseCurrency={baseCurrency}
        fmt={fmt}
        fmtDec={fmtDec}
        onToggleAdd={toggleAdd}
        onNewCatChange={setNewCat}
        onAddCategory={handleAddCategory}
      />
      <RecentTransactionsList transactions={recentTransactions} fmtDec={fmtDec} />
    </div>
  );
}
