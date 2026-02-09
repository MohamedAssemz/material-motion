

## Enforce "At Least 1 Admin" Rule

### Summary

Prevent the last remaining admin from changing their primary role to a non-admin role. The guard needs to be applied in two places: the UI (to disable the option) and the backend edge function (to enforce it server-side).

### Changes

**1. `src/pages/Admin.tsx` (Client-side guard)**

- Compute `adminCount`: count users whose `primary_role === 'admin'`
- When rendering the Primary Role `<Select>` for a user whose `primary_role === 'admin'` and `adminCount === 1`:
  - Disable the Select entirely
  - Add a tooltip or small helper text: "Last admin"
- This prevents the UI from even allowing the change

**2. `supabase/functions/admin-users/index.ts` (Server-side guard)**

In the `update-primary-role` case, before updating, check if the user currently has `primary_role === 'admin'` and the new role is not `admin`. If so, count how many other users have `primary_role = 'admin'`. If the count is 0, reject with an error.

```typescript
// Before updating, check if this would remove the last admin
if (oldPrimaryRole === 'admin' && primary_role !== 'admin') {
  const { count } = await supabaseAdmin
    .from('profiles')
    .select('id', { count: 'exact', head: true })
    .eq('primary_role', 'admin')
    .neq('id', user_id);

  if (count === 0) {
    return error 403: "Cannot change role: at least one admin must exist"
  }
}
```

Also apply the same check in the `delete` case -- prevent deleting the last admin user.

### Files to Modify

| File | Change |
|------|--------|
| `src/pages/Admin.tsx` | Compute `adminCount`, disable primary role Select for the sole admin |
| `supabase/functions/admin-users/index.ts` | Add server-side guard in `update-primary-role` and `delete` cases |

