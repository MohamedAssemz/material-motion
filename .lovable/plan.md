

## Fix: Auto-Login Loop After Logout

### Problem
When logging out, the user gets logged back in immediately. This is caused by:

1. **Session invalidation on password change**: When an admin updates any user's password (including their own), Supabase invalidates all existing sessions server-side
2. **Failed logout with stale cache**: The `signOut()` call fails with "session_not_found" (403) but doesn't clear local storage
3. **Auth page reads stale token**: The Auth page calls `getSession()` which reads from local storage cache and finds the old (invalid) token
4. **Auto-redirect**: The Auth page navigates back to `/` thinking the user is still logged in

### Evidence from Logs

Network requests show multiple failed logout attempts:
```text
POST /auth/v1/logout?scope=global
Status: 403
Response: {"code":"session_not_found","message":"Session from session_id claim in JWT does not exist"}
```

This happens because the password was just updated for the current user, which invalidated their session.

---

### Solution

#### 1. Improve `signOut()` in AuthContext

Handle the case where `signOut()` returns an error (session already invalid) by manually clearing local state:

```typescript
const signOut = async () => {
  try {
    const { error } = await supabase.auth.signOut();
    // If signOut fails (session already invalid), still clear local state
    if (error) {
      console.warn('Sign out returned error:', error.message);
    }
  } catch (e) {
    console.warn('Sign out exception:', e);
  }
  
  // Always clear local state regardless of server response
  setUser(null);
  setSession(null);
  setUserRoles([]);
  setPrimaryRole(null);
  navigate('/auth');
};
```

#### 2. Fix Auth Page Session Check

The Auth page should verify the session is **actually valid** on the server, not just cached:

```typescript
useEffect(() => {
  // Check if user is already logged in with a VALID session
  supabase.auth.getSession().then(async ({ data: { session } }) => {
    if (session) {
      // Verify session is still valid by making a lightweight API call
      const { data: { user }, error } = await supabase.auth.getUser();
      if (user && !error) {
        navigate('/');
      }
      // If error or no user, the session is invalid - stay on auth page
    }
  });
}, [navigate]);
```

#### 3. Force Refresh After Password Update

When a user updates their **own** password, immediately sign them out since their session is invalidated:

In `EditUserDialog.tsx`, after password update:
```typescript
// If user updated their own password, force sign out
if (user.id === currentUser?.id) {
  toast.info('Password updated. Please sign in again.');
  await supabase.auth.signOut({ scope: 'local' }); // Just clear local, don't call server
  navigate('/auth');
}
```

---

### Files to Update

| File | Changes |
|------|---------|
| `src/contexts/AuthContext.tsx` | Improve `signOut()` to always clear local state even on error |
| `src/pages/Auth.tsx` | Verify session validity with `getUser()` before auto-redirecting |
| `src/components/EditUserDialog.tsx` | Force logout when user updates their own password |

---

### Implementation Details

**AuthContext.tsx changes:**

```typescript
const signOut = async () => {
  try {
    // Try to sign out on server
    await supabase.auth.signOut({ scope: 'global' });
  } catch (error) {
    // Session might already be invalid - that's fine
    console.warn('Sign out error (session may already be invalid):', error);
  }
  
  // Always clear local state
  setUser(null);
  setSession(null);
  setUserRoles([]);
  setPrimaryRole(null);
  
  // Navigate to auth page
  navigate('/auth');
};
```

**Auth.tsx changes:**

```typescript
useEffect(() => {
  const checkSession = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    
    if (session) {
      // Verify token is still valid on server
      const { data: { user }, error } = await supabase.auth.getUser();
      
      if (user && !error) {
        navigate('/');
      } else {
        // Session invalid - clear local storage
        await supabase.auth.signOut({ scope: 'local' });
      }
    }
  };
  
  checkSession();
}, [navigate]);
```

**EditUserDialog.tsx changes:**

After successful password update, check if the updated user is the current user:
```typescript
// After password update success
const { data: { user: currentUser } } = await supabase.auth.getUser();
if (currentUser?.id === user.id) {
  toast.info('Your password was updated. Please sign in again with your new password.');
  await supabase.auth.signOut({ scope: 'local' });
  window.location.href = '/auth'; // Hard redirect to clear all state
  return;
}
```

---

### Why This Works

1. **Robust signOut**: Always clears local state, even if server call fails
2. **Valid session check**: Uses `getUser()` which actually verifies the token with the server
3. **Self-password update handling**: Proactively logs out the user when their password changes
4. **Local scope signOut**: When session is already invalid server-side, use `scope: 'local'` to just clear the browser storage without calling the server

