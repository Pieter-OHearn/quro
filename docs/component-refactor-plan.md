# Component Refactor Plan

Technical spike report for an incremental Atomic Design refactor of the React UI layer.

Scope reviewed:

- `packages/frontend`
- `packages/shared`

Non-goals for this spike:

- No application code changes
- No visual redesign
- No rewrite of page flows, feature hooks, or data fetching

## 1. Component Architecture Audit

### Current architecture

The current UI architecture is split across three layers:

| Layer                                         | Current state                                       | Notes                                                                                                                                          |
| --------------------------------------------- | --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/shared`                             | Domain types and generic utilities only             | `@quro/shared` is already consumed widely for frontend/backend contracts. It should stay that way and should not become the UI component home. |
| `packages/frontend/src/components`            | Partial app-level UI kit                            | `ui/`, `layout/`, `notifications/`, and `errors/` contain reusable presentation components.                                                    |
| `packages/frontend/src/features/*/components` | Feature-local compositions and duplicate primitives | Many features rebuild the same card, modal, form, filter, and table patterns locally.                                                          |

### Existing strengths

The codebase already has several abstractions that are strong candidates for promotion into a reusable frontend component library rather than being rewritten:

- `packages/frontend/src/components/ui/StatCard.tsx`
  Used by dashboard, investments, pension, and mortgage.
- `packages/frontend/src/components/ui/TxnHistoryPanel.tsx`
  Already shared by savings, investments, and pension transaction flows.
- `packages/frontend/src/components/ui/FormField.tsx`
  Provides a usable starting point for labeled fields, text input, currency input, and select input.
- `packages/frontend/src/components/ui/Modal.tsx`
  Already adopted by savings, salary, pension, and investments.
- `packages/frontend/src/components/ui/AreaChartCard.tsx`
  Good seed for reusable chart containers.
- `packages/frontend/src/components/ui/PdfAttachmentField.tsx`
  Good example of a feature-agnostic, higher-value reusable molecule.
- `packages/frontend/src/components/ui/EmojiPickerField.tsx`
  Another reusable input primitive with contained behavior.

### Architectural gaps

- There is no dedicated frontend design-system layer yet. `packages/shared` is intentionally the wrong place for React UI components in this repo.
- `packages/frontend/src/components/ui` acts like an internal design system, but adoption is inconsistent across features.
- Feature-local components mix domain logic and visual primitives, which makes extraction harder than it should be.
- `packages/frontend/src/styles/theme.css` defines design tokens, but most components still hardcode Tailwind colors and sizing directly in feature files.
- There is no observed UI test or Storybook-style safety net in `packages/frontend` or `packages/shared`, so refactor risk is mostly managed by small PR scope and manual verification.

### Layout and composition observations

- Eight page-level containers repeat the same shell pattern: `p-6 space-y-6`.
- App shell layout in `packages/frontend/src/components/layout/Layout.tsx` is application-specific because it couples router state, auth, currency switching, and notifications.
- Marketing and brand pages under `features/landing` and `features/brand` use the same visual language, but some of their compositions are intentionally bespoke and should not be generalized too early.

### Atomic Design interpretation of the current code

| Atomic level | Current examples in repo                                                                                                  | Current issue                                                               |
| ------------ | ------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Atoms        | `LoadingSpinner`, `QuroLogo`, input primitives inside `FormField.tsx`, close buttons, action buttons                      | Too many atoms still exist only as repeated class strings, not components.  |
| Molecules    | `FormField`, `DateNoteRow`, `EmptyState`, `ModalFooter`, `TxnTypeSelector`, `PdfAttachmentField`                          | Some are reusable already, others are duplicated per feature.               |
| Organisms    | `Modal`, `TxnHistoryPanel`, `AreaChartCard`, `PayslipHistoryTable`, `AccountsList`, `MortgageTxnHistory`                  | Several feature organisms solve the same problem with different code paths. |
| Templates    | App shell in `Layout.tsx`, repeated page stacks, tabbed content shells                                                    | Template layer is mostly implicit rather than modeled.                      |
| Pages        | `DashboardPage`, `SavingsPage`, `InvestmentsPage`, `PensionPage`, `MortgagePage`, `SalaryPage`, `GoalsPage`, `BudgetPage` | Pages are reasonably feature-oriented and should stay that way.             |

## 2. Duplication Findings

### Measured hotspots

- Modal shell duplication: 7 files use the exact same overlay container pattern `fixed inset-0 z-50 flex items-center justify-center p-4`.
  Files include shared `Modal.tsx`, `AddGoalModal.tsx`, `SignInModal.tsx`, `SignUpModal.tsx`, `AddMortgageModal.tsx`, `AddMortgageTxnModal.tsx`, and `ImportPensionStatementModal.tsx`.
- White card surface duplication: 15 files reuse the same base shell `bg-white rounded-2xl p-6 border border-slate-100 shadow-sm`.
- Primary CTA duplication: 10 files reuse the same `bg-indigo-600 hover:bg-indigo-700 text-white` button styling.
- Input chrome duplication: 12 files reuse the same `focus:outline-none focus:ring-2 focus:ring-indigo-300` input pattern.
- Loading duplication: 4 places use the same centered `Loader2` loading UI.
- Year selector duplication: goals and salary each implement the same year pill control independently.
- Stat grid duplication: 6 feature areas use `grid grid-cols-2 lg:grid-cols-4 gap-4`, but only 4 rely on shared `StatCard`.
- Panel header duplication: savings, salary, mortgage, and pension list/table containers repeat the same `px-6 py-5 border-b border-slate-100` header layout.
- Pagination duplication: savings and pension transaction histories share an almost identical custom pagination footer implementation.
- Page container duplication: 8 screens use the same page stack wrapper.

### Pattern-by-pattern findings

| Pattern                    | Current locations                                                                                                                                          | Finding                                                                                                                                                          |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tables and row lists       | `PayslipHistoryTable.tsx`, `AccountsList.tsx`, `MortgageTxnHistory.tsx`, `PensionPotsList.tsx`, `RecentTransactionsList.tsx`, `RecentTransactionsCard.tsx` | List and table containers use nearly identical card shells, headers, empty states, and row action buttons, but there is no shared table or data panel primitive. |
| Transaction history        | `TxnHistoryPanel.tsx`, `Savings/TxnHistory.tsx`, `HoldingTxnHistory.tsx`, `PropertyTxnHistory.tsx`, `PensionTxnHistory.tsx`, `MortgageTxnHistory.tsx`      | A good shared organism already exists, but mortgage still hand-rolls a parallel version and savings/pension each duplicate pagination.                           |
| Cards                      | `AreaChartCard.tsx`, budget cards, dashboard cards, salary cards, pension cards, mortgage cards                                                            | Card styling is consistent visually but duplicated structurally. The codebase is ready for a shared `Card` surface plus `CardHeader` pattern.                    |
| Form inputs                | shared `FormField.tsx`, landing `FormField.tsx`, `AddGoalModal.tsx`, `AddMortgageModal.tsx`, `AddMortgageTxnModal.tsx`, `BudgetCategoriesSection.tsx`      | Form styling is one of the highest-value extraction targets. Shared form primitives exist, but several major features still rebuild them locally.                |
| Buttons                    | `ModalFooter`, `SubmitButton`, goals filter bar, budget category actions, savings/salary/mortgage add buttons, property/brokerage add buttons              | Variants exist conceptually, but not as components. Button work should be an early refactor step.                                                                |
| Headers                    | `PayslipTableHeader`, `AccountsListHeader`, `CategorySectionHeader`, dashboard card headers, page hero banners                                             | The same title/subtitle/action pattern appears throughout the app under different component names.                                                               |
| Loading states             | `LoadingSpinner.tsx`, `BudgetLoadingState.tsx`, `GoalsLoadingState.tsx`, inline loader in `SalaryPage.tsx`                                                 | This is low-risk duplication and should be standardized early.                                                                                                   |
| Empty states               | shared `EmptyState.tsx`, `GoalsEmptyState.tsx`, `NotificationEmptyState.tsx`, inline empty text in tables and charts                                       | Empty state semantics are consistent enough for a shared component family, but current implementations vary in density and CTA handling.                         |
| Filter and search controls | `GoalsFilterBar.tsx`, `GoalsHeader.tsx`, `SalaryPage.tsx`, `MortgageTabSelector.tsx`, `TabSwitcher.tsx`, `TxnHistoryPanel.tsx`, `EditHoldingModal.tsx`     | Filter chips, segmented tabs, and search field patterns are spread across features with overlapping UX.                                                          |
| Modal and dialog patterns  | shared `Modal.tsx`, auth modals, goal modal, mortgage modals, pension import modal                                                                         | Shared dialog work has started, but multiple feature-specific dialog shells bypass it entirely.                                                                  |

### Existing good abstractions worth preserving

These should be treated as seeds for the frontend design-system layer, not replaced blindly:

- `StatCard` is already a stable shared KPI card primitive.
- `TxnHistoryPanel` is already a reusable organism with filters, stats, add CTA, and empty handling.
- `PdfAttachmentField` and `EmojiPickerField` demonstrate the right boundary for shared interactive molecules.
- `AreaChartCard` already separates chart shell concerns from chart data.

## 3. Candidate Shared Components

### Priority summary

- First wave: button, field, dialog, card, loading, empty, stat, pagination
- Second wave: filter/tabs, transaction history, chart shell, data table
- Third wave: page templates and hero/banner abstractions

### Candidate list

| Candidate                                                                             | Atomic level         | Current locations                                                                                                                                                                                          | Duplication evidence                                                                      | Expected props / API                                                                                    |
| ------------------------------------------------------------------------------------- | -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `Button`                                                                              | Atom                 | `ModalFooter.tsx`, `SubmitButton.tsx`, `GoalsFilterBar.tsx`, `BudgetCategoriesSection.tsx`, `AccountsList.tsx`, `PayslipHistoryTable.tsx`, `MortgageTxnHistory.tsx`, `BrokerageTab.tsx`, `PropertyTab.tsx` | 10 files share the same primary CTA class string                                          | `variant`, `size`, `leadingIcon`, `trailingIcon`, `loading`, `disabled`, `fullWidth`, `type`, `onClick` |
| `IconButton`                                                                          | Atom                 | Row edit/delete/download actions in salary, savings, mortgage, investments, notifications, dialog close buttons                                                                                            | Same ghost/danger icon action patterns repeated across rows and headers                   | `icon`, `label`, `variant`, `size`, `disabled`, `onClick`                                               |
| `Spinner` / `LoadingState`                                                            | Atom / Molecule      | `LoadingSpinner.tsx`, `GoalsLoadingState.tsx`, `BudgetLoadingState.tsx`, `SalaryPage.tsx`                                                                                                                  | 4 identical loader implementations                                                        | `size`, `tone`, `minHeight`, `label`, `inline`                                                          |
| `Badge`                                                                               | Atom                 | Goal type pills, currency badges, bonus badges, transaction badges, notification status badges                                                                                                             | Repeated rounded-pill badge markup with small color variants                              | `tone`, `size`, `icon`, `children`                                                                      |
| `TextInput`, `SelectInput`, `CurrencyInput`, `DateInput`, `Textarea`, `PasswordInput` | Atom                 | shared `FormField.tsx`, landing auth inputs, goals modal, mortgage modals, pension modal, budget add form                                                                                                  | 12 files reuse the same input chrome classes                                              | Standard controlled input props plus `error`, `disabled`, `placeholder`, `inputMode`, `step`            |
| `FormField`                                                                           | Molecule             | shared `FormField.tsx`, landing `FormField.tsx`, ad-hoc label+error blocks in goals and mortgage forms                                                                                                     | Same label, hint, required, error pattern repeated locally                                | `label`, `required`, `hint`, `error`, `children`, `className`                                           |
| `Dialog` + `DialogHeader` + `DialogFooter`                                            | Organism + Molecules | shared `Modal.tsx`, auth modals, goals modal, mortgage modals, pension import modal                                                                                                                        | 7 duplicate overlay shells and repeated gradient header/footer patterns                   | `title`, `subtitle`, `size`, `scrollable`, `onClose`, `footer`, `tone`, optional `headerContent`        |
| `Card` / `PanelCard`                                                                  | Atom / Organism      | `AreaChartCard.tsx`, budget cards, dashboard cards, salary cards, mortgage charts, pension growth chart, recent transaction panels                                                                         | 15 repeated card shell implementations                                                    | `title`, `subtitle`, `action`, `footer`, `padding`, `overflow`, `className`                             |
| `PanelHeader` / `SectionHeader`                                                       | Molecule             | `PayslipTableHeader`, `AccountsListHeader`, `CategorySectionHeader`, chart headers, recent transaction headers                                                                                             | Repeated title/subtitle/action layout                                                     | `title`, `subtitle`, `meta`, `action`, `align`                                                          |
| `StatCard` + `StatsGrid`                                                              | Molecule + Organism  | existing `StatCard.tsx`; custom KPI cards in goals, budget, salary                                                                                                                                         | 6 stat grids share identical layout but only 4 features use `StatCard`                    | `items`, `columns`, `href`, `trend`, `subtitle`, `icon`, `tone`                                         |
| `EmptyState`                                                                          | Organism             | shared `EmptyState.tsx`, `GoalsEmptyState.tsx`, `NotificationEmptyState.tsx`, inline table/chart empty states                                                                                              | Same icon/title/body/CTA structure expressed three different ways                         | `icon`, `title`, `description`, `action`, `compact`, `tone`                                             |
| `SegmentedControl` / `FilterTabs`                                                     | Molecule             | `GoalsHeader.tsx`, `SalaryPage.tsx`, `GoalsFilterBar.tsx`, `MortgageTabSelector.tsx`, `TabSwitcher.tsx`, `TxnHistoryPanel.tsx`                                                                             | Filters, tabs, and year pills repeat with slightly different markup                       | `options`, `value`, `onChange`, `variant`, `size`, `counts`, `action`                                   |
| `Pagination`                                                                          | Molecule             | `Savings/TxnHistory.tsx`, `PensionTxnHistory.tsx`                                                                                                                                                          | Footer implementation is effectively duplicated                                           | `page`, `totalPages`, `rangeStart`, `rangeEnd`, `totalCount`, `onChange`                                |
| `TransactionHistoryPanel` + `TransactionRow`                                          | Organism             | shared `TxnHistoryPanel.tsx`, savings, pension, holdings, properties; mortgage custom history panel                                                                                                        | One shared version exists, but mortgage still duplicates the organism                     | `title`, `subtitle`, `stats`, `filters`, `addAction`, `emptyMessage`, `footer`, `children`              |
| `DataTable` + `RowActions`                                                            | Organism + Molecule  | `PayslipHistoryTable.tsx`, pension import table-like rows, future list/table screens                                                                                                                       | Table shells and action cells are repeated but not abstracted                             | `columns`, `rows`, `renderCell`, `emptyState`, `rowActionSlot`, `onRowClick`                            |
| `ChartCard`                                                                           | Organism             | `AreaChartCard.tsx`, `SalaryHistoryChart.tsx`, `SavingsCharts.tsx`, `PensionGrowthChart.tsx`, `MortgageCharts.tsx`, `PortfolioChart.tsx`                                                                   | Shared card/header/empty-state work is repeated around different Recharts implementations | `title`, `subtitle`, `badge`, `emptyMessage`, `children`                                                |
| `PageStack` / `PageSection`                                                           | Template             | All main app pages                                                                                                                                                                                         | 8 screens repeat `p-6 space-y-6` page shell                                               | `spacing`, `header`, `actions`, `children`                                                              |
| `PageHero`                                                                            | Organism / Template  | `WelcomeBanner.tsx`, `PensionHeroBanner.tsx`, `MortgageHeroCard.tsx`                                                                                                                                       | Shared gradient hero pattern exists, but content models still differ                      | `eyebrow`, `title`, `description`, `metrics`, `actions`, `tone`                                         |

### Components that should remain frontend-specific

These should keep living in `packages/frontend` even after the refactor:

- Route-aware app shell in `packages/frontend/src/components/layout/Layout.tsx`
- Feature workflows such as `AddGoalModal`, `AddPayslipModal`, `PensionModal`, `ImportPensionStatementModal`
- Marketing and brand storytelling sections in `features/landing` and `features/brand`
- Any component that imports feature hooks, router hooks, auth context, or API logic directly

The goal is to move visual primitives and composable presentation blocks into shared, not feature behavior.

## 4. Proposed Atomic Design Structure

### Recommended package structure

```text
packages/frontend/src/components/
  ui/
    atoms/
      Badge/
      Button/
      IconButton/
      Input/
      Select/
      Textarea/
      Spinner/
      Surface/
    molecules/
      FormField/
      FieldRow/
      DialogHeader/
      DialogFooter/
      PanelHeader/
      SegmentedControl/
      Pagination/
      EmptyState/
      RowActions/
    organisms/
      Dialog/
      StatCard/
      StatsGrid/
      TransactionHistoryPanel/
      DataTable/
      ChartCard/
      PageHero/
    templates/
      PageStack/
      ContentSection/
    index.ts
  layout/
  notifications/
  errors/
```

### How this maps to the current repo

- `packages/frontend/src/components/ui/*` becomes the source pool for initial extraction.
- `packages/shared` remains focused on frontend/backend contracts, types, and generic utilities.
- `packages/frontend/src/components/ui/index.ts` should stay the barrel for the design-system layer during migration.
- Template components should stay small and generic. App-router layout and feature page orchestration stay in `packages/frontend`.
- If a separate package is ever needed later, create `packages/ui` or `packages/design-system`, not `packages/shared`.

### Naming conventions

- Use PascalCase component names and colocated folders for each design-system component.
- Prefer generic names in the design-system layer: `Dialog`, `PanelHeader`, `StatsGrid`, `SegmentedControl`.
- Keep domain names out of design-system component names and prop models.
  Good: `TransactionHistoryPanel`
  Avoid: `MortgageHistoryPanel`
- Export `ComponentProps` types from each design-system component.
- Keep feature wrappers in frontend when business copy or domain defaults matter.
  Example: `AddPayslipModal` stays frontend but composes shared `Dialog`, `FormField`, `Button`, and `DataTable`.

### Design-system vs feature boundary rules

A component belongs in the frontend design-system layer under `packages/frontend/src/components/ui` when all of the following are true:

- It is presentational or interaction-only.
- It is already used in at least two features, or it is obviously a reusable primitive.
- It does not import feature hooks, route state, auth state, or API modules.
- Its props can be expressed in generic UI terms instead of domain nouns.

A component should stay feature-local in `packages/frontend` when any of the following are true:

- It owns a multi-step business workflow.
- It depends on feature-specific copy, validation rules, or query state.
- It is route-aware or app-shell aware.
- It is a one-off marketing or brand composition.

### Styling guidance

- Reuse the existing token source in `packages/frontend/src/styles/theme.css`, but stop adding new hardcoded component classes in feature files.
- In early phases, centralize class recipes inside design-system components before attempting to move all CSS tokens around.
- Treat token migration as a follow-up once the design-system component APIs stabilize.

## 5. Refactor Roadmap

The roadmap is ordered to maximize reuse early and keep each pull request small.

### Step 1. Create the frontend design-system skeleton

- Description: Restructure `packages/frontend/src/components/ui` into Atomic Design folders and add stable barrel exports.
- Files affected:
  `packages/frontend/src/components/ui/**`, `packages/frontend/src/components/ui/index.ts`
- Expected outcome: The repo has a real frontend design-system layer without moving feature behavior yet.
- Migration approach: Start with re-export shims and file moves inside `ui/` so existing frontend imports continue to work while components move gradually.
- Risk level: Medium

### Step 2. Extract foundational atoms

- Description: Standardize `Button`, `IconButton`, `Spinner`, and `Badge`.
- Files affected:
  `packages/frontend/src/components/ui/LoadingSpinner.tsx`, `packages/frontend/src/features/landing/components/SubmitButton.tsx`, row-action-heavy list components, shared modal footer code
- Expected outcome: Primary, secondary, danger, and ghost action styles stop being repeated inline.
- Migration approach: Replace exact-class duplicates first; keep feature-specific wrappers as thin adapters where copy differs.
- Risk level: Low

### Step 3. Standardize form primitives and field composition

- Description: Promote shared form atoms and a single `FormField` molecule, including date/password/textarea support.
- Files affected:
  `packages/frontend/src/components/ui/FormField.tsx`, `packages/frontend/src/features/landing/components/FormField.tsx`, `SignInModal.tsx`, `SignUpModal.tsx`, `AddGoalModal.tsx`, `AddMortgageModal.tsx`, `AddMortgageTxnModal.tsx`, `BudgetCategoriesSection.tsx`
- Expected outcome: Labels, errors, hints, required markers, and input chrome become consistent across the app.
- Migration approach: Convert small forms first, then high-field-count modals once the API settles.
- Risk level: Medium

### Step 4. Consolidate dialog primitives

- Description: Evolve the existing shared `Modal` into a shared dialog system with header/footer variants.
- Files affected:
  `packages/frontend/src/components/ui/Modal.tsx`, `AddGoalModal.tsx`, `SignInModal.tsx`, `SignUpModal.tsx`, `AddMortgageModal.tsx`, `AddMortgageTxnModal.tsx`, `ImportPensionStatementModal.tsx`
- Expected outcome: Overlay shell, close behavior, scroll handling, and footer actions become consistent.
- Migration approach: Migrate simple shared-modal consumers first, then feature-specific custom dialogs, leaving the pension import workflow for last.
- Risk level: Medium

### Step 5. Introduce shared card surfaces and panel headers

- Description: Extract `Card` / `PanelCard` plus a reusable `PanelHeader`.
- Files affected:
  `packages/frontend/src/components/ui/AreaChartCard.tsx`, `BudgetCategoriesSection.tsx`, `RecentTransactionsList.tsx`, `RecentTransactionsCard.tsx`, `PayslipHistoryTable.tsx`, `AccountsList.tsx`, `MortgageTxnHistory.tsx`
- Expected outcome: White surface cards and title/subtitle/action headers are centralized.
- Migration approach: Start by wrapping existing content with shared shells rather than refactoring internal row markup immediately.
- Risk level: Low

### Step 6. Normalize KPI cards with shared `StatCard` and `StatsGrid`

- Description: Expand `StatCard` if needed and convert salary, goals, and budget summary cards to shared primitives.
- Files affected:
  `packages/frontend/src/components/ui/StatCard.tsx`, `GoalsStatsGrid.tsx`, `BudgetSummaryCards.tsx`, `SalaryStatsCards.tsx`
- Expected outcome: KPI cards share one visual API and one change/trend model where applicable.
- Migration approach: Migrate the custom stat grids one feature at a time without changing their data computation.
- Risk level: Low

### Step 7. Standardize loading and empty states

- Description: Create shared `LoadingState` and `EmptyState` variants with compact and CTA-capable modes.
- Files affected:
  `LoadingSpinner.tsx`, `GoalsLoadingState.tsx`, `BudgetLoadingState.tsx`, `SalaryPage.tsx`, `GoalsEmptyState.tsx`, `NotificationEmptyState.tsx`, `PropertyTab.tsx`, `MortgagePage.tsx`
- Expected outcome: Empty and loading feedback becomes visually consistent and cheaper to reuse.
- Migration approach: Replace exact duplicates first, then convert feature-specific wrappers into prop-driven shared usage.
- Risk level: Low

### Step 8. Extract segmented controls, filters, and pagination

- Description: Create shared `SegmentedControl`, `FilterTabs`, and `Pagination`.
- Files affected:
  `GoalsHeader.tsx`, `SalaryPage.tsx`, `GoalsFilterBar.tsx`, `MortgageTabSelector.tsx`, `TabSwitcher.tsx`, `TxnHistoryPanel.tsx`, `PensionTxnHistory.tsx`, `Savings/TxnHistory.tsx`
- Expected outcome: Year selectors, tab switches, filter chips, and pagination become reusable molecules.
- Migration approach: Start with the year selector because the duplication is exact, then move pagination, then tab/filter patterns.
- Risk level: Medium

### Step 9. Promote `TxnHistoryPanel` into the frontend design-system layer and migrate mortgage

- Description: Move the transaction history organism under `packages/frontend/src/components/ui/organisms` and refactor mortgage to consume it.
- Files affected:
  `packages/frontend/src/components/ui/TxnHistoryPanel.tsx`, `MortgageTxnHistory.tsx`, `HoldingTxnHistory.tsx`, `PropertyTxnHistory.tsx`, `PensionTxnHistory.tsx`, `Savings/TxnHistory.tsx`
- Expected outcome: Transaction history UI has one shared panel, one row action model, and one pagination/filter composition strategy.
- Migration approach: Preserve feature-specific amount rendering and stats computation; only standardize structure and controls.
- Risk level: Medium

### Step 10. Standardize table and chart shells

- Description: Introduce shared `DataTable` and `ChartCard` shells for richer list and chart views.
- Files affected:
  `PayslipHistoryTable.tsx`, `ImportPensionStatementModal.tsx`, `SalaryHistoryChart.tsx`, `SavingsCharts.tsx`, `PensionGrowthChart.tsx`, `MortgageCharts.tsx`, `PortfolioChart.tsx`, `AreaChartCard.tsx`
- Expected outcome: Tables and chart panels share headers, empty states, row actions, and surface treatment.
- Migration approach: Extract shell-level concerns first; do not force all chart series logic into one abstraction.
- Risk level: Medium

### Step 11. Add shared page templates only after primitives settle

- Description: Introduce lightweight page stack and section templates once the lower layers are stable.
- Files affected:
  Main feature page components and new `packages/frontend/src/components/ui/templates/*`
- Expected outcome: Page spacing and section composition become standardized without coupling route logic to shared.
- Migration approach: Limit template scope to spacing and section framing; keep app shell and data hooks in frontend.
- Risk level: Low

## 6. Refactor Tickets

### Ticket 1. Scaffold frontend design-system structure

- Description: Create the Atomic Design folder structure under `packages/frontend/src/components/ui` with stable barrel exports and migration-safe re-exports.
- Acceptance criteria:
  - `packages/shared` remains unchanged as the frontend/backend contract package.
  - `packages/frontend/src/components/ui` exposes a stable component entry point.
  - Frontend can consume design-system components without changing page behavior.
- Estimated complexity: Medium

Implementation Notes:

- Completed by moving the existing reusable `ui` components into `atoms`, `molecules`, and `organisms` folders with colocated folder-level `index.ts` files.
- Kept `packages/frontend/src/components/ui/index.ts` as the stable entry point and added flat re-export shims at the old `ui/*` paths so existing deep imports continue to resolve during migration.

### Ticket 2. Extract shared action primitives

- Description: Build `Button`, `IconButton`, `Spinner`, and `Badge` in shared and migrate exact duplicates first.
- Acceptance criteria:
  - Primary, secondary, danger, and ghost button styles are defined once.
  - Loading buttons no longer require feature-local spinner markup.
  - Row action icons use a shared primitive.
- Estimated complexity: Medium

Implementation Notes:

- Added shared `Button`, `IconButton`, `Spinner`, and `Badge` atoms under `packages/frontend/src/components/ui/atoms` and exported them through the existing `ui` barrel.
- Migrated the shared modal footer, landing submit button, shared transaction row actions, and the first set of exact duplicate add/action/badge usages in salary, savings, pension, and mortgage list components without changing feature workflows.

### Ticket 3. Build the shared field system

- Description: Consolidate labeled fields and common input variants into shared atoms and molecules.
- Acceptance criteria:
  - Landing auth forms and at least one app modal use shared field primitives.
  - Required markers, hint text, and error text are handled by one `FormField`.
  - No new feature-local input chrome is introduced.
- Estimated complexity: Large

Implementation Notes:

- Extracted shared `TextInput`, `SelectInput`, `CurrencyInput`, `DateInput`, `PasswordInput`, and `Textarea` atoms under `packages/frontend/src/components/ui/atoms` while keeping `packages/frontend/src/components/ui/FormField.tsx` as the migration-safe export shim.
- Migrated landing sign-in/sign-up forms to the shared field atoms and switched `AddGoalModal` to the shared `FormField`, `TextInput`, `SelectInput`, and `Textarea` primitives so one app modal now uses the same field system.

### Ticket 4. Consolidate dialog shells

- Description: Replace custom overlay shells with a shared dialog foundation.
- Acceptance criteria:
  - Shared dialog supports title, subtitle, scrollable body, and footer actions.
  - Goals, landing auth, and mortgage dialogs no longer duplicate overlay markup.
  - Existing close-on-overlay-click behavior is preserved.
- Estimated complexity: Large

Implementation Notes:

- Extended the shared `Modal` with customizable header, body, panel, and backdrop variants, and exported a reusable `ModalHeader` alongside the existing `ModalFooter`.
- Migrated goals, landing auth, and mortgage dialog shells to the shared modal foundation, preserving overlay-click close behavior while removing their duplicated overlay container markup.

### Ticket 5. Introduce shared card and panel header primitives

- Description: Create shared card surface and header components for lists, charts, and data panels.
- Acceptance criteria:
  - White card surface styling is defined centrally.
  - At least three feature areas migrate to shared panel headers.
  - Existing card content layouts remain visually unchanged.
- Estimated complexity: Medium

Implementation Notes:

- Added a shared `Card` atom and `PanelHeader` molecule under `packages/frontend/src/components/ui` so the repeated white surface shell and title/subtitle/action header layout are defined once in the frontend design-system layer.
- Migrated shared `AreaChartCard` plus the salary payslip table, savings accounts list, and mortgage transaction history panels to the new primitives without changing their internal row, table, or filter layouts.

### Ticket 6. Normalize KPI summary cards

- Description: Standardize summary card grids around shared `StatCard` and `StatsGrid`.
- Acceptance criteria:
  - Salary, goals, and budget KPI cards stop using custom duplicate card markup.
  - Shared stat components support feature-specific icon and color needs.
  - KPI grid spacing stays consistent across screens.
- Estimated complexity: Medium

Implementation Notes:

- Added a shared `StatsGrid` organism under `packages/frontend/src/components/ui` and wired the existing KPI sections onto it so the 2-up mobile and 4-up desktop spacing now comes from one frontend design-system primitive.
- Migrated salary, goals, and budget KPI cards onto the shared `StatCard`, extending `StatCard` with an optional `valueClassName` so budget-specific positive and warning emphasis stays intact without reintroducing bespoke card markup.

### Ticket 7. Unify loading and empty states

- Description: Replace duplicate loader and empty-state components with shared versions.
- Acceptance criteria:
  - Duplicate `Loader2` loading shells are removed.
  - Empty states support optional CTA and compact mode.
  - Notification, goals, mortgage, and property states use the shared family or thin wrappers around it.
- Estimated complexity: Small

Implementation Notes:

- Added a shared `LoadingState` entry in `packages/frontend/src/components/ui` as a thin alias over the existing loading shell so feature pages and wrappers can converge on one API without breaking existing `LoadingSpinner` imports.
- Expanded the shared `EmptyState` with compact, tone, and CTA configuration, then migrated goals and notifications to thin wrappers around that shared component while keeping mortgage/property on the same shared family.

### Ticket 8. Extract segmented controls and pagination

- Description: Create shared filter/tab/year-switcher/pagination molecules.
- Acceptance criteria:
  - Salary and goals share the same year selector primitive.
  - Savings and pension share the same pagination primitive.
  - Investments and mortgage tabs are implemented with the same base control, even if styling variants differ.
- Estimated complexity: Medium

### Ticket 9. Promote transaction history into shared

- Description: Move `TxnHistoryPanel` and its row primitives into the frontend design-system layer and migrate mortgage history onto it.
- Acceptance criteria:
  - Mortgage transaction history no longer has a bespoke panel shell.
  - Savings, pension, holding, and property histories consume the shared organism from one package.
  - Feature-specific amount cells remain injectable via props or children.
- Estimated complexity: Large

### Ticket 10. Introduce shared table and chart shells

- Description: Create shared `DataTable` and `ChartCard` shells for richer list and chart screens.
- Acceptance criteria:
  - Payslip history uses a shared table shell and shared row actions.
  - At least two chart panels consume a shared chart container.
  - Empty-state and header patterns are no longer duplicated across chart cards.
- Estimated complexity: Large

### Ticket 11. Add lightweight shared UI verification

- Description: Add minimal render-level or smoke-test coverage for shared components as they are introduced.
- Acceptance criteria:
  - Shared atoms and molecules have at least basic render coverage or equivalent verification harness.
  - Refactor PRs include a documented manual verification checklist until broader UI automation exists.
  - New shared components are not merged without some reusable verification path.
- Estimated complexity: Medium

## Recommended implementation order

If the refactor must be sequenced aggressively, the highest-value order is:

1. Shared package skeleton
2. Buttons and form primitives
3. Dialogs
4. Card surfaces and panel headers
5. KPI cards
6. Loading and empty states
7. Filters and pagination
8. Transaction history
9. Tables and chart shells
10. Templates

## Risks and guardrails

- Highest risk:
  Dialog behavior, form behavior, and complex import workflows
- Medium risk:
  Transaction history and table abstractions, because row content varies by domain
- Lowest risk:
  Loading states, empty states, card shells, and button extraction

Guardrails for implementation:

- Keep each PR visual-only where possible; do not mix data-layer rewrites with UI extraction.
- Leave feature containers and hooks in `packages/frontend`.
- Prefer re-export shims during migration to avoid import churn across the app.
- Only promote a component to shared if its API can stay domain-agnostic.
- Do not generalize brand/marketing compositions until at least two screens need the same abstraction.

## Conclusion

The repo is already close to a design-system shape, but the reusable pieces currently stop at the `frontend` package boundary and are inconsistently adopted inside feature folders. The most pragmatic path is to promote the existing best primitives into a dedicated frontend design-system layer under `packages/frontend/src/components/ui`, add a small number of missing atoms and molecules, and then migrate feature components in narrow PR-sized steps.

This should be treated as an extraction and consolidation effort, not a rewrite.

## Progress Tracker

- [x] Ticket 1. Scaffold frontend design-system structure
- [x] Ticket 2. Extract shared action primitives
- [x] Ticket 3. Build the shared field system
- [x] Ticket 4. Consolidate dialog shells
- [x] Ticket 5. Introduce shared card and panel header primitives
- [x] Ticket 6. Normalize KPI summary cards
- [x] Ticket 7. Unify loading and empty states
- [ ] Ticket 8. Extract segmented controls and pagination
- [ ] Ticket 9. Promote transaction history into shared
- [ ] Ticket 10. Introduce shared table and chart shells
- [ ] Ticket 11. Add lightweight shared UI verification
