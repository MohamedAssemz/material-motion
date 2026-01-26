import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { useNavigate } from 'react-router-dom';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  userRoles: string[];
  primaryRole: string | null;
  loading: boolean;
  signOut: () => Promise<void>;
  hasRole: (role: string) => boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [userRoles, setUserRoles] = useState<string[]>([]);
  const [primaryRole, setPrimaryRole] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    // Set up auth state listener
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        
        // Fetch user roles when session changes
        if (session?.user) {
          setTimeout(() => {
            fetchUserData(session.user.id);
          }, 0);
        } else {
          setUserRoles([]);
          setPrimaryRole(null);
        }
      }
    );

    // Check for existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      
      if (session?.user) {
        fetchUserData(session.user.id);
      }
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const fetchUserData = async (userId: string) => {
    try {
      // Fetch roles
      const { data: rolesData, error: rolesError } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', userId);

      if (rolesError) throw rolesError;
      setUserRoles(rolesData?.map(r => r.role) || []);

      // Fetch primary role from profile
      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('primary_role')
        .eq('id', userId)
        .single();

      if (profileError) throw profileError;
      setPrimaryRole(profileData?.primary_role || null);
    } catch (error) {
      console.error('Error fetching user data:', error);
      setUserRoles([]);
      setPrimaryRole(null);
    }
  };

  const signOut = async () => {
    try {
      // Try to sign out on server
      await supabase.auth.signOut({ scope: 'global' });
    } catch (error) {
      // Session might already be invalid - that's fine
      console.warn('Sign out error (session may already be invalid):', error);
    }
    
    // Always clear local state regardless of server response
    setUser(null);
    setSession(null);
    setUserRoles([]);
    setPrimaryRole(null);
    
    // Navigate to auth page
    navigate('/auth');
  };

  const hasRole = (role: string) => {
    return userRoles.includes(role) || userRoles.includes('admin') || primaryRole === role || primaryRole === 'admin';
  };

  return (
    <AuthContext.Provider value={{ user, session, userRoles, primaryRole, loading, signOut, hasRole }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
