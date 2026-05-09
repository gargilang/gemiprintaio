-- Stage 2: dynamic posting rules + cash flow classification.

ALTER TABLE chart_of_accounts
ADD COLUMN IF NOT EXISTS is_cash_account BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE chart_of_accounts
ADD COLUMN IF NOT EXISTS cash_flow_group TEXT
  CHECK (cash_flow_group IN ('operating','investing','financing','non_cash'));
UPDATE chart_of_accounts
SET is_cash_account = TRUE
WHERE account_code IN ('1-1000','1-1100');
UPDATE chart_of_accounts
SET cash_flow_group =
  CASE
    WHEN account_type IN ('revenue','expense') THEN 'operating'
    WHEN account_type = 'asset' THEN 'investing'
    WHEN account_type IN ('liability','equity') THEN 'financing'
    ELSE 'non_cash'
  END
WHERE cash_flow_group IS NULL;
