-- Add fee_type_id to billing_records so billing can be categorised by fee type.
ALTER TABLE billing_records
  ADD COLUMN IF NOT EXISTS fee_type_id UUID REFERENCES fee_types(id) ON DELETE SET NULL;

-- Super-admin bypass (matches pattern used for all other tables in migration 002)
CREATE POLICY "super_admin_all_billing_records_fee_type"
  ON billing_records
  FOR ALL
  TO authenticated
  USING (is_super_admin())
  WITH CHECK (is_super_admin());
