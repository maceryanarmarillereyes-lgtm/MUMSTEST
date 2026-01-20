(function(){
  const Config = {
    // Single source of truth for build label used by login + app.
    BUILD: '20260120-aurora-fix30',
    APP: {
      shortName: 'MUMS',
      fullName: 'MEYS User Management System'
    },
    TZ: 'Asia/Manila',
    ROLES: {
      SUPER_ADMIN: 'SUPER_ADMIN',
      SUPER_USER: 'SUPER_USER',
      ADMIN: 'ADMIN',
      TEAM_LEAD: 'TEAM_LEAD',
      MEMBER: 'MEMBER',
    },

    // Team schedule times + Mailbox duty times (24h HH:MM)
    TEAMS: [
      { id: 'morning', label: 'Morning Shift', teamStart: '06:00', teamEnd: '15:00', dutyStart: '06:00', dutyEnd: '15:00' },
      { id: 'mid', label: 'Mid Shift', teamStart: '13:00', teamEnd: '22:00', dutyStart: '15:00', dutyEnd: '22:00' },
      { id: 'night', label: 'Night Shift', teamStart: '22:00', teamEnd: '06:00', dutyStart: '22:00', dutyEnd: '06:00' },
    ],

    SCHEDULES: {
      mailbox_manager: { id: 'mailbox_manager', label: 'Mailbox Manager', icon: '📥' },
      back_office: { id: 'back_office', label: 'Back Office', icon: '🗄️' },
      call_available: { id: 'call_available', label: 'Call Available', icon: '📞' },
      // Renamed per ops terminology: "Call Available" (keep same id/icon for compatibility)
      call_onqueue: { id: 'call_onqueue', label: 'Call Available', icon: '📞' },
      mailbox_call: { id: 'mailbox_call', label: 'Mailbox Manager + Call', icon: '📥📞' },
      block: { id: 'block', label: 'Block', icon: '⛔' },
      lunch: { id: 'lunch', label: 'Lunch', icon: '🍽️' },
    },

    // Theme presets (applied via CSS variables).
    // - Colors always apply.
    // - Optional: font, radius, shadow for deeper theme control.
    // NOTE: "Aurora (Ecommerce Dark)" is a MUMS theme preset inspired by the visual style of
    // https://aurora.themewagon.com/dashboard/ecommerce (dark mode).
    THEMES: [
      // --- Aurora-inspired presets (ThemeWagon Aurora / ecommerce-style) ---
      // NOTE: "Aurora Light" is designed to visually match the referenced Aurora dashboard
      // (clean typography + light surfaces). Dark variants are included for users who
      // prefer the existing MUMS dark UI.
      {
        id:'aurora_light',
        name:'Aurora (Ecommerce Light)',
        mode:'light',
        bg:'#f4f6fb',
        panel:'#ffffff',
        panel2:'#f1f4fa',
        text:'#0f172a',
        muted:'#64748b',
        border:'rgba(15,23,42,.12)',
        accent:'#4f46e5',
        bgRad1:'#dfe8ff',
        bgRad3:'#f8fafc',
        font:"'Plus Jakarta Sans', Inter, system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif",
        radius:'16px',
        shadow:'0 14px 30px rgba(15,23,42,.10)'
      },
      {
        id:'aurora_dark',
        name:'Aurora (Ecommerce Dark)',
        mode:'dark',
        bg:'#0b1220',
        panel:'#0f1b2e',
        panel2:'#0c1628',
        text:'#eef2ff',
        muted:'#b7c1d9',
        border:'rgba(255,255,255,.10)',
        accent:'#4f8bff',
        bgRad1:'#162a4b',
        bgRad3:'#050914',
        // Aurora uses a very modern, clean font.
        font:"'Plus Jakarta Sans', Inter, system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif",
        // Slightly tighter radius + softer shadow to match the referenced UI.
        radius:'16px',
        shadow:'0 12px 28px rgba(0,0,0,.30)'
      },
      { id:'aurora_midnight', name:'Aurora Midnight', mode:'dark', bg:'#050914', panel:'#0b1022', panel2:'#090e1c', text:'#eef2ff', muted:'#b9c1da', border:'rgba(255,255,255,.09)', accent:'#7c87ff', bgRad1:'#161f46', bgRad3:'#02040a', font:"'Plus Jakarta Sans', Inter, system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif", radius:'16px' },
      { id:'aurora_dracula',  name:'Aurora Dracula',  mode:'dark', bg:'#110a18', panel:'#1a0f24', panel2:'#150c1e', text:'#f7efff', muted:'#d6c0ea', border:'rgba(255,255,255,.10)', accent:'#c084fc', bgRad1:'#2b1244', bgRad3:'#050308', font:"'Plus Jakarta Sans', Inter, system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif", radius:'16px' },
      { id:'aurora_ember',    name:'Aurora Ember',    mode:'dark', bg:'#14070a', panel:'#1f0c11', panel2:'#16090d', text:'#fff1f2', muted:'#f1bac0', border:'rgba(255,255,255,.10)', accent:'#fb7185', bgRad1:'#3a101a', bgRad3:'#070304', font:"'Plus Jakarta Sans', Inter, system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif", radius:'16px' },
      { id:'aurora_arctic',   name:'Aurora Arctic',   mode:'dark', bg:'#06111a', panel:'#0b1e2d', panel2:'#081827', text:'#e9fbff', muted:'#b2d5e3', border:'rgba(255,255,255,.10)', accent:'#38bdf8', bgRad1:'#0b3144', bgRad3:'#030b10', font:"'Plus Jakarta Sans', Inter, system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif", radius:'16px' },
      { id:'aurora_nature',   name:'Aurora Nature',   mode:'dark', bg:'#05110b', panel:'#0a2216', panel2:'#071a11', text:'#effff5', muted:'#b6d6c2', border:'rgba(255,255,255,.10)', accent:'#22c55e', bgRad1:'#123b22', bgRad3:'#020a05', font:"'Plus Jakarta Sans', Inter, system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif", radius:'16px' },
      { id:'aurora_luxury',   name:'Aurora Luxury',   mode:'dark', bg:'#121008', panel:'#1f1a0a', panel2:'#171407', text:'#fff8e7', muted:'#e4d4a8', border:'rgba(255,255,255,.10)', accent:'#fbbf24', bgRad1:'#2f250a', bgRad3:'#070503', font:"'Plus Jakarta Sans', Inter, system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif", radius:'16px' },

      // --- Original MUMS presets (kept for variety) ---
      { id:'ocean',     name:'Ocean Blue',   bg:'#071224', panel:'#0c1b33', panel2:'#0a162b', text:'#eaf2ff', muted:'#a8b6d6', border:'rgba(255,255,255,.08)', accent:'#4aa3ff', bgRad1:'#0c2a52', bgRad3:'#050c18' },
      { id:'emerald',   name:'Emerald',      bg:'#061a14', panel:'#0a2a22', panel2:'#072018', text:'#eafff6', muted:'#a9d6c6', border:'rgba(255,255,255,.08)', accent:'#34d399', bgRad1:'#0a3a2c', bgRad3:'#03110d' },
      { id:'royal',     name:'Royal Indigo', bg:'#0b0f24', panel:'#121a3a', panel2:'#0e1531', text:'#eef0ff', muted:'#b7bce8', border:'rgba(255,255,255,.08)', accent:'#7c87ff', bgRad1:'#232c66', bgRad3:'#070a16' },
      { id:'slate',     name:'Slate Gray',   bg:'#0b1220', panel:'#121c2f', panel2:'#0e1727', text:'#eef2ff', muted:'#b5bfd6', border:'rgba(255,255,255,.08)', accent:'#60a5fa', bgRad1:'#1b2a44', bgRad3:'#050914' },
      { id:'sunset',    name:'Sunset',       bg:'#1a0b12', panel:'#2a121d', panel2:'#200e16', text:'#fff0f5', muted:'#e0b6c6', border:'rgba(255,255,255,.08)', accent:'#fb7185', bgRad1:'#4b1a2a', bgRad3:'#0d0508' },
      { id:'amber',     name:'Amber Gold',   bg:'#141007', panel:'#241c0b', panel2:'#1c1508', text:'#fff8e7', muted:'#d7c7a8', border:'rgba(255,255,255,.08)', accent:'#fbbf24', bgRad1:'#3a2a0c', bgRad3:'#070503' },
      { id:'cyan',      name:'Cyan Tech',    bg:'#06161b', panel:'#0b2730', panel2:'#081e25', text:'#e9fbff', muted:'#a7d4de', border:'rgba(255,255,255,.08)', accent:'#22d3ee', bgRad1:'#0a3a46', bgRad3:'#030c0f' },
      { id:'orchid',    name:'Orchid',       bg:'#130a1b', panel:'#211030', panel2:'#180c25', text:'#f7efff', muted:'#d1b6e6', border:'rgba(255,255,255,.08)', accent:'#c084fc', bgRad1:'#3b1a56', bgRad3:'#07030a' },
      { id:'forest',    name:'Forest',       bg:'#07130b', panel:'#0d2416', panel2:'#0a1b11', text:'#effff5', muted:'#b6d6c2', border:'rgba(255,255,255,.08)', accent:'#22c55e', bgRad1:'#133b23', bgRad3:'#030a05' },
      { id:'mono',      name:'Monochrome',   bg:'#0b0c10', panel:'#13151b', panel2:'#0f1116', text:'#f3f4f6', muted:'#b7bcc6', border:'rgba(255,255,255,.10)', accent:'#a3a3a3', bgRad1:'#1a1d26', bgRad3:'#050608' },
    ],

    NAV: [
      { id: 'dashboard', label: 'Dashboard', icon: '🏠', perm: 'view_dashboard' },
      { id: 'mailbox', label: 'Mailbox', icon: '📨', perm: 'view_mailbox' },
      // Members menu (tree). Child visibility is controlled via perms.
      {
        id: 'members',
        label: 'Members',
        // Use a more recognizable "members" icon.
        icon: '👥',
        perm: 'view_members',
        children: [
          { id: 'members', label: 'Assign Tasks', icon: '🧩', perm: 'view_members' },
          // Use a more recognizable master schedule/calendar icon.
          { id: 'master_schedule', label: 'Master Schedule', icon: '📅', perm: 'view_master_schedule' },
        ]
      },
      { id: 'users', label: 'User Management', icon: '👥', perm: 'manage_users' },
      { id: 'announcements', label: 'Announcements', icon: '📣', perm: 'manage_announcements' },
    ],

    // Permissions are intentionally flat strings to keep the app usable without a backend.
    // New: manage_release_notes (grants Add/Import/Export/Delete release notes).
    PERMS: {
      SUPER_ADMIN: ['*'],
      SUPER_USER: ['view_dashboard','view_mailbox','view_members','manage_release_notes','view_master_schedule'],
      ADMIN: ['view_dashboard','view_mailbox','view_members','manage_users','manage_announcements','manage_release_notes','manage_members_scheduling','view_master_schedule'],
      TEAM_LEAD: ['view_dashboard','view_mailbox','view_members','manage_members_scheduling','manage_announcements','view_master_schedule'],
      MEMBER: ['view_dashboard','view_mailbox'],
    },

    can(roleOrUser, perm){
      const role = typeof roleOrUser === 'string' ? roleOrUser : (roleOrUser && roleOrUser.role);
      const p = this.PERMS[role] || [];
      return p.includes('*') || p.includes(perm);
    },

    teamById(id){
      return this.TEAMS.find(t => t.id===id) || this.TEAMS[0];
    },

    scheduleById(id){
      return this.SCHEDULES[id] || null;
    },
  };

  window.Config = Config;
})();
