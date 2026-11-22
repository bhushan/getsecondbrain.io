-- A deleted workspace keeps its row for the recovery period, then the daily job erases it.
ALTER TABLE workspaces ADD COLUMN deleted_at INTEGER;
