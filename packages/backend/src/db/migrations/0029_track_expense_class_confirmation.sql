ALTER TABLE "budget_categories" ADD COLUMN "expense_class_confirmed" boolean DEFAULT false NOT NULL;--> statement-breakpoint
UPDATE "budget_categories"
SET
  "expense_class" = CASE "name"
    WHEN 'Restaurants & Bars' THEN 'discretionary'
    WHEN 'Shopping' THEN 'discretionary'
    WHEN 'Subscriptions' THEN 'discretionary'
    WHEN 'Entertainment' THEN 'discretionary'
    WHEN 'Travel' THEN 'discretionary'
    WHEN 'Personal Care' THEN 'discretionary'
    ELSE 'essential'
  END,
  "expense_class_confirmed" = true
WHERE "name" IN (
  'Groceries',
  'Restaurants & Bars',
  'Transport',
  'Fuel',
  'Shopping',
  'Subscriptions',
  'Entertainment',
  'Health',
  'Utilities',
  'Personal Care',
  'Travel',
  'Uncategorised'
);
