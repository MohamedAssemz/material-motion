

## User Role Management & Authentication Overhaul

### Overview
Transform the authentication flow from self-signup to admin-managed user creation. Admins will create users with credentials, assign a primary role, and manage additional roles. Users can only sign in with provided credentials.

---

### Current State Analysis

**Auth Page (`src/pages/Auth.tsx`):**
- Has both Sign In and Sign Up tabs
- Uses `supabase.auth.signUp()` for self-registration
- Profiles are created automatically via database trigger

**Admin Page (`src/pages/Admin.tsx`):**
- Displays users from `profiles` table
- Can add/remove roles from existing users
- No ability to create users, update passwords, or delete users

**Database:**
- `profiles` table: id, email, full_name, created_at, updated_at
- `user_roles` table: id, user_id, role (app_role enum)
- Trigger `handle_new_user()` creates profile on signup

---

### Implementation Plan

#### Phase 1: Database Changes

**1.1 Add `primary_role` column to profiles table**

```sql
ALTER TABLE public.profiles 
ADD COLUMN primary_role public.app_role DEFAULT 'viewer';
```

This distinguishes the user's main role from additional roles in `user_roles`.

**1.2 Create Edge Function for Admin User Management**

Since creating/deleting users in `auth.users` requires the service role key, we need an edge function:

```text
supabase/functions/admin-users/index.ts
```

This function will handle:
- **Create user**: Uses Supabase Admin API to create user with email/password
- **Update password**: Reset user password
- **Delete user**: Remove user from auth.users (cascades to profiles)

---

#### Phase 2: Edge Function Implementation

**`admin-users` Edge Function:**

| Endpoint | Method | Action |
|----------|--------|--------|
| `/admin-users?action=create` | POST | Create new user with email, password, full_name, primary_role |
| `/admin-users?action=update-password` | POST | Update user's password |
| `/admin-users?action=delete` | POST | Delete user account |

**Security:**
- Validates JWT token from request
- Checks if caller has `admin` role using the `has_role` database function
- Returns 403 if not authorized

---

#### Phase 3: Auth Page Updates

**3.1 Simplify Auth page (`src/pages/Auth.tsx`):**
- Remove the Sign Up tab completely
- Show only Sign In form
- Update description text to reflect admin-provided credentials

---

#### Phase 4: Admin Page Enhancements

**4.1 Redesign Admin page (`src/pages/Admin.tsx`):**

**New Features:**
1. **Create User Dialog**
   - Email input
   - Password input (with show/hide toggle)
   - Full Name input
   - Primary Role dropdown
   - "Create User" button

2. **User Cards Enhancement**
   - Show primary role as main badge (different style)
   - Show additional roles as secondary badges
   - Actions dropdown with:
     - Edit credentials (opens dialog to update email/password)
     - Change primary role
     - Delete user (with confirmation)

3. **Add Extra Roles Section**
   - Keep existing role addition functionality
   - Clarify UI that these are "additional" roles

**4.2 Create New Components:**

| Component | Purpose |
|-----------|---------|
| `CreateUserDialog.tsx` | Modal for creating new users |
| `EditUserDialog.tsx` | Modal for editing email/password |
| `DeleteUserConfirmation.tsx` | Confirmation dialog for user deletion |

---

#### Phase 5: Context Updates

**5.1 Update AuthContext (`src/contexts/AuthContext.tsx`):**
- Add `primaryRole` to context state
- Fetch primary role from profiles table alongside user_roles
- Update `hasRole` to check primary role as well

---

### File Changes Summary

| File | Action | Changes |
|------|--------|---------|
| `src/pages/Auth.tsx` | Modify | Remove signup, sign-in only |
| `src/pages/Admin.tsx` | Major rewrite | Add create/edit/delete user functionality |
| `src/components/CreateUserDialog.tsx` | Create | New user creation modal |
| `src/components/EditUserDialog.tsx` | Create | Edit credentials modal |
| `src/contexts/AuthContext.tsx` | Modify | Add primary role support |
| `supabase/functions/admin-users/index.ts` | Create | Admin API for user management |

---

### Database Migration

```sql
-- Add primary_role column to profiles
ALTER TABLE public.profiles 
ADD COLUMN primary_role public.app_role DEFAULT 'viewer';

-- Update existing profiles with their first role (or 'admin' for admin users)
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
  
  -- Also insert the primary role into user_roles
  INSERT INTO public.user_roles (user_id, role)
  VALUES (
    new.id,
    COALESCE((new.raw_user_meta_data->>'primary_role')::public.app_role, 'viewer')
  );
  
  RETURN new;
END;
$$;
```

---

### UI Flow After Implementation

```text
+------------------+     +------------------------+
|   Auth Page      |     |      Admin Page        |
+------------------+     +------------------------+
| [Sign In Form]   |     | [+ Create User]        |
| - Email          |     |                        |
| - Password       |     | User Cards:            |
| [Sign In Button] |     | +--------------------+ |
+------------------+     | | John Doe           | |
                         | | john@company.com   | |
                         | | Primary: Packer    | |
                         | | Extra: QC, Boxer   | |
                         | | [Edit] [Delete]    | |
                         | +--------------------+ |
                         +------------------------+
```

---

### Technical Details

**Edge Function Security Pattern:**

```typescript
// Verify admin role before any operation
const { data: { user } } = await supabase.auth.getUser(token);
const { data: isAdmin } = await supabase.rpc('has_role', {
  _user_id: user.id,
  _role: 'admin'
});
if (!isAdmin) return new Response('Forbidden', { status: 403 });
```

**Supabase Admin API for User Creation:**

```typescript
const { data, error } = await supabaseAdmin.auth.admin.createUser({
  email,
  password,
  email_confirm: true, // Auto-confirm email
  user_metadata: { full_name, primary_role }
});
```

---

### Implementation Order

1. Create database migration (add primary_role, update trigger)
2. Create edge function for admin user management
3. Update Auth page (remove signup)
4. Create dialog components
5. Update Admin page with new functionality
6. Update AuthContext for primary role support
7. Test complete flow

