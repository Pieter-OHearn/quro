WITH categories_with_sort AS (
  SELECT
    id,
    user_id,
    name,
    budgeted,
    year * 12 + CASE month
      WHEN 'Jan' THEN 0
      WHEN 'Feb' THEN 1
      WHEN 'Mar' THEN 2
      WHEN 'Apr' THEN 3
      WHEN 'May' THEN 4
      WHEN 'Jun' THEN 5
      WHEN 'Jul' THEN 6
      WHEN 'Aug' THEN 7
      WHEN 'Sep' THEN 8
      WHEN 'Oct' THEN 9
      WHEN 'Nov' THEN 10
      WHEN 'Dec' THEN 11
      ELSE -1
    END AS month_sort
  FROM budget_categories
),
budget_backfill AS (
  SELECT zero_budget.id, template.budgeted
  FROM categories_with_sort zero_budget
  CROSS JOIN LATERAL (
    SELECT source.budgeted
    FROM categories_with_sort source
    WHERE source.user_id IS NOT DISTINCT FROM zero_budget.user_id
      AND source.name = zero_budget.name
      AND source.id <> zero_budget.id
      AND source.budgeted > 0
    ORDER BY
      CASE WHEN source.month_sort <= zero_budget.month_sort THEN 0 ELSE 1 END,
      ABS(source.month_sort - zero_budget.month_sort),
      source.month_sort DESC,
      source.id DESC
    LIMIT 1
  ) template
  WHERE zero_budget.budgeted = 0
)
UPDATE budget_categories bc
SET budgeted = budget_backfill.budgeted
FROM budget_backfill
WHERE bc.id = budget_backfill.id;
