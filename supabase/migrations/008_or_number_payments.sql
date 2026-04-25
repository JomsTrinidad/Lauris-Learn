-- Add official receipt number to payments
ALTER TABLE payments ADD COLUMN IF NOT EXISTS or_number VARCHAR(50);
