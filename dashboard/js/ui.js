(function(){
  const UI = {
    el(sel, root){ return (root||document).querySelector(sel); },
    els(sel, root){ return Array.from((root||document).querySelectorAll(sel)); },
    esc(s){ return String(s??'').replace(/[&<>"']/g, c=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c])); },
    // Profile helpers
    initials(name){
      const parts = String(name||'').trim().split(/\s+/).filter(Boolean);
      if(!parts.length) return 'U';
      const a = (parts[0]||'')[0]||'';
      const b = (parts[1]||parts[0]||'')[0]||'';
      return (a+b).toUpperCase();
    },

    // Read image file as a compressed data URL. maxSize is the max dimension (px).
    readImageAsDataUrl(file, maxSize){
      return new Promise((resolve, reject)=>{
        try{
          const reader = new FileReader();
          reader.onload = ()=>{
            const raw = String(reader.result||'');
            const img = new Image();
            img.onload = ()=>{
              const m = Math.max(img.width, img.height) || 1;
              const scale = Math.min(1, (Number(maxSize||480)) / m);
              const w = Math.max(1, Math.round(img.width * scale));
              const h = Math.max(1, Math.round(img.height * scale));
              const canvas = document.createElement('canvas');
              canvas.width = w; canvas.height = h;
              const ctx = canvas.getContext('2d');
              ctx.drawImage(img, 0, 0, w, h);
              resolve(canvas.toDataURL('image/jpeg', 0.85));
            };
            img.onerror = ()=>resolve(raw);
            img.src = raw;
          };
          reader.onerror = ()=>reject(reader.error);
          reader.readAsDataURL(file);
        }catch(e){ resolve(''); }
      });
    },
    // Profile helpers
    initials(name){
      const parts = String(name||'').trim().split(/\s+/).filter(Boolean);
      if(!parts.length) return 'U';
      const a = (parts[0]||'')[0]||'';
      const b = (parts[1]||parts[0]||'')[0]||'';
      return (a+b).toUpperCase();
    },

    // Read image file as a compressed data URL. maxSize is the max dimension (px).
    readImageAsDataUrl(file, maxSize){
      return new Promise((resolve, reject)=>{
        try{
          const reader = new FileReader();
          reader.onerror = ()=>reject(new Error('Failed to read image.'));
          reader.onload = ()=>{
            const img = new Image();
            img.onerror = ()=>reject(new Error('Invalid image file.'));
            img.onload = ()=>{
              const m = Number(maxSize||480);
              const scale = Math.min(1, m / Math.max(img.width, img.height));
              const w = Math.round(img.width * scale);
              const h = Math.round(img.height * scale);
              const canvas = document.createElement('canvas');
              canvas.width = w; canvas.height = h;
              const ctx = canvas.getContext('2d');
              ctx.drawImage(img, 0, 0, w, h);
              // use jpeg for smaller payload unless transparency likely
              const type = 'image/jpeg';
              const quality = 0.86;
              resolve(canvas.toDataURL(type, quality));
            };
            img.src = String(reader.result||'');
          };
          reader.readAsDataURL(file);
        }catch(err){ reject(err); }
      });
    },
    initials(name){
      const parts = String(name||"").trim().split(/\s+/).filter(Boolean);
      if(!parts.length) return "U";
      const a = (parts[0]||"")[0]||"";
      const b = (parts[1]||parts[0]||"")[0]||"";
      return (a+b).toUpperCase();
    },

    async readImageAsDataUrl(file, maxSize){
      const f = file;
      if(!f) return null;
      const dataUrl = await new Promise((resolve,reject)=>{
        const r = new FileReader();
        r.onload = ()=>resolve(String(r.result||""));
        r.onerror = ()=>reject(r.error||new Error("read failed"));
        r.readAsDataURL(f);
      });
      // If no resizing requested, return as-is
      const limit = Number(maxSize||0);
      if(!limit) return dataUrl;
      // Resize via canvas
      const img = await new Promise((resolve,reject)=>{
        const im = new Image();
        im.onload = ()=>resolve(im);
        im.onerror = ()=>reject(new Error("image load failed"));
        im.src = dataUrl;
      });
      const w = img.naturalWidth||img.width;
      const h = img.naturalHeight||img.height;
      const scale = Math.min(1, limit/Math.max(w,h));
      if(scale>=1) return dataUrl;
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(w*scale));
      canvas.height = Math.max(1, Math.round(h*scale));
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      return canvas.toDataURL("image/jpeg", 0.9);
    },


    openModal(id){ const m = UI.el('#'+id); if(m) m.classList.add('open'); },
    closeModal(id){ const m = UI.el('#'+id); if(m) m.classList.remove('open'); },

    downloadJSON(filename, obj){
      const blob = new Blob([JSON.stringify(obj, null, 2)], { type:'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(()=>URL.revokeObjectURL(a.href), 4000);
    },

    downloadCSV(filename, rows){
      const esc = (v)=>{
        const s = String(v ?? '');
        if(/[",\n\r]/.test(s)) return '"' + s.replace(/"/g,'""') + '"';
        return s;
      };
      const csv = rows.map(r => r.map(esc).join(',')).join('\r\n');
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(()=>URL.revokeObjectURL(a.href), 4000);
    },

    pickJSON(){
      return new Promise((resolve)=>{
        const inp = document.createElement('input');
        inp.type='file';
        inp.accept='application/json';
        inp.onchange = async () => {
          const f = inp.files && inp.files[0];
          if(!f) return resolve(null);
          const txt = await f.text();
          try{ resolve(JSON.parse(txt)); }catch(e){ resolve(null); }
        };
        inp.click();
      });
    },

    // Manila time helpers
    manilaParts(date){
      const Config = window.Config;
      const fmt = new Intl.DateTimeFormat('en-CA', {
        timeZone: (Config && Config.TZ) || 'Asia/Manila',
        year:'numeric',month:'2-digit',day:'2-digit',
        hour:'2-digit',minute:'2-digit',second:'2-digit',
        hour12:false
      });
      const parts = Object.fromEntries(
        fmt.formatToParts(date||new Date())
          .filter(p=>p.type!=='literal')
          .map(p=>[p.type,p.value])
      );
      return {
        y:+parts.year, m:+parts.month, d:+parts.day,
        hh:+parts.hour, mm:+parts.minute, ss:+parts.second,
        isoDate:`${parts.year}-${parts.month}-${parts.day}`,
        iso:`${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}`
      };
    },
    manilaNow(){ return UI.manilaParts(new Date()); },

    // Mailbox time override (Super Admin testing)
    // Returns Manila date parts using either system time or the override time configured in Settings.
    mailboxNowParts(){
      try{
        const u = (window.Auth && Auth.getUser) ? Auth.getUser() : null;
        const superAdmin = window.Config && Config.ROLES ? Config.ROLES.SUPER_ADMIN : 'SUPER_ADMIN';
        if(!u || u.role !== superAdmin) return UI.manilaNow();
        const o = (window.Store && Store.getMailboxTimeOverride) ? Store.getMailboxTimeOverride() : null;
        if(!o || !o.enabled || !o.ms) return UI.manilaNow();
        const base = Number(o.ms)||0;
        const freeze = (o.freeze !== false);
        const setAt = Number(o.setAt)||0;
        const ms = freeze ? base : (base + Math.max(0, Date.now() - setAt));
        return UI.manilaParts(new Date(ms));
      }catch(_){
        return UI.manilaNow();
      }
    },


    // Mailbox override info helper
    mailboxTimeInfo(){
      const info = {
        isSuperAdmin:false,
        overrideEnabled:false,
        freeze:true,
        baseMs:0,
        effectiveMs:0,
        systemParts:UI.manilaNow(),
        effectiveParts:null,
      };
      try{
        const u = (window.Auth && Auth.getUser) ? Auth.getUser() : null;
        const superAdmin = (window.Config && Config.ROLES) ? Config.ROLES.SUPER_ADMIN : 'SUPER_ADMIN';
        info.isSuperAdmin = !!(u && u.role === superAdmin);
        if(!info.isSuperAdmin) return info;
        const o = (window.Store && Store.getMailboxTimeOverride) ? Store.getMailboxTimeOverride() : null;
        if(!o || !o.enabled || !o.ms) return info;
        info.overrideEnabled = true;
        info.freeze = (o.freeze !== false);
        info.baseMs = Number(o.ms)||0;
        const setAt = Number(o.setAt)||0;
        info.effectiveMs = info.freeze ? info.baseMs : (info.baseMs + Math.max(0, Date.now()-setAt));
        info.effectiveParts = UI.manilaParts(new Date(info.effectiveMs));
      }catch(_){ }
      return info;
    },

    isMailboxOverrideActive(){
      try{
        const i = UI.mailboxTimeInfo();
        return !!(i && i.isSuperAdmin && i.overrideEnabled);
      }catch(_){ return false; }
    },

    // Parse a datetime-local string (YYYY-MM-DDTHH:MM) as Manila time and return epoch ms.
    // Manila is UTC+8 with no DST.
    parseManilaDateTimeLocal(v){
      const s = String(v||'').trim();
      if(!s || !s.includes('T')) return 0;
      const [d,t] = s.split('T');
      const [yy,mm,dd] = d.split('-').map(n=>Number(n));
      const [hh,mi] = t.split(':').map(n=>Number(n));
      if(!yy||!mm||!dd||Number.isNaN(hh)||Number.isNaN(mi)) return 0;
      // Convert Manila local time to UTC ms
      return Date.UTC(yy, mm-1, dd, hh-8, mi, 0, 0);
    },

    // Format an epoch ms as a datetime-local string in Manila time.
    formatManilaDateTimeLocal(ms){
      const p = UI.manilaParts(new Date(Number(ms)||Date.now()));
      const pad = n => String(n).padStart(2,'0');
      return `${p.y}-${pad(p.m)}-${pad(p.d)}T${pad(p.hh)}:${pad(p.mm)}`;
    },

    // Mailbox override info helper
    mailboxTimeInfo(){
      const info = {
        isSuperAdmin:false,
        overrideEnabled:false,
        freeze:true,
        baseMs:0,
        effectiveMs:0,
        systemParts:UI.manilaNow(),
        effectiveParts:null,
      };
      try{
        const u = (window.Auth && Auth.getUser) ? Auth.getUser() : null;
        const superAdmin = (window.Config && Config.ROLES) ? Config.ROLES.SUPER_ADMIN : 'SUPER_ADMIN';
        info.isSuperAdmin = !!(u && u.role === superAdmin);
        if(!info.isSuperAdmin) return info;
        const o = (window.Store && Store.getMailboxTimeOverride) ? Store.getMailboxTimeOverride() : null;
        if(!o || !o.enabled || !o.ms) return info;
        info.overrideEnabled = true;
        info.freeze = (o.freeze !== false);
        info.baseMs = Number(o.ms)||0;
        const setAt = Number(o.setAt)||0;
        info.effectiveMs = info.freeze ? info.baseMs : (info.baseMs + Math.max(0, Date.now()-setAt));
        info.effectiveParts = UI.manilaParts(new Date(info.effectiveMs));
      }catch(_){ }
      return info;
    },

    isMailboxOverrideActive(){
      try{
        const i = UI.mailboxTimeInfo();
        return !!(i && i.isSuperAdmin && i.overrideEnabled);
      }catch(_){ return false; }
    },
    // Mailbox override info helper
    mailboxTimeInfo(){
      const info = {
        isSuperAdmin:false,
        overrideEnabled:false,
        freeze:true,
        baseMs:0,
        effectiveMs:0,
        systemParts:UI.manilaNow(),
        effectiveParts:null,
      };
      try{
        const u = (window.Auth && Auth.getUser) ? Auth.getUser() : null;
        const superAdmin = window.Config && Config.ROLES ? Config.ROLES.SUPER_ADMIN : "SUPER_ADMIN";
        info.isSuperAdmin = !!(u && u.role === superAdmin);
        if(!info.isSuperAdmin) return info;
        const o = (window.Store && Store.getMailboxTimeOverride) ? Store.getMailboxTimeOverride() : null;
        if(!o || !o.enabled || !o.ms) return info;
        info.overrideEnabled = true;
        info.freeze = (o.freeze !== false);
        info.baseMs = Number(o.ms)||0;
        const setAt = Number(o.setAt)||0;
        info.effectiveMs = info.freeze ? info.baseMs : (info.baseMs + Math.max(0, Date.now()-setAt));
        info.effectiveParts = UI.manilaParts(new Date(info.effectiveMs));
      }catch(_){ }
      return info;
    },

    isMailboxOverrideActive(){
      try{
        const i = UI.mailboxTimeInfo();
        return !!(i && i.isSuperAdmin && i.overrideEnabled);
      }catch(_){ return false; }
    },

    // ISO date helpers (timezone-safe)
    // Treat ISO strings (YYYY-MM-DD) as a calendar date in Manila.
    // Do NOT use Date.UTC(...).getUTCDay() for weekday checks because Manila midnight
    // maps to the prior UTC day and will shift weekdays.
    isoToYMD(iso){
      const parts = String(iso||'').split('-');
      const y = Number(parts[0]);
      const m = Number(parts[1]);
      const d = Number(parts[2]);
      if(!y || !m || !d) return null;
      return { y, m, d };
    },

    // Day index 0..6 where 0=Sunday..6=Saturday
    weekdayFromISO(iso){
      const v = UI.isoToYMD(iso);
      if(!v) return null;
      // Tomohiko Sakamoto algorithm (Gregorian calendar)
      const t = [0, 3, 2, 5, 0, 3, 5, 1, 4, 6, 2, 4];
      let y = v.y;
      const m = v.m;
      const d = v.d;
      if(m < 3) y -= 1;
      const wd = (y + Math.floor(y/4) - Math.floor(y/100) + Math.floor(y/400) + t[m-1] + d) % 7;
      return wd;
    },

    addDaysISO(iso, deltaDays){
      const v = UI.isoToYMD(iso);
      if(!v) return String(iso||'');
      const ms = Date.UTC(v.y, v.m-1, v.d) + (Number(deltaDays||0) * 86400000);
      const d = new Date(ms);
      const pad = n => String(n).padStart(2,'0');
      return `${d.getUTCFullYear()}-${pad(d.getUTCMonth()+1)}-${pad(d.getUTCDate())}`;
    },

    manilaTodayISO(){
      return UI.manilaNow().isoDate;
    },
    minutesOfDay(p){ return (p.hh*60) + p.mm; },
    parseHM(hm){ const a = String(hm||'00:00').split(':'); return (+a[0]||0)*60 + (+a[1]||0); },

    DAYS: ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'],

    // Convert minutes into percent position along a team shift timeline.
    // Works for shifts that cross midnight (end<=start).
    shiftMeta(team){
      const start = UI.parseHM(team.teamStart);
      const end = UI.parseHM(team.teamEnd);
      const wraps = end <= start;
      const length = wraps ? (24*60 - start + end) : (end - start);
      return { start, end, wraps, length };
    },

    // Normalizes a time string "HH:MM" to minutes offset from shift start
    // (0..shiftLength). If out of range, it may be negative or >length.
    offsetFromShiftStart(team, hm){
      const m = UI.parseHM(hm);
      const meta = UI.shiftMeta(team);
      if(!meta.wraps) return m - meta.start;
      // shift crosses midnight
      if(m >= meta.start) return m - meta.start;
      return (24*60 - meta.start) + m;
    },

    blockToStyle(team, block){
      const meta = UI.shiftMeta(team);
      const a = UI.offsetFromShiftStart(team, block.start);
      const b = UI.offsetFromShiftStart(team, block.end);
      const left = (a / meta.length) * 100;
      const width = ((b - a) / meta.length) * 100;
      return { left: left, width: width };
    },

    // Snap minutes to a step (default 15 minutes)
    snapMinutes(mins, step){
      const s = step || 15;
      return Math.max(0, Math.round(mins / s) * s);
    },

    // Convert minutes offset from shift start -> "HH:MM" clock time
    offsetToHM(team, off){
      const meta = UI.shiftMeta(team);
      const abs = (meta.start + off) % (24*60);
      const hh = String(Math.floor(abs/60)).padStart(2,'0');
      const mm = String(abs%60).padStart(2,'0');
      return `${hh}:${mm}`;
    },

    // Manila-aware "now" as a Date object with Manila wall time
    // (Good enough for weekly reset + log grouping when app is used on other timezones.)
    manilaNowDate(){
      return new Date(new Date().toLocaleString('en-US', { timeZone: (window.Config && Config.TZ) || 'Asia/Manila' }));
    },

    // Start of this week (Monday 00:00 Manila wall time) in ms
    manilaWeekStartMondayMs(){
      const d = UI.manilaNowDate();
      // JS getDay: 0=Sun..6=Sat; convert to Mon-based week
      const day = d.getDay();
      const diff = (day === 0) ? 6 : (day - 1);
      d.setDate(d.getDate() - diff);
      d.setHours(0,0,0,0);
      return d.getTime();
    },
    formatDuration(sec){
      sec = Math.max(0, Math.floor(sec||0));
      const h = Math.floor(sec/3600);
      const m = Math.floor((sec%3600)/60);
      const s = sec%60;
      const pad = n => String(n).padStart(2,'0');
      return `${pad(h)}:${pad(m)}:${pad(s)}`;
    },

    // Duty windows based on Config.TEAMS dutyStart/dutyEnd
    getDutyWindow(nowParts){
      const Config = window.Config;
      const p = nowParts || UI.manilaNow();
      const nowMin = UI.minutesOfDay(p);
      const teams = (Config && Array.isArray(Config.TEAMS)) ? Config.TEAMS : [];
      const windows = teams.map(t=>{
        const start = UI.parseHM(t.dutyStart);
        const end = UI.parseHM(t.dutyEnd);
        return { team:t, start, end, wraps: end<=start };
      });

      function inWindow(w){
        if(!w.wraps) return nowMin>=w.start && nowMin<w.end;
        return (nowMin>=w.start) || (nowMin<w.end);
      }

      let cur = windows.find(inWindow) || windows[0];
      const idx = Math.max(0, windows.findIndex(w=>w.team.id===cur.team.id));
      const next = windows[(idx+1)%windows.length] || windows[0];

      let minsLeft;
      if(!cur.wraps) minsLeft = cur.end - nowMin;
      else minsLeft = (nowMin < cur.end) ? (cur.end - nowMin) : (24*60 - nowMin + cur.end);
      const secLeft = minsLeft*60 - p.ss;

      return { current: cur.team, next: next.team, secLeft };
    },

    schedulePill(scheduleId){
      const Config = window.Config;
      const s = Config && Config.scheduleById ? Config.scheduleById(scheduleId) : null;
      if(!s) return '';
      return `<span class="iconpill"><span class="icon">${UI.esc(s.icon)}</span>${UI.esc(s.label)}</span>`;
    },

    activeAnnouncements(){
      const Store = window.Store;
      const list = Store ? Store.getAnnouncements() : [];
      const nowMs = Date.now();
      return list
        .filter(a => nowMs >= a.startAt && nowMs <= a.endAt)
        .sort((a,b)=>a.startAt-b.startAt);
    },

    toDatetimeLocal(ms){
      const d = new Date(ms);
      const pad = n => String(n).padStart(2,'0');
      // Use local time (user machine). For Manila accuracy, we store ms already; editing convenience only.
      return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    },

    // Notification sound preferences (per user)
    _sndKey(userId){ return `ums_sound_settings_${userId||'anon'}`; },
    getSoundSettings(userId){
      try{
        const raw = localStorage.getItem(UI._sndKey(userId));
        const obj = raw ? JSON.parse(raw) : null;
        const out = Object.assign({ enabled: true, volume: 0.65, type: 'beep' }, (obj||{}));
        out.volume = Math.max(0, Math.min(1, Number(out.volume)));
        out.enabled = !!out.enabled;
        out.type = ['beep','chime','pop'].includes(out.type) ? out.type : 'beep';
        return out;
      }catch(e){
        return { enabled: true, volume: 0.65, type: 'beep' };
      }
    },
    saveSoundSettings(userId, settings){
      const s = Object.assign(UI.getSoundSettings(userId), settings||{});
      try{ localStorage.setItem(UI._sndKey(userId), JSON.stringify(s)); }catch(e){}
      return s;
    },
    playNotifSound(userId){
      const s = UI.getSoundSettings(userId);
      if(!s.enabled || s.volume<=0.001) return;

      // WebAudio (no external files)
      try{
        const Ctx = window.AudioContext || window.webkitAudioContext;
        if(!Ctx) return;
        const ctx = UI._audioCtx || (UI._audioCtx = new Ctx());
        const now = ctx.currentTime;
        const gain = ctx.createGain();
        gain.gain.value = 0;
        gain.connect(ctx.destination);

        const env = (t0, attack, hold, release, peak)=>{
          gain.gain.cancelScheduledValues(t0);
          gain.gain.setValueAtTime(0, t0);
          gain.gain.linearRampToValueAtTime(peak, t0 + attack);
          gain.gain.setValueAtTime(peak, t0 + attack + hold);
          gain.gain.linearRampToValueAtTime(0, t0 + attack + hold + release);
        };

        const osc = ctx.createOscillator();
        osc.connect(gain);

        if(s.type==='chime'){
          osc.type = 'sine';
          osc.frequency.setValueAtTime(880, now);
          env(now, 0.01, 0.08, 0.18, 0.35*s.volume);
          osc.start(now);
          osc.stop(now + 0.30);

          const osc2 = ctx.createOscillator();
          osc2.type='sine';
          osc2.frequency.setValueAtTime(1175, now + 0.11);
          osc2.connect(gain);
          osc2.start(now + 0.11);
          osc2.stop(now + 0.36);
        } else if(s.type==='pop'){
          osc.type='triangle';
          osc.frequency.setValueAtTime(520, now);
          env(now, 0.005, 0.03, 0.09, 0.45*s.volume);
          osc.start(now);
          osc.stop(now + 0.13);
        } else {
          // beep
          osc.type='square';
          osc.frequency.setValueAtTime(760, now);
          env(now, 0.01, 0.05, 0.12, 0.30*s.volume);
          osc.start(now);
          osc.stop(now + 0.20);
          const osc2 = ctx.createOscillator();
          osc2.type='square';
          osc2.frequency.setValueAtTime(760, now + 0.22);
          osc2.connect(gain);
          env(now + 0.22, 0.01, 0.05, 0.12, 0.26*s.volume);
          osc2.start(now + 0.22);
          osc2.stop(now + 0.42);
        }
      }catch(e){
        // ignore
      }
    },

    bindSoundSettingsModal(user){
      const u = user || (window.Auth && Auth.getUser && Auth.getUser());
      if(!u) return;
      const modal = document.getElementById('soundSettingsModal');
      if(!modal) return;
      const enabledEl = document.getElementById('sndEnabled');
      const typeEl = document.getElementById('sndType');
      const volEl = document.getElementById('sndVol');
      const testEl = document.getElementById('sndTest');
      const saveEl = document.getElementById('sndSave');

      const load = ()=>{
        const s = UI.getSoundSettings(u.id);
        if(enabledEl) enabledEl.checked = !!s.enabled;
        if(typeEl) typeEl.value = s.type;
        if(volEl) volEl.value = String(Math.round((s.volume||0)*100));
      };

      if(testEl) testEl.onclick = ()=>{
        const s = {
          enabled: enabledEl ? enabledEl.checked : true,
          type: typeEl ? typeEl.value : 'beep',
          volume: (volEl ? Number(volEl.value) : 65) / 100
        };
        UI.saveSoundSettings(u.id, s);
        UI.playNotifSound(u.id);
      };
      if(saveEl) saveEl.onclick = ()=>{
        const s = {
          enabled: enabledEl ? enabledEl.checked : true,
          type: typeEl ? typeEl.value : 'beep',
          volume: (volEl ? Number(volEl.value) : 65) / 100
        };
        UI.saveSoundSettings(u.id, s);
        UI.closeModal('soundSettingsModal');
      };

      // close buttons
      (modal.querySelectorAll('[data-close="soundSettingsModal"]')||[]).forEach(b=>b.onclick=()=>UI.closeModal('soundSettingsModal'));

      // load on open (cheap)
      modal.addEventListener('transitionend', ()=>{});
      load();
      return load;
    },

    // Dictionary modal: always reflects the current app state (features/roles/config).
    bindDictionaryModal(user){
      const u = user || (window.Auth && Auth.getUser && Auth.getUser());
      const modal = document.getElementById('dictionaryModal');
      if(!modal) return;
      const searchEl = document.getElementById('dictSearch');
      const qEl = document.getElementById('dictQuestion');
      const askEl = document.getElementById('dictAskBtn');
      const askHint = document.getElementById('dictAskHint');
      const metaEl = document.getElementById('dictMeta');
      const contentEl = document.getElementById('dictContent');
      const footerEl = document.getElementById('dictFooter');

      const keyQ = (u ? `ums_dict_questions_${u.id}` : 'ums_dict_questions');
      const loadQs = ()=>{
        try{ const arr = JSON.parse(localStorage.getItem(keyQ)||'[]'); return Array.isArray(arr)?arr:[]; }catch(e){ return []; }
      };
      const saveQs = (arr)=>{ localStorage.setItem(keyQ, JSON.stringify(Array.isArray(arr)?arr:[])); };

      const stateSummary = ()=>{
        const cfg = window.Config || {};
        const roles = cfg.ROLES || {};
        const tz = cfg.TZ || 'Asia/Manila';
        const navIds = (cfg.NAV||[]).map(n=>n.id);
        const hasMaster = navIds.includes('members') && (cfg.NAV||[]).some(n=>n.id==='members' && (n.children||[]).some(c=>c.id==='master_schedule'));
        const schedules = Object.keys(cfg.SCHEDULES||{});
        const week = (UI && UI.manilaTodayISO) ? UI.manilaTodayISO() : '';
        return {
          tz,
          week,
          user: u ? { name: u.name||u.username, role: u.role, teamId: u.teamId } : null,
          features: {
            masterSchedule: !!hasMaster,
            leaves: ['SICK','EMERGENCY','VACATION','HOLIDAY'],
            hourGrid: true,
            dragToPaint: true,
            sendAck: true,
            soundSettings: true
          },
          counts: { teams: (cfg.TEAMS||[]).length, schedules: schedules.length, nav: navIds.length }
        };
      };

      const illusGrid = ()=>`
        <div class="dict-illus" aria-hidden="true">
          <svg viewBox="0 0 520 120" width="100%" height="120" preserveAspectRatio="none">
            <rect x="8" y="18" width="504" height="84" rx="14" ry="14" fill="rgba(255,255,255,.03)" stroke="rgba(255,255,255,.10)"/>
            ${Array.from({length:9}).map((_,i)=>{
              const x = 18 + i*56;
              return `<rect x="${x}" y="32" width="46" height="56" rx="10" fill="rgba(255,255,255,.04)" stroke="rgba(255,255,255,.08)"/>`;
            }).join('')}
            <rect x="18" y="32" width="102" height="56" rx="10" fill="rgba(110,231,255,.14)" stroke="rgba(110,231,255,.45)"/>
            <text x="28" y="64" fill="rgba(255,255,255,.85)" font-size="12" font-weight="700">Call</text>
            <text x="28" y="80" fill="rgba(255,255,255,.55)" font-size="10">1-hour blocks</text>
          </svg>
        </div>`;

      const illusLeaves = ()=>`
        <div class="dict-illus" aria-hidden="true">
          <svg viewBox="0 0 520 120" width="100%" height="120" preserveAspectRatio="none">
            <rect x="8" y="18" width="504" height="84" rx="14" fill="rgba(255,255,255,.03)" stroke="rgba(255,255,255,.10)"/>
            <rect x="18" y="32" width="150" height="56" rx="12" fill="rgba(255,255,255,.03)" stroke="rgba(255,255,255,.10)"/>
            <text x="30" y="66" fill="rgba(255,255,255,.85)" font-size="12" font-weight="800">SL EL VL HL</text>
            <rect x="190" y="32" width="312" height="56" rx="12" fill="rgba(255,255,255,.02)" stroke="rgba(255,255,255,.08)"/>
            <text x="206" y="58" fill="rgba(255,255,255,.65)" font-size="12" font-weight="700">Click to set leave</text>
            <text x="206" y="76" fill="rgba(255,255,255,.55)" font-size="11">Click again → confirm removal</text>
          </svg>
        </div>`;

      const buildCards = (s)=>{
        const cards = [];
        cards.push({
          id:'overview',
          title:'What is MUMS?',
          keywords:'mums meys user management system overview',
          body:`MUMS (MEYS User Management System) is a single-file web app for managing users, teams, announcements, and 1-hour grid scheduling (no minutes). It runs locally in the browser using secure localStorage.`
        });
        cards.push({
          id:'scheduling',
          title:'Scheduling rules (strict hour blocks)',
          keywords:'schedule hour grid no minutes drag paint call onqueue back office block lunch',
          body:`All schedules are strictly aligned to 1-hour blocks. No minutes are allowed on the grid. Drag-to-paint lets Team Leads fill multiple hours quickly while still enforcing 1-hour steps.`,
          extra: illusGrid()
        });
        cards.push({
          id:'master',
          title:'Master Schedule and Rest Days',
          keywords:'master schedule rest day monthly quarterly frequency',
          body:`Team Leads/Admins can configure fixed rest days per member in Master Schedule. Rest days automatically gray-out the member in Members Assigning with the notice “ON REST DAY”. Frequency controls how the fixed schedule repeats (monthly / every 2 months / every 3 months / quarterly).`
        });
        cards.push({
          id:'leaves',
          title:'Leaves (SL / EL / VL / HL)',
          keywords:'sick emergency vacation holiday leave sl el vl hl',
          body:`Leaves are per-member per-date: SL (Sick), EL (Emergency), VL (Vacation), HL (Holiday). Setting a leave grays out the member schedule immediately and auto-scheduling skips them. Clicking an already-active leave prompts for confirmation before removal.`,
          extra: illusLeaves()
        });
        cards.push({
          id:'send',
          title:'Send schedule updates + Acknowledgements',
          keywords:'send notify popup acknowledge',
          body:`Team Lead can press “Send” to broadcast schedule updates. Members receive a real-time pop-up with an Acknowledge button. Team Leads can view acknowledgement status (who acknowledged + timestamp).`
        });
        cards.push({
          id:'sound',
          title:'Notification sound settings',
          keywords:'sound beep volume type on off',
          body:`Users can control notification sound with the Settings icon: On/Off, volume, and sound type (Beep/Chime/Pop). Notifications still show pop-ups even if sound is Off.`
        });
        cards.push({
          id:'roles',
          title:'Roles and permissions',
          keywords:'roles team lead admin super user permissions',
          body:`Super Admin controls everything. Admin can manage teams and users. Team Lead manages their own team’s members, master schedule, announcements, and scheduling. Members view their own schedules and receive notifications.`
        });
        cards.push({
          id:'structure',
          title:'How MUMS is built',
          keywords:'structure localstorage pages config store ui',
          body:`MUMS is a lightweight, file-based web app: Config defines teams/schedules/permissions; Store persists data in localStorage (with backups); UI provides timezone-safe Manila helpers and reusable modals; Pages render the screens (Dashboard, Members, Master Schedule, User Management, etc.).`
        });
        return cards;
      };

      const render = ()=>{
        const s = stateSummary();
        const cards = buildCards(s);
        const q = (searchEl && searchEl.value || '').trim().toLowerCase();
        const qs = loadQs();

        metaEl && (metaEl.innerHTML = `
          <div class="dict-grid">
            <div class="dict-card">
              <h3>Current state</h3>
              <div class="small">
                <div><b>Time zone:</b> ${UI.esc(s.tz)} (Manila)</div>
                <div><b>Today (Manila ISO):</b> ${UI.esc(s.week)}</div>
                ${s.user ? `<div><b>User:</b> ${UI.esc(s.user.name)} • ${UI.esc(s.user.role)} • Team ${UI.esc(s.user.teamId||'—')}</div>` : ''}
              </div>
            </div>
            <div class="dict-card">
              <h3>Enabled capabilities</h3>
              <div class="small">
                <div>✅ Strict 1-hour scheduling grid</div>
                <div>✅ Drag-to-paint assignment</div>
                <div>✅ Master Schedule + Rest Day sync</div>
                <div>✅ Leaves: SL, EL, VL, HL</div>
                <div>✅ Send + acknowledgements</div>
                <div>✅ Notification sound settings</div>
              </div>
            </div>
          </div>
        `);

        const filtered = !q ? cards : cards.filter(c=>{
          const hay = (c.title+' '+c.keywords+' '+c.body).toLowerCase();
          return hay.includes(q);
        });

        if(contentEl){
          contentEl.innerHTML = filtered.map(c=>{
            return `
              <div class="dict-card" data-id="${UI.esc(c.id)}">
                <h3>${UI.esc(c.title)}</h3>
                <div class="small">${UI.esc(c.body)}</div>
                ${c.extra || ''}
              </div>
            `;
          }).join('') || `<div class="dict-card"><h3>No match</h3><div class="small">Try a different keyword (e.g., rest day, leave, send, auto schedule).</div></div>`;
        }

        if(footerEl){
          footerEl.textContent = `MUMS Dictionary • Teams: ${s.counts.teams} • Schedules: ${s.counts.schedules} • Notes saved: ${qs.length}`;
        }

        if(askHint){
          if(qs.length){
            askHint.innerHTML = `Saved questions (local):<br>${qs.slice(0,5).map(x=>`• ${UI.esc(x.q)}`).join('<br>')}${qs.length>5?'<br>…':''}`;
          } else {
            askHint.textContent = 'Saved questions appear to you as notes (local only).';
          }
        }
      };

      if(searchEl){
        searchEl.oninput = ()=>render();
      }
      if(askEl){
        askEl.onclick = ()=>{
          const q = (qEl && qEl.value || '').trim();
          if(!q) return;
          const arr = loadQs();
          arr.unshift({ q, at: Date.now() });
          saveQs(arr.slice(0,50));
          if(qEl) qEl.value = '';
          render();
        };
      }

      // Close buttons
      (modal.querySelectorAll('[data-close="dictionaryModal"]')||[]).forEach(b=>b.onclick=()=>UI.closeModal('dictionaryModal'));

      render();
      return render;
    },

    // Release Notes modal (append-only; render from Store.getReleaseNotes)
    bindReleaseNotesModal(user){
      const u = user || (window.Auth && Auth.getUser && Auth.getUser());
      const modal = document.getElementById('releaseNotesModal');
      if(!modal || !window.Store) return;

      const searchEl = document.getElementById('rnSearch');
      const filterEl = document.getElementById('rnFilter');
      const metaEl = document.getElementById('rnMeta');
      const listEl = document.getElementById('rnList');

      const adminWrap = document.getElementById('rnAdmin');
      const verEl = document.getElementById('rnVer');
      const tagsEl = document.getElementById('rnTags');
      const titleEl = document.getElementById('rnTitle');
      const bodyEl = document.getElementById('rnBody');
      const addEl = document.getElementById('rnAdd');

      // Advanced tools
      const bodyPreviewEl = document.getElementById('rnBodyPreview');
      const importEl = document.getElementById('rnImportFile');
      const importModeEl = document.getElementById('rnImportMode');
      const importBtn = document.getElementById('rnImportBtn');
      const exportBtn = document.getElementById('rnExportBtn');
      const clearBtn = document.getElementById('rnClearBtn');
      const toolbar = document.getElementById('rnToolbar');

      const canManage = !!(u && window.Config && Config.can && Config.can(u,'manage_release_notes'));
      const canDelete = canManage; // single permission for now
      if(adminWrap) adminWrap.style.display = canManage ? '' : 'none';

      const fmt = (ms)=>{
        try{
          const d = new Date(Number(ms||0)||Date.now());
          return d.toLocaleString('en-CA', { year:'numeric', month:'short', day:'2-digit', hour:'2-digit', minute:'2-digit' });
        }catch(_){ return ''; }
      };

      const normalizeTags = (s)=>{
        return String(s||'')
          .split(',')
          .map(x=>x.trim().toLowerCase())
          .filter(Boolean)
          .slice(0,8);
      };

      const resolveDefaultVersion = ()=>{
        try{
          const el = document.querySelector('.brand-build');
          return el ? String(el.textContent||'').replace('Build:','').trim() : '';
        }catch(_){ return ''; }
      };

      const render = ()=>{
        const q = String(searchEl && searchEl.value || '').trim().toLowerCase();
        const f = String(filterEl && filterEl.value || 'all').trim().toLowerCase();
        const all = (Store.getReleaseNotes ? Store.getReleaseNotes() : []);

        let filtered = all;
        if(f && f!=='all'){
          filtered = filtered.filter(n => (n.tags||[]).map(t=>String(t).toLowerCase()).includes(f));
        }
        if(q){
          filtered = filtered.filter(n=>{
            const hay = (
              String(n.version||'') + ' ' +
              String(n.title||'') + ' ' +
              String(n.body||'') + ' ' +
              String((n.tags||[]).join(' '))
            ).toLowerCase();
            return hay.includes(q);
          });
        }

        if(metaEl){
          metaEl.textContent = `${filtered.length} of ${all.length} note(s) shown`;
        }

        if(listEl){
          listEl.innerHTML = filtered.map(n=>{
            const tags = (n.tags||[]).map(t=>`<span class="badge" style="margin-right:6px">${UI.esc(t)}</span>`).join('');
            return `
              <div class="card pad rn-item" style="margin:10px 0" data-rnid="${UI.esc(n.id||'')}">
                <div class="row" style="justify-content:space-between;gap:10px;align-items:flex-start">
                  <div style="min-width:0">
                    <div class="h3" style="margin:0">${UI.esc(n.title||'Update')}</div>
                    <div class="small muted" style="margin-top:4px">${UI.esc(n.version||'')} • ${UI.esc(fmt(n.date))}${n.author?(' • '+UI.esc(n.author)):''}</div>
                  </div>
                  ${canDelete ? `<button class="btn danger ghost rn-del" type="button" data-del="${UI.esc(n.id||'')}">Delete</button>` : ''}
                </div>
                <div class="rn-body" style="margin-top:10px">${renderMarkdownSafe(n.body||'')}</div>
                <div style="margin-top:10px">${tags}</div>
              </div>
            `;
          }).join('') || `<div class="card pad"><div class="small muted">No release notes match your filter.</div></div>`;
        }
      };

      // Very small markdown renderer (safe): supports headings, bold, italics, inline code, lists, and line breaks.
      function renderMarkdownSafe(md){
        const esc = UI.esc(String(md||''));
        // code blocks (triple backticks)
        let out = esc.replace(/```([\s\S]*?)```/g, (m,g)=>`<pre class="rn-pre"><code>${g}</code></pre>`);
        // headings
        out = out.replace(/^###\s(.+)$/gm, '<div class="rn-h3">$1</div>');
        out = out.replace(/^##\s(.+)$/gm, '<div class="rn-h2">$1</div>');
        out = out.replace(/^#\s(.+)$/gm, '<div class="rn-h1">$1</div>');
        // bold / italics / inline code
        out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
        out = out.replace(/\*([^*]+)\*/g, '<em>$1</em>');
        out = out.replace(/`([^`]+)`/g, '<code class="rn-code">$1</code>');
        // unordered lists
        out = out.replace(/^(?:\s*[-*]\s.+\n?)+/gm, (block)=>{
          const items = block.trim().split(/\n/).map(l=>l.replace(/^\s*[-*]\s+/,'').trim()).filter(Boolean);
          if(!items.length) return block;
          return `<ul class="rn-ul">${items.map(i=>`<li>${i}</li>`).join('')}</ul>`;
        });
        // ordered lists
        out = out.replace(/^(?:\s*\d+\.\s.+\n?)+/gm, (block)=>{
          const items = block.trim().split(/\n/).map(l=>l.replace(/^\s*\d+\.\s+/,'').trim()).filter(Boolean);
          if(!items.length) return block;
          return `<ol class="rn-ol">${items.map(i=>`<li>${i}</li>`).join('')}</ol>`;
        });
        // line breaks
        out = out.replace(/\n/g, '<br/>');
        return `<div class="rn-md">${out}</div>`;
      }

      if(searchEl) searchEl.oninput = ()=>render();
      if(filterEl) filterEl.onchange = ()=>render();

      // Editor toolbar: insert simple markdown snippets.
      if(toolbar && bodyEl){
        toolbar.querySelectorAll('[data-md]').forEach(btn=>{
          btn.onclick = ()=>{
            try{
              const t = String(btn.dataset.md||'');
              const ta = bodyEl;
              const start = ta.selectionStart || 0;
              const end = ta.selectionEnd || 0;
              const sel = String(ta.value||'').slice(start,end);
              const before = String(ta.value||'').slice(0,start);
              const after = String(ta.value||'').slice(end);

              let insert = t;
              // tokens: {text}
              if(t.includes('{text}')) insert = t.replace('{text}', sel||'text');
              ta.value = before + insert + after;
              const pos = before.length + insert.length;
              ta.focus();
              ta.selectionStart = ta.selectionEnd = pos;
              if(bodyPreviewEl) bodyPreviewEl.innerHTML = renderMarkdownSafe(ta.value||'');
            }catch(_){ }
          };
        });
      }

      if(bodyEl && bodyPreviewEl){
        bodyPreviewEl.innerHTML = renderMarkdownSafe(bodyEl.value||'');
        bodyEl.oninput = ()=>{ bodyPreviewEl.innerHTML = renderMarkdownSafe(bodyEl.value||''); };
      }

      if(addEl && canManage){
        addEl.onclick = ()=>{
          const ver = String(verEl && verEl.value || '').trim();
          const ttl = String(titleEl && titleEl.value || '').trim();
          const body = String(bodyEl && bodyEl.value || '').trim();
          const tags = normalizeTags(tagsEl && tagsEl.value || '');

          if(!ttl || !body){
            alert('Please enter a Title and Details.');
            return;
          }

          Store.addReleaseNote({
            version: ver || resolveDefaultVersion(),
            date: Date.now(),
            title: ttl,
            body: body,
            author: u ? (u.name||u.username||u.id) : '',
            tags: tags.length ? tags : ['feature'],
          });

          if(titleEl) titleEl.value = '';
          if(bodyEl) bodyEl.value = '';
          if(bodyPreviewEl) bodyPreviewEl.innerHTML = renderMarkdownSafe('');
          if(tagsEl) tagsEl.value = '';
          if(verEl) verEl.value = '';
          render();
        };
      }

      // Import (JSON, TXT, MD)
      if(importBtn && canManage){
        importBtn.onclick = async()=>{
          const f = importEl && importEl.files && importEl.files[0];
          if(!f){ alert('Please choose a file to import.'); return; }
          const mode = String(importModeEl && importModeEl.value || 'merge');
          const name = String(f.name||'').toLowerCase();
          const text = await (f.text ? f.text() : new Promise((res,rej)=>{
            const r = new FileReader();
            r.onload = ()=>res(String(r.result||''));
            r.onerror = rej;
            r.readAsText(f);
          }));
          try{
            if(name.endsWith('.json')){
              const obj = JSON.parse(text);
              Store.importReleaseNotes(obj, mode);
            } else {
              // Treat as a single note body; first line becomes title when available.
              const lines = String(text||'').replace(/\r/g,'').split('\n');
              const first = String(lines[0]||'').trim();
              const body = lines.slice(1).join('\n').trim();
              Store.addReleaseNote({
                version: resolveDefaultVersion(),
                date: Date.now(),
                title: first || 'Imported note',
                body: body || String(text||''),
                author: u ? (u.name||u.username||u.id) : '',
                tags: ['import']
              });
            }
            if(importEl) importEl.value = '';
            render();
          }catch(err){
            console.error(err);
            alert('Import failed. Please verify the file format.');
          }
        };
      }

      // Export
      if(exportBtn && canManage){
        exportBtn.onclick = ()=>{
          try{
            const data = Store.getReleaseNotes ? Store.getReleaseNotes() : [];
            const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            const ts = new Date().toISOString().slice(0,10);
            a.href = url;
            a.download = `mums_release_notes_${ts}.json`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            setTimeout(()=>{ try{ URL.revokeObjectURL(url); }catch(_){ } }, 1500);
          }catch(err){ console.error(err); alert('Export failed.'); }
        };
      }

      // Clear all
      if(clearBtn && canManage){
        clearBtn.onclick = ()=>{
          const ok1 = confirm('This will delete ALL release notes in this browser. A backup is retained, but you should export first. Continue?');
          if(!ok1) return;
          const phrase = prompt('Type DELETE ALL to confirm:');
          if(String(phrase||'').trim().toUpperCase() !== 'DELETE ALL') return;
          try{ Store.clearReleaseNotes(); }catch(_){ }
          render();
        };
      }

      // Per-item delete
      if(listEl && canDelete){
        listEl.onclick = (e)=>{
          const btn = e && e.target ? e.target.closest('[data-del]') : null;
          if(!btn) return;
          const id = String(btn.dataset.del||'').trim();
          if(!id) return;
          if(!confirm('Delete this release note?')) return;
          try{ Store.deleteReleaseNote(id); }catch(_){ }
          render();
        };
      }

      // Close buttons
      (modal.querySelectorAll('[data-close="releaseNotesModal"]')||[]).forEach(b=>b.onclick=()=>UI.closeModal('releaseNotesModal'));

      render();
      return render;
    },

    // Lightweight realtime notifications for schedule updates.
    // Works across tabs via BroadcastChannel + storage events (no server required).
    startScheduleNotifListener(user){
      if(!user || !window.Store) return;

      // Create modal shell once
      if(!document.getElementById('schedNotifModal')){
        const m = document.createElement('div');
        m.className = 'modal';
        m.id = 'schedNotifModal';
        m.innerHTML = `
          <div class="panel">
            <div class="head">
              <div>
                <div class="announce-title" id="schedNotifTitle">Schedule Updated</div>
                <div class="small" id="schedNotifMeta">—</div>
              </div>
              <button class="btn ghost" type="button" id="schedNotifClose">✕</button>
            </div>
            <div class="body" id="schedNotifBody" style="white-space:pre-wrap"></div>
            <div class="foot" style="display:flex;justify-content:flex-end;gap:10px">
              <button class="btn" type="button" id="schedNotifAck">Acknowledge</button>
            </div>
          </div>
        `;
        document.body.appendChild(m);
      }

      const channel = ('BroadcastChannel' in window) ? new BroadcastChannel('ums_schedule_updates') : null;
      let lastShownId = null;
      const ping = ()=>{
        // Show the latest un-acked notif for this user
        const list = Store.getNotifs();
        const n = list.find(x=>x && Array.isArray(x.recipients) && x.recipients.includes(user.id) && !(x.acks && x.acks[user.id]));
        if(!n) return;

        // Beep once per notif
        if(n.id && n.id !== lastShownId){
          lastShownId = n.id;
          UI.playNotifSound(user.id);
        }

        UI.el('#schedNotifTitle').textContent = n.title || 'Schedule Updated';
        UI.el('#schedNotifMeta').textContent = `From: ${n.fromName||'Team Lead'} • Week of ${n.weekStartISO||'—'}`;
        UI.el('#schedNotifBody').textContent = n.body || 'Your schedule has been updated.';

        const close = ()=>UI.closeModal('schedNotifModal');
        UI.el('#schedNotifClose').onclick = close;

        UI.el('#schedNotifAck').onclick = ()=>{
          Store.ackNotif(n.id, user.id);
          // broadcast ack to other tabs
          try{ channel && channel.postMessage({ type:'ack', notifId:n.id, userId:user.id }); }catch(e){}
          close();
        };

        UI.openModal('schedNotifModal');
      };

      // periodic poll (cheap) + cross-tab hints
      let timer = setInterval(ping, 1500);
      const onStorage = (ev)=>{
        if(!ev || !ev.key) return;
        if(ev.key=== 'ums_schedule_notifs') ping();
      };
      window.addEventListener('storage', onStorage);

      if(channel){
        channel.onmessage = ()=>ping();
      }

      // immediate check
      ping();

      // return disposer
      return ()=>{
        try{ clearInterval(timer); }catch(e){}
        try{ window.removeEventListener('storage', onStorage); }catch(e){}
        try{ channel && channel.close(); }catch(e){}
      };
    }
  };

  window.UI = UI;
})();
