import { ContentSection, PageStack } from '@/components/ui';
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
    <PageStack>
      <ContentSection>
        <BudgetSummaryCards
          totalBudgeted={totalBudgeted}
          totalSpent={totalSpent}
          remaining={remaining}
          savingsRate={savingsRate}
          fmt={fmt}
        />
      </ContentSection>
      <ContentSection>
        <BudgetChartsRow pieData={pieData} categories={categories} fmtDec={fmtDec} fmt={fmt} />
      </ContentSection>
      <ContentSection>
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
      </ContentSection>
      <ContentSection>
        <RecentTransactionsList transactions={recentTransactions} fmtDec={fmtDec} />
      </ContentSection>
    </PageStack>
  );
}
