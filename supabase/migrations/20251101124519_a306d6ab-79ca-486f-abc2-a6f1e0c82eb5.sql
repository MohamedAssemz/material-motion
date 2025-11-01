-- Add new unit states for packaging and boxing materials
ALTER TYPE unit_state ADD VALUE IF NOT EXISTS 'waiting_for_packaging_material';
ALTER TYPE unit_state ADD VALUE IF NOT EXISTS 'waiting_for_boxing_material';

-- Create function to notify users about unit updates
CREATE OR REPLACE FUNCTION notify_unit_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  order_num TEXT;
  unit_serial TEXT;
  target_role_current app_role;
  target_role_next app_role;
BEGIN
  -- Get order number and unit serial
  SELECT o.order_number, NEW.serial_no
  INTO order_num, unit_serial
  FROM orders o
  WHERE o.id = NEW.order_id;

  -- Determine roles to notify based on new state
  CASE NEW.state
    WHEN 'waiting_for_rm' THEN
      target_role_current := 'manufacture_lead';
      target_role_next := 'manufacture_lead';
    WHEN 'manufacturing' THEN
      target_role_current := 'manufacturer';
      target_role_next := 'qc';
    WHEN 'qc' THEN
      target_role_current := 'qc';
      target_role_next := 'packer';
    WHEN 'waiting_for_packaging_material' THEN
      target_role_current := 'packaging_manager';
      target_role_next := 'packer';
    WHEN 'packaging' THEN
      target_role_current := 'packer';
      target_role_next := 'boxer';
    WHEN 'waiting_for_boxing_material' THEN
      target_role_current := 'boxing_manager';
      target_role_next := 'boxer';
    WHEN 'boxing' THEN
      target_role_current := 'boxer';
      target_role_next := 'admin';
    WHEN 'complete' THEN
      target_role_current := 'admin';
      target_role_next := 'admin';
    ELSE
      target_role_current := 'admin';
      target_role_next := 'admin';
  END CASE;

  -- Create notifications for current role users
  INSERT INTO notifications (target_role, order_id, unit_ids, type, message)
  VALUES (
    target_role_current,
    NEW.order_id,
    ARRAY[NEW.id],
    'unit_update',
    'Unit ' || COALESCE(unit_serial, 'N/A') || ' in order ' || order_num || ' updated to ' || NEW.state
  );

  -- Create notifications for next role users if different
  IF target_role_next IS DISTINCT FROM target_role_current THEN
    INSERT INTO notifications (target_role, order_id, unit_ids, type, message)
    VALUES (
      target_role_next,
      NEW.order_id,
      ARRAY[NEW.id],
      'unit_ready',
      'Unit ' || COALESCE(unit_serial, 'N/A') || ' in order ' || order_num || ' is ready for ' || target_role_next
    );
  END IF;

  RETURN NEW;
END;
$$;

-- Create trigger for unit updates
DROP TRIGGER IF EXISTS unit_update_notification ON units;
CREATE TRIGGER unit_update_notification
  AFTER UPDATE OF state ON units
  FOR EACH ROW
  WHEN (OLD.state IS DISTINCT FROM NEW.state)
  EXECUTE FUNCTION notify_unit_update();

-- Create function to check and notify late units
CREATE OR REPLACE FUNCTION check_late_units()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  late_unit RECORD;
  order_num TEXT;
BEGIN
  FOR late_unit IN
    SELECT 
      u.id,
      u.order_id,
      u.serial_no,
      u.state,
      eta.eta,
      eta.stage
    FROM units u
    JOIN unit_stage_eta eta ON eta.unit_id = u.id
    WHERE eta.eta < NOW()
      AND eta.notified = false
      AND u.state != 'complete'
  LOOP
    -- Get order number
    SELECT order_number INTO order_num
    FROM orders
    WHERE id = late_unit.order_id;

    -- Create late notification
    INSERT INTO notifications (target_role, order_id, unit_ids, type, message)
    VALUES (
      'admin',
      late_unit.order_id,
      ARRAY[late_unit.id],
      'eta_exceeded',
      'Unit ' || COALESCE(late_unit.serial_no, 'N/A') || ' in order ' || order_num || ' is late for stage ' || late_unit.stage
    );

    -- Mark as notified
    UPDATE unit_stage_eta
    SET notified = true
    WHERE unit_id = late_unit.id AND stage = late_unit.stage;
  END LOOP;
END;
$$;