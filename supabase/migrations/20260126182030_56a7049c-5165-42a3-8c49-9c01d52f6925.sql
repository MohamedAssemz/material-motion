-- Add primary_role column to profiles
ALTER TABLE public.profiles 
ADD COLUMN primary_role public.app_role DEFAULT 'viewer';

-- Update existing profiles with their first role (or 'viewer' as fallback)
UPDATE public.profiles p
SET primary_role = COALESCE(
  (SELECT role FROM public.user_roles WHERE user_id = p.id ORDER BY created_at LIMIT 1),
  'viewer'
);

-- Update handle_new_user trigger to accept primary_role from metadata
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, primary_role)
  VALUES (
    new.id,
    new.email,
    COALESCE(new.raw_user_meta_data->>'full_name', new.email),
    COALESCE((new.raw_user_meta_data->>'primary_role')::public.app_role, 'viewer')
  );
  
  -- Also insert the primary role into user_roles for consistency
  INSERT INTO public.user_roles (user_id, role)
  VALUES (
    new.id,
    COALESCE((new.raw_user_meta_data->>'primary_role')::public.app_role, 'viewer')
  );
  
  RETURN new;
END;
$$;