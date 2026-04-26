-- Migration 017: Add receipt photo attachment to payments
ALTER TABLE payments ADD COLUMN IF NOT EXISTS receipt_photo_path TEXT;
