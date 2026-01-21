// Authentication layer.
//
// IMPORTANT:
// - If Supabase is configured (window.__MEYS_ENV + window.SB), auth uses Supabase Auth.
// - If not configured, it falls back to the legacy local-only user DB.

(function () {
  let currentUser = null;

  function normalizeIdentifierToEmail(identifier) {
    const raw = (identifier || '').trim();
    if (!raw) return '';
    if (raw.includes('@')) return raw.toLowerCase();
    // Legacy behavior: username → username@mums.local
    return `${raw.toLowerCase()}@mums.local`;
  }

  async function getSupabaseSessionUser() {
    if (!window.SB || !window.SB.isEnabled()) return null;
    const sb = window.SB.getClient();
    const { data, error } = await sb.auth.getSession();
    if (error) throw error;
    return data.session?.user || null;
  }

  async function loadProfile(uid) {
    const sb = window.SB.getClient();
    const { data, error } = await sb
      .from('profiles')
      .select('id, username, full_name, role, team_id, status, theme_id')
      .eq('id', uid)
      .maybeSingle();

    if (error) throw error;
    return data || null;
  }

  function profileToAppUser(profile, email) {
    return {
      id: profile.id,
      username: profile.username || '',
      fullName: profile.full_name || '',
      email: email || '',
      role: profile.role || 'MEMBER',
      teamId: profile.team_id || 'Morning Shift',
      status: profile.status || 'Active',
      themeId: profile.theme_id || 'light',
      // scheduleId remains local-only for now (Master Schedule feature)
      scheduleId: null,
    };
  }

  async function ensureUserLoaded() {
    if (currentUser) return currentUser;

    // Supabase mode
    if (window.SB && window.SB.isEnabled()) {
      const sbUser = await getSupabaseSessionUser();
      if (!sbUser) return null;

      const profile = await loadProfile(sbUser.id);
      if (!profile) {
        // This usually means the schema/trigger wasn't applied yet.
        throw new Error(
          'Profile not found for this auth user. Run the MEYS/MUMS schema SQL (profiles trigger + RLS) then try again.'
        );
      }

      currentUser = profileToAppUser(profile, sbUser.email);
      try { window.Store.setSession({ userId: currentUser.id, at: Date.now(), mode: 'supabase' }); } catch (_) {}
      return currentUser;
    }

    // Legacy local mode
    try {
      const sess = window.Store.getSession?.();
      const userId = sess?.userId;
      if (!userId) return null;
      const u = window.Store.getUserById?.(userId);
      if (!u) return null;
      currentUser = u;
      return currentUser;
    } catch (_) {
      return null;
    }
  }

  window.Auth = {
    // For app pages
    async getUser() {
      return ensureUserLoaded();
    },

    async requireLogin() {
      const u = await ensureUserLoaded();
      if (!u) window.location.href = './login.html';
      return u;
    },

    // Login form
    async login(identifier, password) {
      // Supabase mode
      if (window.SB && window.SB.isEnabled()) {
        const email = normalizeIdentifierToEmail(identifier);
        if (!email || !password) return { ok: false, message: 'Please enter email/username and password.' };

        const { user, error } = await window.SB.signIn(email, password);
        if (error) {
          return { ok: false, message: error.message || 'Login failed.' };
        }

        const profile = await loadProfile(user.id);
        if (!profile) {
          return {
            ok: false,
            message:
              'Login succeeded but profile row is missing. Run the schema SQL (profiles trigger + RLS) then try again.',
          };
        }

        currentUser = profileToAppUser(profile, user.email);
        try { window.Store.setSession({ userId: currentUser.id, at: Date.now(), mode: 'supabase' }); } catch (_) {}
        return { ok: true, user: currentUser };
      }

      // Legacy local mode
      const idf = (identifier || '').trim();
      const pass = (password || '').trim();
      if (!idf || !pass) return { ok: false, message: 'Please enter username/email and password.' };

      const u = window.Store.findUserByLogin?.(idf, pass);
      if (!u) return { ok: false, message: 'User not found.' };

      currentUser = u;
      try { window.Store.setSession({ userId: u.id, at: Date.now(), mode: 'local' }); } catch (_) {}
      return { ok: true, user: u };
    },

    async logout() {
      currentUser = null;
      try { window.Store.setSession(null); } catch (_) {}
      if (window.SB && window.SB.isEnabled()) {
        try { await window.SB.signOut(); } catch (_) {}
      }
      window.location.href = './login.html';
    },
  };
})();
