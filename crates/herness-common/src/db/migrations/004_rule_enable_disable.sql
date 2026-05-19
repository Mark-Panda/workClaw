-- Migrate existing 'active' status to 'enabled' for backward compatibility
UPDATE rule_chains SET status = 'enabled' WHERE status = 'active';

-- Add index for efficient lookup of enabled chains during preload
CREATE INDEX IF NOT EXISTS idx_rule_chains_status ON rule_chains(status);
