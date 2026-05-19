-- Track applied migrations to avoid re-running them
CREATE TABLE IF NOT EXISTS _migrations (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Add missing index for node-level audit queries
CREATE INDEX IF NOT EXISTS idx_rule_node_executions_execution
    ON rule_node_executions(execution_id);
