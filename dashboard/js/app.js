(function(){
  let cleanup = null;
  let annTimer = null;
  let notifCleanup = null;

  function showFatalError(err){
    try{
      console.error(err);
      // Log fatal errors into Activity Logs (for reporting)
      try{
        if(window.Store && Store.addLog){
          const u = (window.Auth && Auth.getUser) ? Auth.getUser() : null;
          Store.addLog({
            ts: Date.now(),
            teamId: (u && u.teamId) ? u.teamId : 'system',
            actorId: (u && u.id) ? u.id : 'system',
            actorName: (u && u.name) ? u.name : 'SYSTEM',
            action: 'APP_ERROR',
            msg: String(err && (err.message||err)) ,
            detail: String((err && err.stack) ? err.stack : '')
          });
        }
      }catch(__){}
      const main = document.getElementById('main');
      if(main){
        main.innerHTML = `
          <div class="card pad" style="border:1px solid rgba(255,80,80,.35)">
            <div class="h2" style="margin:0 0 8px">Something went wrong</div>
            <div class="small" style="white-space:pre-wrap;opacity:.9">${UI && UI.esc ? UI.esc(String(err && (err.stack||err.message||err))) : String(err)}</div>
            <div class="small muted" style="margin-top:10px">Tip: try Logout → Login, or hard refresh (Ctrl+Shift+R). If it still happens, send the console error screenshot.</div>
          </div>
        `;
      }
    }catch(_){ /* ignore */ }
  }

  // Reduce font-size until text fits its box (used for sidebar profile). Cheap and safe.
  function fitText(el, minPx, maxPx){
    try{
      if(!el) return;
      const min = Number(minPx||12);
      const max = Number(maxPx||22);
      el.style.fontSize = max + 'px';
      // Force reflow
      void el.offsetHeight;
      let cur = max;
      // Shrink while overflowing (height-wise) or causing horizontal overflow.
      while(cur > min && (el.scrollHeight > el.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1)){
        cur -= 1;
        el.style.fontSize = cur + 'px';
      }
    }catch(e){ /* ignore */ }
  }

  // Theme application via CSS variables
  function applyTheme(themeId){
    const themes = (Config && Array.isArray(Config.THEMES)) ? Config.THEMES : [];
    const t = themes.find(x=>x.id===themeId) || themes[0];
    if(!t) return;
    const r = document.documentElement;
    r.style.setProperty('--bg', t.bg);
    r.style.setProperty('--panel', t.panel);
    r.style.setProperty('--panel2', t.panel2);
    r.style.setProperty('--text', t.text);
    r.style.setProperty('--muted', t.muted);
    r.style.setProperty('--border', t.border);
    r.style.setProperty('--accent', t.accent);

    // Derived RGB vars for CSS rgba() usage (keeps themes consistent across light/dark)
    try{
      const hex = String(t.accent||'').trim();
      const m = /^#?([0-9a-fA-F]{6})$/.exec(hex);
      if(m){
        const s = m[1];
        const rr = parseInt(s.slice(0,2), 16);
        const gg = parseInt(s.slice(2,4), 16);
        const bb = parseInt(s.slice(4,6), 16);
        r.style.setProperty('--accent-rgb', `${rr},${gg},${bb}`);
      }else{
        r.style.setProperty('--accent-rgb', '74,163,255');
      }
    }catch(_){ r.style.setProperty('--accent-rgb', '74,163,255'); }

    r.style.setProperty('--bgRad1', t.bgRad1);
    r.style.setProperty('--bgRad3', t.bgRad3);

    // Optional deeper theme controls
    try{
      if(t.font) r.style.setProperty('--font', t.font); else r.style.removeProperty('--font');
      if(t.radius) r.style.setProperty('--radius', t.radius); else r.style.removeProperty('--radius');
      if(t.shadow) r.style.setProperty('--shadow', t.shadow); else r.style.removeProperty('--shadow');
    }catch(_){ }
    try{
      document.body.dataset.theme = t.id;
      // Expose theme mode for CSS (e.g., light theme needs different input/icon rendering)
      const mode = (t.mode ? String(t.mode) : (String(t.id||'').includes('light') ? 'light' : 'dark'));
      document.body.dataset.mode = mode;
      document.documentElement.dataset.mode = mode;
      
      // Fix16: semantic tokens + mode-specific control colors + accent contrast
      try{
        r.style.setProperty("--surface-0", t.bg);
        r.style.setProperty("--surface-1", t.panel);
        r.style.setProperty("--surface-2", t.panel2);
        r.style.setProperty("--text-0", t.text);
        r.style.setProperty("--text-muted", t.muted);
        r.style.setProperty("--border-0", t.border);
        const isLight = mode === "light";
        r.style.setProperty("--control-bg", isLight ? "rgba(255,255,255,.92)" : "rgba(18,24,38,.92)");
        r.style.setProperty("--control-border", isLight ? "rgba(15,23,42,.12)" : t.border);
        r.style.setProperty("--control-text", t.text);
        r.style.setProperty("--overlay-scrim", isLight ? "rgba(15,23,42,.40)" : "rgba(0,0,0,.55)");
        r.style.setProperty("--btn-glass-top", isLight ? "rgba(15,23,42,.04)" : "rgba(255,255,255,.08)");
        r.style.setProperty("--btn-glass-bot", isLight ? "rgba(15,23,42,.02)" : "rgba(255,255,255,.02)");
        r.style.setProperty("--accent-contrast", chooseAccentText(t.accent));
      }catch(_){ }

      try{ window.dispatchEvent(new CustomEvent("mums:themeApplied", { detail: { id: t.id, mode } })); }catch(_){ }
      try{ if(typeof renderThemeAudit === "function") renderThemeAudit(); }catch(_){ }

    }catch(e){}
  }


  // Fix16: Theme Lab (contrast/visibility checks)
  function _parseColor(str){
    const s = String(str||'').trim();
    // #rgb or #rrggbb
    let m = /^#?([0-9a-f]{3})$/i.exec(s);
    if(m){
      const h = m[1];
      return [int(h[0]*2), int(h[1]*2), int(h[2]*2)];
    }
    m = /^#?([0-9a-f]{6})$/i.exec(s);
    if(m){
      const h = m[1];
      return [int(h.slice(0,2)), int(h.slice(2,4)), int(h.slice(4,6))];
    }
    // rgb/rgba
    m = /^rgba?\(([^)]+)\)$/i.exec(s);
    if(m){
      const parts = m[1].split(',').map(x=>parseFloat(x));
      if(parts.length>=3) return [clamp(parts[0]), clamp(parts[1]), clamp(parts[2])];
    }
    return [255,255,255];

    function int(hex){ return parseInt(hex,16); }
    function clamp(n){ n = Number(n); if(!Number.isFinite(n)) return 0; return Math.max(0, Math.min(255, n)); }
  }

  function _relLum(rgb){
    const srgb = rgb.map(v=>v/255).map(v=> v<=0.03928 ? v/12.92 : Math.pow((v+0.055)/1.055, 2.4));
    return 0.2126*srgb[0] + 0.7152*srgb[1] + 0.0722*srgb[2];
  }

  function _contrast(c1, c2){
    const L1 = _relLum(_parseColor(c1));
    const L2 = _relLum(_parseColor(c2));
    const hi = Math.max(L1,L2);
    const lo = Math.min(L1,L2);
    return (hi+0.05)/(lo+0.05);
  }

  function chooseAccentText(accent){
    // Choose the better contrast of white vs deep slate on the accent background.
    const a = String(accent||'');
    const onWhite = _contrast('#ffffff', a);
    const onDark = _contrast('#0b1220', a);
    return (onDark > onWhite) ? '#0b1220' : '#ffffff';
  }

  function renderThemeAudit(){
    const audit = document.getElementById('themeAudit');
    const inner = document.getElementById('themeAuditInner');
    if(!audit || !inner) return;

    const user = (window.Auth && Auth.getUser) ? Auth.getUser() : null;
    const can = (window.Config && Config.can) ? Config.can(user, 'manage_release_notes') : false;
    if(!can){
      audit.style.display = 'none';
      inner.innerHTML = '';
      return;
    }

    const cs = getComputedStyle(document.documentElement);
    const bg = cs.getPropertyValue('--bg').trim() || '#0b1220';
    const panel = cs.getPropertyValue('--panel').trim() || '#121c2f';
    const text = cs.getPropertyValue('--text').trim() || '#eaf2ff';
    const muted = cs.getPropertyValue('--muted').trim() || '#a8b6d6';
    const border = cs.getPropertyValue('--border').trim() || 'rgba(255,255,255,.08)';
    const accent = cs.getPropertyValue('--accent').trim() || '#4aa3ff';

    const rows = [
      { k: 'Text on Panel', v: _contrast(text, panel), min: 4.5 },
      { k: 'Muted on Panel', v: _contrast(muted, panel), min: 3.0 },
      { k: 'Text on Background', v: _contrast(text, bg), min: 4.5 },
      { k: 'Accent on Panel', v: _contrast(accent, panel), min: 3.0 },
      { k: 'Border on Panel', v: _contrast(border, panel), min: 1.8 },
    ];

    function badge(r){
      if(r >= 4.5) return { label: 'PASS', cls: 'pass' };
      if(r >= 3.0) return { label: 'WARN', cls: 'warn' };
      return { label: 'FAIL', cls: 'fail' };
    }

    inner.innerHTML = `
      <div class="audit-grid">
        ${rows.map(row=>{
          const ratio = (Math.round(row.v*100)/100).toFixed(2);
          const b = (row.v >= row.min) ? {label:'PASS', cls:'pass'} : (row.v >= Math.max(3.0, row.min)) ? {label:'WARN', cls:'warn'} : {label:'FAIL', cls:'fail'};
          return `<div class="audit-row"><div style="font-weight:900">${UI.esc(row.k)}</div><div style="display:flex;gap:8px;align-items:center"><div class="small muted">${ratio}:1</div><div class="audit-pill ${b.cls}">${b.label}</div></div></div>`;
        }).join('')}
      </div>
      <div class="small muted" style="margin-top:10px">
        Guidance: If any item fails, adjust theme tokens (text/muted/border/panel). For Aurora (Ecommerce Light) the typical fix is increasing muted contrast and strengthening borders.
      </div>
    `;

    audit.style.display = 'block';
  }

  function renderThemeGrid(){
    const grid = document.getElementById('themeGrid');
    if(!grid) return;
    const cur = Store.getTheme();
    const themes = (Config && Array.isArray(Config.THEMES)) ? Config.THEMES : [];
    grid.innerHTML = themes.map(t=>{
      const active = t.id===cur;
      const fontName = (t.font ? String(t.font).split(',')[0].replace(/['\"]/g,'').trim() : 'System');
      return `
        <div class="theme-tile ${active?'active':''}" data-theme="${UI.esc(t.id)}" tabindex="0" role="button" aria-label="Theme ${UI.esc(t.name)}">
          <div class="theme-swatch" style="--sw1:${t.accent};--sw2:${t.bgRad1}"></div>
          <div>
            <div class="tname">${UI.esc(t.name)}</div>
            <div class="tmeta">Accent ${UI.esc(t.accent)} • Font ${UI.esc(fontName)}${active?' • Selected':''}</div>
          </div>
        </div>
      `;
    }).join('');

    grid.querySelectorAll('[data-theme]').forEach(tile=>{
      const pick = ()=>{
        const id = tile.dataset.theme;
        try{ if(Store && Store.dispatch) Store.dispatch('UPDATE_THEME', { id:id }); else Store.setTheme(id); }catch(_){ try{ Store.setTheme(id); }catch(__){} }
        try{ applyTheme(id); }catch(_){ }
        renderThemeGrid();
      };
      tile.onclick = pick;
      tile.onkeydown = (e)=>{ if(e.key==='Enter' || e.key===' '){ e.preventDefault(); pick(); } };
    });

    // Fix16: refresh Theme Lab (contrast checks)
    try{ renderThemeAudit(); }catch(_){ }
  }

  // Bottom quick links
  function normalizeUrl(u){
    const s = String(u||'').trim();
    if(!s) return '';
    if(/^https?:\/\//i.test(s)) return s;
    return 'https://' + s;
  }

  function renderQuickLinksBar(){
    const wrap = document.getElementById('quickLinksInner');
    if(!wrap) return;
    const links = Store.getQuickLinks();

    wrap.innerHTML = links.map((l, idx)=>{
      const has = !!(l && l.url);
      const label = String(l?.label||'').trim();
      const url = normalizeUrl(l?.url||'');
      const glow = String(l?.glowColor||l?.glow||'').trim();
      const glowCss = has ? (glow || 'var(--accent)') : '';
      const tip = (label || url || `Link ${idx+1}`).trim();
      // IMPORTANT: Do not change the number inside the circle based on labels.
      const num = String(idx+1);
      const shownLabel = label || '';
      return `
        <div class="qitem" data-idx="${idx}" ${has?`data-has="1"`:''} data-tip="${UI.esc(tip)}">
          <div class="qlabel">${UI.esc(shownLabel)}</div>
          <button class="qcircle ${has?'filled glowing':''}" ${has?`style="--glow:${UI.esc(glowCss)}"`:''} type="button" data-idx="${idx}" aria-label="Quick link ${idx+1}">
            <span class="qtxt">${UI.esc(num)}</span>
          </button>
        </div>
      `;
    }).join('');

    wrap.querySelectorAll('.qcircle').forEach(btn=>{
      btn.onclick = ()=>{
        const idx = Number(btn.dataset.idx||0);
        const links = Store.getQuickLinks();
        const l = links[idx] || {};
        const url = normalizeUrl(l.url);
        if(!url) return;
        window.open(url, '_blank', 'noopener');
      };
    });
  }

  // === World clocks (3 programmable digital clocks on bottom bar) ===
  const CLOCK_STYLES = [
    {id:'classic', name:'Classic'},
    {id:'neon', name:'Neon'},
    {id:'mono', name:'Monochrome'},
    {id:'glass', name:'Glass'},
    {id:'bold', name:'Bold'},
    {id:'minimal', name:'Minimal'},
    {id:'terminal', name:'Terminal'},
    {id:'chip', name:'Chip'},
    {id:'rounded', name:'Rounded'},
    {id:'outline', name:'Outline'},
  ];

  function tzLabel(tz){
    const map = {
      'Asia/Manila':'Manila',
      'UTC':'UTC',
      'America/Los_Angeles':'Los Angeles',
      'America/New_York':'New York',
      'Europe/London':'London',
      'Europe/Paris':'Paris',
      'Asia/Tokyo':'Tokyo',
      'Asia/Singapore':'Singapore',
      'Australia/Sydney':'Sydney'
    };
    return map[tz] || tz;
  }

  function formatTimeParts(date, tz){
    try{
      const fmt = new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour:'2-digit', minute:'2-digit', second:'2-digit', hour12:false });
      const parts = Object.fromEntries(fmt.formatToParts(date).filter(p=>p.type!=='literal').map(p=>[p.type,p.value]));
      return { hh: parts.hour||'00', mm: parts.minute||'00', ss: parts.second||'00' };
    }catch(e){
      const d = date;
      return { hh: String(d.getHours()).padStart(2,'0'), mm: String(d.getMinutes()).padStart(2,'0'), ss: String(d.getSeconds()).padStart(2,'0') };
    }
  }

  function renderWorldClocksBar(){
    const wrap = document.getElementById('worldClocks');
    if(!wrap) return;
    const list = Store.getWorldClocks();
    const now = new Date();
    wrap.innerHTML = list.map((c, i)=>{
      const on = !!c.enabled;
      if(!on) return '';
      const tz = c.timeZone || 'Asia/Manila';
      const t = formatTimeParts(now, tz);
      const label = String(c.label||tzLabel(tz)||`Clock ${i+1}`);
      const hcol = c.hoursColor || '#EAF3FF';
      const mcol = c.minutesColor || '#9BD1FF';
      const style = String(c.style||'classic');
      return `
        <div class="wclock wc-${style}" data-idx="${i}" title="${UI.esc(label)} (${UI.esc(tz)})">
          <div class="wc-label">${UI.esc(label)}</div>
          <div class="wc-time"><span class="wc-h" style="color:${UI.esc(hcol)}">${UI.esc(t.hh)}</span><span class="wc-sep">:</span><span class="wc-m" style="color:${UI.esc(mcol)}">${UI.esc(t.mm)}</span><span class="wc-sec">:${UI.esc(t.ss)}</span></div>
        </div>
      `;
    }).join('');
  }

  // Force-refresh helper: some browsers can defer layout updates while closing modals.
  // This guarantees the clocks appear instantly after saving settings (no manual refresh).
  function refreshWorldClocksNow(){
    try{ renderWorldClocksBar(); }catch(e){ console.error(e); }
    try{ requestAnimationFrame(()=>{ try{ renderWorldClocksBar(); }catch(_){ } }); }catch(_){ }
    try{ setTimeout(()=>{ try{ renderWorldClocksBar(); }catch(_){ } }, 0); }catch(_){ }
  }

  // Preview strip in World Clocks settings (modal)
  // - Shows an instant preview of the 3 clocks
  // - Supports drag re-order (left-to-right)
  function renderClocksPreviewStrip(){
    const strip = document.getElementById('clocksPreviewStrip');
    if(!strip) return;
    const list = Store.getWorldClocks();
    const now = new Date();

    strip.innerHTML = list.map((c,i)=>{
      const tz = c.timeZone || 'Asia/Manila';
      const t = formatTimeParts(now, tz);
      const label = String(c.label||tzLabel(tz)||`Clock ${i+1}`);
      const hcol = c.hoursColor || '#EAF3FF';
      const mcol = c.minutesColor || '#9BD1FF';
      const style = String(c.style||'classic');
      const on = !!c.enabled;
      return `
        <div class="wclock wc-${style} wclock-preview ${on?'':'is-off'}" draggable="true" data-idx="${i}" title="Drag to reorder • ${UI.esc(label)} (${UI.esc(tz)})">
          <div class="wc-label">${UI.esc(label)}</div>
          <div class="wc-time">
            <span class="wc-h" style="color:${UI.esc(hcol)}">${UI.esc(t.hh)}</span><span class="wc-sep">:</span><span class="wc-m" style="color:${UI.esc(mcol)}">${UI.esc(t.mm)}</span><span class="wc-sec">:${UI.esc(t.ss)}</span>
          </div>
          <div class="wc-drag" aria-hidden="true">↔</div>
        </div>
      `;
    }).join('');

    // Bind drag-and-drop reorder (safe; only 3 items)
    strip.querySelectorAll('.wclock-preview').forEach(el=>{
      el.addEventListener('dragstart', (e)=>{
        try{ e.dataTransfer.setData('text/plain', String(el.dataset.idx||'')); }catch(_){}
        el.classList.add('dragging');
      });
      el.addEventListener('dragend', ()=>{ el.classList.remove('dragging'); });
      el.addEventListener('dragover', (e)=>{ e.preventDefault(); el.classList.add('dragover'); });
      el.addEventListener('dragleave', ()=>{ el.classList.remove('dragover'); });
      el.addEventListener('drop', (e)=>{
        e.preventDefault();
        el.classList.remove('dragover');
        let from = -1;
        try{ from = Number(e.dataTransfer.getData('text/plain')); }catch(_){}
        const to = Number(el.dataset.idx||-1);
        if(!Number.isFinite(from) || !Number.isFinite(to) || from<0 || to<0 || from===to) return;
        try{
          const cur = Store.getWorldClocks().slice();
          if(from>=cur.length || to>=cur.length) return;
          const item = cur.splice(from,1)[0];
          cur.splice(to,0,item);
          try{ if(Store && Store.dispatch) Store.dispatch('UPDATE_CLOCKS', cur); else Store.saveWorldClocks(cur); }catch(_){ try{ Store.saveWorldClocks(cur); }catch(__){} }
          // Re-render everything to reflect new order (numbers, bottom bar, preview)
          renderClocksGrid();
          renderWorldClocksBar();
          renderClocksPreviewStrip();
        }catch(err){ console.error(err); }
      });
    });
  }


  // Alarm checker (runs per second)
  const _alarmState = { lastKey: null };
  function checkWorldClockAlarms(){
    const list = Store.getWorldClocks();
    const now = new Date();
    const user = Auth && Auth.getUser ? Auth.getUser() : null;
    const userId = user ? user.id : 'anon';

    for(let i=0;i<list.length;i++){
      const c = list[i] || {};
      if(!c.enabled || !c.alarmEnabled || !c.alarmTime) continue;
      const tz = c.timeZone || 'Asia/Manila';
      const t = formatTimeParts(now, tz);
      const hm = `${t.hh}:${t.mm}`;
      if(hm === c.alarmTime && t.ss === '00'){
        const key = `${i}|${tz}|${c.alarmTime}|${UI.manilaNow().isoDate}`;
        if(_alarmState.lastKey === key) continue;
        _alarmState.lastKey = key;
        // Use existing notification sound settings
        try{ UI.playNotifSound(userId); }catch(e){}
      }
    }
  }

  function renderClocksGrid(){
    const grid = document.getElementById('clocksGrid');
    if(!grid) return;
    const list = Store.getWorldClocks();
    const timeZones = [
      'Asia/Manila','UTC','America/Los_Angeles','America/New_York','Europe/London','Europe/Paris','Asia/Tokyo','Asia/Singapore','Australia/Sydney'
    ];
    const styleOpts = CLOCK_STYLES.map(s=>`<option value="${UI.esc(s.id)}">${UI.esc(s.name)}</option>`).join('');

    grid.innerHTML = list.map((c, i)=>{
      const tz = c.timeZone || 'Asia/Manila';
      const tzOpts = timeZones.map(z=>`<option value="${UI.esc(z)}" ${z===tz?'selected':''}>${UI.esc(tzLabel(z))}</option>`).join('');
      return `
        <div class="clock-card" data-idx="${i}">
          <div class="row" style="justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap">
            <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
              <div class="chip">Clock ${i+1}</div>
              <label class="small" style="display:flex;gap:8px;align-items:center">
                <input type="checkbox" class="clk-enabled" ${c.enabled?'checked':''} />
                Enabled
              </label>
              <label class="small" style="display:flex;gap:8px;align-items:center">
                <input type="checkbox" class="clk-alarmEnabled" ${c.alarmEnabled?'checked':''} />
                Alarm enabled
              </label>
            </div>
            <div class="small muted" style="white-space:nowrap">Alarm uses Notification Sound</div>
          </div>

          <div style="display:grid;grid-template-columns:1.2fr 1fr;gap:12px;margin-top:10px">
            <label class="small">Label
              <input class="input clk-label" value="${UI.esc(c.label||'')}" placeholder="e.g. Support HQ" />
            </label>
            <label class="small">Time zone
              <select class="input clk-tz">${tzOpts}</select>
            </label>
          </div>

          <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-top:10px">
            <label class="small">Hours color
              <input class="input clk-hc" type="color" value="${UI.esc(c.hoursColor||'#EAF3FF')}" />
            </label>
            <label class="small">Minutes color
              <input class="input clk-mc" type="color" value="${UI.esc(c.minutesColor||'#9BD1FF')}" />
            </label>
            <label class="small">Clock design
              <select class="input clk-style">${styleOpts}</select>
            </label>
          </div>

          <div style="display:grid;grid-template-columns:1fr;gap:10px;margin-top:10px">
            <label class="small">Alarm time
              <input class="input clk-alarm" type="time" value="${UI.esc(c.alarmTime||'')}" style="max-width:180px" ${c.alarmEnabled?'':'disabled'} />
            </label>
          </div>
        </div>
      `;
    }).join('');

    // set styles after render
    grid.querySelectorAll('.clock-card').forEach(card=>{
      const i = Number(card.dataset.idx||0);
      const s = (list[i] && list[i].style) ? list[i].style : 'classic';
      const sel = card.querySelector('.clk-style');
      if(sel) sel.value = s;
    });

    // Always refresh the in-modal preview strip so users can instantly see
    // what will appear on the bottom bar, and can drag-reorder clocks.
    try{ renderClocksPreviewStrip(); }catch(e){ /* ignore */ }

    // Live preview + autosave (professional UX): any change immediately updates the bottom bar.
    // This avoids "clock not visible" complaints when users expect instant feedback.
    if(!grid.__liveBind){
      grid.__liveBind = true;
      let t = null;
      const commit = ()=>{
        try{
          const next = Store.getWorldClocks();
          grid.querySelectorAll('.clock-card').forEach(card=>{
            const i = Number(card.dataset.idx||0);
            if(!next[i]) next[i] = {};
            const q = (sel)=>card.querySelector(sel);
            const alarmOn = !!q('.clk-alarmEnabled')?.checked;
            const alarmInput = q('.clk-alarm');
            // Keep UI consistent: disable the time input unless Alarm is enabled.
            try{ if(alarmInput) alarmInput.disabled = !alarmOn; }catch(_){ }
            next[i] = {
              enabled: !!q('.clk-enabled')?.checked,
              label: String(q('.clk-label')?.value||'').trim(),
              timeZone: String(q('.clk-tz')?.value||'Asia/Manila'),
              hoursColor: String(q('.clk-hc')?.value||'#EAF3FF'),
              minutesColor: String(q('.clk-mc')?.value||'#9BD1FF'),
              style: String(q('.clk-style')?.value||'classic'),
              alarmEnabled: alarmOn,
              alarmTime: alarmOn ? String(alarmInput?.value||'').trim() : '',
            };
          });
          try{ if(Store && Store.dispatch) Store.dispatch('UPDATE_CLOCKS', next); else Store.saveWorldClocks(next); }catch(_){ try{ Store.saveWorldClocks(next); }catch(__){} }
          // Immediate bottom bar update (no refresh needed)
          refreshWorldClocksNow();
          try{ renderClocksPreviewStrip(); }catch(_){ }
        }catch(e){ /* never break settings */ console.error(e); }
      };
      // Expose a safe flush hook so closing the modal applies changes immediately.
      // This prevents the "I saved but clocks didn't appear" issue when the last
      // change is still waiting in a debounce timer.
      grid.__commitClocks = ()=>{ try{ clearTimeout(t); }catch(_){ } try{ commit(); }catch(_){ } };
      grid.addEventListener('input', ()=>{ clearTimeout(t); t = setTimeout(commit, 150); });
      grid.addEventListener('change', ()=>{ clearTimeout(t); t = setTimeout(commit, 0); });
    }
  }

  function renderLinksGrid(){
    const grid = document.getElementById('linksGrid');
    if(!grid) return;
    const links = Store.getQuickLinks();
    grid.innerHTML = links.map((l, idx)=>{
      const label = String(l?.label||'');
      const url = String(l?.url||'');
      const glowColor = String(l?.glowColor||l?.glow||'');
      return `
        <div class="link-row" data-idx="${idx}">
          <div class="lr-head">
            <div class="lr-slot">Link ${idx+1}</div>
            <div class="lr-actions">
              <button class="btn tiny" type="button" data-save>Save</button>
              <button class="btn tiny danger" type="button" data-del>Delete</button>
            </div>
          </div>
          <div style="display:grid;grid-template-columns:1fr;gap:10px;margin-top:10px">
            <label class="small">Label
              <input class="input" data-label value="${UI.esc(label)}" placeholder="e.g., Zendesk" />
            </label>
            <label class="small">URL
              <input class="input" data-url value="${UI.esc(url)}" placeholder="https://..." />
            </label>
            <label class="small">Glow color (for filled circles)
              <div class="row" style="gap:10px;align-items:center">
                <input type="color" data-glow value="${UI.esc((glowColor||'').trim()||'#4f46e5')}" style="width:44px;height:34px;border-radius:10px;border:1px solid var(--border);background:transparent;padding:0" />
                <input class="input" data-glowText value="${UI.esc((glowColor||'').trim())}" placeholder="#4f46e5 (optional)" />
              </div>
            </label>
          </div>
        </div>
      `;
    }).join('');

    grid.querySelectorAll('.link-row').forEach(row=>{
      const idx = Number(row.dataset.idx||0);
      const getVals = ()=>({
        label: String(row.querySelector('[data-label]')?.value||'').trim(),
        url: String(row.querySelector('[data-url]')?.value||'').trim(),
        glowColor: String((row.querySelector('[data-glowText]')?.value||row.querySelector('[data-glow]')?.value||'')).trim()
      });
      const saveBtn = row.querySelector('[data-save]');
      const delBtn = row.querySelector('[data-del]');
      // Sync the color picker with the hex text field
      const glowPick = row.querySelector('[data-glow]');
      const glowTxt = row.querySelector('[data-glowText]');
      if(glowPick && glowTxt){
        glowPick.oninput = ()=>{ try{ glowTxt.value = String(glowPick.value||'').trim(); }catch(_){ } };
        glowTxt.oninput = ()=>{
          const v = String(glowTxt.value||'').trim();
          if(/^#([0-9a-fA-F]{6})$/.test(v)) glowPick.value = v;
        };
      }
      if(saveBtn) saveBtn.onclick = ()=>{
        const v = getVals();
        const url = normalizeUrl(v.url);
        if(!url){ alert('Please enter a valid URL.'); return; }
        Store.setQuickLink(idx, { label: v.label, url, glowColor: v.glowColor });
        renderQuickLinksBar();
        renderLinksGrid();
      };
      if(delBtn) delBtn.onclick = ()=>{
        if(!confirm('Delete this quick link?')) return;
        Store.clearQuickLink(idx);
        renderQuickLinksBar();
        renderLinksGrid();
      };
    });
  }

  function renderNav(user){
    const nav = UI.el('#nav');
    function renderItem(n, depth){
      if(!Config.can(user, n.perm)) return '';
      const pad = depth ? `style="padding-left:${12 + depth*12}px"` : '';
      const hasKids = Array.isArray(n.children) && n.children.length;
      if(!hasKids){
        return `<a href="#${n.id}" data-page="${n.id}" ${pad}><span>${n.icon||''}</span><span>${UI.esc(n.label)}</span></a>`;
      }
      // Tree group
      const key = `nav_group_${n.id}`;
      const open = localStorage.getItem(key);
      const isOpen = open === null ? true : (open === '1');
      const kidsHtml = n.children
        .map(k => renderItem(k, depth+1))
        .filter(Boolean)
        .join('');
      if(!kidsHtml) return '';
      return `
        <div class="nav-group" data-group="${n.id}">
          <button class="nav-group-head" type="button" data-toggle="${n.id}" aria-expanded="${isOpen?'true':'false'}">
            <span class="ico">${n.icon||''}</span>
            <span class="lbl">${UI.esc(n.label)}</span>
            <span class="chev">▾</span>
          </button>
          <div class="nav-group-kids" style="display:${isOpen?'block':'none'}">${kidsHtml}</div>
        </div>
      `;
    }

    nav.innerHTML = Config.NAV.map(n=>renderItem(n,0)).filter(Boolean).join('');
    // If nothing is visible due to perms/role mismatch, show a hint.
    if(!nav.innerHTML.trim()){
      nav.innerHTML = `
        <div class="small muted" style="padding:10px 6px">
          No menu items available for this account.<br/>
          Check the user role/permissions in <b>User Management</b>.
        </div>
      `;
      return;
    }

    // group toggles
    nav.querySelectorAll('[data-toggle]').forEach(btn=>{
      btn.onclick = ()=>{
        const id = btn.dataset.toggle;
        const wrap = nav.querySelector(`.nav-group[data-group="${CSS.escape(id)}"]`);
        if(!wrap) return;
        const kids = wrap.querySelector('.nav-group-kids');
        const open = kids.style.display !== 'none';
        kids.style.display = open ? 'none' : 'block';
        btn.setAttribute('aria-expanded', open ? 'false' : 'true');
        localStorage.setItem(`nav_group_${id}`, open ? '0' : '1');
      };
    });
  }

  function renderUserCard(user){
    const el = UI.el('#userCard');
    if(!el) return;
    const team = Config.teamById(user.teamId);
    // Current duty for the logged-in user (Manila time).
    // Uses the weekly schedule blocks for today's Manila date.
    const duty = (function(){
      const todayISO = UI.manilaTodayISO();

      // 1) Leaves override duty
      const lv = Store.getLeave(user.id, todayISO);
      if(lv && lv.type){
        const map = { SICK:'ON SICK LEAVE', EMERGENCY:'ON EMERGENCY LEAVE', VACATION:'ON VACATION LEAVE', HOLIDAY:'ON HOLIDAY LEAVE' };
        return { roleId: null, label: map[lv.type] || 'ON LEAVE' };
      }

      // 2) Rest day override duty (based on master schedule cycle)
      try{
        const mm = Store.getMasterMember(user.teamId, user.id);
        const tm = Store.getTeamMaster(user.teamId) || {};
        const freq = Number(tm.frequencyMonths || 1) || 1;
        if(mm && Array.isArray(mm.restWeekdays) && mm.restWeekdays.length){
          const dow = UI.weekdayFromISO(todayISO);
          // month-difference cycle check (Manila calendar, ISO-safe)
          const s = String(mm.startISO || todayISO);
          const sy = parseInt(s.slice(0,4),10), sm = parseInt(s.slice(5,7),10);
          const ty = parseInt(todayISO.slice(0,4),10), tm0 = parseInt(todayISO.slice(5,7),10);
          if(Number.isFinite(sy) && Number.isFinite(sm) && Number.isFinite(ty) && Number.isFinite(tm0)){
            const monthsDiff = (ty - sy) * 12 + (tm0 - sm);
            const inCycle = monthsDiff >= 0 ? (monthsDiff % freq === 0) : false;
            if(inCycle && mm.restWeekdays.includes(dow)){
              return { roleId: null, label: 'ON REST DAY' };
            }
          }
        }
      }catch(e){ /* ignore */ }

      // 3) Otherwise, compute duty from the currently active scheduled block
      const dow = UI.weekdayFromISO(todayISO);
      if(dow === null) return { roleId: null, label: '—' };

      const p = UI.manilaNow();
      const nowMin = UI.minutesOfDay(p);
      const blocks = Store.getUserDayBlocks(user.id, dow) || [];
      for(const b of blocks){
        const s = UI.parseHM(b.start);
        const e = UI.parseHM(b.end);
        if(!Number.isFinite(s) || !Number.isFinite(e)) continue;
        const wraps = e <= s;
        const hit = (!wraps && nowMin >= s && nowMin < e) || (wraps && (nowMin >= s || nowMin < e));
        if(hit){
          const sc = Config.scheduleById(b.role);
          return { roleId: b.role, label: (sc && sc.label) ? sc.label : String(b.role||'—') };
        }
      }
      return { roleId: null, label: '—' };
    })();
    const prof = Store.getProfile(user.id) || {};
    const initials = UI.initials(user.name||user.username);
    const avatarHtml = prof.photoDataUrl
      ? `<img src="${prof.photoDataUrl}" alt="User photo" />`
      : `<div class="initials">${UI.esc(initials)}</div>`;

    // Enforce the requested profile format (sample-like):
    // Photo on left; role below photo; name on the right; below name: shift; below shift: duty.
    // We intentionally DO NOT depend on a persisted "layout" localStorage value here,
    // because previous builds could keep rendering the old card format and make it
    // look like updates "didn't apply".
    // Keep edit access, but make it subtle (icon button) so the profile layout matches
    // the reference format (photo left, role under photo, details on the right).
    // New requested sidebar profile format:
    // Order:
    // 1) Duty (top)
    // 2) Full name (centered, aligned to photo)
    // 3) Photo
    // 4) Position
    // 5) Shift
    // (Profile editing is accessed from the Settings modal, not an inline edit icon.)
    const shiftLabel = (team && team.label) ? team.label : '';
    const roleLabel = String(user.role||'').replaceAll('_',' ');
    el.innerHTML = `
      <div class="sp-wrap" role="group" aria-label="User profile">
        <div class="sp-duty"><span class="muted">DUTY:</span> <span class="sp-dutyvalue">${UI.esc(duty.label||'—')}</span></div>
        <div class="sp-name">${UI.esc(user.name||user.username)}</div>
        <div class="sp-photo" aria-hidden="true">${avatarHtml}</div>
        <div class="sp-position">${UI.esc(roleLabel||'')}</div>
        <div class="sp-shift">${UI.esc(String(shiftLabel||'').toUpperCase())}</div>
      </div>
    `;

    // Auto-fit text so long names/duty are still readable within the allocated sidebar width.
    const nm = el.querySelector('.sp-name');
    const dutyEl = el.querySelector('.sp-duty');
    // Run after layout
    requestAnimationFrame(()=>{
      try{
        if(nm) fitText(nm, 14, 22);
        if(dutyEl) fitText(dutyEl, 11, 13);
      }catch(err){ console.error('Profile RAF error', err); }
    });

    // no inline edit button
  }

  function openProfileModal(user){
    const prof = Store.getProfile(user.id) || {};
    const team = Config.teamById(user.teamId);

    // fill fields
    UI.el('#profileName').value = user.name||'';
    UI.el('#profileEmail').value = user.email||'';
    UI.el('#profileRole').value = user.role||'';
    UI.el('#profileTeam').value = team.label||'';
    renderProfileAvatar(prof.photoDataUrl, user);

    // layout selector
    const layoutSel = UI.el('#profileLayout');
    if(layoutSel){
      layoutSel.value = localStorage.getItem('mums_profile_layout') || 'banner';
    }

    // upload
    const input = UI.el('#profilePhotoInput');
    input.value = '';
    input.onchange = async()=>{
      const f = input.files && input.files[0];
      if(!f) return;
      const dataUrl = await UI.readImageAsDataUrl(f, 480);
      Store.setProfile(user.id, { photoDataUrl: dataUrl, updatedAt: Date.now() });
      renderProfileAvatar(dataUrl, user);
      // refresh side card immediately
      renderUserCard(user);
    };

    // remove photo
    const rm = UI.el('#profileRemovePhoto');
    if(rm){
      rm.onclick = ()=>{
        const hasPhoto = !!(Store.getProfile(user.id)||{}).photoDataUrl;
        if(!hasPhoto) return;
        if(!confirm('Remove your profile photo?')) return;
        Store.setProfile(user.id, { photoDataUrl: null, updatedAt: Date.now() });
        renderProfileAvatar(null, user);
        renderUserCard(Store.getUsers().find(u=>u.id===user.id) || user);
      };
    }

    UI.el('#profileSave').onclick = ()=>{
      const name = String(UI.el('#profileName').value||'').trim();
      const email = String(UI.el('#profileEmail').value||'').trim();
      Store.updateUser(user.id, { name: name||user.username, email });

      // persist layout selection
      if(layoutSel){
        localStorage.setItem('mums_profile_layout', String(layoutSel.value||'card'));
      }
      // refresh session user object
      const updated = Store.getUsers().find(u=>u.id===user.id);
      if(updated){ renderUserCard(updated); }
      UI.closeModal('profileModal');
    };

    UI.openModal('profileModal');
  }

  function renderProfileAvatar(photoDataUrl, user){
    const box = UI.el('#profileAvatar');
    if(!box) return;
    if(photoDataUrl){
      box.innerHTML = `<img src="${photoDataUrl}" alt="User photo" />`;
    } else {
      box.innerHTML = `<div class="initials" style="font-size:28px">${UI.esc(UI.initials(user.name||user.username))}</div>`;
    }
  }

  function canSeeLog(me, entry){
    const isSuper = me.role === Config.ROLES.SUPER_ADMIN;
    const isAdmin = isSuper || me.role === Config.ROLES.ADMIN;
    const isLead = me.role === Config.ROLES.TEAM_LEAD;
    if(isAdmin) return true;
    if(isLead){
      const showAll = localStorage.getItem('ums_logs_show_all') === '1';
      return showAll ? true : (entry.teamId === me.teamId);
    }
    return entry.teamId === me.teamId;
  }

  function renderSideLogs(user){

    // Component-module override (preferred)
    try{
      if(window.Components && Components.SidebarLogs){
        Components.SidebarLogs.render(user);
        return;
      }
    }catch(_){ }
    const box = UI.el('#sideLogs');
    const list = UI.el('#sideLogsList');
    const hint = UI.el('#sideLogsHint');
    const btn = UI.el('#openLogs');
    if(!box || !list || !btn) return;
    btn.onclick = ()=>{ window.location.hash = '#logs'; };
    const logs = Store.getLogs().filter(l=>canSeeLog(user,l)).slice(0,5);
    hint.textContent = logs.length ? `Showing ${logs.length} recent` : 'No activity';
    const fmt = (ts)=>{
      try{
        const p = UI.manilaParts(new Date(ts));
        const hh = String(p.hh).padStart(2,'0');
        const mm = String(p.mm).padStart(2,'0');
        return `${hh}:${mm}`;
      }catch(e){
        const d = new Date(ts);
        const hh = String(d.getHours()).padStart(2,'0');
        const mm = String(d.getMinutes()).padStart(2,'0');
        return `${hh}:${mm}`;
      }
    };
    list.innerHTML = logs.map(e=>{
      const teamClass = `team-${e.teamId}`;
      return `<div class="logline ${teamClass}" title="${UI.esc(e.detail||'')}">
        <span class="t">[${fmt(e.ts)}]</span>
        <span class="m">${UI.esc(e.msg||e.action||'')}</span>
      </div>`;
    }).join('');
  }

  function setActiveNav(page){
    UI.els('#nav a').forEach(a=>a.classList.toggle('active', a.dataset.page===page));
    // If active is inside a group, visually mark the group header too.
    UI.els('#nav .nav-group').forEach(g=>g.classList.remove('active'));
    const active = UI.el(`#nav a[data-page="${CSS.escape(page)}"]`);
    if(active){
      const group = active.closest('.nav-group');
      if(group){
        group.classList.add('active');
        // auto expand so user can see current page in tree
        const kids = group.querySelector('.nav-group-kids');
        const head = group.querySelector('.nav-group-head');
        if(kids && kids.style.display==='none'){
          kids.style.display = 'block';
          if(head) head.setAttribute('aria-expanded','true');
          const id = group.getAttribute('data-group');
          if(id) localStorage.setItem(`nav_group_${id}`,'1');
        }
      }
    }
  }

  function renderRightNow(){
    // Per UX: remove live date/time from the right sidebar.
    // Keep a lightweight static hint if needed.
    const chip = UI.el('#summaryNowChip');
    if(chip) chip.textContent = 'Asia/Manila';
  }

  // ---------------------------------------------------------------------
  // Dynamic Guide system (Right sidebar > Summary)
  // ---------------------------------------------------------------------
  function mkGuideSvg(title, lines){
    const esc = UI.esc;
    // Accept either an array of lines or a single string.
    // Some callers pass a single string; previously that caused a crash
    // because String.prototype.slice returns a string (no .map).
    let arr = [];
    if(Array.isArray(lines)) arr = lines;
    else if(typeof lines === 'string') arr = lines.split('\n');
    else if(lines != null) arr = [String(lines)];
    const safeLines = arr.slice(0,6).map(x=>esc(x));
    const lineY = [54,76,98,120,142,164];
    const text = safeLines.map((t,i)=>`<text x="28" y="${lineY[i]}" font-size="12" fill="rgba(255,255,255,.82)" font-family="system-ui,-apple-system,Segoe UI,Roboto">${t}</text>`).join('');
    return `
      <svg viewBox="0 0 520 200" width="100%" height="140" aria-hidden="true">
        <defs>
          <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stop-color="rgba(255,255,255,.10)"/>
            <stop offset="1" stop-color="rgba(0,0,0,.05)"/>
          </linearGradient>
        </defs>
        <rect x="10" y="10" width="500" height="180" rx="18" fill="url(#g)" stroke="rgba(255,255,255,.12)"/>
        <rect x="24" y="26" width="472" height="28" rx="10" fill="rgba(0,0,0,.18)" stroke="rgba(255,255,255,.10)"/>
        <text x="36" y="46" font-size="13" fill="rgba(255,255,255,.92)" font-weight="700" font-family="system-ui,-apple-system,Segoe UI,Roboto">${esc(title)}</text>
        ${text}
        <rect x="24" y="158" width="180" height="18" rx="9" fill="rgba(255,255,255,.07)"/>
        <rect x="212" y="158" width="120" height="18" rx="9" fill="rgba(255,255,255,.06)"/>
        <rect x="340" y="158" width="156" height="18" rx="9" fill="rgba(255,255,255,.05)"/>
      </svg>
    `;
  }

  const GUIDES = {
    dashboard: {
      title: 'Dashboard',
      guide: [
        { q:'What is this page for?', a:'Dashboard gives you a quick overview of your day and system status in MUMS.' },
        { q:'Manila time', a:'All time-based logic (duty, schedules, announcements) follows Asia/Manila time.' },
      ],
      notes: [
        'If you are a Team Lead, use Members > Assign Tasks to update schedules.',
        'Use Announcements to broadcast updates to your team.'
      ],
      legends: [
        ['🔒','Locked week (cannot edit until unlocked)'],
        ['📣','Announcement broadcast'],
      ]
    },
    mailbox: {
      title: 'Mailbox',
      guide: [
        { q:'What is Mailbox duty?', a:'Mailbox duty indicates the member responsible for mailbox handling at the current hour.' },
        { q:'How is duty computed?', a:'Duty is derived from the scheduled task blocks and Manila time.' },
      ],
      notes: [
        'If duty looks incorrect, confirm the week and day selector on Assign Tasks.'
      ],
      legends: [
        ['📥','Mailbox Manager'],
        ['📞','Call-related tasks']
      ]
    },
    members: {
      title: 'Assign Tasks',
      guide: [
        { q:'How do I assign tasks to members?', a:'Select a member row, choose a task, then click-and-drag on the hour grid. All scheduling is strictly 1-hour blocks (no minutes).' },
        { q:'What is Paint mode?', a:'Paint lets you click-and-drag across multiple hours to fill quickly with the selected task. It still enforces 1-hour blocks.' },
        { q:'How do SL / EL / VL / HL work?', a:'Use the leave buttons on a member to set Sick Leave (SL), Emergency Leave (EL), Vacation Leave (VL), or Holiday Leave (HL). When active, the member is greyed out and excluded from Auto Schedule.' },
        { q:'What is the Coverage Meter?', a:'Coverage Meter shows OK Hours and Health% for the selected day grid. OK Hours = hours with valid active coverage; Health% = (OK Hours / required hours) × 100.' },
        { q:'How do I delete schedule blocks?', a:'Click one or more blocks to select them, then press Delete/Backspace to remove immediately. You can also use Delete Selected or Clear All.' },
        { q:'What does Clear All do?', a:'Clear All deletes ALL assigned blocks for the selected member for the entire week (Sun–Sat). You will be asked to confirm.' },
        { q:'What does Send do?', a:'Send notifies members that the schedule was updated and requires acknowledgement. Team Lead can see who acknowledged.' },
      ],
      manual: [
        {title:'Assign blocks', caption:'Assign 1-hour blocks via drag or Paint', svg: mkGuideSvg('Assign Tasks','Drag on the hour grid — snaps to hours only')},
        {title:'Leave buttons', caption:'SL/EL/VL/HL grey out a member for the selected date', svg: mkGuideSvg('Leave Controls','Click to set; click again to remove (confirm)')},
        {title:'Coverage Meter', caption:'OK Hours and Health% for the selected day grid', svg: mkGuideSvg('Coverage Meter','Shows day label and health trend signals')},
        {title:'Send & Acknowledge', caption:'Send updates to members and track acknowledgements', svg: mkGuideSvg('Send','Members receive pop-up + beep, then acknowledge')}
      ],
      notes: [
        'Active members appear on top. Members on Rest Day or Leave appear below.',
        'Rest Day is driven by Master Schedule and follows Manila calendar date (no timezone shifts).',
        'Locked weeks cannot be edited. Unlock (Mon–Fri) if you need changes.'
      ],
      legends: [
        ['SL','Sick Leave'],
        ['EL','Emergency Leave'],
        ['VL','Vacation Leave'],
        ['HL','Holiday Leave'],
        ['🖌','Paint mode'],
        ['🧹','Clear All'],
        ['⌫','Delete selected blocks'],
        ['ON REST DAY','Member is not schedulable on that date'],
      ]
    },
    master_schedule: {
      title: 'Master Schedule',
      guide: [
        { q:'What is Master Schedule?', a:'Master Schedule defines each member\'s fixed Rest Day pattern (e.g., Friday & Saturday) and frequency (monthly/quarterly). It drives the Rest Day greying in Assign Tasks.' },
        { q:'How do I set Rest Days?', a:'Select a member, choose rest weekdays, choose frequency, then save. The Assign Tasks page updates automatically.' },
      ],
      manual: [
        {title:'Rest days', caption:'Set fixed rest weekdays per member', svg: mkGuideSvg('Master Schedule','Choose weekdays and save rule')} ,
        {title:'Frequency', caption:'Monthly / Every 2 months / Every 3 months / Quarterly', svg: mkGuideSvg('Frequency','Controls when fixed pattern repeats')}
      ],
      notes: [
        'Rest Day is a calendar rule (weekday-based) computed in Manila time.',
        'Members on Rest Day are shown as disabled in Assign Tasks with “ON REST DAY”.'
      ],
      legends: [
        ['Fri/Sat','Example Rest Day selection'],
        ['Monthly','Rule frequency example']
      ]
    },
    users: {
      title: 'User Management',
      guide: [
        { q:'What is this page for?', a:'User Management is where Admin/Super User maintains the user roster, roles, and team assignment.' },
        { q:'Why do users sometimes look missing?', a:'MUMS includes recovery/migration logic for older stored user keys. If a browser profile was reset, re-import or re-create users as needed.' },
      ],
      manual: [
        {title:'Roles', caption:'Assign MEMBER, TEAM_LEAD, ADMIN, SUPER_ADMIN', svg: mkGuideSvg('User Management','Roles control what pages are visible')} ,
        {title:'Roster', caption:'Create and maintain user list', svg: mkGuideSvg('User Roster','Existing users are recovered via migration/backup')}
      ],
      notes: [
        'For production multi-user shared data, connect to Supabase later (realtime roster + schedules).'
      ],
      legends: [
        ['TEAM_LEAD','Can manage schedules for own team'],
        ['ADMIN','Can manage users + teams'],
        ['SUPER_ADMIN','Full access (MEYS)']
      ]
    },
    announcements: {
      title: 'Announcements',
      guide: [
        { q:'How does the announcement bar work?', a:'The top bar rotates one announcement every 3 seconds. Clicking it opens the full message.' },
        { q:'What is shown on the bar?', a:'Page › Announcement details › Creator full name › Broadcast time (Manila).' },
      ],
      manual: [
        {title:'Broadcast', caption:'Create announcement with creator and timestamp', svg: mkGuideSvg('Announcements','Rotates 1 item every 3 seconds')} ,
        {title:'Format', caption:'Page › Announcement: Details › User › Time', svg: mkGuideSvg('Announcement Bar','Shows who sent it and when (Manila)')}
      ],
      notes: [
        'Members can control notification sound in Settings > Sound.'
      ],
      legends: [
        ['📣','Announcement'],
        ['🔔','Notification sound (if enabled)']
      ]
    },
    logs: {
      title: 'Activity Logs',
      guide: [
        { q:'What is recorded?', a:'Important actions like schedule edits, leaves, sends, locks/unlocks, and exports are tracked for visibility.' },
      ],
      notes: [
        'Team Leads usually see their team logs unless “show all” is enabled (Admin only).' 
      ],
      legends: [
        ['🕒','Time of action'],
        ['Team tag','Which team the action belongs to']
      ]
    }
  };

  // -------------------------------------------------------------
  // Offline AI-like Guide (no internet): search over GUIDES
  // -------------------------------------------------------------
  function buildGuideKB(){
    const kb=[];
    const guides=GUIDES||{};
    const sections=[['guide','GUIDE'],['notes','NOTES'],['legends','LEGENDS'],['manual','MANUAL']];
    const norm=(s)=>String(s||'').toLowerCase();
    Object.keys(guides).forEach(pageId=>{
      const g=guides[pageId]||{};
      const pageTitle=g.title||pageId;
      sections.forEach(([key,label])=>{
        const items=g[key]||[];
        if(key==='notes'){
          items.forEach((t,i)=>{
            const q=label+' '+(i+1);
            const a=String(t||'');
            const blob=norm([pageId,pageTitle,label,q,a].join(' '));
            kb.push({pageId,pageTitle,section:label,q,aShort:a,aLong:'',steps:[],tips:[],tags:[],blob});
          });
          return;
        }
        if(key==='legends'){
          items.forEach((r,i)=>{
            const q=String((r&&r[0])|| (label+' '+(i+1)));
            const a=String((r&&r[1])||'');
            const blob=norm([pageId,pageTitle,label,q,a].join(' '));
            kb.push({pageId,pageTitle,section:label,q,aShort:a,aLong:'',steps:[],tips:[],tags:[],blob});
          });
          return;
        }
        if(key==='manual'){
          items.forEach((it,i)=>{
            const q=String(it?.title || ('Manual '+(i+1)));
            const a=String(it?.caption || '');
            const blob=norm([pageId,pageTitle,label,q,a].join(' '));
            kb.push({pageId,pageTitle,section:label,q,aShort:a,aLong:'',steps:[],tips:[],tags:[],blob});
          });
          return;
        }
        items.forEach((it,i)=>{
          if(!it) return;
          const q=String(it.q || ('Guide '+(i+1)));
          const a=String(it.a || it.a_short || '');
          const aLong=String(it.a_long || '');
          const steps=Array.isArray(it.steps)?it.steps:[];
          const tips=Array.isArray(it.tips)?it.tips:[];
          const tags=Array.isArray(it.tags)?it.tags:[];
          const blob=norm([pageId,pageTitle,label,q,a,aLong,steps.join(' '),tips.join(' '),tags.join(' ')].join(' '));
          kb.push({pageId,pageTitle,section:label,q,aShort:a,aLong,steps,tips,tags,blob});
        });
      });
    });
    return kb;
  }

  const _guideKB = buildGuideKB();

  function _tokenize(s){
    return String(s||'').toLowerCase().replace(/[^a-z0-9\s]/g,' ').split(/\s+/).filter(Boolean).filter(w=>w.length>1);
  }

  function _scoreGuideItem(tokens, item, currentPageId){
    let score=0;
    if(item.pageId===currentPageId) score+=20;
    const blob=item.blob||'';
    const q=String(item.q||'').toLowerCase();
    for(const t of tokens){
      if(blob.includes(t)) score+=3;
      if(q.includes(t)) score+=4;
    }
    const joined=tokens.join(' ');
    if(joined.includes('paint') && blob.includes('paint')) score+=8;
    if(joined.includes('coverage') && blob.includes('coverage')) score+=8;
    if(joined.includes('clear') && blob.includes('clear')) score+=6;
    if((joined.includes('sl')||joined.includes('el')||joined.includes('vl')||joined.includes('hl')) && item.section==='LEGENDS') score+=6;
    return score;
  }

  function answerGuideQuestion(question, currentPageId){
    const tokens=_tokenize(question);
    if(!tokens.length) return {best:null, related:[], note:'Type a clearer question (example: how to use Paint?).', confidence:0, scores:{best:0, second:0}};
    const scored=_guideKB
      .map(it=>({it, score:_scoreGuideItem(tokens,it,currentPageId)}))
      .filter(x=>x.score>0)
      .sort((a,b)=>b.score-a.score);

    const bestObj = scored[0] || null;
    const secondObj = scored[1] || null;
    const best = bestObj ? bestObj.it : null;
    const related = scored.slice(1,4).map(x=>x.it);

    // Confidence heuristic (0..100):
    // - higher when best score is high
    // - higher when best is well separated from 2nd
    const bestScore = bestObj ? bestObj.score : 0;
    const secondScore = secondObj ? secondObj.score : 0;
    let conf = 0;
    if(bestScore > 0){
      const separation = (bestScore - secondScore) / Math.max(1, bestScore);
      // Base increases quickly then saturates
      const base = 1 - Math.exp(-bestScore / 18);
      conf = Math.round(100 * Math.min(1, Math.max(0, 0.55*base + 0.45*separation)));
    }

    return {
      best,
      related,
      note: best ? '' : 'No match found. Try different keywords (Paint, Clear All, SL).',
      confidence: conf,
      scores: { best: bestScore, second: secondScore }
    };
  }

  function renderSummaryGuide(pageId, menuLabel){
    const titleEl = UI.el('#summaryMenuTitle');
    const metaEl = UI.el('#summaryMenuMeta');
    const bodyEl = UI.el('#summaryGuide');
    if(!titleEl || !metaEl || !bodyEl) return;

    const g = GUIDES[pageId] || {
      title: (menuLabel||pageId||'').toString(),
      guide: [{ q:'Guide not available yet', a:'This page is new. Add a guide entry so Summary can show procedures, notes, legends, and manual screenshots.' }],
      notes: ['MUMS guides are dynamic and will expand as new pages/features are added.'],
      legends: [],
      manual: []
    };

    titleEl.textContent = `Guide: ${g.title}`;
    metaEl.textContent = `${(menuLabel||g.title)} • Use Search to find answers. Guides update automatically when you switch menus.`;

    // Guide enabled toggle
    const enabledToggle = UI.el('#guideEnabledToggle');
    const enabled = localStorage.getItem('mums_guide_enabled') !== '0';
    if(enabledToggle){
      enabledToggle.checked = enabled;
    }

    if(!enabled){
      bodyEl.innerHTML = `
        <div class="gpanel">
          <div class="gpanel-disabled">
            <div class="gpanel-disabled-title">Guide is disabled</div>
            <div class="small muted">Enable Guide in the toggle above to see procedures, notes, legends, and mini manual for this page.</div>
            <button class="btn" type="button" id="guideEnableNow">Enable Guide</button>
          </div>
        </div>
      `;
      const b = UI.el('#guideEnableNow');
      if(b){
        b.onclick = ()=>{
          localStorage.setItem('mums_guide_enabled','1');
          renderSummaryGuide(pageId, menuLabel);
        };
      }
      return;
    }

    const activeTab = (localStorage.getItem('mums_guide_tab') || 'guide');
    // Sync tab UI
    try{ UI.els('.gtab').forEach(b=>{ const on = (b.dataset.gtab||'')===activeTab; b.classList.toggle('active', on); b.setAttribute('aria-selected', on?'true':'false'); }); }catch(e){}
    const searchEl = UI.el('#guideSearch');
    const q = (searchEl && searchEl.value) ? String(searchEl.value).trim().toLowerCase() : '';

    // Remember questions per page
    const qKey = `mums_guide_questions_${pageId}`;
    let savedQs = [];
    try{ savedQs = JSON.parse(localStorage.getItem(qKey) || '[]') || []; }catch(e){ savedQs = []; }

    // Last offline AI answer for this page
    let lastAI = null;
    try{ lastAI = JSON.parse(localStorage.getItem('mums_ai_last_'+pageId) || 'null'); }catch(e){ lastAI=null; }

    const esc = UI.esc;

    function matchText(s){
      if(!q) return true;
      return String(s||'').toLowerCase().includes(q);
    }

    const guideItems = (g.guide||[]).filter(it=> matchText(it.q) || matchText(it.a));
    const noteItems = (g.notes||[]).filter(it=> matchText(it));
    const legendItems = (g.legends||[]).filter(it=> matchText(it[0]) || matchText(it[1]));
    const manualItems = (g.manual||[]).filter(it=> matchText(it.caption) || matchText(it.title));

    function renderGuide(){
      const parts = [];

      // AI answer card (if user asked a question)
      if(lastAI && lastAI.q){
        const qTxt = String(lastAI.q||'');
        const ansObj = lastAI.ans || {};
        const best = ansObj.best || null;
        const note = ansObj.note || '';
        const related = Array.isArray(ansObj.related) ? ansObj.related : [];
        const answerText = best ? (best.aShort || best.q || '') : (note || 'No answer found.');
        const src = best ? (best.pageTitle + ' • ' + best.section) : '';
        const conf = (typeof ansObj.confidence === 'number') ? ansObj.confidence : 0;
        const confText = conf ? (`Confidence: ${conf}%`) : 'Confidence: —';
        const relHtml = related.length ? (`<div class="grel">` + related.map((r,i)=>{
          const label = esc(r.q || ('Related '+(i+1)));
          return `<button class="btn ghost small" type="button" data-grel="${esc(r.q||'')}">${label}</button>`;
        }).join('') + `</div>`) : '';

        parts.push(`
          <div class="gcard gai">
            <div class="gcard-top">
              <span class="badge">AI (Offline)</span>
              <span class="small muted">${esc(confText)}${src ? (' • ' + esc(src)) : ''}</span>
            </div>
            <div class="gq">${esc(qTxt)}</div>
            <div class="ga">${esc(answerText)}</div>
            ${relHtml}
            <div class="gcard-actions">
              <button class="btn small" type="button" data-gai-more="1">More details</button>
              <button class="btn ghost small" type="button" data-gai-src="1" ${best?'':'disabled'} title="Show where this answer came from">Show sources</button>
              <button class="btn ghost small" type="button" data-gai-clear="1">Clear</button>
            </div>
          </div>
        `);
      }

      if(!guideItems.length){
        parts.push(`<div class="small muted">No results.</div>`);
      } else {
        parts.push(`<div class="gcards">` + guideItems.map((it,idx)=>{
          const qv = esc(it.q);
          const av = esc(it.a);
          return `
            <div class="gcard" data-gidx="${idx}">
              <div class="gq">${qv}</div>
              <div class="ga">${av}</div>
              <div class="gcard-actions">
                <button class="btn ghost small" type="button" data-gmore="${idx}">More details</button>
              </div>
            </div>
          `;
        }).join('') + `</div>`);
      }

      return parts.join('');
    }

    function renderNotes(){
      if(!noteItems.length) return `<div class="small muted">No results.</div>`;
      return `<ul class="gnotes">` + noteItems.map(n=>`<li>${esc(n)}</li>`).join('') + `</ul>`;
    }

    function renderLegends(){
      if(!legendItems.length) return `<div class="small muted">No legends.</div>`;
      return `<table class="gleg"><thead><tr><th>Label</th><th>Meaning</th></tr></thead><tbody>`+
        legendItems.map(r=>`<tr><td>${esc(r[0])}</td><td>${esc(r[1])}</td></tr>`).join('')+
      `</tbody></table>`;
    }

    function renderManual(){
      if(!manualItems.length) return `<div class="small muted">No manual images available for this page yet.</div>`;
      return `<div class="gmanual">` + manualItems.map((m,i)=>{
        const id = `gm_${pageId}_${i}`;
        return `
          <button class="gthumb" type="button" data-gimg="${esc(id)}" title="Open">
            <div class="gthumb-img">${m.svg||''}</div>
            <div class="gthumb-cap">${esc(m.caption||m.title||'')}</div>
          </button>
        `;
      }).join('') + `</div>`;
    }

    const tabContent = {
      guide: renderGuide(),
      notes: renderNotes(),
      legends: renderLegends(),
      manual: renderManual()
    };

    bodyEl.innerHTML = `
      <div class="gpanel">
        <div class="gpanel-head">
          <div class="gpanel-title">${esc(g.title)}</div>
          <div class="small muted">${q ? ('Showing results for “'+esc(q)+'”') : 'Select a tab to view details.'}</div>
        </div>
        <div class="gpanel-body">
          <div class="gpanel-tab" data-tab="${esc(activeTab)}">
            ${tabContent[activeTab] || tabContent.guide}
          </div>
        </div>
        <div class="gpanel-foot">
          <div class="small muted">Tip: Use Search to filter the guide. Click a manual thumbnail to enlarge.</div>
          ${savedQs.length ? (`<div class="gqs"><div class="small muted">Saved questions</div>`+
            savedQs.slice(-3).reverse().map(x=>`<div class="gqs-item">• ${esc(x)}</div>`).join('') + `</div>`) : ''}
        </div>
      </div>
    `;

    // Wire manual thumbnail clicks (open image modal)
    const thumbs = bodyEl.querySelectorAll('.gthumb');
    thumbs.forEach((b)=>{
      b.onclick = ()=>{
        const cap = b.querySelector('.gthumb-cap')?.textContent || 'Guide';
        const svg = b.querySelector('.gthumb-img')?.innerHTML || '';
        UI.openModal('guideImgModal');
        const t = UI.el('#guideImgTitle');
        const c = UI.el('#guideImgCaption');
        const bd = UI.el('#guideImgBody');
        if(t) t.textContent = 'Mini Manual';
        if(c) c.textContent = cap;
        if(bd) bd.innerHTML = `<div class="gimg-wrap">${svg}</div>`;
      };
    });

    // Wire guide "More details" and Offline AI buttons
    bodyEl.querySelectorAll('[data-gmore]').forEach((btn)=>{
      btn.onclick = ()=>{
        const i = Number(btn.getAttribute('data-gmore')||0);
        const it = (g.guide||[])[i];
        if(!it) return;
        UI.openModal('guideImgModal');
        const t = UI.el('#guideImgTitle');
        const c = UI.el('#guideImgCaption');
        const bd = UI.el('#guideImgBody');
        if(t) t.textContent = 'Guide Details';
        if(c) c.textContent = it.q || 'Guide';
        if(bd){
          bd.innerHTML = `
            <div class="gdetail">
              <div class="gq">${esc(it.q||'')}</div>
              <div class="ga" style="margin-top:10px">${esc(it.a||'')}</div>
            </div>
          `;
        }
      };
    });

    // Offline AI: related buttons
    bodyEl.querySelectorAll('[data-grel]').forEach((btn)=>{
      btn.onclick = ()=>{
        const relQ = String(btn.getAttribute('data-grel')||'').trim();
        if(!relQ) return;
        try{
          const ans = answerGuideQuestion(relQ, pageId);
          localStorage.setItem('mums_ai_last_'+pageId, JSON.stringify({ q:relQ, ans:ans, ts:Date.now() }));
        }catch(e){}
        // render again and switch to Guide tab
        localStorage.setItem('mums_guide_tab','guide');
        const searchEl = UI.el('#guideSearch');
        if(searchEl) searchEl.value = '';
        renderSummaryGuide(pageId, menuLabel);
      };
    });

    // Offline AI: clear card
    const clearAI = bodyEl.querySelector('[data-gai-clear]');
    if(clearAI){
      clearAI.onclick = ()=>{
        try{ localStorage.removeItem('mums_ai_last_'+pageId); }catch(e){}
        renderSummaryGuide(pageId, menuLabel);
      };
    }

    // Offline AI: more details
    const moreAI = bodyEl.querySelector('[data-gai-more]');
    if(moreAI && lastAI && lastAI.ans){
      moreAI.onclick = ()=>{
        const qTxt = String(lastAI.q||'');
        const ansObj = lastAI.ans||{};
        const best = ansObj.best||null;
        const related = Array.isArray(ansObj.related)?ansObj.related:[];
        UI.openModal('guideImgModal');
        const t = UI.el('#guideImgTitle');
        const c = UI.el('#guideImgCaption');
        const bd = UI.el('#guideImgBody');
        if(t) t.textContent = 'AI Answer (Offline)';
        if(c) c.textContent = qTxt;
        if(bd){
          const steps = (best && Array.isArray(best.steps) && best.steps.length) ? ('<div class="small muted" style="margin-top:12px"><b>Steps</b><br>'+best.steps.map((s,i)=> (i+1)+'. '+esc(s)).join('<br>')+'</div>') : '';
          const tips = (best && Array.isArray(best.tips) && best.tips.length) ? ('<div class="small muted" style="margin-top:12px"><b>Tips</b><br>'+best.tips.map(s=>'• '+esc(s)).join('<br>')+'</div>') : '';
          const rel = related.length ? ('<div class="small muted" style="margin-top:12px"><b>Related</b><br>'+related.map(r=>'• '+esc(r.q||'' )+' ('+esc(r.pageTitle||r.pageId||'')+')').join('<br>')+'</div>') : '';
          bd.innerHTML = `
            <div class="gdetail">
              <div class="gq">${esc(qTxt)}</div>
              <div class="ga" style="margin-top:10px">${esc(best ? (best.aShort||'') : (ansObj.note||''))}</div>
              ${(best && best.aLong) ? ('<div class=\"small muted\" style=\"margin-top:12px\">'+esc(best.aLong)+'</div>') : ''}
              ${steps}
              ${tips}
              ${rel}
            </div>
          `;
        }
      };
    }

    // Offline AI: show sources (which KB entry produced the answer)
    const srcAI = bodyEl.querySelector('[data-gai-src]');
    if(srcAI && lastAI && lastAI.ans){
      srcAI.onclick = ()=>{
        const ansObj = lastAI.ans || {};
        const best = ansObj.best || null;
        if(!best) return;
        UI.openModal('guideImgModal');
        const t = UI.el('#guideImgTitle');
        const c = UI.el('#guideImgCaption');
        const bd = UI.el('#guideImgBody');
        const conf = (typeof ansObj.confidence==='number') ? ansObj.confidence : 0;
        if(t) t.textContent = 'Answer Sources';
        if(c) c.textContent = `${best.pageTitle || best.pageId || ''} • ${best.section || ''}${conf?(' • Confidence '+conf+'%'):''}`;
        if(bd){
          const steps = (Array.isArray(best.steps) && best.steps.length)
            ? ('<div class="small muted" style="margin-top:12px"><b>Steps</b><br>' + best.steps.map((s,i)=> (i+1)+'. '+esc(s)).join('<br>') + '</div>')
            : '';
          const tips = (Array.isArray(best.tips) && best.tips.length)
            ? ('<div class="small muted" style="margin-top:12px"><b>Tips</b><br>' + best.tips.map(s=>'• '+esc(s)).join('<br>') + '</div>')
            : '';
          const long = best.aLong ? ('<div class="small muted" style="margin-top:12px">'+esc(best.aLong)+'</div>') : '';
          bd.innerHTML = `
            <div class="gdetail">
              <div class="small muted">This answer was matched from the MUMS in-app guide knowledge base.</div>
              <div class="gq" style="margin-top:10px"><b>Entry question</b><br>${esc(best.q||'')}</div>
              <div class="ga" style="margin-top:10px"><b>Entry answer</b><br>${esc(best.aShort||'')}</div>
              ${long}
              ${steps}
              ${tips}
              <div class="small muted" style="margin-top:12px"><b>Source</b><br>${esc(best.pageTitle||best.pageId||'')} • ${esc(best.section||'')}</div>
            </div>
          `;
        }
      };
    }
  }

  function openFullManualForPage(pageId, menuLabel){
    const esc = UI.esc;
    const g = GUIDES[pageId] || {
      title: (menuLabel||pageId||'').toString(),
      guide: [], notes: [], legends: [], manual: []
    };
    UI.openModal('guideImgModal');
    const t = UI.el('#guideImgTitle');
    const c = UI.el('#guideImgCaption');
    const bd = UI.el('#guideImgBody');
    if(t) t.textContent = 'Full Manual';
    if(c) c.textContent = `${g.title} • Guide + Notes + Legends + Manual`;
    if(!bd) return;

    const guideHtml = (g.guide||[]).length ? (g.guide||[]).map((it,i)=>{
      return `
        <div class="card pad" style="margin:10px 0">
          <div class="small muted">GUIDE</div>
          <div class="h3" style="margin:6px 0">${esc(it.q||('Guide '+(i+1)))}</div>
          <div class="small" style="white-space:pre-wrap">${esc(it.a||it.a_short||'')}</div>
          ${it.a_long ? `<div class="small muted" style="margin-top:10px;white-space:pre-wrap">${esc(it.a_long)}</div>` : ''}
          ${(Array.isArray(it.steps)&&it.steps.length) ? (`<div class="small" style="margin-top:10px"><b>Steps</b><br>`+it.steps.map((s,ix)=>`${ix+1}. ${esc(s)}`).join('<br>')+`</div>`) : ''}
          ${(Array.isArray(it.tips)&&it.tips.length) ? (`<div class="small" style="margin-top:10px"><b>Tips</b><br>`+it.tips.map(s=>`• ${esc(s)}`).join('<br>')+`</div>`) : ''}
        </div>
      `;
    }).join('') : `<div class="small muted">No guide entries yet.</div>`;

    const notesHtml = (g.notes||[]).length ? (`<ul style="margin:8px 0 0 18px">`+(g.notes||[]).map(n=>`<li class="small" style="margin:6px 0">${esc(n)}</li>`).join('')+`</ul>`) : `<div class="small muted">No notes.</div>`;

    const legendsHtml = (g.legends||[]).length ? (`<table class="gleg" style="margin-top:8px"><thead><tr><th>Label</th><th>Meaning</th></tr></thead><tbody>`+
      (g.legends||[]).map(r=>`<tr><td>${esc(r[0])}</td><td>${esc(r[1])}</td></tr>`).join('')+
    `</tbody></table>`) : `<div class="small muted">No legends.</div>`;

    const manualHtml = (g.manual||[]).length ? (`<div class="gmanual" style="margin-top:8px">`+(g.manual||[]).map((m,i)=>{
      return `
        <div class="card pad" style="margin:10px 0">
          <div class="small muted">MANUAL</div>
          <div class="h3" style="margin:6px 0">${esc(m.title||('Manual '+(i+1)))}</div>
          <div class="small muted" style="margin-bottom:10px">${esc(m.caption||'')}</div>
          <div class="gimg-wrap">${m.svg||''}</div>
        </div>
      `;
    }).join('')+`</div>`) : `<div class="small muted">No manual images available for this page yet.</div>`;

    bd.innerHTML = `
      <div>
        <div class="h2" style="margin:0 0 8px">Guide</div>
        ${guideHtml}

        <div class="h2" style="margin:18px 0 8px">Notes</div>
        ${notesHtml}

        <div class="h2" style="margin:18px 0 8px">Legends</div>
        ${legendsHtml}

        <div class="h2" style="margin:18px 0 8px">Manual</div>
        ${manualHtml}
      </div>
    `;
  }

  function updateAnnouncementBar(){
    const bar = UI.el('#announceBar');
    const active = UI.activeAnnouncements();
    if(!active.length){
      bar.style.visibility='hidden';
      bar.dataset.count='0';
      bar.dataset.idx='0';
      return;
    }
    bar.style.visibility='visible';
    const count = active.length;
    const idx = Number(bar.dataset.idx||0) % count;
    const a = active[idx];

    bar.dataset.count = String(count);
    bar.dataset.idx = String(idx);

    const details = String(a.short||a.title||'').replace(/\s+/g,' ').trim();
    const who = a.createdByName || '—';

    // Broadcast time: use startAt (when it becomes active), fall back to createdAt.
    const tms = a.startAt || a.createdAt;
    let when = '—';
    if(tms){
      const ts = new Date(tms);
      const p = UI.manilaParts(ts);
      const pad = n => String(n).padStart(2,'0');
      when = `${p.isoDate} ${pad(p.hh)}:${pad(p.mm)}`;
    }

    // Announcement format: Announcement: 'Message' - [User] | (DATE)
    const msgTitle = String(a.title||'').trim();
    const msgDetails = details && details!==msgTitle ? ` — ${details}` : '';
    UI.el('#announceTitle').textContent = `Announcement:`;
    UI.el('#announceMsg').textContent = `'${msgTitle}${msgDetails}' - ${who}`;
    const meta = UI.el('#announceMeta');
    if(meta) meta.textContent = when ? `| ${when}` : '';
bar.onclick = ()=>{
      UI.el('#annModalTitle').textContent = a.title;
      // Rich text support (stored HTML). If not available, fall back to escaped text.
      const body = UI.el('#annModalBody');
      if(a.fullHtml){ body.innerHTML = a.fullHtml; }
      else { body.textContent = a.full || a.short; }
      UI.openModal('topAnnModal');
    };
  }

  function startAnnouncementRotation(){
    // Start once and keep running across page navigation.
    // Page routing must NOT reset the rotation index or restart the interval,
    // otherwise announcements appear to "change" when switching menu pages.
    if(annTimer) return;
    updateAnnouncementBar();
    annTimer = setInterval(()=>{
      try{
      const bar = UI.el('#announceBar');
      const count = Number(bar.dataset.count||0);
      if(count<=1){ updateAnnouncementBar(); return; }
      bar.dataset.idx = String((Number(bar.dataset.idx||0)+1)%count);
      updateAnnouncementBar();
    
      }catch(e){ console.error('Announcement interval error', e); }
    }, 3000);
  }

  function route(){
    try{
      const user = Auth.getUser();
      if(!user) return;
      renderUserCard(user);
      renderSideLogs(user);

      const hash = (window.location.hash || '#dashboard').replace('#','');
      const pageId = (window.Pages && window.Pages[hash]) ? hash : 'dashboard';
      try{
        const m = (Config && Config.menu) ? Config.menu.find(x=>x.id===pageId) : null;
        window._currentPageLabel = m ? (m.label||pageId) : pageId;
      }catch(e){ window._currentPageLabel = pageId; }

      // Update the right sidebar Summary guide based on the currently selected menu page.
      renderSummaryGuide(pageId, window._currentPageLabel);
      setActiveNav(pageId);

      const main = UI.el('#main');
      if(cleanup){ try{ cleanup(); }catch(e){} cleanup=null; }
      main.innerHTML = '';

      try{
        window.Pages[pageId](main);
      }catch(pageErr){
        showFatalError(pageErr);
      }
      if(main._cleanup){ cleanup = main._cleanup; main._cleanup = null; }

      // Do not restart announcements on route changes.
      // Just refresh the content in case announcements changed.
      updateAnnouncementBar();
    }catch(e){
      showFatalError(e);
    }
  }

  function boot(){
    // Prevent double-boot (inline boot + auto-boot safety).
    if(window.__mumsBooted) return;
    window.__mumsBooted = true;
    // Global safety net: don't allow a blank screen.
    window.addEventListener('error', (e)=>{ showFatalError(e.error || e.message || e); });
    window.addEventListener('unhandledrejection', (e)=>{ showFatalError(e.reason || e); });

    // ensure initial super user exists
    Store.ensureSeed();

    // Apply saved theme ASAP (before heavy rendering)
    applyTheme(Store.getTheme());

    const user = Auth.requireUser();
    if(!user) return;

    // Normalize user fields so routing/nav don't fail if older user records are missing data
    // OR if role values were stored in a non-canonical format (e.g., "Team Lead", "TEAM LEAD", "team_lead ").
    function normalizeRole(v){
      const raw = String(v||'').trim();
      if(!raw) return (Config?.ROLES?.MEMBER) || 'MEMBER';
      const up = raw.toUpperCase().replace(/\s+/g,'_');
      const map = {
        'TEAMLEAD':'TEAM_LEAD',
        'TEAM-LEAD':'TEAM_LEAD',
        'TEAM_LEAD':'TEAM_LEAD',
        'LEAD':'TEAM_LEAD',
        'TL':'TEAM_LEAD',
        'SUPERADMIN':'SUPER_ADMIN',
        'SUPER-ADMIN':'SUPER_ADMIN',
        'SUPER_ADMIN':'SUPER_ADMIN',
        'ADMIN':'ADMIN',
        'MEMBER':'MEMBER'
      };
      const norm = map[up] || up;
      // If unknown, fall back to MEMBER.
      return (Config && Config.PERMS && Config.PERMS[norm]) ? norm : ((Config?.ROLES?.MEMBER) || 'MEMBER');
    }

    const fixedRole = normalizeRole(user.role);
    if(fixedRole !== user.role){
      user.role = fixedRole;
      try{ Store.updateUser(user.id, { role: fixedRole }); }catch(e){}
    }

    if(!user.teamId || !(Config?.TEAMS||[]).some(t=>t.id===user.teamId)){
      user.teamId = (Config?.TEAMS?.[0]?.id) || 'morning';
      try{ Store.updateUser(user.id, { teamId: user.teamId }); }catch(e){}
    }

    UI.el('#logoutBtn').onclick = ()=>{ Auth.logout(); window.location.href='./login.html'; };

    // Release Notes (new icon before Dictionary)
    const rnBtn = document.getElementById('releaseNotesBtn');
    if(rnBtn){
      rnBtn.onclick = ()=>{
        try{ UI.bindReleaseNotesModal && UI.bindReleaseNotesModal(user); }catch(e){ console.error(e); }
        UI.openModal('releaseNotesModal');
      };
    }

    // Dictionary (book icon before Settings)
    const dictBtn = document.getElementById('dictionaryBtn');
    if(dictBtn){
      dictBtn.onclick = ()=>{
        try{ UI.bindDictionaryModal && UI.bindDictionaryModal(user); }catch(e){ console.error(e); }
        UI.openModal('dictionaryModal');
      };
    }

    // Settings hub (gear icon before Logout)
    const settingsBtn = document.getElementById('settingsBtn');
    if(settingsBtn){
      settingsBtn.onclick = ()=>{
        UI.openModal('settingsModal');
      };
    }
    const openSoundBtn = document.getElementById('openSoundBtn');
    if(openSoundBtn){
      openSoundBtn.onclick = ()=>{
        UI.closeModal('settingsModal');
        try{ UI.bindSoundSettingsModal && UI.bindSoundSettingsModal(user); }catch(e){}
        UI.openModal('soundSettingsModal');
      };
    }
    const openProfileBtn = document.getElementById('openProfileBtn');
    if(openProfileBtn){
      openProfileBtn.onclick = ()=>{
        UI.closeModal('settingsModal');
        openProfileModal(Auth.getUser()||user);
      };
    }

    // Theme settings
    const openThemeBtn = document.getElementById('openThemeBtn');
    if(openThemeBtn){
      openThemeBtn.onclick = ()=>{
        UI.closeModal('settingsModal');
        renderThemeGrid();
        UI.openModal('themeModal');
      };
    }

    // Quick links settings
    const openLinksBtn = document.getElementById('openLinksBtn');
    if(openLinksBtn){
      openLinksBtn.onclick = ()=>{
        UI.closeModal('settingsModal');
        renderLinksGrid();
        UI.openModal('linksModal');
      };
    }


    // Mailbox time override (Super Admin only)
    try{
      const isSA = (user.role === (Config && Config.ROLES ? Config.ROLES.SUPER_ADMIN : 'SUPER_ADMIN'));
      const card = document.getElementById('timeOverrideCard');
      if(card) card.style.display = isSA ? '' : 'none';

      const openMailboxTimeBtn = document.getElementById('openMailboxTimeBtn');
      const modal = document.getElementById('mailboxTimeModal');

      function fmtManilaLocal(ms){
        try{
          const p = UI.manilaParts(new Date(ms));
          const pad = (n)=>String(n).padStart(2,'0');
          return `${p.isoDate}T${pad(p.hh)}:${pad(p.mm)}`;
        }catch(_){ return ''; }
      }

      function parseManilaLocal(str){
        const s = String(str||'').trim();
        if(!s) return 0;
        const parts = s.split('T');
        if(parts.length < 2) return 0;
        const d = parts[0];
        const t = parts[1];
        const dp = d.split('-').map(n=>Number(n));
        const tp = t.split(':').map(n=>Number(n));
        if(dp.length < 3 || tp.length < 2) return 0;
        const y = dp[0], m = dp[1], da = dp[2];
        const hh = tp[0], mm = tp[1];
        if(!y || !m || !da && da !== 0) return 0;
        if([y,m,da,hh,mm].some(x=>Number.isNaN(x))) return 0;
        // Manila is UTC+8 year-round
        return Date.UTC(y, m-1, da, hh-8, mm, 0, 0);
      }

      function bindMailboxTimeModal(){
        if(!modal || modal.__bound) return;
        modal.__bound = true;

        const enabledEl = document.getElementById('mbTimeEnabled');
        const freezeEl = document.getElementById('mbTimeFreeze');
        const inputEl = document.getElementById('mbTimeInput');
        const sysEl = document.getElementById('mbTimeSys');
        const effEl = document.getElementById('mbTimeEffective');
        const errEl = document.getElementById('mbTimeErr');
        const clockEl = document.getElementById('mbTimeClock');
        const clockDateEl = document.getElementById('mbTimeClockDate');
        const saveBtn = document.getElementById('mbTimeSave');
        const resetBtn = document.getElementById('mbTimeReset');
        const setNowBtn = document.getElementById('mbTimeSetNow');

        // Draft state while modal is open
        let draft = Store.getMailboxTimeOverride ? Store.getMailboxTimeOverride() : { enabled:false, ms:0, freeze:true, setAt:0 };
        draft = {
          enabled: !!draft.enabled,
          ms: Number(draft.ms)||0,
          freeze: (draft.freeze !== false),
          setAt: Number(draft.setAt)||0,
        };
        if(!draft.ms) draft.ms = Date.now();
        if(!draft.freeze && !draft.setAt) draft.setAt = Date.now();

        function effectiveMs(){
          if(!draft.enabled) return Date.now();
          if(!draft.ms) return Date.now();
          if(draft.freeze) return draft.ms;
          return draft.ms + Math.max(0, Date.now() - (Number(draft.setAt)||Date.now()));
        }

        function render(){
          try{ if(errEl) errEl.textContent=''; }catch(_){ }
          const sys = UI.manilaNow();
          if(sysEl){
            sysEl.textContent = `System Manila time: ${sys.iso.replace('T',' ')}`;
          }
          if(enabledEl) enabledEl.checked = !!draft.enabled;
          if(freezeEl) freezeEl.checked = !!draft.freeze;
          if(inputEl) inputEl.value = fmtManilaLocal(draft.ms);

          const on = !!draft.enabled;
          if(effEl){
            if(!on) effEl.textContent = 'Override OFF — Mailbox uses system Manila time.';
            else effEl.textContent = draft.freeze ? 'Override ON — Frozen clock (testing mode).' : 'Override ON — Running clock (testing mode).';
          }

          const ms = effectiveMs();
          const p = UI.manilaParts(new Date(ms));
          const pad = (n)=>String(n).padStart(2,'0');
          if(clockEl) clockEl.textContent = `${pad(p.hh)}:${pad(p.mm)}:${pad(p.ss)}`;
          if(clockDateEl) clockDateEl.textContent = `${p.isoDate} (Asia/Manila)`;
        }

        function startClock(){
          try{ if(modal.__clockInt) clearInterval(modal.__clockInt); }catch(_){ }
          modal.__clockInt = setInterval(()=>{ try{ render(); }catch(e){ } }, 1000);
        }

        function stopClock(){
          try{ if(modal.__clockInt) clearInterval(modal.__clockInt); }catch(_){ }
          modal.__clockInt = null;
        }

        function open(){
          // Refresh draft from store each open
          let o = Store.getMailboxTimeOverride ? Store.getMailboxTimeOverride() : { enabled:false, ms:0, freeze:true, setAt:0 };
          draft = {
            enabled: !!o.enabled,
            ms: Number(o.ms)||0,
            freeze: (o.freeze !== false),
            setAt: Number(o.setAt)||0,
          };
          if(!draft.ms) draft.ms = Date.now();
          if(!draft.freeze && !draft.setAt) draft.setAt = Date.now();
          render();
          startClock();
        }

        // Expose to opener
        modal.__open = open;

        // Event bindings
        if(enabledEl){
          enabledEl.onchange = ()=>{
            draft.enabled = !!enabledEl.checked;
            if(draft.enabled && !draft.ms) draft.ms = Date.now();
            if(draft.enabled && !draft.freeze) draft.setAt = Date.now();
            render();
          };
        }
        if(freezeEl){
          freezeEl.onchange = ()=>{
            draft.freeze = !!freezeEl.checked;
            if(!draft.freeze) draft.setAt = Date.now();
            else draft.setAt = 0;
            render();
          };
        }
        if(inputEl){
          inputEl.onchange = ()=>{
            const ms = parseManilaLocal(inputEl.value);
            if(ms){
              draft.ms = ms;
              if(draft.enabled && !draft.freeze) draft.setAt = Date.now();
            }
            render();
          };
        }

        if(setNowBtn){
          setNowBtn.onclick = ()=>{
            draft.ms = Date.now();
            if(draft.enabled && !draft.freeze) draft.setAt = Date.now();
            render();
          };
        }

        // Quick shift buttons
        modal.querySelectorAll('[data-mbshift]').forEach(btn=>{
          btn.onclick = ()=>{
            const delta = Number(btn.getAttribute('data-mbshift')||0);
            draft.ms = Number(draft.ms)||Date.now();
            draft.ms += delta;
            if(draft.enabled && !draft.freeze) draft.setAt = Date.now();
            render();
          };
        });

        if(saveBtn){
          saveBtn.onclick = ()=>{
            try{ if(errEl) errEl.textContent=''; }catch(_){ }
            if(!draft.enabled){
              Store.saveMailboxTimeOverride({ enabled:false, ms:0, freeze:true, setAt:0 });
              render();
              return;
            }
            if(!draft.ms){
              if(errEl) errEl.textContent = 'Please select a valid Manila date & time.';
              return;
            }
            const payload = { enabled:true, ms: Number(draft.ms)||0, freeze: !!draft.freeze };
            if(!draft.freeze) payload.setAt = Number(draft.setAt)||Date.now();
            Store.saveMailboxTimeOverride(payload);
            render();
          };
        }

        if(resetBtn){
          resetBtn.onclick = ()=>{
            Store.saveMailboxTimeOverride({ enabled:false, ms:0, freeze:true, setAt:0 });
            draft = Store.getMailboxTimeOverride();
            if(!draft.ms) draft.ms = Date.now();
            render();
          };
        }

        // Close handling should stop the interval
        UI.els('[data-close="mailboxTimeModal"]').forEach(b=>b.onclick=()=>{ stopClock(); UI.closeModal('mailboxTimeModal'); });

      }

      if(isSA && openMailboxTimeBtn){
        bindMailboxTimeModal();
        openMailboxTimeBtn.onclick = ()=>{
          UI.closeModal('settingsModal');
          try{ if(modal && typeof modal.__open === 'function') modal.__open(); }catch(_){ }
          UI.openModal('mailboxTimeModal');
        };
      }

    }catch(e){ console.error('Mailbox time override init error', e); }


    // World clocks settings
    const openClocksBtn = document.getElementById('openClocksBtn');
    if(openClocksBtn){
      openClocksBtn.onclick = ()=>{
        UI.closeModal('settingsModal');
        renderClocksGrid();
        UI.openModal('clocksModal');
        try{ renderClocksPreviewStrip(); }catch(e){}
      };
    }
    // Ensure close handlers exist
    UI.els('[data-close="settingsModal"]').forEach(b=>b.onclick=()=>UI.closeModal('settingsModal'));
    UI.els('[data-close="soundSettingsModal"]').forEach(b=>b.onclick=()=>UI.closeModal('soundSettingsModal'));
    UI.els('[data-close="dictionaryModal"]').forEach(b=>b.onclick=()=>UI.closeModal('dictionaryModal'));
    UI.els('[data-close="profileModal"]').forEach(b=>b.onclick=()=>UI.closeModal('profileModal'));
    UI.els('[data-close="themeModal"]').forEach(b=>b.onclick=()=>UI.closeModal('themeModal'));
    UI.els('[data-close="linksModal"]').forEach(b=>b.onclick=()=>UI.closeModal('linksModal'));
    // World clocks: close should also flush any pending edits so users don't need to refresh.
    UI.els('[data-close="clocksModal"]').forEach(b=>b.onclick=()=>{
      try{
        const grid = document.getElementById('clocksGrid');
        if(grid && typeof grid.__commitClocks === 'function') grid.__commitClocks();
      }catch(_){ }
      UI.closeModal('clocksModal');
      try{ refreshWorldClocksNow(); }catch(_){ }
    });
    UI.els('[data-close="guideImgModal"]').forEach(b=>b.onclick=()=>UI.closeModal('guideImgModal'));

    // Save clocks
    const clocksSave = document.getElementById('clocksSave');
    if(clocksSave){
      clocksSave.onclick = ()=>{
        const grid = document.getElementById('clocksGrid');
        if(!grid) return;
        const next = Store.getWorldClocks();
        grid.querySelectorAll('.clock-card').forEach(card=>{
          const i = Number(card.dataset.idx||0);
          if(!next[i]) next[i] = {};
          const q = (sel)=>card.querySelector(sel);
          const alarmOn = !!q('.clk-alarmEnabled')?.checked;
          const alarmInput = q('.clk-alarm');
          next[i] = {
            enabled: !!q('.clk-enabled')?.checked,
            label: String(q('.clk-label')?.value||'').trim(),
            timeZone: String(q('.clk-tz')?.value||'Asia/Manila'),
            hoursColor: String(q('.clk-hc')?.value||'#EAF3FF'),
            minutesColor: String(q('.clk-mc')?.value||'#9BD1FF'),
            style: String(q('.clk-style')?.value||'classic'),
            alarmEnabled: alarmOn,
            alarmTime: alarmOn ? String(alarmInput?.value||'').trim() : '',
          };
        });
        try{ if(Store && Store.dispatch) Store.dispatch('UPDATE_CLOCKS', next); else Store.saveWorldClocks(next); }catch(_){ try{ Store.saveWorldClocks(next); }catch(__){} }
        refreshWorldClocksNow();
        UI.closeModal('clocksModal');
      };
    }


    // Render critical UI FIRST (nav + first page). Optional features are initialized later.
    try{ renderNav(user); }catch(e){ showFatalError(e); return; }
    try{ renderUserCard(user); }catch(e){ /* don't block app */ console.error(e); }
    try{ renderSideLogs(user); }catch(e){ /* don't block app */ console.error(e); }
    try{ renderRightNow(); }catch(e){ /* don't block app */ console.error(e); }

    // Ensure routing runs even if optional widgets fail.
    window.addEventListener('hashchange', route);
    if(!window.location.hash) window.location.hash = '#dashboard';
    try{ route(); }catch(e){ showFatalError(e); return; }

    // Optional UI (quick links, announcements, notifications, guide) — never block routing.
    try{ renderQuickLinksBar(); renderWorldClocksBar(); }catch(e){ console.error(e); }

    // Centralized UI refresh triggers (no manual refresh needed)
    window.Renderers = window.Renderers || {};
    // World clocks
    window.Renderers.renderClocks = ()=>{ try{ renderWorldClocksBar(); }catch(_){ } try{ renderClocksPreviewStrip(); }catch(_){ } };
    // Sidebar activity logs
    window.Renderers.renderSidebarLogs = ()=>{
      try{
        const u = (window.Auth && Auth.getUser) ? Auth.getUser() : user;
        if(window.Components && Components.SidebarLogs) Components.SidebarLogs.render(u);
        else renderSideLogs(u);
      }catch(_){ }
    };
    // Coverage meter (only re-renders if component exists)
    window.Renderers.renderCoverageMeter = ()=>{ try{ if(window.Components && Components.CoverageMeter) Components.CoverageMeter.refresh(); }catch(_){ } };

    // Subscribe to reducer-style store updates so Settings changes always repaint UI instantly.
    try{
      if(Store && Store.subscribe && !window.__mumsStoreSub){
        window.__mumsStoreSub = Store.subscribe((action)=>{
          const a = String(action||'');
          if(a === 'UPDATE_THEME' || a === 'UPDATE_CLOCKS' || a === 'UPDATE_QUICKLINKS'){
            try{ window.Renderers.renderClocks && window.Renderers.renderClocks(); }catch(_){ }
            try{ window.Renderers.renderCoverageMeter && window.Renderers.renderCoverageMeter(); }catch(_){ }
            try{ window.Renderers.renderSidebarLogs && window.Renderers.renderSidebarLogs(); }catch(_){ }
          }
        });
      }
    }catch(e){ console.error(e); }
    try{
      if(!window.__mumsClockTimer){
        window.__mumsClockTimer = setInterval(()=>{
          try{ renderWorldClocksBar(); }catch(_){}
          try{ renderClocksPreviewStrip(); }catch(_){}
          try{ checkWorldClockAlarms(); }catch(_){}
        }, 1000);
      }
    }catch(e){ console.error(e); }
    // (Removed duplicate interval) __mumsClockTimer already refreshes clocks + alarms.
    try{ startAnnouncementRotation(); }catch(e){ console.error(e); }

    // Keep theme and quick links in sync within the same tab
    window.addEventListener('mums:theme', (e)=>{
      try{ applyTheme((e && e.detail && e.detail.id) || Store.getTheme()); }catch(_){}
    });
    window.addEventListener('mums:store', (e)=>{
      const key = e && e.detail && e.detail.key;
      if(key === 'mums_quicklinks' || key === 'mums_worldclocks'){
        try{ renderQuickLinksBar(); }catch(_){ }
        try{ refreshWorldClocksNow(); }catch(_){ }
      }
      if(key === 'mums_worldclocks'){
        try{ refreshWorldClocksNow(); }catch(_){ }
      }

      // Auto-refresh triggers (covers non-dispatch Store writes too)
      if(key === 'ums_activity_logs'){
        try{ window.Renderers && Renderers.renderSidebarLogs && Renderers.renderSidebarLogs(); }catch(_){ }
      }
      if(key === 'ums_auto_schedule_settings' || key === 'ums_member_leaves' || key === 'ums_schedule_locks'){
        try{ window.Renderers && Renderers.renderCoverageMeter && Renderers.renderCoverageMeter(); }catch(_){ }
      }
    });

    // Right sidebar tabs
    (function bindRightTabs(){
      const tabs = UI.els('.rtab');
      if(!tabs.length) return;
      const panels = {
        summary: UI.el('#rtab-summary'),
        cases: UI.el('#rtab-cases'),
        mylink: UI.el('#rtab-mylink')
      };
      function activate(key){
        tabs.forEach(t=>{
          const on = t.dataset.rtab===key;
          t.classList.toggle('active', on);
          t.setAttribute('aria-selected', on? 'true':'false');
        });
        Object.entries(panels).forEach(([k,p])=>{
          if(!p) return;
          p.classList.toggle('active', k===key);
        });
      }
      tabs.forEach(t=>t.onclick = ()=>activate(t.dataset.rtab));
      // default
      activate(tabs.find(t=>t.classList.contains('active'))?.dataset.rtab || 'summary');
    })();

    // Summary Guide UI (enable/disable + tabs + search + ask)
    (function bindGuideUI(){
      const toggle = UI.el('#guideEnabledToggle');
      if(toggle){
        toggle.checked = localStorage.getItem('mums_guide_enabled') !== '0';
        toggle.onchange = ()=>{
          localStorage.setItem('mums_guide_enabled', toggle.checked ? '1' : '0');
          try{ route(); }catch(e){
            // fallback: rerender current guide
            const hash = (window.location.hash||'#dashboard').replace('#','');
            const pageId = (window.Pages && window.Pages[hash]) ? hash : 'dashboard';
            renderSummaryGuide(pageId, window._currentPageLabel);
          }
        };
      }

      // Tabs inside Summary
      UI.els('.gtab').forEach(b=>{
        b.onclick = ()=>{
          const k = b.dataset.gtab || 'guide';
          localStorage.setItem('mums_guide_tab', k);
          const hash = (window.location.hash||'#dashboard').replace('#','');
          const pageId = (window.Pages && window.Pages[hash]) ? hash : 'dashboard';
          renderSummaryGuide(pageId, window._currentPageLabel);
        };
      });

      // Search (debounced)
      const search = UI.el('#guideSearch');
      let t=null;
      if(search){
        search.oninput = ()=>{
          if(t) clearTimeout(t);
          t=setTimeout(()=>{
            const hash = (window.location.hash||'#dashboard').replace('#','');
            const pageId = (window.Pages && window.Pages[hash]) ? hash : 'dashboard';
            renderSummaryGuide(pageId, window._currentPageLabel);
          }, 120);
        };
      }

      // Ask a question
      const ask = UI.el('#guideAsk');
      const askBtn = UI.el('#guideAskBtn');
      function submitAsk(){
        const text = (ask && ask.value) ? String(ask.value).trim() : '';
        if(!text) return;
        const hash = (window.location.hash||'#dashboard').replace('#','');
        const pageId = (window.Pages && window.Pages[hash]) ? hash : 'dashboard';

        // Offline AI-like answer (no internet): search across all guides,
        // but strongly prioritize the current page.
        let ans = null;
        try{ ans = answerGuideQuestion(text, pageId); }catch(e){ ans = {best:null, related:[], note:'No answer.'}; }
        try{
          localStorage.setItem('mums_ai_last_'+pageId, JSON.stringify({ q:text, ans:ans, ts:Date.now() }));
        }catch(e){}

        // Save question history per page
        const qKey = `mums_guide_questions_${pageId}`;
        let arr=[];
        try{ arr = JSON.parse(localStorage.getItem(qKey) || '[]') || []; }catch(e){ arr=[]; }
        arr.push(text);
        localStorage.setItem(qKey, JSON.stringify(arr.slice(-50)));

        localStorage.setItem('mums_guide_tab','guide');
        if(ask) ask.value='';
        renderSummaryGuide(pageId, window._currentPageLabel);
      }
      if(askBtn) askBtn.onclick = submitAsk;
      if(ask){
        ask.addEventListener('keydown', (e)=>{
          if(e.key==='Enter'){ e.preventDefault(); submitAsk(); }
        });
      }

      // Open full manual modal (Guide + Notes + Legends + Manual)
      const fullBtn = UI.el('#guideOpenFullManual');
      if(fullBtn){
        fullBtn.onclick = ()=>{
          const hash = (window.location.hash||'#dashboard').replace('#','');
          const pageId = (window.Pages && window.Pages[hash]) ? hash : 'dashboard';
          try{
            openFullManualForPage(pageId, window._currentPageLabel);
          }catch(err){
            try{ console.error(err); }catch(_){ }
            try{ UI.toast('Full manual failed to open. Please reload and try again.', 'error'); }catch(_){ alert('Full manual failed to open.'); }
          }
        };
      }

      // Robust fallback: if the Summary header is ever re-rendered or the button
      // gets replaced, ensure the click still works (prevents "button not working").
      if(!window.__mumsFullManualDelegated){
        window.__mumsFullManualDelegated = true;
        document.addEventListener('click', (e)=>{
          const btn = e.target && e.target.closest ? e.target.closest('#guideOpenFullManual') : null;
          if(!btn) return;
          try{
            const hash = (window.location.hash||'#dashboard').replace('#','');
            const pageId = (window.Pages && window.Pages[hash]) ? hash : 'dashboard';
            try{
              openFullManualForPage(pageId, window._currentPageLabel);
            }catch(err){
              try{ console.error(err); }catch(_){ }
              try{ UI.toast('Full manual failed to open. Please reload and try again.', 'error'); }catch(_){ alert('Full manual failed to open.'); }
            }
          }catch(err){ try{ console.error(err); }catch(_){} }
        });
      }
    })();

    // Real-time schedule update popups (members + leads)
    try{ if(notifCleanup) notifCleanup(); }catch(e){}
    try{ notifCleanup = UI.startScheduleNotifListener(user); }catch(e){ console.error(e); }

    UI.els('[data-close="topAnnModal"]').forEach(b=>b.onclick=()=>UI.closeModal('topAnnModal'));

    // Removed live right-sidebar clock (no date/time requested).
    setInterval(()=>{ try{ renderSideLogs(Auth.getUser()||user); }catch(e){} }, 5000);
    // Keep "Duty" fresh as schedules/time change (Manila time).
    setInterval(()=>{ try{ renderUserCard(Auth.getUser()||user); }catch(e){} }, 60000);

    // React immediately to in-app Store writes (weekly schedules / leaves / profile changes)
    window.addEventListener('mums:store', ()=>{
      try{ renderUserCard(Auth.getUser()||user); }catch(e){}
    });

    // hashchange handler already bound above.
  }

  window.App = { boot };
  // Auto-boot safety: some hosting setups or cached bundles may skip the inline boot call.
  // This ensures the app initializes once the DOM is ready.
  (function(){
    let started = false;
    function start(){
      if(started) return;
      started = true;
      try{ window.App && window.App.boot && window.App.boot(); }catch(e){ try{ console.error(e); }catch(_){} }
    }
    if(document.readyState === 'loading'){
      document.addEventListener('DOMContentLoaded', start);
    }else{
      setTimeout(start, 0);
    }
  })();
})();
