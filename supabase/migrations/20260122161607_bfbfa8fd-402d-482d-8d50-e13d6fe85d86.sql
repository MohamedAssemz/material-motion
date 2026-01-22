-- Drop existing check constraint and add new one with all machine types
ALTER TABLE machines DROP CONSTRAINT IF EXISTS machines_type_check;

ALTER TABLE machines ADD CONSTRAINT machines_type_check 
CHECK (type IN ('manufacturing', 'finishing', 'packaging', 'boxing'));