/* global supabase */

// Supabase helper for the MEYS/MUMS static app.
// Exposes window.SB = { getClient(), signIn(), signOut(), getProfile(), adminCreateUser(), ... }

(function () {
  function env() {
    return window.__MEYS_ENV || {};
  }

  function isEnabled() {
    const e = env();
    return !!(e.SUPABASE_URL && e.SUPABASE_ANON_KEY);
  }

  function functionsBase() {
    const e = env();
    if (e.SUPABASE_FUNCTIONS_BASE) return e.SUPABASE_FUNCTIONS_BASE;
    if (e.SUPABASE_URL) return e.SUPABASE_URL.replace(/\/$/, '') + '/functions/v1';
    return '';
  }

  let _client = null;

  function getClient() {
    if (!isEnabled()) return null;
    if (_client) return _client;
    if (!window.supabase || !window.supabase.createClient) {
      throw new Error('Supabase JS not loaded. Ensure the supabase-js CDN script is included before sb.js');
    }
    const e = env();
    _client = window.supabase.createClient(e.SUPABASE_URL, e.SUPABASE_ANON_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
      },
    });
    return _client;
  }

  async function getSession() {
    const client = getClient();
    if (!client) return null;
    const { data, error } = await client.auth.getSession();
    if (error) throw error;
    return data.session || null;
  }

  async function signIn(email, password) {
    const client = getClient();
    if (!client) throw new Error('Supabase not configured (env.js missing/empty).');
    const { data, error } = await client.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data;
  }

  async function signOut() {
    const client = getClient();
    if (!client) return;
    await client.auth.signOut();
  }

  async function getProfile(userId) {
    const client = getClient();
    if (!client) return null;
    const { data, error } = await client
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle();
    if (error) throw error;
    return data || null;
  }

  // Creates a user in Supabase Auth + profiles via Edge Function.
  async function adminCreateUser(payload, accessToken) {
    const base = functionsBase();
    if (!base) throw new Error('Supabase functions base URL not configured.');
    const res = await fetch(base.replace(/\/$/, '') + '/admin-create-user', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(accessToken ? { Authorization: 'Bearer ' + accessToken } : {}),
      },
      body: JSON.stringify(payload),
    });
    const text = await res.text();
    let json;
    try { json = text ? JSON.parse(text) : {}; } catch { json = { raw: text }; }
    if (!res.ok) {
      const msg = (json && (json.error || json.message)) ? (json.error || json.message) : (text || 'Request failed');
      throw new Error(msg);
    }
    return json;
  }

  async function getAccessToken() {
    const s = await getSession();
    return s && s.access_token ? s.access_token : null;
  }

  async function listProfiles() {
    const client = getClient();
    const { data, error } = await client
      .from("profiles")
      .select("*")
      .order("created_at", { ascending: true });
    if (error) throw error;
    return data || [];
  }

  function profileRowToUser(r) {
    return {
      id: r.id,
      username: r.username || "",
      fullName: r.full_name || "",
      email: (r.username ? (r.username + ".local") : ""),
      role: r.role || "MEMBER",
      teamId: r.team_id || "Morning Shift",
      status: r.status || "ACTIVE",
      themeId: r.theme_id || "default",
      scheduleId: r.schedule_id || null,
      createdAt: r.created_at || null
    };
  }

  async function fetchUsersFromProfiles() {
    const rows = await listProfiles();
    return rows.map(profileRowToUser);
  }

  async function syncUsersToLocalStore() {
    const users = await fetchUsersFromProfiles();
    if (window.Store && typeof window.Store.saveUsers === "function") {
      window.Store.saveUsers(users);
    } else {
      try { localStorage.setItem("ums_users", JSON.stringify(users)); } catch {}
    }
    return users;
  }

  window.SB = {
    isEnabled,
    env,
    functionsBase,
    getClient,
    getSession,
    getAccessToken,
    signIn,
    signOut,
    getProfile,
    adminCreateUser,
    fetchUsersFromProfiles,
    syncUsersToLocalStore,
  };
})();
