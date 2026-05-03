import { RouteQueryErrorState } from '@/components/errors/RouteQueryErrorState';
import { ContentSection, PageStack } from '@/components/ui';
import {
  BudgetCategoriesSection,
  BudgetChartsRow,
  BudgetLoadingState,
  BudgetSummaryCards,
  EditCategoryDialog,
  RecentTransactionsList,
} from './components';
import { useBudgetPage } from './hooks';

export function Budget() {
  const page = useBudgetPage();

  if (page.isLoading) return <BudgetLoadingState />;
  if (page.queryFailures.length > 0) {
    return <RouteQueryErrorState routeName="Budget" failedQueries={page.queryFailures} />;
  }

  return (
    <PageStack>
      <ContentSection>
        <BudgetSummaryCards
          totalBudgeted={page.totalBudgeted}
          totalSpent={page.totalSpent}
          remaining={page.remaining}
          savingsRate={page.savingsRate}
          fmt={page.fmt}
        />
      </ContentSection>
      <ContentSection>
        <BudgetChartsRow
          pieData={page.pieData}
          categories={page.categories}
          fmtDec={page.fmtDec}
          fmt={page.fmt}
        />
      </ContentSection>
      <ContentSection>
        <BudgetCategoriesSection
          categories={page.categories}
          overBudget={page.overBudget}
          showAdd={page.showAdd}
          newCat={page.newCat}
          baseCurrency={page.baseCurrency}
          fmt={page.fmt}
          fmtDec={page.fmtDec}
          selectedMonth={page.selectedMonth}
          selectedYear={page.selectedYear}
          isCurrentMonth={page.isCurrentMonth}
          onPrevMonth={page.navigatePrev}
          onNextMonth={page.navigateNext}
          onToggleAdd={page.toggleAdd}
          onNewCatChange={page.setNewCat}
          onAddCategory={page.handleAddCategory}
          onEditCategory={page.setEditingCategory}
        />
      </ContentSection>
      <ContentSection>
        <RecentTransactionsList
          transactions={page.monthlyTransactions}
          categories={page.categories}
          fmtDec={page.fmtDec}
          selectedMonth={page.selectedMonth}
          selectedYear={page.selectedYear}
          onDelete={page.handleDeleteTransaction}
          onChangeCategory={page.handleChangeTxCategory}
        />
      </ContentSection>
      {page.editingCategory && (
        <EditCategoryDialog
          category={page.editingCategory}
          isSaving={page.isUpdating}
          onSave={page.handleSaveEdit}
          onClose={() => page.setEditingCategory(null)}
        />
      )}
    </PageStack>
  );
}
