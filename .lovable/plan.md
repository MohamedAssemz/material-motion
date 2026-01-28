

## Fix Primary Role Update Bug and Modernize Admin Page

This plan addresses two issues:
1. **Bug Fix**: Primary role dropdown doesn't update the primary role (only adds to additional roles)
2. **UI Redesign**: Modernize the admin page with a cleaner, more compact layout

---

### Part 1: Fix Primary Role Update Bug

**Problem Identified:**

The current code tries to update the `profiles` table directly from the client, but the database's security policy only allows users to update their **own** profile. When an admin tries to update another user's primary role, the update silently fails. The code then adds the role to the `user_roles` table (which works), making it appear as an additional role instead of a primary role change.

**Solution:**

Route the primary role update through the secure backend function that has elevated permissions.

**Changes to Edge Function (`supabase/functions/admin-users/index.ts`):**

Add a new action `update-primary-role`:
- Accepts `user_id` and `primary_role` in request body
- Uses the admin client to update the `profiles` table (bypasses security restrictions)
- Ensures the new primary role also exists in `user_roles` table
- Removes the old primary role from `user_roles` if no longer needed

**Changes to Admin Page (`src/pages/Admin.tsx`):**

Update the `updatePrimaryRole` function to:
- Call the edge function instead of direct database update
- Handle the response and show appropriate success/error messages

---

### Part 2: Modern UI Redesign

The new design will feature:

**1. Table-Based Layout**
- Replace individual cards with a clean data table
- More compact presentation with less vertical space
- Columns: User (name + email), Primary Role (inline dropdown), Additional Roles (inline badges), Actions

**2. Visual Improvements**
- Subtle row hover effects
- Inline role management (no separate "Add role" section per user)
- Compact role badges with inline remove buttons
- Add role via small popover button within the roles cell
- Cleaner header with stats summary

**3. Layout Structure**

```text
+----------------------------------------------------------+
| [<] User Management                     [+ Create User]  |
|     Manage user accounts and roles                       |
|----------------------------------------------------------+
| 3 users total                                            |
+----------------------------------------------------------+
| User              | Primary Role    | Additional Roles   |
|----------------------------------------------------------|
| Mohamed Assem     | [Admin v]       | Mfg Lead [x]       |
| admin@email.com   |                 | [+ Add]            |
|----------------------------------------------------------|
| John Doe          | [Viewer v]      | Packer [x]         |
| john@email.com    |                 | Boxer [x] [+ Add]  |
+----------------------------------------------------------+
```

**4. Component Changes**

Replace the grid of cards with:
- Use the existing Table component from shadcn/ui
- Inline Select for primary role (smaller, no label)
- Badge chips for additional roles with X button
- Small "+" button to add roles (opens a popover with role selection)
- Actions column with icon buttons (edit, delete)

---

### Technical Implementation

**Files to modify:**

1. **`supabase/functions/admin-users/index.ts`**
   - Add `update-primary-role` action case
   - Update profiles table with admin client
   - Sync with user_roles table

2. **`src/pages/Admin.tsx`**
   - Rewrite `updatePrimaryRole` to use edge function
   - Replace Card-based layout with Table layout
   - Add role management popover for adding roles inline
   - Simplify the overall structure

---

### Benefits

- **Bug Fix**: Primary role updates will work correctly for all users
- **Better UX**: Compact table view shows more users at once
- **Cleaner Design**: No repeated sections per user, inline editing
- **Faster Workflow**: Fewer clicks to manage roles

