(function(){
  const KEYS = {
    users: 'ums_users',
    // Backstop to reduce risk of accidental overwrite/corruption wiping users
    users_backup: 'ums_users_backup',
    session: 'ums_session',
    announcements: 'ums_announcements',
    cases: 'ums_cases',
    rr: 'ums_rr',
    weekly: 'ums_weekly_schedules',
    auto: 'ums_auto_schedule_settings',
    logs: 'ums_activity_logs',
    locks: 'ums_schedule_locks',
    master: 'ums_master_schedule',
    leaves: 'ums_member_leaves',
    notifs: 'ums_schedule_notifs',
    audit: 'ums_audit',
    profile: 'ums_user_profiles',
    theme: 'mums_theme',
        mailbox_time_override: 'mums_mailbox_time_override',
    // Release notes are stored separately to survive factory reset.
    // Backup key is used to protect notes from accidental deletion.
    release_notes: 'mums_release_notes',
    release_notes_backup: 'mums_release_notes_backup',
  };

  // 6 months retention as requested
  const SIX_MONTHS_MS = 183 * 24 * 60 * 60 * 1000;

  function read(key, fallback){
    try{ const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; }catch(e){ return fallback; }
  }
  function write(key, value, opts){
    localStorage.setItem(key, JSON.stringify(value));
    // Notify same-tab listeners (used to keep UI in sync without reload).
    // NOTE: Some internal migrations/sanitizers run during boot and should not
    // emit store events (they can cause expensive re-renders / perceived freezes).
    const silent = !!(opts && opts.silent);
    if(!silent){
      try{ window.dispatchEvent(new CustomEvent('mums:store', { detail: { key } })); }catch(e){}
    }
  }

  // Users caching to avoid repeated JSON.parse + migration work on hot paths.
  // (Auth.getUser() is called often for UI refresh intervals.)
  let _usersCache = null;
  let _usersRev = '';
  function usersRev(){
    try{ return String(localStorage.getItem('ums_users_rev') || ''); }catch(_){ return ''; }
  }
  function bumpUsersRev(){
    try{ localStorage.setItem('ums_users_rev', String(Date.now())); }catch(_){ }
  }

  // Normalize legacy/corrupt user records so UI logic doesn't crash and roster isn't hidden.
  // This addresses:
  // - missing username/email/role/teamId
  // - role strings in older formats ("member", "Super Admin", etc.)
  // - non-object/null entries in localStorage arrays
  function sanitizeUsers(list){
    const teams = (window.Config && Array.isArray(Config.TEAMS) && Config.TEAMS.length) ? Config.TEAMS : [{id:'morning'}];
    const teamIds = new Set(teams.map(t=>t.id));
    const defaultTeam = teams[0].id;

    const makeId = ()=>{
      try{ if(window.crypto && crypto.randomUUID) return crypto.randomUUID(); }catch(_){ }
      return 'id-'+Math.random().toString(16).slice(2)+'-'+Date.now().toString(16);
    };

    const normalizeRole = (role)=>{
      const r0 = String(role||'').trim();
      if(!r0) return (window.Config ? Config.ROLES.MEMBER : 'MEMBER');
      const u = r0.toUpperCase().replace(/\s+/g,'_').replace(/-+/g,'_');
      const map = {
        SUPERADMIN: 'SUPER_ADMIN',
        SUPER_ADMINISTRATOR: 'SUPER_ADMIN',
        SUPERADMINISTRATOR: 'SUPER_ADMIN',
        SUPER_ADMIN: 'SUPER_ADMIN',
        SUPERUSER: 'SUPER_USER',
        SUPER_USER: 'SUPER_USER',
        ADMINISTRATOR: 'ADMIN',
        ADMIN: 'ADMIN',
        TEAMLEAD: 'TEAM_LEAD',
        TEAM_LEAD: 'TEAM_LEAD',
        TEAMLEADER: 'TEAM_LEAD',
        LEAD: 'TEAM_LEAD',
        MEMBER: 'MEMBER',
        MEMBERS: 'MEMBER',
        USER: 'MEMBER'
      };
      return map[u] || (window.Config && Config.ROLES[u] ? u : 'MEMBER');
    };

    const out = [];
    for(const raw of (Array.isArray(list) ? list : [])){
      if(!raw || typeof raw !== 'object') continue;
      const u = { ...raw };

      u.id = String(u.id||'').trim() || makeId();

      // username: required across the app (sorting, filters, uniqueness checks)
      const email = String(u.email||'').trim();
      let username = String(u.username||'').trim();
      if(!username && email.includes('@')) username = email.split('@')[0];
      if(!username) username = 'user_' + u.id.slice(0,6);
      u.username = username;

      // name: optional but improve UX
      u.name = String(u.name||'').trim() || username;

      // role/team normalization (prevents "members not visible" due to role mismatch)
      u.role = normalizeRole(u.role);
      u.teamId = String(u.teamId||'').trim() || defaultTeam;
      if(!teamIds.has(u.teamId)) u.teamId = defaultTeam;

      u.status = String(u.status||'active');
      // back-compat for older password field
      if(!u.passwordHash && u.password){
        try{ u.passwordHash = window.Auth ? Auth.hash(u.password) : u.password; }catch(_){ }
        delete u.password;
      }
      out.push(u);
    }

    // Deduplicate by (id) first, then username/email
    const byId = new Map();
    for(const u of out){ if(!byId.has(u.id)) byId.set(u.id, u); }
    const merged = Array.from(byId.values());
    const keyOf = (u)=>String(u.username||u.email||u.id||'').trim().toLowerCase();
    const seen = new Set();
    const finalList = [];
    for(const u of merged){
      const k = keyOf(u);
      if(!k || seen.has(k)) continue;
      seen.add(k);
      finalList.push(u);
    }
    return finalList;
  }


  // Normalize announcement records to avoid hidden items or runtime errors.
  function sanitizeAnnouncements(list){
    const out = [];
    for(const raw of (Array.isArray(list) ? list : [])){
      if(!raw || typeof raw !== 'object') continue;
      const a = { ...raw };
      a.id = String(a.id||'').trim() || ('ann-'+Math.random().toString(16).slice(2)+'-'+Date.now().toString(16));
      a.title = String(a.title||'').trim() || 'Announcement';
      a.short = String(a.short||'').trim();
      a.full = String(a.full||'').trim();
      // Full HTML is optional; keep only if string.
      if(a.fullHtml && typeof a.fullHtml !== 'string') delete a.fullHtml;

      // Start/end windows must be numeric ms. If missing, default to always-active window.
      const now = Date.now();
      const startAt = Number(a.startAt);
      const endAt = Number(a.endAt);
      a.startAt = Number.isFinite(startAt) ? startAt : (Number.isFinite(Number(a.createdAt)) ? Number(a.createdAt) : (now - 60*60*1000));
      a.endAt = Number.isFinite(endAt) ? endAt : (a.startAt + 24*60*60*1000);
      a.createdAt = Number.isFinite(Number(a.createdAt)) ? Number(a.createdAt) : a.startAt;

      a.createdBy = a.createdBy ? String(a.createdBy) : '';
      a.createdByName = a.createdByName ? String(a.createdByName) : '';

      out.push(a);
    }
    // Sort stable by start
    out.sort((x,y)=>Number(x.startAt||0)-Number(y.startAt||0));
    return out;
  }

  // Normalize announcement records to avoid hidden items or runtime errors.
  function sanitizeAnnouncements(list){
    const out = [];
    for(const raw of (Array.isArray(list) ? list : [])){
      if(!raw || typeof raw !== 'object') continue;
      const a = { ...raw };
      a.id = String(a.id||'').trim() || ('ann-'+Math.random().toString(16).slice(2)+'-'+Date.now().toString(16));
      a.title = String(a.title||'').trim() || 'Announcement';
      a.short = String(a.short||'').trim();
      a.full = String(a.full||'').trim();
      // Full HTML is optional; keep only if string.
      if(a.fullHtml && typeof a.fullHtml !== 'string') delete a.fullHtml;

      // Start/end windows must be numeric ms. If missing, default to always-active window.
      const now = Date.now();
      const startAt = Number(a.startAt);
      const endAt = Number(a.endAt);
      a.startAt = Number.isFinite(startAt) ? startAt : (Number.isFinite(Number(a.createdAt)) ? Number(a.createdAt) : (now - 60*60*1000));
      a.endAt = Number.isFinite(endAt) ? endAt : (a.startAt + 24*60*60*1000);
      a.createdAt = Number.isFinite(Number(a.createdAt)) ? Number(a.createdAt) : a.startAt;

      a.createdBy = a.createdBy ? String(a.createdBy) : '';
      a.createdByName = a.createdByName ? String(a.createdByName) : '';

      out.push(a);
    }
    // Sort stable by start
    out.sort((x,y)=>Number(x.startAt||0)-Number(y.startAt||0));
    return out;
  }
  // Robust user loading:
  // - recover from backup if primary is empty/corrupt
  // - migrate from legacy keys if present
  function readUsersRobust(){
    const primaryRaw = localStorage.getItem(KEYS.users);
    let primary = null;
    try{ primary = primaryRaw ? JSON.parse(primaryRaw) : null; }catch(e){ primary = null; }
    if(!Array.isArray(primary)) primary = null;

    const backupRaw = localStorage.getItem(KEYS.users_backup);
    let backup = null;
    try{ backup = backupRaw ? JSON.parse(backupRaw) : null; }catch(e){ backup = null; }
    if(!Array.isArray(backup)) backup = null;

    // Legacy keys from older builds / experiments (keep expanding to prevent "missing users" regressions)
    const legacyKeys = [
      'users','vip_users','dashboard_users','umsUsers','ums_users_v1','ums_users_v2',
      // MUMS-branded builds
      'mums_users','mumsUsers','mums_users_v1','mums_users_v2',
      // Backups or alternate prefixes
      'users_backup','vip_users_backup','dashboard_users_backup','ums_users_backup','mums_users_backup'
    ];
    let legacy = [];
    for(const k of legacyKeys){
      const raw = localStorage.getItem(k);
      if(!raw) continue;
      try{
        const arr = JSON.parse(raw);
        if(Array.isArray(arr) && arr.length){ legacy = legacy.concat(arr); }
      }catch(e){ /* ignore */ }
    }

    // Choose best base: primary if non-empty, else backup if non-empty, else legacy.
    let base = (primary && primary.length) ? primary
      : (backup && backup.length) ? backup
      : (legacy && legacy.length) ? legacy
      : [];

    // Merge legacy into base without duplicates (by username/email)
    if(legacy && legacy.length){
      const keyOf = (u)=>String(u?.username||u?.email||u?.id||'').trim().toLowerCase();
      const seen = new Set(base.map(keyOf).filter(Boolean));
      for(const u of legacy){
        const k = keyOf(u);
        if(!k || seen.has(k)) continue;
        seen.add(k);
        base.push(u);
      }
    }

    // If primary was corrupted (raw exists but parse failed), preserve raw for debugging
    if(primaryRaw && !primary){
      try{ localStorage.setItem('ums_users_corrupt_'+Date.now(), primaryRaw); }catch(e){}
    }

    const cleaned = sanitizeUsers(base);
    // Persist sanitized roster to prevent repeat crashes across pages.
    // IMPORTANT: silent writes ...
    try{ write(KEYS.users, cleaned, { silent:true }); write(KEYS.users_backup, cleaned, { silent:true }); }catch(e){}
    return cleaned;
  }

  function uuid(){
    if(window.crypto && crypto.randomUUID) return crypto.randomUUID();
    // fallback
    return 'id-'+Math.random().toString(16).slice(2)+'-'+Date.now().toString(16);
  }

  const Store = {
    ensureSeed(){
      // Use robust loader so a corrupted/empty primary store doesn't wipe the roster.
      const users = readUsersRobust();
      const hasMeys = users.find(u => String(u.username||'').toUpperCase()==='MEYS');
      const defaultTeam = (window.Config && Array.isArray(Config.TEAMS) && Config.TEAMS[0]) ? Config.TEAMS[0].id : 'morning';
      const meys = {
        id: hasMeys && hasMeys.id ? hasMeys.id : uuid(),
        username: 'MEYS',
        email: 'meys@local',
        name: 'MEYS',
        role: (window.Config ? Config.ROLES.SUPER_ADMIN : 'SUPER_ADMIN'),
        teamId: (hasMeys && hasMeys.teamId) ? hasMeys.teamId : defaultTeam,
        schedule: 'mailbox_manager',
        status: 'active',
        passwordHash: window.Auth ? Auth.hash('MEYS') : 'h0',
        createdAt: hasMeys && hasMeys.createdAt ? hasMeys.createdAt : Date.now(),
      };

      let out;
      if(!hasMeys){ out = [meys, ...users]; }
      else {
        out = users.map(u => u.id===hasMeys.id ? { ...u, ...meys, id: hasMeys.id } : u);
      }
      // Write both primary + backup
      write(KEYS.users, out);
      write(KEYS.users_backup, out);
      bumpUsersRev();
      _usersCache = out;
      _usersRev = usersRev();
      if(localStorage.getItem(KEYS.announcements)===null) write(KEYS.announcements, []);
      if(localStorage.getItem(KEYS.cases)===null) write(KEYS.cases, []);
      if(localStorage.getItem(KEYS.rr)===null) write(KEYS.rr, {});
      if(localStorage.getItem(KEYS.logs)===null) write(KEYS.logs, []);
      if(localStorage.getItem(KEYS.locks)===null) write(KEYS.locks, {});
      if(localStorage.getItem(KEYS.profile)===null) write(KEYS.profile, {});
      if(localStorage.getItem(KEYS.theme)===null) localStorage.setItem(KEYS.theme, 'ocean');
      if(localStorage.getItem(KEYS.quicklinks)===null) write(KEYS.quicklinks, Array.from({length:10}, ()=>({label:'', url:'', glowColor:''})));
      // Release notes: initialize once, and also seed the backup store.
      // Notes are intentionally not removed on factory reset.
      if(localStorage.getItem(KEYS.release_notes)===null){
        const init = [{
          id: uuid(),
          version: (document.querySelector('.brand-build') ? (document.querySelector('.brand-build').textContent||'').replace('Build:','').trim() : ''),
          date: Date.now(),
          title: 'Build initialized',
          body: 'Release notes are now available in-app. Future changes will append here (older notes are retained).',
          author: 'SYSTEM',
          tags:['init']
        }];
        write(KEYS.release_notes, init);
        write(KEYS.release_notes_backup, init);
      } else if(localStorage.getItem(KEYS.release_notes_backup)===null){
        // Create backup if a prior build already has notes.
        try{ write(KEYS.release_notes_backup, read(KEYS.release_notes, [])); }catch(_){ }
      }
    },

    // users
    getUsers(){
      let rev = usersRev();
      // If revision missing (older builds), create one so caching works reliably.
      if(!rev){ bumpUsersRev(); rev = usersRev(); }
      if(_usersCache && rev === _usersRev) return _usersCache;
      const loaded = readUsersRobust();
      _usersCache = loaded;
      _usersRev = usersRev() || rev;
      return loaded;
    },
    saveUsers(list){
      const safe = Array.isArray(list) ? list : [];
      write(KEYS.users, safe);
      write(KEYS.users_backup, safe);
      bumpUsersRev();
      _usersCache = safe;
      _usersRev = usersRev();
    },
    // Import users from an external JSON (e.g., to move data into a private/incognito browser).
    // Performs the same normalization used by the robust loader to prevent crashes / hidden members.
    importUsers(list){
      const normalized = sanitizeUsers(Array.isArray(list) ? list : []);
      Store.saveUsers(normalized);
      return normalized.length;
    },

    // Export a portable system snapshot for private/incognito browsers.
    // Includes users + announcements + release notes (and can be extended later).
    exportBundle(){
      const build = (window.Config && Config.BUILD) ? Config.BUILD : '';
      const bundle = {
        kind: 'mums_bundle',
        build,
        exportedAt: Date.now(),
        users: Store.getUsers(),
        announcements: Store.getAnnouncements(),
        releaseNotes: read(KEYS.release_notes, []),
      };
      return bundle;
    },

    // Import a system snapshot.
    // Back-compat:
    // - If an array is provided, treat it as users[] (older exports).
    importBundle(data){
      // Older format: users array only
      if(Array.isArray(data)){
        const n = Store.importUsers(data);
        return { users: n, announcements: 0, releaseNotes: 0 };
      }
      const obj = (data && typeof data === 'object') ? data : null;
      if(!obj) throw new Error('Invalid JSON. Expected a MUMS bundle or users array.');

      let usersN = 0, annN = 0, rnN = 0;
      if(Array.isArray(obj.users)){
        usersN = Store.importUsers(obj.users);
      }
      if(Array.isArray(obj.announcements)){
        const anns = sanitizeAnnouncements(obj.announcements);
        Store.saveAnnouncements(anns);
        annN = anns.length;
      }
      if(Array.isArray(obj.releaseNotes)){
        // Keep release notes append-only by default; merge without deleting.
        const existing = read(KEYS.release_notes, []);
        const merged = Array.isArray(existing) ? existing.slice() : [];
        const seen = new Set(merged.map(x=>x && x.id ? String(x.id) : ''));
        for(const r of (Array.isArray(obj.releaseNotes)?obj.releaseNotes:[])){
          if(!r || typeof r !== 'object') continue;
          const id = String(r.id||'').trim();
          if(!id || seen.has(id)) continue;
          seen.add(id);
          merged.push(r);
        }
        write(KEYS.release_notes, merged);
        // Keep backup in sync for safety
        try{ write(KEYS.release_notes_backup, merged); }catch(_){ }
        rnN = merged.length;
      }
      return { users: usersN, announcements: annN, releaseNotes: rnN };
    },

    addUser(user){
      const users = Store.getUsers();
      users.unshift(user);
      Store.saveUsers(users);
    },
    updateUser(id, patch){
      const users = Store.getUsers().map(u => u.id===id ? { ...u, ...patch, id } : u);
      Store.saveUsers(users);
    },
    deleteUser(id){
      Store.saveUsers(Store.getUsers().filter(u=>u.id!==id));
    },
    findUserByLogin(login){
      const l = String(login||'').trim().toLowerCase();
      return Store.getUsers().find(u => String(u.username||'').toLowerCase()===l || String(u.email||'').toLowerCase()===l);
    },

    // user profile extras (photo, preferences)
    getProfiles(){
      const obj = read(KEYS.profile, {});
      return obj && typeof obj === 'object' ? obj : {};
    },
    saveProfiles(obj){ write(KEYS.profile, obj || {}); },
    getProfile(userId){
      const all = Store.getProfiles();
      return all[userId] || null;
    },
    setProfile(userId, patch){
      const all = Store.getProfiles();
      all[userId] = { ...(all[userId]||{}), ...(patch||{}), userId };
      Store.saveProfiles(all);
    },

    // World clocks (3 programmable digital clocks shown on bottom bar)
    // NOTE: Keys are normalized to match UI/components: hoursColor + minutesColor.
    getWorldClocks(){
      try{
        const raw = localStorage.getItem('mums_worldclocks');
        const arr = raw ? JSON.parse(raw) : null;
        const def = [
          { enabled: false, label: 'Manila', timeZone: 'Asia/Manila', hoursColor: '#ffffff', minutesColor: '#a9c8ff', alarmEnabled: false, alarmTime: '09:00', style: 'classic' },
          { enabled: false, label: 'UTC', timeZone: 'UTC', hoursColor: '#ffffff', minutesColor: '#a9c8ff', alarmEnabled: false, alarmTime: '09:00', style: 'classic' },
          { enabled: false, label: 'New York', timeZone: 'America/New_York', hoursColor: '#ffffff', minutesColor: '#a9c8ff', alarmEnabled: false, alarmTime: '09:00', style: 'classic' },
        ];
        if(!Array.isArray(arr)) return def;
        // Back-compat: migrate old keys (hourColor/minColor) if present.
        const out = def.map((d,i)=>{
          const cur = Object.assign({}, d, arr[i]||{});
          if(cur.hourColor && !cur.hoursColor) cur.hoursColor = cur.hourColor;
          if(cur.minColor && !cur.minutesColor) cur.minutesColor = cur.minColor;
          if(cur.style === 's1') cur.style = 'classic';
          delete cur.hourColor; delete cur.minColor;
          return cur;
        });
        return out;
      }catch(e){
        return [
          { enabled: false, label: 'Manila', timeZone: 'Asia/Manila', hoursColor: '#ffffff', minutesColor: '#a9c8ff', alarmEnabled: false, alarmTime: '09:00', style: 'classic' },
          { enabled: false, label: 'UTC', timeZone: 'UTC', hoursColor: '#ffffff', minutesColor: '#a9c8ff', alarmEnabled: false, alarmTime: '09:00', style: 'classic' },
          { enabled: false, label: 'New York', timeZone: 'America/New_York', hoursColor: '#ffffff', minutesColor: '#a9c8ff', alarmEnabled: false, alarmTime: '09:00', style: 'classic' },
        ];
      }
    },
    saveWorldClocks(list){
      // Save + broadcast change so UI updates instantly without reload.
      // (Some pages rely on store events to re-render bottom widgets.)
      try{
        localStorage.setItem('mums_worldclocks', JSON.stringify(Array.isArray(list)?list:[]));
        try{ window.dispatchEvent(new CustomEvent('mums:store', { detail: { key: 'mums_worldclocks' } })); }catch(_){ }
        try{ window.dispatchEvent(new CustomEvent('mums:worldclocks', { detail: { key: 'mums_worldclocks' } })); }catch(_){ }
      }catch(e){}
    },

    // Theme preference (saved per-user; falls back to last-used on this device/browser)
    // Fixes: theme leaking across accounts when switching users in the same browser.
    getTheme(){
      try{
        const sess = Store.getSession && Store.getSession();
        const userId = (sess && sess.userId) ? String(sess.userId) : '';
        if(userId){
          const prof = Store.getProfile ? (Store.getProfile(userId) || {}) : {};
          const t = (prof && prof.theme) ? String(prof.theme) : '';
          if(t) return t;
          // Migration: if a legacy global theme exists, store it onto the user's profile once.
          const legacy = String(localStorage.getItem(KEYS.theme) || '');
          if(legacy){
            try{ Store.setProfile(userId, { theme: legacy }); }catch(_){ }
            return legacy;
          }
        }
      }catch(_){ }
      return String(localStorage.getItem(KEYS.theme) || 'ocean');
    },
    setTheme(themeId){
      const id = String(themeId||'ocean');
      // Keep a global copy as "last used" for login page / first-time profiles.
      localStorage.setItem(KEYS.theme, id);
      // Save per user when a session exists.
      try{
        const sess = Store.getSession && Store.getSession();
        const userId = (sess && sess.userId) ? String(sess.userId) : '';
        if(userId && Store.setProfile) Store.setProfile(userId, { theme: id });
      }catch(_){ }
      try{ window.dispatchEvent(new CustomEvent('mums:theme', { detail: { id } })); }catch(e){}
    },

    // Release notes
    // - append-only for normal usage
    // - protected by a backup key
    // - can be deleted only by privileged users (UI-gated)
    getReleaseNotes(){
      // Recovery: if main store is missing/corrupt but backup exists, restore.
      let arr = read(KEYS.release_notes, null);
      if(!Array.isArray(arr)){
        const b = read(KEYS.release_notes_backup, []);
        if(Array.isArray(b) && b.length){
          try{ write(KEYS.release_notes, b); }catch(_){ }
          arr = b;
        }
      }
      if(!Array.isArray(arr)) arr = [];
      const list = Array.isArray(arr) ? arr : [];
      // Normalize + sort (newest first)
      return list
        .map(n=>({
          id: String(n && n.id || ''),
          version: String(n && n.version || ''),
          date: Number(n && n.date || 0),
          title: String(n && n.title || ''),
          body: String(n && n.body || ''),
          author: String(n && n.author || ''),
          tags: Array.isArray(n && n.tags) ? n.tags.map(String) : [],
        }))
        .filter(n=>n.version || n.title || n.body)
        .sort((a,b)=>(b.date||0)-(a.date||0));
    },
    // Persist notes.
    // opts.updateBackup (default true): when false, the backup snapshot is NOT overwritten.
    saveReleaseNotes(list, opts){
      const out = Array.isArray(list)?list:[];
      const o = opts || {};
      const updateBackup = (o.updateBackup===undefined) ? true : !!o.updateBackup;
      write(KEYS.release_notes, out);
      // Backup is intentionally protected. We do not overwrite it on destructive operations
      // unless explicitly requested.
      if(updateBackup){
        try{ write(KEYS.release_notes_backup, out); }catch(_){ }
      }
    },
    addReleaseNote(note){
      const list = Store.getReleaseNotes();
      const n = note || {};
      const id = String(n.id || uuid());
      const out = [{
        id,
        version: String(n.version||''),
        date: Number(n.date||Date.now()),
        title: String(n.title||''),
        body: String(n.body||''),
        author: String(n.author||''),
        tags: Array.isArray(n.tags)? n.tags.map(String):[],
      }, ...list];
      Store.saveReleaseNotes(out, { updateBackup:true });
    },

    deleteReleaseNote(noteId){
      const id = String(noteId||'').trim();
      if(!id) return;
      const list = Store.getReleaseNotes().filter(n=>n && String(n.id)!==id);
      // Do not overwrite backup on deletes (security requirement).
      Store.saveReleaseNotes(list, { updateBackup:false });
    },

    clearReleaseNotes(){
      // Clear visible list without wiping the protected backup.
      Store.saveReleaseNotes([], { updateBackup:false });
    },

    // Import notes from array/object. Mode:
    // - merge (default): prepend new unique ids
    // - replace: overwrite with imported list
    importReleaseNotes(payload, mode){
      const m = String(mode||'merge').toLowerCase();
      const normOne = (x)=>{
        if(!x || typeof x !== 'object') return null;
        const n = {
          id: String(x.id || uuid()),
          version: String(x.version||''),
          date: Number(x.date||Date.now()),
          title: String(x.title||''),
          body: String(x.body||x.text||''),
          author: String(x.author||''),
          tags: Array.isArray(x.tags) ? x.tags.map(String) : (String(x.tags||'').split(',').map(s=>s.trim()).filter(Boolean)),
        };
        if(!(n.title||n.body||n.version)) return null;
        return n;
      };
      let arr = [];
      if(Array.isArray(payload)) arr = payload;
      else if(payload && typeof payload === 'object') arr = [payload];
      const incoming = arr.map(normOne).filter(Boolean);
      if(!incoming.length) return;

      if(m === 'replace'){
        Store.saveReleaseNotes(incoming);
        return;
      }

      const cur = Store.getReleaseNotes();
      const seen = new Set(cur.map(n=>String(n.id||'')));
      const merged = [];
      for(const n of incoming){
        const id = String(n.id||'');
        if(id && seen.has(id)) continue;
        if(id) seen.add(id);
        merged.push(n);
      }
      Store.saveReleaseNotes([...merged, ...cur]);
    },

    // Quick links (10 circles) saved per device/browser
    getQuickLinks(){
      const arr = read(KEYS.quicklinks, []);
      const list = Array.isArray(arr) ? arr.slice(0,10) : [];
      // Back-compat: older builds stored only {label,url}.
      for(let i=0;i<list.length;i++){
        const it = list[i]||{};
        list[i] = { label: String(it.label||''), url: String(it.url||''), glowColor: String(it.glowColor||it.glow||'') };
      }
      while(list.length < 10) list.push({ label:'', url:'', glowColor:'' });
      return list;
    },
    saveQuickLinks(list){
      const out = Array.isArray(list) ? list.slice(0,10) : [];
      for(let i=0;i<out.length;i++){
        const it = out[i]||{};
        out[i] = { label: String(it.label||''), url: String(it.url||''), glowColor: String(it.glowColor||it.glow||'') };
      }
      while(out.length < 10) out.push({ label:'', url:'', glowColor:'' });
      write(KEYS.quicklinks, out);
    },
    setQuickLink(slotIndex, link){
      const i = Math.max(0, Math.min(9, Number(slotIndex||0)));
      const list = Store.getQuickLinks();
      list[i] = { label: String(link?.label||''), url: String(link?.url||''), glowColor: String(link?.glowColor||link?.glow||'') };
      Store.saveQuickLinks(list);
    },
    clearQuickLink(slotIndex){
      const i = Math.max(0, Math.min(9, Number(slotIndex||0)));
      const list = Store.getQuickLinks();
      list[i] = { label:'', url:'', glowColor:'' };
      Store.saveQuickLinks(list);
    },

    // session
    getSession(){ return read(KEYS.session, null); },
    setSession(sess){ write(KEYS.session, sess); },
    clearSession(){ localStorage.removeItem(KEYS.session); },

    // announcements
    getAnnouncements(){ return sanitizeAnnouncements(read(KEYS.announcements, [])); },
    saveAnnouncements(list){ write(KEYS.announcements, sanitizeAnnouncements(list)); },

    // cases
    getCases(){ return read(KEYS.cases, []); },
    saveCases(list){ write(KEYS.cases, list); },

    // round robin pointers
    getRR(){ return read(KEYS.rr, {}); },
    saveRR(obj){ write(KEYS.rr, obj); },

    // Weekly per-user schedules (Sun..Sat) with time blocks.
    // Stored as: { [userId]: { teamId: "morning", days: { "0": [..], ... "6": [..] } } }
    getWeekly(){ return read(KEYS.weekly, {}); },
    saveWeekly(obj){ write(KEYS.weekly, obj); },
    getUserDayBlocks(userId, dayIndex){
      const all = Store.getWeekly();
      const u = all[userId];
      const days = (u && u.days) || {};
      const list = days[String(dayIndex)] || [];
      return Array.isArray(list) ? list : [];
    },
    setUserDayBlocks(userId, teamId, dayIndex, blocks){
      const all = Store.getWeekly();
      if(!all[userId]) all[userId] = { teamId: teamId || null, days: {} };
      all[userId].teamId = teamId || all[userId].teamId || null;
      all[userId].days[String(dayIndex)] = blocks;
      Store.saveWeekly(all);
    },

    // Auto-schedule settings per team (shift)
    getAutoSettings(){ return read(KEYS.auto, {}); },
    saveAutoSettings(obj){ write(KEYS.auto, obj); },
    getTeamAutoSettings(teamId){
      const all = Store.getAutoSettings();
      return all[teamId] || null;
    },
    setTeamAutoSettings(teamId, settings){
      const all = Store.getAutoSettings();
      all[teamId] = settings;
      Store.saveAutoSettings(all);
    },


    // Activity logs (retained for ~6 months)
    getLogs(){
      const list = read(KEYS.logs, []);
      return Array.isArray(list) ? list : [];
    },
    saveLogs(list){
      const cutoff = Date.now() - SIX_MONTHS_MS;
      const cleaned = (list||[]).filter(x => (x && x.ts && x.ts >= cutoff));
      write(KEYS.logs, cleaned);
    },
    addLog(entry){
      const list = Store.getLogs();
      list.unshift(entry);
      Store.saveLogs(list);
    },

    // Schedule locks (per team + weekStart ISO)
    // Stored as: { "<teamId>|<weekStartISO>": { lockedDays: {"1":true,...}, lockedAt, lockedBy } }
    getLocks(){
      const obj = read(KEYS.locks, {});
      return obj && typeof obj === 'object' ? obj : {};
    },
    saveLocks(obj){ write(KEYS.locks, obj || {}); },
    getLock(teamId, weekStartISO){
      const key = `${teamId}|${weekStartISO}`;
      const all = Store.getLocks();
      return all[key] || null;
    },
    setLock(teamId, weekStartISO, lockObj){
      const key = `${teamId}|${weekStartISO}`;
      const all = Store.getLocks();
      all[key] = lockObj;
      Store.saveLocks(all);
    },
    clearLock(teamId, weekStartISO){
      const key = `${teamId}|${weekStartISO}`;
      const all = Store.getLocks();
      delete all[key];
      Store.saveLocks(all);
    },

    // Master schedule templates (per team)
    // Stored as: { [teamId]: { updatedAt, frequencyMonths, members: { [userId]: { restWeekdays:[0..6], startISO } } } }
    getMaster(){ return read(KEYS.master, {}); },
    saveMaster(obj){ write(KEYS.master, obj || {}); },
    getTeamMaster(teamId){
      const all = Store.getMaster();
      return all[teamId] || null;
    },
    setTeamMaster(teamId, data){
      const all = Store.getMaster();
      all[teamId] = data;
      Store.saveMaster(all);
    },
    setMasterMember(teamId, userId, patch){
      const all = Store.getMaster();
      if(!all[teamId]) all[teamId] = { updatedAt: Date.now(), frequencyMonths: 1, members: {} };
      if(!all[teamId].members) all[teamId].members = {};
      const prev = all[teamId].members[userId] || { restWeekdays: [], startISO: new Date().toISOString().slice(0,10) };
      all[teamId].members[userId] = Object.assign({}, prev, patch||{});
      all[teamId].updatedAt = Date.now();
      Store.saveMaster(all);
    },
    getMasterMember(teamId, userId){
      const t = Store.getTeamMaster(teamId);
      return (t && t.members && t.members[userId]) ? t.members[userId] : null;
    },

    // Member leave flags (per member per date)
    // Stored as: { [userId]: { [isoDate]: { type: 'SICK'|'EMERGENCY'|'VACATION'|'HOLIDAY', setAt, setBy } } }
    getLeaves(){ return read(KEYS.leaves, {}); },
    saveLeaves(obj){ write(KEYS.leaves, obj || {}); },
    getLeave(userId, isoDate){
      const all = Store.getLeaves();
      return (all[userId] && all[userId][isoDate]) ? all[userId][isoDate] : null;
    },
    setLeave(userId, isoDate, type, meta){
      const all = Store.getLeaves();
      if(!all[userId]) all[userId] = {};
      if(!type){
        delete all[userId][isoDate];
      } else {
        all[userId][isoDate] = Object.assign({ type, setAt: Date.now() }, meta||{});
      }
      Store.saveLeaves(all);
    },

    // Schedule update notifications + acknowledgements (team broadcast)
    // Stored as: [ { id, ts, teamId, weekStartISO, fromId, fromName, title, body, recipients:[userId], acks:{[userId]:ts} } ]
    getNotifs(){
      const list = read(KEYS.notifs, []);
      return Array.isArray(list) ? list : [];
    },
    saveNotifs(list){ write(KEYS.notifs, Array.isArray(list)?list:[]); },
    addNotif(notif){
      const list = Store.getNotifs();
      list.unshift(notif);
      Store.saveNotifs(list);
    },
    ackNotif(notifId, userId){
      const list = Store.getNotifs();
      const n = list.find(x=>x && x.id===notifId);
      if(!n) return;
      if(!n.acks) n.acks = {};
      if(!n.acks[userId]) n.acks[userId] = Date.now();
      Store.saveNotifs(list);
    },
    getTeamNotifs(teamId){
      return Store.getNotifs().filter(n=>n && n.teamId===teamId);
    },

    // Audit trail (per week)
    getAudit(){
      const list = read(KEYS.audit, []);
      return Array.isArray(list) ? list : [];
    },
    saveAudit(list){ write(KEYS.audit, Array.isArray(list)?list:[]); },
    addAudit(entry){
      const list = Store.getAudit();
      list.unshift(entry);
      // keep last 2000 entries
      if(list.length > 2000) list.length = 2000;
      Store.saveAudit(list);
    },
    getWeekAudit(teamId, weekStartISO){
      return Store.getAudit().filter(a=>a && a.teamId===teamId && a.weekStartISO===weekStartISO);
    },


    // Mailbox time override (Super Admin testing; local device only)
    // Stored on this device. Applied ONLY for SUPER_ADMIN sessions, and only affects Mailbox page timers.
    getMailboxTimeOverride(){
      const def = { enabled:false, ms:0, freeze:true, setAt:0 };
      const d = read(KEYS.mailbox_time_override, null);
      if(!d || typeof d !== 'object') return def;
      const o = Object.assign({}, def, d);
      o.enabled = !!o.enabled;
      o.ms = Number(o.ms)||0;
      o.freeze = (o.freeze !== false);
      o.setAt = Number(o.setAt)||0;
      return o;
    },
    saveMailboxTimeOverride(next, opts){
      const cur = Store.getMailboxTimeOverride();
      const o = Object.assign({}, cur, (next||{}));
      o.enabled = !!o.enabled;
      o.ms = Number(o.ms)||0;
      o.freeze = (o.freeze !== false);
      // Anchor start time so running mode can advance deterministically.
      const prevEnabled = !!cur.enabled;
      const prevFreeze = (cur.freeze !== false);
      const prevMs = Number(cur.ms)||0;
      const nextHasMs = (next && Object.prototype.hasOwnProperty.call(next,'ms'));
      const nextHasFreeze = (next && Object.prototype.hasOwnProperty.call(next,'freeze'));
      const msChanged = nextHasMs && (o.ms !== prevMs);
      const modeChangedToRun = nextHasFreeze && (o.freeze === false) && (prevFreeze !== false);
      if(o.enabled && o.ms>0){
        if(o.freeze){
          // Freeze mode does not need an anchor.
          o.setAt = 0;
        }else{
          // Running mode: keep anchor stable unless we changed the base time or just enabled/switch modes.
          if(!prevEnabled || msChanged || modeChangedToRun || !o.setAt){
            o.setAt = Date.now();
          }else{
            o.setAt = Number(o.setAt)||Date.now();
          }
        }
      }else{
        o.setAt = 0;
      }
      write(KEYS.mailbox_time_override, o, opts);
      return o;
    },
    factoryReset(){
      localStorage.removeItem(KEYS.users);
      localStorage.removeItem(KEYS.users_backup);
      localStorage.removeItem(KEYS.session);
      localStorage.removeItem(KEYS.announcements);
      localStorage.removeItem(KEYS.cases);
      localStorage.removeItem(KEYS.rr);
      localStorage.removeItem(KEYS.weekly);
      localStorage.removeItem(KEYS.auto);
      localStorage.removeItem(KEYS.logs);
      localStorage.removeItem(KEYS.locks);
      localStorage.removeItem(KEYS.master);
      localStorage.removeItem(KEYS.leaves);
      localStorage.removeItem(KEYS.notifs);
      localStorage.removeItem(KEYS.audit);
      localStorage.removeItem(KEYS.profile);
      localStorage.removeItem(KEYS.theme);
      localStorage.removeItem(KEYS.quicklinks);
      localStorage.removeItem(KEYS.mailbox_time_override);
      Store.ensureSeed();
    }
  };


  // --- Central UI state + reducer-style dispatch (recommended) ---
  // This avoids scattered UI updates and makes the app less crash-prone.
  const _subs = [];
  const _ui = { theme: null, worldClocks: null, quickLinks: null };

  function _syncUIState(){
    try{ _ui.theme = Store.getTheme ? Store.getTheme() : 'ocean'; }catch(_){ _ui.theme = 'ocean'; }
    try{ _ui.worldClocks = Store.getWorldClocks ? Store.getWorldClocks() : []; }catch(_){ _ui.worldClocks = []; }
    try{ _ui.quickLinks = Store.getQuickLinks ? Store.getQuickLinks() : []; }catch(_){ _ui.quickLinks = []; }
  }
  _syncUIState();

  // Unified state snapshot (UI-only).
  Store.getState = function(){
    _syncUIState();
    return {
      theme: _ui.theme,
      worldClocks: Array.isArray(_ui.worldClocks) ? _ui.worldClocks.slice() : _ui.worldClocks,
      quickLinks: Array.isArray(_ui.quickLinks) ? _ui.quickLinks.slice() : _ui.quickLinks,
      session: Store.getSession ? Store.getSession() : null,
    };
  };

  // Subscribe to reducer-style dispatch.
  Store.subscribe = function(fn){
    if(typeof fn !== 'function') return function(){};
    _subs.push(fn);
    return function(){
      const i = _subs.indexOf(fn);
      if(i >= 0) _subs.splice(i, 1);
    };
  };

  function _emitDispatch(action, payload){
    try{
      window.dispatchEvent(new CustomEvent('mums:dispatch', { detail: { action: action, payload: payload } }));
    }catch(_){ }
    // Call subscribers (safe)
    const snap = Store.getState();
    for(const fn of _subs.slice()){
      try{ fn(action, payload, snap); }catch(_){ }
    }
  }

  // Central reducer-style dispatcher.
  // Examples:
  //   Store.dispatch('UPDATE_THEME', {id:'aurora_light'})
  //   Store.dispatch('UPDATE_CLOCKS', clocksArray)
  Store.dispatch = function(action, payload){
    const type = String(action||'').trim().toUpperCase();
    try{
      if(type === 'UPDATE_THEME'){
        const id = (payload && payload.id) ? payload.id : payload;
        Store.setTheme(id);
      }else if(type === 'UPDATE_CLOCKS'){
        const list = (payload && payload.clocks) ? payload.clocks : payload;
        Store.saveWorldClocks(list);
      }else if(type === 'UPDATE_QUICKLINKS'){
        const list = (payload && payload.links) ? payload.links : payload;
        Store.saveQuickLinks(list);
      }else{
        console.warn('Store.dispatch: unknown action', action);
      }
    }catch(e){
      console.error('Store.dispatch error', e);
    }

    _syncUIState();
    _emitDispatch(type || action, payload);
  };

  window.Store = Store;
})();
