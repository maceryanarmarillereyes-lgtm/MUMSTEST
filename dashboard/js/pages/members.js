(window.Pages = window.Pages || {});

window.Pages.members = function(root){
  const me = Auth.requireUser();
  if(!me) return;

  if(!Config.can(me, 'view_members')){
    root.innerHTML = '<div class="h1">Members</div><div class="muted">You do not have access to this page.</div>';
    return;
  }

  const isSuper = me.role === Config.ROLES.SUPER_ADMIN;
  const isAdmin = isSuper || me.role === Config.ROLES.ADMIN;
  const isLead = me.role === Config.ROLES.TEAM_LEAD;

  // Scheduling grid: STRICT 1-hour blocks (no minutes on the grid)
  // Every assignable unit is 60 minutes.
  const GRID_STEP_MIN = 60;

  // Team filter
  let selectedTeamId = isLead ? me.teamId : (Config.TEAMS[0] && Config.TEAMS[0].id);

  // Day tabs (Sun..Sat)
  function getManilaDayIndex(){
    // Use Manila calendar date -> weekday (timezone-safe)
    const wd = UI.weekdayFromISO(UI.manilaTodayISO());
    return (wd==null) ? 0 : wd;
  }

  let selectedDay = getManilaDayIndex();

  // Week scope selector (Manila week starting Monday)
  // Manila week starting Monday, derived from Manila *calendar* date
  const _todayISO = UI.manilaTodayISO();
  const _todayWD = UI.weekdayFromISO(_todayISO);
  const _deltaToMon = (_todayWD===0) ? -6 : (1 - _todayWD); // Sun->Mon = -6
  const defaultWeekStartISO = UI.addDaysISO(_todayISO, _deltaToMon);
  let weekStartISO = localStorage.getItem('ums_week_start_iso') || defaultWeekStartISO;

  function normalizeToMonday(iso){
    // Snap selected ISO date to Monday of that week using calendar math (timezone-safe)
    const wd = UI.weekdayFromISO(String(iso||defaultWeekStartISO));
    if(wd==null) return defaultWeekStartISO;
    const delta = (wd===0) ? -6 : (1 - wd);
    return UI.addDaysISO(String(iso||defaultWeekStartISO), delta);
  }
  weekStartISO = normalizeToMonday(weekStartISO);

  function isoForDay(dayIndex){
    // weekStartISO is Monday (dayIndex 1). Sunday is -1 day.
    const offset = Number(dayIndex) - 1;
    return UI.addDaysISO(weekStartISO, offset);
  }

  function isRestDay(teamId, userId, isoDate){
    const t = Store.getTeamMaster ? Store.getTeamMaster(teamId) : null;
    const m = t && t.members ? t.members[userId] : null;
    if(!m || !Array.isArray(m.restWeekdays) || !m.restWeekdays.length) return false;
    // Weekday derived from the *calendar date* (timezone-safe)
    const wd = UI.weekdayFromISO(isoDate);
    if(wd==null) return false;
    return m.restWeekdays.includes(wd);
  }

  function getTeamLock(teamId){
    return (Store.getLock ? Store.getLock(teamId, weekStartISO) : null);
  }
  function isDayLocked(teamId, dayIndex){
    const lock = getTeamLock(teamId);
    return !!(lock && lock.lockedDays && lock.lockedDays[String(dayIndex)]);
  }

  function dayHasAnyBlocks(teamId, dayIndex){
    const members = getMembersForView(teamId);
    return members.some(m => (Store.getUserDayBlocks(m.id, dayIndex) || []).length > 0);
  }

  function renderDayTabs(){
    const tabs = wrap.querySelector('#dayTabs');
    if(!tabs) return;
    const teamId = selectedTeamId;
    const lock = getTeamLock(teamId);
    const lockedMonFri = !!(lock && lock.lockedDays && [1,2,3,4,5].some(d=>lock.lockedDays[String(d)]));
    tabs.innerHTML = UI.DAYS.map((d,i)=>{
      const active = i===selectedDay ? 'active' : '';
      const has = dayHasAnyBlocks(teamId, i);
      const locked = isDayLocked(teamId, i);
      const dot = has ? '<span class="dot"></span>' : '';
      const lk = locked ? '<span class="lock">🔒</span>' : '';
      return `<button class="daytab ${active}" data-day="${i}" type="button">${UI.esc(d.slice(0,3))}${dot}${lk}</button>`;
    }).join('');
    tabs.querySelectorAll('button.daytab').forEach(b=>{
      b.onclick = ()=>{
        selectedDay = Number(b.dataset.day);
        triggerSwap();
        renderDayTabs();
        renderAll();
      };
    });

    const badge = wrap.querySelector('#lockBadge');
    const unlockBtn = wrap.querySelector('#unlockSchedule');
    const autoBtn = wrap.querySelector('#autoSchedule');
    const previewBtn = wrap.querySelector('#previewAuto');
    const autoSettingsBtn = wrap.querySelector('#autoSettings');
    if(badge) badge.style.display = lockedMonFri ? '' : 'none';
    const canUnlock = lockedMonFri && (isLead || isAdmin || isSuper);
    if(unlockBtn) unlockBtn.style.display = canUnlock ? '' : 'none';
    // When locked, prevent accidental re-apply until unlocked
    const lockDisable = !!lockedMonFri;
    if(autoBtn) autoBtn.disabled = lockDisable;
    if(previewBtn) previewBtn.disabled = lockDisable;
    if(autoSettingsBtn) autoSettingsBtn.disabled = lockDisable;

    renderWeekWarning();
  }

  // 12-hour clock label (for ruler)
  function to12h(hm){
    const mins = UI.parseHM(hm);
    const hh = Math.floor(mins/60) % 24;
    const mm = mins % 60;
    const ap = hh >= 12 ? 'PM' : 'AM';
    const h12 = ((hh + 11) % 12) + 1;
    return `${h12}:${String(mm).padStart(2,'0')} ${ap}`;
  }

  // Multi-select state (current day only)
  let selMemberId = null;
  let selMemberIds = new Set(); // selected members (for bulk actions)
  let selIdx = new Set(); // indices for selMemberId

  // Clipboard feature removed (copy/paste disabled)
  let lastCursor = null; // { memberId, offsetMin }

  function clearSelection(){
    selMemberId = null;
    selMemberIds = new Set();
    selIdx = new Set();
    updateSelectionUI();
    applySelectionStyles();
    applyMemberRowSelectionStyles();
  }

  function updateSelectionUI(){
    const badge = wrap.querySelector('#selBadge');
    const clr = wrap.querySelector('#selClear');
    const desel = wrap.querySelector('#selDeselect');
    const count = selIdx.size;
    if(badge) badge.textContent = `${count} selected`;
    // Clear All should work even if no blocks are selected, as long as a member is selected.
    const canClear = (selMemberIds && selMemberIds.size) ? true : !!selMemberId;
    const canDeleteSelected = !!selMemberId && count>0;
    if(clr) clr.disabled = !canClear;
    if(desel) desel.disabled = !canDeleteSelected;
  }

  function applySelectionStyles(){
    wrap.querySelectorAll('.timeline .seg').forEach(seg=>seg.classList.remove('selected'));
    if(!selMemberId || selIdx.size===0) return;
    const row = wrap.querySelector(`.members-row[data-id="${CSS.escape(selMemberId)}"]`);
    if(!row) return;
    selIdx.forEach(i=>{
      const seg = row.querySelector(`.seg[data-idx="${i}"]`);
      if(seg) seg.classList.add('selected');
    });
  }

  function applyMemberRowSelectionStyles(){
    // Highlight selected member rows (bulk actions)
    const rows = wrap.querySelectorAll('.members-row');
    rows.forEach(r=>{
      const id = r.dataset.id;
      const on = (selMemberIds && selMemberIds.has(id)) || (!!selMemberId && selMemberId===id);
      r.classList.toggle('m-selected', !!on);
      const cb = r.querySelector('input.m-select');
      if(cb) cb.checked = !!(selMemberIds && selMemberIds.has(id));
    });
  }

  const wrap = document.createElement('div');
  wrap.className = 'grid';
  wrap.style.gap = '14px';

  wrap.innerHTML = `
    <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-wrap:wrap">
      <div>
        <div class="h1">Members</div>
        <div class="muted">Plan coverage by assigning time blocks (Sun–Sat). Timeline view shows the whole team shift.</div>
      </div>
      <div class="row" style="gap:10px;align-items:center">
        ${isLead ? '' : `
        <label class="small" style="display:flex;gap:8px;align-items:center">
          Team
          <select class="input" id="teamSelect" style="min-width:180px">
            ${Config.TEAMS.map(t=>`<option value="${t.id}">${UI.esc(t.label)}</option>`).join('')}
          </select>
        </label>
        `}
        <div class="weekctl">
          <div class="small" style="display:flex;gap:8px;align-items:center">
            <span>Week of (Mon)</span>
            <button class="iconbtn" id="weekHelp" type="button" aria-label="Week selector help" title="What does this do?">ⓘ</button>
            <input class="input" id="weekSelect" type="date" value="${UI.esc(weekStartISO)}" style="min-width:160px" />
            <button class="btn" id="jumpToday" type="button" title="Jump to Manila Today / This Week">📅 Today</button>
          </div>
          <div id="weekWarn" class="week-warn" style="display:none"></div>
        </div>
      </div>
    </div>

    <div class="daytabs" id="dayTabs"></div>

    <div class="card sched-swap" id="schedulePane" style="padding:12px">
      <div class="timeline-legend">
        <span class="legend-item"><span class="legend-dot role-mailbox_manager"></span>Mailbox Manager</span>
        <span class="legend-item"><span class="legend-dot role-call_onqueue"></span>Call Available</span>
        <span class="legend-item"><span class="legend-dot role-back_office"></span>Back Office</span>
        <span class="legend-item"><span class="legend-dot role-mailbox_call"></span>Mailbox + Call</span>
        <span class="legend-item"><span class="legend-dot role-lunch"></span>Lunch</span>
        <span class="legend-item"><span class="legend-dot role-block"></span>Block</span>
      </div>

      <div class="sched-toolbar">
        <div class="left">
          <span class="badge" id="selBadge">0 selected</span>
          <span class="small muted">Tip: Assignments are <b>strictly 1-hour blocks</b> (no minutes). Drag empty space to create. Use <b>Paint</b> (click & drag across hours) to fill multiple hours fast. Shift+Click blocks to multi-select. Shift+Drag on empty space to box-select.</span>
        </div>
        <div class="right">
          <div class="paintbar" id="paintBar"></div>
          ${(isLead||isAdmin) ? '<div class="toolgroup"><button class="btn" id="autoSettings" type="button">Auto Settings</button><button class="btn" id="previewAuto" type="button">Preview</button><button class="btn primary" id="autoSchedule" type="button">Apply & Lock</button><span class="lock-badge" id="lockBadge" style="display:none">🔒 Locked</span><button class="btn danger" id="unlockSchedule" type="button" style="display:none">Unlock</button></div>' : ''}
          <div class="toolgroup">
            <button class="btn danger" id="selClear" type="button" disabled title="Clear ALL blocks for this member/day">🧹 Clear All</button>
            <button class="btn ghost" id="selDeselect" type="button" disabled title="Delete selected blocks (or press Delete)">🗑 Delete Selected</button>
          </div>
        </div>
      </div>

      ${(isLead||isAdmin) ? `
      <div class="sched-float-actions" aria-label="Member scheduling actions">
        <div class="iconrow" aria-label="Exports, audit, acknowledgements">
          <button class="iconbtn flat" id="exportSchedule" type="button" title="Export schedule CSV" aria-label="Export schedule CSV">📄</button>
          <button class="iconbtn flat" id="exportWorkload" type="button" title="Export workload CSV" aria-label="Export workload CSV">📊</button>
          <button class="iconbtn flat" id="viewAudit" type="button" title="Audit history for the week" aria-label="Audit history">🕘</button>
          <button class="iconbtn flat" id="viewAcks" type="button" title="Acknowledgements" aria-label="Acknowledgements">✅</button>
          <button class="iconbtn flat" id="viewTrend" type="button" title="Health trend (weekly)" aria-label="Health trend">📈</button>
        </div>
        <button class="btn primary" id="sendSchedule" type="button" title="Notify members about updates and collect acknowledgements">Send</button>
      </div>
      ` : ''}

      <div id="coverageMeter" class="coverage-panel" style="margin-top:10px"></div>

      <div class="timeline-ruler" id="ruler"></div>

      <div class="members-table" id="membersTable"></div>
    </div>

    <div class="modal" id="memberSchedModal">
      <div class="panel">
        <div class="head">
          <div>
            <div class="announce-title" id="msTitle">Schedule</div>
            <div class="small" id="msSub">Edit blocks</div>
          </div>
          <button class="btn ghost" type="button" id="msClose">✕</button>
        </div>
        <div class="body" id="msBody"></div>
      </div>
    </div>

    <div class="modal" id="ackModal">
      <div class="panel">
        <div class="head">
          <div>
            <div class="announce-title" id="ackTitle">Acknowledgements</div>
            <div class="small" id="ackSub">—</div>
          </div>
          <button class="btn ghost" type="button" id="ackClose">✕</button>
        </div>
        <div class="body" id="ackBody"></div>
      </div>
    </div>

    <div class="modal" id="auditModal">
      <div class="panel">
        <div class="head">
          <div>
            <div class="announce-title" id="auditTitle">Audit History</div>
            <div class="small" id="auditSub">—</div>
          </div>
          <button class="btn ghost" type="button" id="auditClose">✕</button>
        </div>
        <div class="body" id="auditBody"></div>
      </div>
    </div>

    <div class="modal" id="trendModal">
      <div class="panel">
        <div class="head">
          <div>
            <div class="announce-title" id="trendTitle">Health Trend</div>
            <div class="small" id="trendSub">—</div>
          </div>
          <button class="btn ghost" type="button" id="trendClose">✕</button>
        </div>
        <div class="body" id="trendBody"></div>
      </div>
    </div>
  `;

  root.replaceChildren(wrap);

  // Smooth transitions when switching weeks/days
  function triggerSwap(){
    const pane = wrap.querySelector('#schedulePane');
    if(!pane) return;
    pane.classList.add('swap-anim');
    window.clearTimeout(triggerSwap._t);
    triggerSwap._t = window.setTimeout(()=>pane.classList.remove('swap-anim'), 240);
  }

  // Week selector tooltip (professional inline popover)
  function showWeekHelp(anchor){
    const existing = document.getElementById('weekHelpPop');
    if(existing) existing.remove();
    const pop = document.createElement('div');
    pop.id = 'weekHelpPop';
    pop.className = 'popover';
    pop.innerHTML = `
      <div class="pop-title">Week Selector</div>
      <div class="small" style="line-height:1.4">
        Controls which <b>week</b> you are viewing, editing, sending, and locking.<br/>
        Rest Days, Leaves, Coverage Meter, and Notifications depend on the selected week.
      </div>
    `;
    document.body.appendChild(pop);
    const r = anchor.getBoundingClientRect();
    const pr = pop.getBoundingClientRect();
    const top = Math.max(12, r.bottom + 8);
    const left = Math.min(window.innerWidth - pr.width - 12, Math.max(12, r.left - 4));
    pop.style.top = top + 'px';
    pop.style.left = left + 'px';
    const onDown = (e)=>{
      if(pop.contains(e.target) || anchor.contains(e.target)) return;
      pop.remove();
      document.removeEventListener('mousedown', onDown);
    };
    document.addEventListener('mousedown', onDown);
  }

  function currentWeekStartISO(){
    const todayISO = UI.manilaTodayISO();
    return normalizeToMonday(todayISO);
  }

  function renderWeekWarning(){
    const warn = wrap.querySelector('#weekWarn');
    if(!warn) return;
    const nowWeek = currentWeekStartISO();
    const lock = getTeamLock(selectedTeamId);
    const lockedMonFri = !!(lock && lock.lockedDays && [1,2,3,4,5].some(d=>lock.lockedDays[String(d)]));
    const isPast = String(weekStartISO) < String(nowWeek);
    const isFuture = String(weekStartISO) > String(nowWeek);

    let html = '';
    let cls = '';
    if(lockedMonFri){
      cls = 'locked';
      html = `🔒 <b>This Week Is Locked</b> — Editing is disabled. Unlock to make changes.`;
    } else if(isPast){
      cls = 'past';
      html = `⚠️ <b>Past Week</b> — You are viewing a previous schedule. Changes here won’t affect current operations.`;
    } else if(isFuture){
      cls = 'future';
      html = `🗓️ <b>Future Week</b> — You are planning ahead.`;
    }

    if(!html){
      warn.style.display = 'none';
      warn.className = 'week-warn';
      return;
    }
    warn.style.display = '';
    warn.className = `week-warn ${cls}`;
    warn.innerHTML = html;
  }

  // Header controls
  const teamSel = wrap.querySelector('#teamSelect');
  if(teamSel){
    teamSel.value = selectedTeamId;
    teamSel.onchange = ()=>{ selectedTeamId = teamSel.value; renderDayTabs(); renderAll(); };
  }
  const weekSel = wrap.querySelector('#weekSelect');
  if(weekSel){
    weekSel.value = weekStartISO;
    weekSel.onchange = ()=>{
      triggerSwap();
      weekStartISO = normalizeToMonday(weekSel.value);
      localStorage.setItem('ums_week_start_iso', weekStartISO);
      weekSel.value = weekStartISO;
      renderDayTabs();
      renderAll();
    };
  }

  const weekHelpBtn = wrap.querySelector('#weekHelp');
  if(weekHelpBtn){
    weekHelpBtn.onclick = ()=>showWeekHelp(weekHelpBtn);
  }

  const jumpTodayBtn = wrap.querySelector('#jumpToday');
  if(jumpTodayBtn){
    jumpTodayBtn.onclick = ()=>{
      triggerSwap();
      weekStartISO = currentWeekStartISO();
      localStorage.setItem('ums_week_start_iso', weekStartISO);
      if(weekSel) weekSel.value = weekStartISO;
      // Also snap day tab to Manila "today"
      selectedDay = getManilaDayIndex();
      renderDayTabs();
      renderAll();
    };
  }

  // Paint mode (click + drag across hours) — still strictly 1-hour blocks
  const paint = {
    enabled: false,
    role: 'call_onqueue',
  };

  function renderPaintBar(){
    const el = wrap.querySelector('#paintBar');
    if(!el) return;
    const roleIds = ['call_onqueue','back_office','block','lunch','mailbox_manager','mailbox_call'];
    const opts = roleIds.map(id=>{
      const s = Config.scheduleById(id);
      if(!s) return '';
      return `<option value="${s.id}">${UI.esc(s.icon||'')} ${UI.esc(s.label)}</option>`;
    }).join('');
    el.innerHTML = `
      <div class="paintbar-inner ${paint.enabled?'on':''}">
        <button class="btn ${paint.enabled?'primary':''}" type="button" id="paintToggle" title="Paint mode: click & drag across hours">🖌 Paint</button>
        <select class="input" id="paintRole" title="Role to paint" style="min-width:170px">
          ${opts}
          <option value="__clear__">🧽 Clear (empty)</option>
        </select>
      </div>
    `;
    const t = el.querySelector('#paintToggle');
    const sel = el.querySelector('#paintRole');
    if(sel) sel.value = paint.role;
    if(t) t.onclick = ()=>{
      paint.enabled = !paint.enabled;
      wrap.classList.toggle('paint-enabled', paint.enabled);
      renderPaintBar();
    };
    if(sel) sel.onchange = ()=>{ paint.role = sel.value; };
    wrap.classList.toggle('paint-enabled', paint.enabled);
  }

  renderPaintBar();

  // Selection tools
  const selClearBtn = wrap.querySelector('#selClear');
  const selDeselectBtn = wrap.querySelector('#selDeselect');

  function deleteSelectedBlocks(opts){
    const o = Object.assign({ confirm: true }, opts||{});
    if(!selMemberId || selIdx.size===0) return;
    const member = Store.getUsers().find(u=>u.id===selMemberId);
    if(!member || !canEditTarget(member)) return;
    const team = Config.teamById(member.teamId);
    if(isDayLocked(member.teamId, selectedDay)) return;
    const blocks = normalizeBlocks(team, Store.getUserDayBlocks(member.id, selectedDay));
    const idxs = Array.from(selIdx).filter(i=>blocks[i]).sort((a,b)=>a-b);
    if(!idxs.length) return;
    if(o.confirm){
      if(!confirm(`Delete ${idxs.length} selected block(s) for ${member.name||member.username} on ${UI.DAYS[selectedDay]}?`)) return;
    }

    const keep = blocks.filter((_,i)=>!selIdx.has(i));
    Store.setUserDayBlocks(member.id, member.teamId, selectedDay, keep);

    const actor = Auth.getUser();
    if(actor) Store.addLog({
      ts: Date.now(), teamId: member.teamId,
      actorId: actor.id, actorName: actor.name||actor.username,
      action: 'SCHEDULE_DELETE',
      targetId: member.id, targetName: member.name||member.username,
      msg: `${actor.name||actor.username} deleted ${idxs.length} block(s) for ${member.name||member.username}`,
      detail: `${UI.DAYS[selectedDay]}`
    });
    addAudit('SCHEDULE_DELETE', member.id, member.name||member.username, `${UI.DAYS[selectedDay]} deleted ${idxs.length} block(s)`);

    clearSelection();
    // Render immediately (no timers) to make Delete-key feel instantaneous.
    renderAll();
  }
  function clearAllBlocksForMemberDay(){
    // Bulk clear: if multiple members are selected via checkboxes, clear all of them.
    const ids = (selMemberIds && selMemberIds.size) ? Array.from(selMemberIds) : (selMemberId ? [selMemberId] : []);
    if(!ids.length) return;
    const users = Store.getUsers();
    const members = ids.map(id=>users.find(u=>u.id===id)).filter(Boolean);
    if(!members.length) return;

    // Confirm message
    const label = members.length===1 ? (members[0].name||members[0].username) : `${members.length} members`;
    if(!confirm(`Clear ALL blocks for ${label} (Sun–Sat)?

Executing Clear All will delete all existing assigned schedule blocks from Sun to Sat tabs for the selected member(s).

This cannot be undone.`)) return;

    for(const member of members){
      for(let d=0; d<=6; d++){
        if(isDayLocked(member.teamId, d)) continue;
        Store.setUserDayBlocks(member.id, member.teamId, d, []);
      }
      const actor = Auth.getUser();
      if(actor) Store.addLog({
        ts: Date.now(), teamId: member.teamId,
        actorId: actor.id, actorName: actor.name||actor.username,
        action: 'SCHEDULE_CLEAR_ALL',
        targetId: member.id, targetName: member.name||member.username,
        msg: `${actor.name||actor.username} cleared ALL blocks for ${member.name||member.username}`,
        detail: `Sun–Sat`
      });
      addAudit('SCHEDULE_CLEAR_ALL', member.id, member.name||member.username, `Sun–Sat cleared all blocks`);
    }

    clearSelection();
    renderAll();
  }


  // Deselect (requested behavior) = delete the specific selected blocks
  if(selDeselectBtn) selDeselectBtn.onclick = deleteSelectedBlocks;

  // Clear = clear all blocks for the selected member/day (confirm required)
  if(selClearBtn) selClearBtn.onclick = clearAllBlocksForMemberDay;

// Auto-schedule settings (per team/shift)
  function defaultAutoSettings(team){
    return {
      mailboxSegmentHours: 3,
      mailboxSingle: true,
      callMinPerHour: 2,
      lunchStart: '10:00',
      lunchEnd: '13:00',
      lunchOverlapMax: 2,
      lunchDurationMin: 60,
      backOfficeMaxHoursPerMember: 2,
    };
  }

  function getAutoSettingsForTeam(teamId){
    const team = Config.teamById(teamId);
    const base = defaultAutoSettings(team);
    const saved = Store.getTeamAutoSettings ? Store.getTeamAutoSettings(teamId) : null;
    return { ...base, ...(saved||{}) };
  }
  function renderAutoSettingsModal(initialTeamId){
    const existing = document.getElementById('autoSettingsModal');
    if(existing) existing.remove();

    // Permissions:
    // - SUPER_ADMIN / ADMIN can edit coverage parameters for any team
    // - TEAM_LEAD can edit only their own team (other teams appear disabled)
    const canEditAllTeams = !!(isSuper || isAdmin);

    let activeTeamId = String(initialTeamId || selectedTeamId || (me && me.teamId) || '').trim();
    if(!activeTeamId) activeTeamId = (Config.TEAMS && Config.TEAMS[0] ? Config.TEAMS[0].id : 'A');

    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.id = 'autoSettingsModal';

    const buildPanel = (teamId)=>{
      const team = Config.teamById(teamId);
      const s = getAutoSettingsForTeam(team.id);

      const teamOpts = (Config.TEAMS||[]).map(t=>{
        const disabled = (!canEditAllTeams && t.id !== (me && me.teamId)) ? 'disabled' : '';
        const sel = t.id===teamId ? 'selected' : '';
        return `<option value="${UI.esc(t.id)}" ${sel} ${disabled}>${UI.esc(t.label)}</option>`;
      }).join('');

      const canEditThisTeam = canEditAllTeams || (me && me.teamId===team.id);
      const teamNote = canEditThisTeam ? '' : ' (read-only)';

      return `
      <div class="panel">
        <div class="head">
          <div>
            <div class="announce-title">Auto Schedule Settings</div>
            <div class="small">Configure criteria for: <b>${UI.esc(team.label)}</b>${teamNote}</div>
          </div>
          <button class="btn ghost" type="button" id="asClose">✕</button>
        </div>

        <div class="body" style="display:grid;gap:10px">
          <div class="grid2">
            <div>
              <label class="small">Team</label>
              <select class="input" id="asTeam">${teamOpts}</select>
            </div>
            <div>
              <label class="small">Call Available minimum active per hour</label>
              <input class="input" id="asCallMin" type="number" min="1" max="10" value="${s.callMinPerHour}" />
            </div>
          </div>

          <div class="grid2">
            <div>
              <label class="small">Mailbox segment hours (minimum)</label>
              <input class="input" id="asMailboxHours" type="number" min="1" max="9" value="${s.mailboxSegmentHours}" />
            </div>
            <div>
              <label class="small">Back Office max hours per member (per day)</label>
              <input class="input" id="asBackMax" type="number" min="0" max="9" value="${s.backOfficeMaxHoursPerMember}" />
            </div>
          </div>

          <div class="grid2">
            <div>
              <label class="small">Lunch window start</label>
              <input class="input" id="asLunchStart" type="time" value="${s.lunchStart}" />
            </div>
            <div>
              <label class="small">Lunch window end</label>
              <input class="input" id="asLunchEnd" type="time" value="${s.lunchEnd}" />
            </div>
          </div>

          <div class="grid2">
            <div>
              <label class="small">Lunch max overlap (members at same time)</label>
              <input class="input" id="asLunchOverlap" type="number" min="1" max="5" value="${s.lunchOverlapMax}" />
            </div>
            <div class="small muted" style="align-self:end">
              <div><b>1-hour grid only</b> (no minutes). Drag/paint assigns whole hours.</div>
              <div>Coverage is evaluated per-hour grid.</div>
            </div>
          </div>

          <div class="row" style="justify-content:flex-end;gap:10px;margin-top:6px">
            <button class="btn" type="button" id="asCancel">Cancel</button>
            <button class="btn primary" type="button" id="asSave" ${canEditThisTeam?'':'disabled'}>Save Settings</button>
          </div>
        </div>
      </div>
      `;
    };

    modal.innerHTML = buildPanel(activeTeamId);
    document.body.appendChild(modal);

    const close = ()=>{ modal.classList.remove('open'); modal.remove(); };
    const bind = ()=>{
      const btnClose = modal.querySelector('#asClose');
      const btnCancel = modal.querySelector('#asCancel');
      if(btnClose) btnClose.onclick = close;
      if(btnCancel) btnCancel.onclick = close;

      const teamSel = modal.querySelector('#asTeam');
      if(teamSel){
        teamSel.onchange = ()=>{
          activeTeamId = String(teamSel.value||'').trim() || activeTeamId;
          modal.innerHTML = buildPanel(activeTeamId);
          bind();
        };
      }

      const btnSave = modal.querySelector('#asSave');
      if(btnSave) btnSave.onclick = ()=>{
        const team = Config.teamById(activeTeamId);
        const canEditThisTeam = canEditAllTeams || (me && me.teamId===team.id);
        if(!canEditThisTeam){
          alert('You do not have permission to edit Coverage Meter parameters for this team.');
          return;
        }
        const settings = {
          mailboxSegmentHours: Math.max(1, Number(modal.querySelector('#asMailboxHours').value||3)),
          mailboxSingle: true,
          callMinPerHour: Math.max(1, Number(modal.querySelector('#asCallMin').value||2)),
          lunchStart: String(modal.querySelector('#asLunchStart').value||'10:00'),
          lunchEnd: String(modal.querySelector('#asLunchEnd').value||'13:00'),
          lunchOverlapMax: Math.max(1, Number(modal.querySelector('#asLunchOverlap').value||2)),
          lunchDurationMin: 60,
          backOfficeMaxHoursPerMember: Math.max(0, Number(modal.querySelector('#asBackMax').value||2)),
        };
        if(Store.setTeamAutoSettings) Store.setTeamAutoSettings(team.id, settings);
        const actor = Auth.getUser();
        if(actor) Store.addLog({ ts: Date.now(), teamId: team.id, actorId: actor.id, actorName: actor.name||actor.username, action: 'AUTO_SETTINGS', targetId: team.id, targetName: team.label, msg: `${actor.name||actor.username} updated auto-schedule settings for ${team.label}`, detail: JSON.stringify(settings) });
        close();
        alert('Auto schedule settings saved.');
      };
    };

    modal.classList.add('open');
    bind();
  }


  const autoSettingsBtn = wrap.querySelector('#autoSettings');
  if(autoSettingsBtn){
    autoSettingsBtn.onclick = ()=>{
      if(!Config.can(me,'manage_users') && !Config.can(me,'manage_members')){}
      renderAutoSettingsModal();
    };
  }


  // Auto scheduling (Mon–Fri) to balance responsibilities
  function computeAutoPlans(team, members){
    const plans = {};
    for(let day=1; day<=5; day++){
      const iso = isoForDay(day);
      const avail = (members||[]).filter(m=>{
        const leave = Store.getLeave ? Store.getLeave(m.id, iso) : null;
        const rest = isRestDay(m.teamId, m.id, iso);
        return !(leave || rest);
      });
      plans[String(day)] = buildAutoPlan(team, avail, day);
    }
    return plans; // {"1": {userId:[blocks]}, ... "5": ...}
  }

  function applyPlansAndLock(team, members, plans){
    // apply
    for(let day=1; day<=5; day++){
      const plan = plans[String(day)] || {};
      for(const u of members){
        Store.setUserDayBlocks(u.id, u.teamId, day, plan[u.id] || []);
      }
    }
    // lock Mon–Fri for this Manila week
    const actor = Auth.getUser();
    const lockObj = {
      lockedDays: {"1":true,"2":true,"3":true,"4":true,"5":true},
      lockedAt: Date.now(),
      lockedBy: actor ? actor.id : null,
      lockedByName: actor ? (actor.name||actor.username) : 'System'
    };
    if(Store.setLock) Store.setLock(team.id, weekStartISO, lockObj);
    if(actor) Store.addLog({
      ts: Date.now(), teamId: team.id,
      actorId: actor.id, actorName: actor.name||actor.username,
      action: 'AUTO_SCHEDULE_APPLY_LOCK',
      targetId: team.id, targetName: team.label,
      msg: `${actor.name||actor.username} approved auto schedule and locked Mon–Fri for ${team.label}`,
      detail: `WeekStart ${weekStartISO}`
    });
    addAudit('AUTO_SCHEDULE_APPLY_LOCK', team.id, team.label, `Locked Mon–Fri for week of ${weekStartISO}`);
  }

  function hourCoverage(team, members, planMap){
    const meta = UI.shiftMeta(team);
    const step = GRID_STEP_MIN;
    const slots = Math.floor(meta.length/step);
    // build per-member slot role (min resolution)
    const slotRole = {};
    for(const u of members){
      const roles = Array(slots).fill(null);
      const bl = (planMap && planMap[u.id]) ? planMap[u.id] : [];
      for(const b of bl){
        const s = Math.max(0, Math.min(slots, Math.floor(UI.offsetFromShiftStart(team, b.start)/step)));
        const e = Math.max(0, Math.min(slots, Math.ceil(UI.offsetFromShiftStart(team, b.end)/step)));
        for(let i=s;i<e;i++) roles[i] = b.role;
      }
      slotRole[u.id] = roles;
    }
    const hours = Math.ceil(meta.length/step);
    const out = [];
    for(let h=0; h<hours; h++){
      const from = h;
      const to = Math.min(slots, from+1);
      let mailboxMin = 999, callMin = 999;
      for(let i=from;i<to;i++){
        let mailbox=0, call=0;
        for(const u of members){
          const r = slotRole[u.id][i];
          if(r==='mailbox_manager' || r==='mailbox_call') mailbox++;
          if(r==='call_onqueue' || r==='call_available' || r==='mailbox_call') call++;
        }
        mailboxMin = Math.min(mailboxMin, mailbox);
        callMin = Math.min(callMin, call);
      }
      const hm = UI.offsetToHM(team, h*step);
      out.push({ label: to12h(hm), mailboxMin: (mailboxMin===999?0:mailboxMin), callMin: (callMin===999?0:callMin) });
    }
    return out;
  }

  function renderPreviewModal(team, members, plans){
    const s = getAutoSettingsForTeam(team.id);
    let day = 1;
    const existing = document.getElementById('autoPreviewModal');
    if(existing) existing.remove();
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.id = 'autoPreviewModal';
    modal.innerHTML = `
      <div class="panel" style="max-width:980px">
        <div class="head">
          <div>
            <div class="announce-title">Preview Auto Schedule</div>
            <div class="small">${UI.esc(team.label)} • Mon–Fri • Week of ${UI.esc(weekStartISO)} (Manila)</div>
          </div>
          <button class="btn ghost" type="button" id="apClose">✕</button>
        </div>
        <div class="body" style="display:grid;gap:12px">
          <div class="daytabs" id="apTabs">
            ${['Mon','Tue','Wed','Thu','Fri'].map((t,i)=>`<button class="daytab ${i===0?'active':''}" data-day="${i+1}" type="button">${t}</button>`).join('')}
          </div>
          <div class="coverage-wrap">
            <div class="small muted" style="margin-bottom:6px">Coverage meter shows per-hour minimum counts (stricter). Mailbox should be 1 active; Call should be ≥ ${s.callMinPerHour} active.</div>
            <div id="apMeter"></div>
          </div>
          <div class="row" style="justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px">
            <div class="small muted">Lunch window: ${UI.esc(s.lunchStart)}–${UI.esc(s.lunchEnd)} (max overlap ${s.lunchOverlapMax}); Back Office max ${s.backOfficeMaxHoursPerMember} hrs/member/day</div>
            <div class="row" style="gap:10px">
              <button class="btn" type="button" id="apCancel">Cancel</button>
              <button class="btn primary" type="button" id="apApply">Approve & Lock Mon–Fri</button>
            </div>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    modal.classList.add('open');

    const close = ()=>{ modal.classList.remove('open'); modal.remove(); };
    modal.querySelector('#apClose').onclick = close;
    modal.querySelector('#apCancel').onclick = close;

    const renderMeter = ()=>{
      const cov = hourCoverage(team, members, plans[String(day)]);
      const meter = modal.querySelector('#apMeter');
      const targetCall = (s.callMinPerHour||2);
      const okCount = cov.reduce((a,c)=>a+((c.mailboxMin===1 && c.callMin>=targetCall)?1:0),0);
      const totalCount = cov.length || 1;
      const pctOk = Math.round((okCount/totalCount)*100);
      meter.innerHTML = `
        <div class="coverage-head" style="margin-bottom:8px">
          <div>
            <div class="coverage-title">Coverage Meter</div>
            <div class="coverage-sub">Mailbox target: <b>1</b>/hr • Call target: <b>≥ ${targetCall}</b>/hr • Values are per-hour <b>minimum</b>.</div>
          </div>
          <div class="coverage-kpis">
            <div class="kpi"><div class="kpi-label">OK hours</div><div class="kpi-val">${okCount}/${totalCount}</div></div>
            <div class="kpi"><div class="kpi-label">Health</div><div class="kpi-val">${pctOk}%</div></div>
          </div>
        </div>
        <div class="coverage-scroll">
          <div class="coverage-meter" aria-label="Coverage meter by hour">
            ${cov.map(c=>{
              const okMailbox = c.mailboxMin===1;
              const okCall = c.callMin >= targetCall;
              const cls = (okMailbox && okCall) ? 'ok' : 'bad';
              return `<div class="cm-col ${cls}" title="${UI.esc(c.label)}\nMailbox: ${c.mailboxMin}\nCall: ${c.callMin}">
                <div class="cm-label">${UI.esc(c.label)}</div>
                <div class="cm-bars">
                  <div class="cm-bar" data-kind="mailbox">M:${c.mailboxMin}</div>
                  <div class="cm-bar" data-kind="call">C:${c.callMin}</div>
                </div>
              </div>`;
            }).join('')}
          </div>
        </div>
      `;
    };

    modal.querySelectorAll('#apTabs .daytab').forEach(b=>{
      b.onclick = ()=>{
        day = Number(b.dataset.day);
        modal.querySelectorAll('#apTabs .daytab').forEach(x=>x.classList.remove('active'));
        b.classList.add('active');
        renderMeter();
      };
    });

    modal.querySelector('#apApply').onclick = ()=>{
      if(!confirm('Apply auto schedule for Mon–Fri and lock the week? This will overwrite existing schedules for those days.')) return;
      applyPlansAndLock(team, members, plans);
      selectedDay = 1;
      renderDayTabs();
      renderAll();
      close();
      alert('Applied and locked Mon–Fri for this week.');
    };

    renderMeter();
  }

  const previewBtn = wrap.querySelector('#previewAuto');
  if(previewBtn){
    previewBtn.onclick = ()=>{
      const team = Config.teamById(selectedTeamId);
      const members = getMembersForView(selectedTeamId).filter(u=>u.role===Config.ROLES.MEMBER);
      if(members.length < 2){ alert('Auto scheduling needs at least 2 members in the team.'); return; }
      const lock = getTeamLock(team.id);
      if(lock && lock.lockedDays && [1,2,3,4,5].some(d=>lock.lockedDays[String(d)])){
        alert('This week is locked. Unlock first to preview/apply again.');
        return;
      }
      const plans = computeAutoPlans(team, members);
      renderPreviewModal(team, members, plans);
    };
  }

  const autoBtn = wrap.querySelector('#autoSchedule');
  if(autoBtn){
    autoBtn.onclick = ()=>{
      // Direct apply is supported, but we encourage preview
      const team = Config.teamById(selectedTeamId);
      const members = getMembersForView(selectedTeamId).filter(u=>u.role===Config.ROLES.MEMBER);
      if(members.length < 2){ alert('Auto scheduling needs at least 2 members in the team.'); return; }
      const lock = getTeamLock(team.id);
      if(lock && lock.lockedDays && [1,2,3,4,5].some(d=>lock.lockedDays[String(d)])){
        alert('This week is locked. Unlock first to apply again.');
        return;
      }
      const plans = computeAutoPlans(team, members);
      renderPreviewModal(team, members, plans);
    };
  }

  const unlockBtn = wrap.querySelector('#unlockSchedule');
  if(unlockBtn){
    unlockBtn.onclick = ()=>{
      const team = Config.teamById(selectedTeamId);
      // Team Leads can unlock for their team; Admin/Super can unlock any team.
      if(!(isLead||isAdmin||isSuper)) return;
      if(isLead && team.id !== me.teamId) return;
      if(!confirm(`Unlock Mon–Fri for ${team.label} (week of ${weekStartISO})?`)) return;
      if(Store.clearLock) Store.clearLock(team.id, weekStartISO);
      const actor = Auth.getUser();
      if(actor) Store.addLog({ ts: Date.now(), teamId: team.id, actorId: actor.id, actorName: actor.name||actor.username, action: 'SCHEDULE_UNLOCK', targetId: team.id, targetName: team.label, msg: `${actor.name||actor.username} unlocked Mon–Fri schedules for ${team.label}`, detail: `WeekStart ${weekStartISO}` });
      addAudit('SCHEDULE_UNLOCK', team.id, team.label, `Unlocked Mon–Fri for week of ${weekStartISO}`);
      renderDayTabs();
      renderAll();
    };
  }


  // Build per-day plan map: { [userId]: [blocks...] }
  function buildAutoPlan(team, members, dayIndex){
    const s = getAutoSettingsForTeam(team.id);
    const meta = UI.shiftMeta(team);
    const step = GRID_STEP_MIN;
    const slots = Math.floor(meta.length / step);
    const slotsPerHour = 60 / step;

    const slotRole = {};
    const mins = {};
    members.forEach(u=>{
      slotRole[u.id] = Array(slots).fill(null);
      mins[u.id] = { mailbox:0, call:0, back:0, lunch:0 };
    });

    // 1) Mailbox coverage: one member at a time, start of shift, segments of mailboxSegmentHours
    const segMin = Math.max(step, Math.round((Number(s.mailboxSegmentHours||3)*60)/step)*step);
    const segSlots = Math.max(1, segMin/step);
    let cur = 0;
    let segIdx = 0;
    while(cur < slots){
      const end = Math.min(slots, cur + segSlots);
      const m = members[(segIdx + (dayIndex||0)) % members.length];
      for(let i=cur;i<end;i++){
        slotRole[m.id][i] = 'mailbox_manager';
      }
      mins[m.id].mailbox += (end-cur)*step;
      cur = end;
      segIdx++;
    }

    // 2) Lunch: 1 hour between lunchStart-lunchEnd, max overlap lunchOverlapMax, avoid mailbox slots if possible
    const lunchSlots = Math.max(1, Math.round((Number(s.lunchDurationMin||60))/step));
    const offStart = Math.max(0, Math.min(slots-1, Math.round(UI.offsetFromShiftStart(team, s.lunchStart)/step)*step/step));
    const offEnd = Math.max(0, Math.min(slots, Math.round(UI.offsetFromShiftStart(team, s.lunchEnd)/step)*step/step));
    const winStart = max(0, min(slots-lunchSlots, offStart));
    const winEnd = max(winStart + lunchSlots, min(slots, offEnd));
    const maxOverlap = Math.max(1, Number(s.lunchOverlapMax||2));
    const lunchCount = Array(slots).fill(0);

    // helper functions in JS string will be defined below
    function canPlaceLunch(memberId, st){
      for(let i=st;i<st+lunchSlots;i++){
        if(i<0 || i>=slots) return false;
        if(lunchCount[i] >= maxOverlap) return false;
        // avoid replacing mailbox_manager
        if(slotRole[memberId][i] === 'mailbox_manager') return false;
      }
      return true;
    }
    function placeLunch(memberId, st){
      for(let i=st;i<st+lunchSlots;i++){
        slotRole[memberId][i] = 'lunch';
        lunchCount[i] += 1;
      }
      mins[memberId].lunch += lunchSlots*step;
    }

    // Spread lunches; rotate order for fairness
    const order = members.slice();
    const rot = (dayIndex||0) % order.length;
    const lunchOrder = order.slice(rot).concat(order.slice(0, rot));
    for(let k=0;k<lunchOrder.length;k++){
      const u = lunchOrder[k];
      let chosen = -1;
      // stagger start in window
      const base = winStart + ((k*2) % max(1, (winEnd-winStart-lunchSlots+1)));
      for(let attempt=0; attempt< (winEnd-winStart+1); attempt++){
        const st = winStart + ((base - winStart + attempt) % max(1,(winEnd-winStart-lunchSlots+1)));
        if(canPlaceLunch(u.id, st)) { chosen = st; break; }
      }
      if(chosen >= 0) placeLunch(u.id, chosen);
    }

    // 3) Call coverage: ensure at least callMinPerHour active per hour
    const callMin = Math.max(1, Number(s.callMinPerHour||2));
    for(let i=0;i<slots;i++){
      let callCount = 0;
      for(const u of members){ if(slotRole[u.id][i] === 'call_onqueue') callCount++; }
      while(callCount < callMin){
        // pick available member with least call minutes
        let best = null;
        for(const u of members){
          const r = slotRole[u.id][i];
          if(r === null){
            if(!best || mins[u.id].call < mins[best.id].call) best = u;
          }
        }
        if(!best) break;
        slotRole[best.id][i] = 'call_onqueue';
        mins[best.id].call += step;
        callCount++;
      }
    }

    // 4) Back Office fill: limit backOfficeMaxHoursPerMember per member per day
    const backMax = Math.max(0, Number(s.backOfficeMaxHoursPerMember||2)) * 60;
    for(const u of members){
      if(backMax <= 0) continue;
      for(let i=0;i<slots;i++){
        if(slotRole[u.id][i] === null && mins[u.id].back < backMax){
          slotRole[u.id][i] = 'back_office';
          mins[u.id].back += step;
        }
      }
    }

    // 5) Remaining empty time -> call_onqueue (keeps coverage and balances)
    for(const u of members){
      for(let i=0;i<slots;i++){
        if(slotRole[u.id][i] === null){
          slotRole[u.id][i] = 'call_onqueue';
          mins[u.id].call += step;
        }
      }
    }

    // Convert slots -> merged blocks
    const out = {};
    for(const u of members){
      const arr = slotRole[u.id];
      const blocks = [];
      let curRole = arr[0];
      let st = 0;
      for(let i=1;i<=slots;i++){
        const r = (i<slots) ? arr[i] : null;
        if(r != curRole){
          if(curRole){
            const startHM = UI.offsetToHM(team, st*step);
            const endHM = UI.offsetToHM(team, i*step);
            blocks.push({ start: startHM, end: endHM, role: curRole });
          }
          curRole = r;
          st = i;
        }
      }
      out[u.id] = blocks;
    }

    return out;

    function max(a,b){ return a>b?a:b; }
    function min(a,b){ return a<b?a:b; }
  }
  function getMembersForView(teamId){
    const users = Store.getUsers();
    // Members page is only for MEMBER schedules
    return users.filter(u=>{
      if(u.role !== Config.ROLES.MEMBER) return false;
      if(isLead) return u.teamId === me.teamId;
      return u.teamId === teamId;
    }).sort((a,b)=>String(a.name||a.username).localeCompare(String(b.name||b.username)));
  }

  function canEditTarget(member){
    if(!member) return false;
    // Respect lock: Mon–Fri can be locked after approval
    if(isDayLocked(selectedTeamId, selectedDay)) return false;
    if(isSuper || isAdmin) return Config.can(me, 'manage_members_scheduling') || Config.can(me, 'manage_users') || Config.can(me, 'manage_members');
    if(isLead) return (member.teamId === me.teamId) && Config.can(me, 'manage_members_scheduling');
    return false;
  }

  function timelineHeaderHtml(team){
    const meta = UI.shiftMeta(team);
    // show hour markers
    const markers = [];
    const startMin = meta.start;
    const total = meta.length;
    for(let off = 0; off <= total; off += 60){
      const pct = (off/total)*100;
      let absoluteMin = startMin + off;
      absoluteMin = absoluteMin % (24*60);
      const hh = String(Math.floor(absoluteMin/60)).padStart(2,'0');
      const mm = String(absoluteMin%60).padStart(2,'0');
      markers.push(`<div class="tl-mark" style="left:${pct}%"><span>${hh}:${mm}</span></div>`);
    }
    return `<div class="tl-header">${markers.join('')}</div>`;
  }

  function blockLabel(roleId){
    const s = Config.scheduleById(roleId);
    return s ? s.label : roleId;
  }

  function normalizeBlocks(team, blocks){
    const meta = UI.shiftMeta(team);

    function isHourAligned(hm){
      const m = UI.parseHM(hm);
      return Number.isFinite(m) && (m % 60) === 0;
    }
    const clean = (blocks||[]).map(b=>({
      start: String(b.start||'').slice(0,5),
      end: String(b.end||'').slice(0,5),
      role: String(b.role||'block')
    })).filter(b=>b.start && b.end && isHourAligned(b.start) && isHourAligned(b.end));

    // sort by start offset
    clean.sort((a,b)=>UI.offsetFromShiftStart(team,a.start) - UI.offsetFromShiftStart(team,b.start));

    // validate within shift range and no overlaps
    const out = [];
    let lastEnd = -1;
    for(const b of clean){
      // Strict hour grid: reject any non-:00 times
      if(!isHourAligned(b.start) || !isHourAligned(b.end)) continue;
      const s = UI.offsetFromShiftStart(team,b.start);
      const e = UI.offsetFromShiftStart(team,b.end);
      if(e <= s) continue;
      if(((e - s) % GRID_STEP_MIN) !== 0) continue;
      if((e - s) < GRID_STEP_MIN) continue;
      if(s < 0 || e > meta.length) continue;
      if(s < lastEnd) continue;
      out.push(b);
      lastEnd = e;
    }
    return out;
  }

  function openEditModal(member){
    const modal = wrap.querySelector('#memberSchedModal');
    const body = wrap.querySelector('#msBody');
    const title = wrap.querySelector('#msTitle');
    const sub = wrap.querySelector('#msSub');
    const close = wrap.querySelector('#msClose');

    const team = Config.teamById(member.teamId);
    const meta = UI.shiftMeta(team);
    const blocks = Store.getUserDayBlocks(member.id, selectedDay);

    title.textContent = `Scheduling: ${member.name||member.username}`;
    sub.textContent = `${Config.teamById(member.teamId).label} • ${UI.DAYS[selectedDay]} • Shift ${team.teamStart}–${team.teamEnd}`;

    function rowHtml(b, idx){
      const options = Object.keys(Config.SCHEDULES).map(k=>{
        const s = Config.SCHEDULES[k];
        const sel = b.role===k ? 'selected' : '';
        return `<option value="${s.id}" ${sel}>${UI.esc(s.label)}</option>`;
      }).join('');
      return `
        <div class="ms-row" data-idx="${idx}">
          <input class="input" type="time" step="3600" data-field="start" value="${UI.esc(b.start)}">
          <input class="input" type="time" step="3600" data-field="end" value="${UI.esc(b.end)}">
          <select class="input" data-field="role">${options}</select>
          <button class="btn danger" type="button" data-act="del">Delete</button>
        </div>
      `;
    }

    function renderModal(){
      const list = normalizeBlocks(team, Store.getUserDayBlocks(member.id, selectedDay));
      body.innerHTML = `
        <div class="muted small" style="margin-bottom:8px">Blocks must be inside the shift window, must not overlap, and must be aligned to the hour (<b>:00</b>) in 1-hour increments.</div>
        <div class="ms-grid" id="msGrid">
          ${list.map(rowHtml).join('')}
        </div>
        <div class="row" style="gap:10px;justify-content:space-between;flex-wrap:wrap;margin-top:12px">
          <button class="btn" type="button" id="msAdd">Add Block</button>
          <div class="row" style="gap:8px;flex-wrap:wrap">
            <button class="btn" type="button" id="msCancel">Cancel</button>
            <button class="btn primary" type="button" id="msSave">Save</button>
          </div>
        </div>
        <div class="err" id="msErr" style="display:none;margin-top:10px"></div>
      `;

      const grid = body.querySelector('#msGrid');
      grid.addEventListener('click', (e)=>{
        const btn = e.target.closest('button');
        if(!btn) return;
        if(btn.dataset.act==='del'){
          const row = btn.closest('.ms-row');
          const idx = Number(row.dataset.idx);
          const cur = Store.getUserDayBlocks(member.id, selectedDay).slice();
          cur.splice(idx,1);
          Store.setUserDayBlocks(member.id, member.teamId, selectedDay, cur);
          renderModal();
          renderAll();
        }
      });

      body.querySelectorAll('.ms-row').forEach(row=>{
        row.addEventListener('change', ()=>{
          const idx = Number(row.dataset.idx);
          const cur = Store.getUserDayBlocks(member.id, selectedDay).slice();
          const start = row.querySelector('[data-field="start"]').value;
          const end = row.querySelector('[data-field="end"]').value;
          const role = row.querySelector('[data-field="role"]').value;
          cur[idx] = { start, end, role };
          Store.setUserDayBlocks(member.id, member.teamId, selectedDay, cur);
        });
      });

      body.querySelector('#msAdd').addEventListener('click', ()=>{
        const cur = Store.getUserDayBlocks(member.id, selectedDay).slice();
        // default one-hour block at shift start
        const defaultStart = team.teamStart;
        const sMin = UI.offsetFromShiftStart(team, defaultStart);
        const eMin = Math.min(meta.length, sMin + 60);
        // convert back to absolute clock time
        const absStart = UI.parseHM(team.teamStart);
        const absNewStart = (absStart + sMin) % (24*60);
        const absNewEnd = (absStart + eMin) % (24*60);
        const toHM = (m)=>String(Math.floor(m/60)).padStart(2,'0') + ':' + String(m%60).padStart(2,'0');
        cur.push({ start: toHM(absNewStart), end: toHM(absNewEnd), role: 'block' });
        Store.setUserDayBlocks(member.id, member.teamId, selectedDay, cur);
        renderModal();
        renderAll();
      });

      body.querySelector('#msCancel').addEventListener('click', ()=>UI.closeModal('memberSchedModal'));

      body.querySelector('#msSave').addEventListener('click', ()=>{
        const err = body.querySelector('#msErr');
        const cur = Store.getUserDayBlocks(member.id, selectedDay);
        const normalized = normalizeBlocks(team, cur);
        if(normalized.length !== cur.length){
          err.style.display = 'block';
          err.textContent = 'Some blocks were invalid (overlap, outside shift, or end before start). Fix times then save again.';
          return;
        }
        err.style.display = 'none';
        Store.setUserDayBlocks(member.id, member.teamId, selectedDay, normalized);
        UI.closeModal('memberSchedModal');
        renderAll();
      });
    }

    close.onclick = ()=>UI.closeModal('memberSchedModal');
    renderModal();
    UI.openModal('memberSchedModal');
  }

  function renderAll(){
    clearSelection();
    renderWeekWarning();
    const team = Config.teamById(selectedTeamId);
    // Sort: active members always at the top. Inactive (rest/leave) go below.
    // Active = not on rest day and not on any leave for the selected Manila date.
    const isoDateForSort = isoForDay(selectedDay);
    const members = getMembersForView(selectedTeamId)
      .slice()
      .sort((a,b)=>{
        const aLeave = Store.getLeave ? Store.getLeave(a.id, isoDateForSort) : null;
        const bLeave = Store.getLeave ? Store.getLeave(b.id, isoDateForSort) : null;
        const aRest = isRestDay(a.teamId, a.id, isoDateForSort);
        const bRest = isRestDay(b.teamId, b.id, isoDateForSort);
        const aInactive = !!aLeave || !!aRest;
        const bInactive = !!bLeave || !!bRest;
        if(aInactive !== bInactive) return aInactive ? 1 : -1;
        return String(a.name||a.username).localeCompare(String(b.name||b.username));
      });

    const table = wrap.querySelector('#membersTable');

    // Ruler (hour labels aligned to timeline grid)
    const ruler = wrap.querySelector('#ruler');
    const meta = UI.shiftMeta(team);
    const marks = [];
    const rticks = [];
    for(let off=0; off<=meta.length; off+=60){
      const pct = (off/meta.length)*100;
      const hm = UI.offsetToHM(team, off);
      const cls = off===0 ? 'mark first' : (off===meta.length ? 'mark last' : 'mark');
      marks.push(`<div class="${cls}" style="left:${pct}%">${UI.esc(to12h(hm))}</div>`);
      rticks.push(`<div class="ruler-tick" style="left:${pct}%"></div>`);
    }
    // 3-column ruler to match members-row grid: meta | timeline | actions
    ruler.innerHTML = `<div></div><div class="ruler-track">${rticks.join('')}${marks.join('')}</div><div></div>`;

    // Coverage meter for the selected day
    const covEl = wrap.querySelector('#coverageMeter');
    if(covEl){
      const s = getAutoSettingsForTeam(team.id);
      const planMap = {};
      for(const u of members){
        planMap[u.id] = normalizeBlocks(team, Store.getUserDayBlocks(u.id, selectedDay));
      }
      const cov = hourCoverage(team, members, planMap);
      const targetCall = (s.callMinPerHour||2);
      const okCount = cov.reduce((a,c)=>a+((c.mailboxMin===1 && c.callMin>=targetCall)?1:0),0);
      const totalCount = cov.length || 1;
      const pctOk = Math.round((okCount/totalCount)*100);

      // Show the specific calendar date + day for the currently edited grid (Manila week)
      // Example: January 19 | FRIDAY
      const _iso = isoForDay(selectedDay);
      const _parts = String(_iso||'').split('-');
      const _mm = Number(_parts[1]||0);
      const _dd = Number(_parts[2]||0);
      const _months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
      const _pretty = `${_months[_mm-1] || _parts[1] || ''} ${_dd || (_parts[2]||'')}`.trim();
      const _dayLabel = String(UI.DAYS[selectedDay] || '').toUpperCase();
      const _dayDisplay = `${_pretty} | ${_dayLabel}`.trim();

      // Render coverage meter via component module (preferred)
      try{
        if(window.Components && Components.CoverageMeter){
          Components.CoverageMeter.render(covEl, {
            cov: cov,
            targetCall: targetCall,
            getTargetCall: ()=>{
              try{ const s2 = getAutoSettingsForTeam(team.id); return (s2 && s2.callMinPerHour) ? s2.callMinPerHour : (targetCall||2); }catch(_){ return (targetCall||2); }
            },
            isoDate: _iso,
            dayLabel: UI.DAYS[selectedDay],
            dayDisplay: _dayDisplay,
            canEdit: (isLead||isAdmin||isSuper),
            onEdit: ()=>renderAutoSettingsModal(selectedTeamId)
          });
        }else{
          covEl.textContent = '';
        }
      }catch(e){ console.error(e); }
    }

    const ticks = [];
    for(let off=0; off<=meta.length; off+=60){
      const pct = (off/meta.length)*100;
      ticks.push(`<div class="tick" style="left:${pct}%"></div>`);
    }

    const weekStartMs = UI.manilaWeekStartMondayMs();
    const cases = Store.getCases();
    const dayLockedForGrid = isDayLocked(team.id, selectedDay);
    function weeklyStats(u){
      const totals = { mailbox:0, back:0, call:0 };
      for(let d=0; d<7; d++){
        const bl = Store.getUserDayBlocks(u.id, d);
        const t = Config.teamById(u.teamId);
        for(const b of (bl||[])){
          const s = UI.offsetFromShiftStart(t,b.start);
          const e = UI.offsetFromShiftStart(t,b.end);
          const mins = Math.max(0, e-s);
          const r = b.role;
          if(r==='back_office') totals.back += mins;
          else if(r==='call_onqueue' || r==='call_available') totals.call += mins;
          else if(r==='mailbox_manager' || r==='mailbox_call') totals.mailbox += mins;
        }
      }
      const toH = m => Math.round(m/60);
      const caseCount = cases.filter(c=>c.assigneeId===u.id && (c.createdAt||0) >= weekStartMs).length;
      return {
        mailboxH: toH(totals.mailbox),
        backOfficeH: toH(totals.back),
        callAvailableH: toH(totals.call),
        caseAssigned: caseCount
      };
    }

    table.innerHTML = members.map(m=>{
      const isoDate = isoForDay(selectedDay);
      const leave = Store.getLeave ? Store.getLeave(m.id, isoDate) : null;
      const rest = isRestDay(m.teamId, m.id, isoDate);
      const isInactive = !!leave || !!rest;
      const leaveLabel = (t)=>({
        SICK: 'ON SICK LEAVE',
        EMERGENCY: 'ON EMERGENCY LEAVE',
        VACATION: 'ON VACATION LEAVE',
        HOLIDAY: 'ON HOLIDAY LEAVE'
      }[t] || 'ON LEAVE');
      const inactiveText = leave ? leaveLabel(leave.type) : (rest ? 'ON REST DAY' : '');

      const ws = weeklyStats(m);

      const blocks = normalizeBlocks(team, Store.getUserDayBlocks(m.id, selectedDay));
      const segs = (blocks||[]).map((b,i)=>{
        const st = UI.blockToStyle(team, b);
        const role = b.role || 'block';
        const title = `${blockLabel(role)} ${b.start}–${b.end}`;
        const icon = (Config.scheduleById(role) ? Config.scheduleById(role).icon : '');
        return `<div class="seg" data-idx="${i}" data-role="${UI.esc(role)}" style="left:${st.left}%;width:${st.width}%" title="${UI.esc(title)}">
          <span>${UI.esc(icon)}</span>
          <div class="handle l"></div>
          <div class="handle r"></div>
        </div>`;
      }).join('');
      const teamClass = `team-${m.teamId}`;
      const rowClass = isInactive ? 'inactive' : '';
      // Render row via component module (preferred).
      try{
        if(window.Components && Components.MemberRow){
          return Components.MemberRow.render({
            id: m.id,
            name: (m.name||m.username),
            memberTeamId: m.teamId,
            memberTeamLabel: Config.teamById(m.teamId).label,
            timelineTeamId: team.id,
            isoDate: isoDate,
            weeklyStats: ws,
            ticksHtml: ticks.join(''),
            segsHtml: segs,
            isInactive: isInactive,
            inactiveText: inactiveText,
            canEdit: canEditTarget(m),
            leave: leave,
            dayLocked: dayLockedForGrid
          });
        }
      }catch(e){ console.error(e); }

      return `
        <div class="members-row ${rowClass}" data-id="${UI.esc(m.id)}" data-inactive="${isInactive?'1':'0'}" data-iso="${UI.esc(isoDate)}">
          <div class="members-meta ${teamClass}">
            <div class="m-name">
              <label class="m-selwrap" title="Select member">
                <input class="m-select" type="checkbox" data-act="mselect" />
              </label>
              <div class="m-name-text">${UI.esc(m.name||m.username)}</div>
            </div>
            <div class="m-stats" aria-label="Weekly workload">
              <span class="statpill" data-kind="mailbox" title="Mailbox hours this week">Mailbox <b>${ws.mailboxH}h</b></span>
              <span class="statpill" data-kind="back" title="Back Office hours this week">Back Office <b>${ws.backOfficeH}h</b></span>
              <span class="statpill" data-kind="call" title="Call Available hours this week">Call Available <b>${ws.callAvailableH}h</b></span>
              <span class="statpill" data-kind="case" title="Cases assigned this week">Case Assigned <b>${ws.caseAssigned}</b></span>
            </div>
            <div class="m-sub">${UI.esc(Config.teamById(m.teamId).label)} ${isInactive ? `<span class="status-pill">${UI.esc(inactiveText)}</span>`:''}</div>
          </div>
          <div>
            <div class="timeline" data-team="${UI.esc(team.id)}">
              ${ticks.join('')}
              ${segs}
              ${isInactive ? `<div class="timeline-overlay">${UI.esc(inactiveText)}</div>`:''}
              ${dayLockedForGrid ? `<div class="locked-ind" aria-label="Locked"><div class="lk-ic">🔒</div><div class="lk-tx">LOCKED</div></div>`:''}
            </div>
          </div>
          <div class="row" style="justify-content:flex-end;flex-direction:column;align-items:flex-end;gap:8px">
            ${canEditTarget(m) ? `
              <button class="iconbtn" data-act="edit" type="button" title="Edit schedule" ${isInactive?'disabled':''}>✎</button>
            ` : '<span class="small muted">View</span>'}
            ${canEditTarget(m) ? `
              <div class="leave-actions" aria-label="Leave actions">
                <button class="btn ghost tiny leavebtn ${leave && leave.type==='SICK'?'active':''}" data-act="leave" data-leave="SICK" type="button" title="Sick Leave (SL)">SL</button>
                <button class="btn ghost tiny leavebtn ${leave && leave.type==='EMERGENCY'?'active':''}" data-act="leave" data-leave="EMERGENCY" type="button" title="Emergency Leave (EL)">EL</button>
                <button class="btn ghost tiny leavebtn ${leave && leave.type==='VACATION'?'active':''}" data-act="leave" data-leave="VACATION" type="button" title="Vacation Leave (VL)">VL</button>
                <button class="btn ghost tiny leavebtn ${leave && leave.type==='HOLIDAY'?'active':''}" data-act="leave" data-leave="HOLIDAY" type="button" title="Holiday Leave (HL)">HL</button>
              </div>
            `:''}
          </div>
        </div>
      `;
    }).join('');

    table.querySelectorAll('button[data-act="edit"]').forEach(btn=>{
      btn.addEventListener('click', ()=>{
        const row = btn.closest('.members-row');
        const id = row.dataset.id;
        const member = Store.getUsers().find(u=>u.id===id);
        if(member) openEditModal(member);
      });
    });


    // Member multi-select checkboxes (bulk clear)
    // Ensure the checkbox itself AND its label are directly clickable.
    // Some browsers can fire the row pointerdown handler first, which may block toggling.
    table.querySelectorAll('.m-selwrap').forEach(lbl=>{
      lbl.addEventListener('pointerdown', (e)=>{ e.stopPropagation(); }, { passive: true });
      lbl.addEventListener('click', (e)=>{ e.stopPropagation(); });
    });
    table.querySelectorAll('input.m-select').forEach(cb=>{
      cb.addEventListener('click', (e)=>{ e.stopPropagation(); });
      cb.addEventListener('pointerdown', (e)=>{ e.stopPropagation(); });
      cb.addEventListener('change', ()=>{
        const row = cb.closest('.members-row');
        if(!row) return;
        const id = row.dataset.id;
        if(!id) return;
        if(cb.checked){
          if(!selMemberIds) selMemberIds = new Set();
          selMemberIds.add(id);
          selMemberId = id;
        }else{
          if(selMemberIds) selMemberIds.delete(id);
          if(selMemberId===id && selMemberIds && selMemberIds.size){
            selMemberId = Array.from(selMemberIds)[0];
          }
        }
        // Do not touch block selection; this is for bulk actions
        updateSelectionUI();
        applyMemberRowSelectionStyles();
      });
    });

    // Leave toggles (per date) — applies immediately.
    table.querySelectorAll('button[data-act="leave"]').forEach(btn=>{
      btn.addEventListener('click', ()=>{
        const row = btn.closest('.members-row');
        if(!row) return;
        const userId = row.dataset.id;
        const iso = row.dataset.iso || isoForDay(selectedDay);
        const cur = Store.getLeave ? Store.getLeave(userId, iso) : null;
        const want = String(btn.dataset.leave||'').toUpperCase();
        let next = (cur && cur.type===want) ? null : want;
        if(cur && cur.type===want){
          const label = ({SICK:'Sick Leave',EMERGENCY:'Emergency Leave',VACATION:'Vacation Leave',HOLIDAY:'Holiday Leave'}[want] || 'Leave');
          const ok = window.confirm(`Remove ${label} status for this member on ${iso}?`);
          if(!ok) return;
        }
        try{
          Store.setLeave(userId, iso, next, { setBy: me.id, setByName: me.name||me.username });
          if(next){
            Store.addLog({ ts: Date.now(), teamId: selectedTeamId, actorId: me.id, actorName: me.name||me.username, action: 'LEAVE_SET', targetId: userId, msg: `${me.name||me.username} set ${want.toLowerCase()} leave`, detail: `Date ${iso}` });
            const u = Store.getUsers().find(x=>x.id===userId);
            addAudit(`LEAVE_SET_${want}`, userId, u ? (u.name||u.username) : null, `Date ${iso}`);
          } else {
            Store.addLog({ ts: Date.now(), teamId: selectedTeamId, actorId: me.id, actorName: me.name||me.username, action: 'LEAVE_CLEAR', targetId: userId, msg: `${me.name||me.username} cleared leave`, detail: `Date ${iso}` });
            const u = Store.getUsers().find(x=>x.id===userId);
            addAudit('LEAVE_CLEAR', userId, u ? (u.name||u.username) : null, `Date ${iso}`);
          }
        }catch(e){
          console.error('Leave toggle failed', e);
          UI.toast && UI.toast('Unable to update leave. Please refresh and try again.');
        }
        clearSelection();
        // Re-render the whole page section so leave buttons + sorting update immediately.
        renderAll();
      });
    });

    // Copy / mirror / duplicate features removed for a cleaner Team Lead workflow.
  }

  // Drag-to-move / resize on timeline segments
  (function(){
    const table = wrap.querySelector('#membersTable');
    let drag = null;
    let raf = null;
    let paintDrag = null; // {member, team, meta, rect, lastHour}

    // Selecting a member row should not require selecting a block.
    // This enables "Clear All" to work predictably and makes keyboard actions behave consistently.
    if(table){
      table.addEventListener('pointerdown', (e)=>{
        const row = e.target.closest('.members-row');
        if(!row) return;
        // If the click is on a block, the segment handler will manage selection/drag.
        if(e.target.closest('.seg')) return;
        if(e.target.closest('input.m-select') || e.target.closest('.m-selwrap')) return;
        const memberId = row.dataset.id;
        if(!memberId) return;
        // Select the member row, clear any block selection
        selMemberId = memberId;
        selMemberIds = new Set([memberId]);
        selIdx = new Set();
        updateSelectionUI();
        applySelectionStyles();
        applyMemberRowSelectionStyles();
    applyMemberRowSelectionStyles();
      });
    }

    function slotsFromBlocks(team, blocks){
      const meta = UI.shiftMeta(team);
      const hours = Math.ceil(meta.length / GRID_STEP_MIN);
      const slots = Array(hours).fill(null);
      for(const b of (blocks||[])){
        const s = Math.floor(UI.offsetFromShiftStart(team,b.start) / GRID_STEP_MIN);
        const e = Math.ceil(UI.offsetFromShiftStart(team,b.end) / GRID_STEP_MIN);
        for(let i=Math.max(0,s); i<Math.min(hours,e); i++) slots[i] = b.role;
      }
      return slots;
    }

    function blocksFromSlots(team, slots){
      const out = [];
      let curRole = slots[0] || null;
      let st = 0;
      for(let i=1;i<=slots.length;i++){
        const r = (i<slots.length) ? (slots[i]||null) : null;
        if(r !== curRole){
          if(curRole){
            out.push({ start: UI.offsetToHM(team, st*GRID_STEP_MIN), end: UI.offsetToHM(team, i*GRID_STEP_MIN), role: curRole });
          }
          curRole = r;
          st = i;
        }
      }
      return out;
    }

    function hourIndexFromX(rect, clientX, hours){
      const rel = (clientX - rect.left) / rect.width;
      const idx = Math.floor(rel * hours);
      return Math.max(0, Math.min(hours-1, idx));
    }

    function applyPaintHours(member, hoursToSet, role){
      const team = Config.teamById(member.teamId);
      const meta = UI.shiftMeta(team);
      const hours = Math.ceil(meta.length / GRID_STEP_MIN);
      const current = normalizeBlocks(team, Store.getUserDayBlocks(member.id, selectedDay));
      const slots = slotsFromBlocks(team, current);
      for(const h of hoursToSet){
        if(h<0 || h>=hours) continue;
        slots[h] = (role === '__clear__') ? null : role;
      }
      const updated = normalizeBlocks(team, blocksFromSlots(team, slots));
      Store.setUserDayBlocks(member.id, member.teamId, selectedDay, updated);
    }

    function roleAtHour(member, team, hourIdx){
      try{
        const meta = UI.shiftMeta(team);
        const hours = Math.ceil(meta.length / GRID_STEP_MIN);
        if(hourIdx < 0 || hourIdx >= hours) return null;
        const current = normalizeBlocks(team, Store.getUserDayBlocks(member.id, selectedDay));
        const slots = slotsFromBlocks(team, current);
        return slots[hourIdx] || null;
      }catch(e){
        return null;
      }
    }

    // If the paint gesture starts inside an existing block of the same role, treat the gesture
    // as a resize/trim request: keep only the painted hours for that contiguous role region.
    // This allows shortening (e.g., 4h -> 3h) without requiring users to manually switch to Clear.
    function trimRoleOutsideTouched(member, team, touchedHours, role){
      try{
        if(!touchedHours || !touchedHours.size) return;
        const meta = UI.shiftMeta(team);
        const hours = Math.ceil(meta.length / GRID_STEP_MIN);
        const current = normalizeBlocks(team, Store.getUserDayBlocks(member.id, selectedDay));
        const slots = slotsFromBlocks(team, current);
        const touched = Array.from(touchedHours).filter(h=>h>=0 && h<hours).sort((a,b)=>a-b);
        if(!touched.length) return;

        const touchedSet = new Set(touched);
        // Build contiguous segments from the painted hours.
        const segs = [];
        let a = touched[0], b = touched[0];
        for(let i=1;i<touched.length;i++){
          const h = touched[i];
          if(h === b + 1){ b = h; continue; }
          segs.push([a,b]);
          a = h; b = h;
        }
        segs.push([a,b]);

        for(const seg of segs){
          const s0 = seg[0], e0 = seg[1];
          // Trim left side
          let h = s0 - 1;
          while(h >= 0 && slots[h] === role && !touchedSet.has(h)){
            slots[h] = null;
            h--;
          }
          // Trim right side
          h = e0 + 1;
          while(h < hours && slots[h] === role && !touchedSet.has(h)){
            slots[h] = null;
            h++;
          }
        }

        const updated = normalizeBlocks(team, blocksFromSlots(team, slots));
        Store.setUserDayBlocks(member.id, member.teamId, selectedDay, updated);
      }catch(e){
        console.error('trimRoleOutsideTouched error', e);
      }
    }


    // Track cursor position for paste target
    table.addEventListener('pointermove', (e)=>{
      if(drag) return;
      const timeline = e.target.closest('.timeline');
      if(!timeline) return;
      const row = e.target.closest('.members-row');
      if(!row) return;
      if(row.dataset.inactive === '1') return;
      const memberId = row.dataset.id;
      const member = Store.getUsers().find(u=>u.id===memberId);
      if(!member) return;
      const team = Config.teamById(member.teamId);
      const meta = UI.shiftMeta(team);
      const rect = timeline.getBoundingClientRect();
      const rel = (e.clientX - rect.left) / rect.width;
      let off = UI.snapMinutes(Math.max(0, Math.min(meta.length, rel * meta.length)), GRID_STEP_MIN);
      if(off >= meta.length) off = meta.length - GRID_STEP_MIN;
      lastCursor = { memberId, offsetMin: off };
    });

    function getOffsets(team, block){
      return { s: UI.offsetFromShiftStart(team, block.start), e: UI.offsetFromShiftStart(team, block.end) };
    }
    function findConflicts(list, idx, s, e, team){
      const hits = [];
      for(let i=0;i<list.length;i++){
        if(i===idx) continue;
        const o = getOffsets(team, list[i]);
        if(e > o.s && s < o.e) hits.push(i);
      }
      return hits;
    }

    function flashConflict(seg, conflicts){
      if(!seg) return;
      const tl = seg.parentElement;
      const elems = [seg];
      (conflicts||[]).forEach(i=>{
        const other = tl.querySelector('.seg[data-idx="'+i+'"]');
        if(other) elems.push(other);
      });
      elems.forEach(el=>el.classList.add('conflict'));
      setTimeout(()=>elems.forEach(el=>el.classList.remove('conflict')), 450);
    }

    // Role picker popover (used after drag-to-create)
    let rolePicker = null;
    function hideRolePicker(){
      if(rolePicker){ rolePicker.remove(); rolePicker = null; }
      window.removeEventListener('pointerdown', onOutside, true);
      window.removeEventListener('keydown', onKey, true);
    }
    function onOutside(ev){
      if(!rolePicker) return;
      if(rolePicker.contains(ev.target)) return;
      hideRolePicker();
    }
    function onKey(ev){
      if(ev.key==='Escape') hideRolePicker();
    }
    function showRolePickerAt(x, y, initialRole, onPick){
      hideRolePicker();
      rolePicker = document.createElement('div');
      rolePicker.className = 'role-picker';
      const roleOptions = Object.keys(Config.SCHEDULES).map(k=>{
        const s = Config.SCHEDULES[k];
        return `<option value="${s.id}" ${s.id===initialRole?'selected':''}>${UI.esc(s.label)}</option>`;
      }).join('');
      rolePicker.innerHTML = `
        <div class="row">
          <div class="small" style="font-weight:800">Choose role</div>
          <button class="btn ghost" type="button" data-act="close">✕</button>
        </div>
        <div style="margin-top:8px">
          <select class="input" id="rpSel">${roleOptions}</select>
          <div class="quick" id="rpQuick"></div>
          <div class="row" style="margin-top:10px;justify-content:flex-end">
            <button class="btn primary" type="button" data-act="apply">Apply</button>
          </div>
        </div>
      `;
      document.body.appendChild(rolePicker);

      // position (keep on-screen)
      const pad = 10;
      const r = rolePicker.getBoundingClientRect();
      const vx = Math.min(window.innerWidth - r.width - pad, Math.max(pad, x - r.width/2));
      const vy = Math.min(window.innerHeight - r.height - pad, Math.max(pad, y + 12));
      rolePicker.style.left = vx + 'px';
      rolePicker.style.top = vy + 'px';

      const sel = rolePicker.querySelector('#rpSel');
      const quick = rolePicker.querySelector('#rpQuick');
      const quickIds = ['mailbox_manager','call_onqueue','back_office','lunch','block'];
      quick.innerHTML = quickIds.map(id=>{
        const s = Config.scheduleById(id);
        return s ? `<button class="btn" type="button" data-role="${s.id}">${UI.esc(s.icon||'')}${UI.esc(s.label)}</button>` : '';
      }).join('');
      quick.querySelectorAll('button[data-role]').forEach(b=>b.onclick=()=>{ sel.value=b.dataset.role; });

      rolePicker.querySelector('[data-act="close"]').onclick = hideRolePicker;
      rolePicker.querySelector('[data-act="apply"]').onclick = ()=>{ const val = sel.value; hideRolePicker(); onPick(val); };

      window.addEventListener('pointerdown', onOutside, true);
      window.addEventListener('keydown', onKey, true);
    }

    // Drag-to-create (default) OR rectangle select (Shift+Drag) on empty timeline space
    table.addEventListener('pointerdown', (e)=>{
      const timeline = e.target.closest('.timeline');
      if(!timeline) return;
      if(e.target.closest('.seg')) return;
      const row = e.target.closest('.members-row');
      if(!row) return;
      if(row.dataset.inactive === '1') return;
      const memberId = row.dataset.id;
      const member = Store.getUsers().find(u=>u.id===memberId);
      if(!member || !canEditTarget(member)) return;
      const team = Config.teamById(member.teamId);
      const meta = UI.shiftMeta(team);
      const blocks = normalizeBlocks(team, Store.getUserDayBlocks(member.id, selectedDay));

      // Paint mode: click+drag across hours
      if(paint.enabled && !e.shiftKey){
        const rect = timeline.getBoundingClientRect();
        const hours = Math.ceil(meta.length / GRID_STEP_MIN);
        const h0 = hourIndexFromX(rect, e.clientX, hours);
        const preSlots = slotsFromBlocks(team, normalizeBlocks(team, Store.getUserDayBlocks(member.id, selectedDay))).slice();
        const startedRoleBefore = preSlots[h0] || null;
        applyPaintHours(member, [h0], paint.role);
        paintDrag = { member, team, meta, timeline, rect, hours, lastHour: h0, touched: new Set([h0]), startedRoleBefore, preSlots };
        timeline.setPointerCapture(e.pointerId);
        return;
      }

      // Shift+Drag: rectangle multi-select (within the member row)
      if(e.shiftKey){
        const rect = timeline.getBoundingClientRect();
        const box = document.createElement('div');
        box.className = 'select-rect';
        box.style.left = '0%';
        box.style.width = '0%';
        timeline.appendChild(box);
        drag = { kind: 'rect', box, timeline, row, memberId, rect, x0: e.clientX, x1: e.clientX };
        timeline.setPointerCapture(e.pointerId);
        return;
      }

      const rect = timeline.getBoundingClientRect();
      const ghost = document.createElement('div');
      ghost.className = 'seg ghost ok';
      ghost.dataset.role = 'block';
      ghost.style.left = '0%';
      ghost.style.width = '0%';
      ghost.title = 'New block';
      ghost.innerHTML = '<span>⏱</span>';
      timeline.appendChild(ghost);

      drag = { kind: 'create', seg: ghost, timeline, member, team, meta, idx: -1, blocks, rect, x0: e.clientX, x1: e.clientX };
      ghost.setPointerCapture(e.pointerId);
    });

    table.addEventListener('pointerdown', (e)=>{
      const seg = e.target.closest('.seg');
      if(!seg) return;
      const row = e.target.closest('.members-row');
      if(!row) return;
      const memberId = row.dataset.id;
      const member = Store.getUsers().find(u=>u.id===memberId);
      if(!member || !canEditTarget(member)) return;

      // Paint mode: allow painting over existing segments too
      if(paint.enabled && !e.shiftKey){
        const timeline = seg.parentElement;
        const rect = timeline.getBoundingClientRect();
        const team = Config.teamById(member.teamId);
        const meta = UI.shiftMeta(team);
        const hours = Math.ceil(meta.length / GRID_STEP_MIN);
        const h0 = hourIndexFromX(rect, e.clientX, hours);
        const preSlots = slotsFromBlocks(team, normalizeBlocks(team, Store.getUserDayBlocks(member.id, selectedDay))).slice();
        const startedRoleBefore = preSlots[h0] || null;
        applyPaintHours(member, [h0], paint.role);
        paintDrag = { member, team, meta, timeline, rect, hours, lastHour: h0, touched: new Set([h0]), startedRoleBefore, preSlots };
        timeline.setPointerCapture(e.pointerId);
        return;
      }

      // Multi-select: Shift+Click toggles selection and does not start drag
      const idxSel = Number(seg.dataset.idx);
      if(e.shiftKey){
        if(selMemberId && selMemberId !== memberId){ clearSelection(); }
        selMemberId = memberId;
        if(selIdx.has(idxSel)) selIdx.delete(idxSel); else selIdx.add(idxSel);
        updateSelectionUI();
    applySelectionStyles();
    applyMemberRowSelectionStyles();
        return;
      }

      // Normal click selects the block (single) but still allows drag
      selMemberId = memberId;
      selIdx = new Set([idxSel]);
      updateSelectionUI();
    applySelectionStyles();
    applyMemberRowSelectionStyles();

      const team = Config.teamById(member.teamId);
      const meta = UI.shiftMeta(team);
      const idx = Number(seg.dataset.idx);
      const blocks = normalizeBlocks(team, Store.getUserDayBlocks(member.id, selectedDay));
      const b = blocks[idx];
      if(!b) return;

      const mode = e.target.classList.contains('l') ? 'resize-l' : e.target.classList.contains('r') ? 'resize-r' : 'move';
      if(b.role==='lunch' && mode!=='move') return; // fixed 1 hour lunch

      const rect = seg.parentElement.getBoundingClientRect();
      const o = getOffsets(team, b);
      drag = { seg, member, team, meta, idx, blocks, mode, rect, x0: e.clientX, s0:o.s, e0:o.e };
      seg.classList.add('dragging');
      seg.setPointerCapture(e.pointerId);
    });

    window.addEventListener('pointermove', (e)=>{
      if(paintDrag){
        const idx = hourIndexFromX(paintDrag.rect, e.clientX, paintDrag.hours);
        if(idx !== paintDrag.lastHour){
          const a = Math.min(paintDrag.lastHour, idx);
          const b = Math.max(paintDrag.lastHour, idx);
          const toSet = [];
          for(let h=a; h<=b; h++){
            if(!paintDrag.touched.has(h)){
              paintDrag.touched.add(h);
              toSet.push(h);
            }
          }
          if(toSet.length) applyPaintHours(paintDrag.member, toSet, paint.role);
          paintDrag.lastHour = idx;
        }
        return;
      }
      if(!drag) return;

      // rectangle select
      if(drag.kind==='rect'){
        drag.x1 = e.clientX;
        const xA = Math.min(drag.x0, drag.x1);
        const xB = Math.max(drag.x0, drag.x1);
        const relA = (xA - drag.rect.left) / drag.rect.width;
        const relB = (xB - drag.rect.left) / drag.rect.width;
        const leftPct = Math.max(0, Math.min(100, relA*100));
        const rightPct = Math.max(0, Math.min(100, relB*100));
        drag.box.style.left = leftPct + '%';
        drag.box.style.width = Math.max(0, rightPct-leftPct) + '%';
        return;
      }

      // create mode
      if(drag.kind==='create'){
        drag.x1 = e.clientX;
        const xA = Math.min(drag.x0, drag.x1);
        const xB = Math.max(drag.x0, drag.x1);
        const relA = (xA - drag.rect.left) / drag.rect.width;
        const relB = (xB - drag.rect.left) / drag.rect.width;
        let sMin = UI.snapMinutes(relA * drag.meta.length, GRID_STEP_MIN);
        let eMin = UI.snapMinutes(relB * drag.meta.length, GRID_STEP_MIN);
        if(eMin - sMin < GRID_STEP_MIN) eMin = sMin + GRID_STEP_MIN;
        sMin = Math.max(0, Math.min(sMin, drag.meta.length-GRID_STEP_MIN));
        eMin = Math.max(sMin+GRID_STEP_MIN, Math.min(eMin, drag.meta.length));
        const conflicts = findConflicts(drag.blocks, -1, sMin, eMin, drag.team);
        drag.seg.classList.toggle('bad', conflicts.length>0);
        drag.seg.classList.toggle('ok', conflicts.length==0);
        const left = (sMin/drag.meta.length)*100;
        const width = ((eMin-sMin)/drag.meta.length)*100;
        drag.seg.style.left = left + '%';
        drag.seg.style.width = width + '%';
        drag._s = sMin;
        drag._e = eMin;
        drag._conflicts = conflicts;
        drag.seg.title = 'New block ' + UI.offsetToHM(drag.team,sMin) + '–' + UI.offsetToHM(drag.team,eMin);
        return;
      }

      const dx = e.clientX - drag.x0;
      const dm = (dx / drag.rect.width) * drag.meta.length;
      let s = drag.s0;
      let e2 = drag.e0;
      const dur = drag.e0 - drag.s0;
      if(drag.mode==='move'){
        s = UI.snapMinutes(drag.s0 + dm, GRID_STEP_MIN);
        e2 = s + dur;
      } else if(drag.mode==='resize-l'){
        s = UI.snapMinutes(drag.s0 + dm, GRID_STEP_MIN);
      } else {
        e2 = UI.snapMinutes(drag.e0 + dm, GRID_STEP_MIN);
      }

      // lunch fixed 60 mins
      if(drag.blocks[drag.idx].role==='lunch'){
        const ns = UI.snapMinutes(s,GRID_STEP_MIN);
        s = ns;
        e2 = ns + GRID_STEP_MIN;
      }

      // clamp
      s = Math.max(0, Math.min(s, drag.meta.length-GRID_STEP_MIN));
      e2 = Math.max(s+GRID_STEP_MIN, Math.min(e2, drag.meta.length));
      if(drag.blocks[drag.idx].role==='lunch'){
        // ensure exactly 1 hour
        e2 = Math.min(drag.meta.length, s+GRID_STEP_MIN);
        if(e2 - s < GRID_STEP_MIN){ s = Math.max(0, e2-GRID_STEP_MIN); }
        e2 = s+GRID_STEP_MIN;
      }

      // overlap guard
      const conflicts = findConflicts(drag.blocks, drag.idx, s, e2, drag.team);
      if(conflicts.length){
        flashConflict(drag.seg, conflicts);
        return;
      }

      // live update DOM (throttled)
      if(raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(()=>{
        try{
          if(!drag || !drag.meta || !drag.seg || !drag.meta.length) return;
          const left = (s/drag.meta.length)*100;
        const width = ((e2-s)/drag.meta.length)*100;
        drag.seg.style.left = left + '%';
        drag.seg.style.width = width + '%';
        drag.seg.title = `${blockLabel(drag.blocks[drag.idx].role)} ${UI.offsetToHM(drag.team,s)}–${UI.offsetToHM(drag.team,e2)}`;
        drag._s = s; drag._e = e2;
        }catch(err){ console.error('RAF update error', err); }
      });
    });

    window.addEventListener('pointerup', (e)=>{
      if(paintDrag){
        const actor = Auth.getUser();
        if(actor){
          Store.addLog({
            ts: Date.now(),
            teamId: paintDrag.member.teamId,
            actorId: actor.id,
            actorName: actor.name||actor.username,
            action: 'SCHEDULE_PAINT',
            targetId: paintDrag.member.id,
            targetName: paintDrag.member.name||paintDrag.member.username,
            msg: `${actor.name||actor.username} painted ${paintDrag.touched.size} hour(s) for ${paintDrag.member.name||paintDrag.member.username}`,
            detail: `${UI.DAYS[selectedDay]} role=${paint.role}`
          });
        }
        // Support shortening (trim) of an existing block using paint.
        // Trim is only applied when the gesture STARTS inside an existing block of the same role.
        // This preserves the normal paint behavior when starting from empty hours (extend is allowed).
        if(paint.role !== '__clear__' && paintDrag.startedRoleBefore === paint.role){
          trimRoleOutsideTouched(paintDrag.member, paintDrag.team, paintDrag.touched, paint.role);
        }
        paintDrag = null;
        renderAll();
        return;
      }
      if(!drag) return;

      // finish rectangle selection
      if(drag.kind==='rect'){
        const row = drag.row;
        const memberId = drag.memberId;
        // remove box
        try{ drag.box.remove(); }catch(_e){}
        const xA = Math.min(drag.x0, drag.x1);
        const xB = Math.max(drag.x0, drag.x1);
        // select segments whose centers are inside [xA,xB]
        selMemberId = memberId;
        selIdx = new Set();
        const segs = row.querySelectorAll('.timeline .seg');
        segs.forEach(seg=>{
          const r = seg.getBoundingClientRect();
          const cx = r.left + r.width/2;
          if(cx >= xA && cx <= xB){
            const i = Number(seg.dataset.idx);
            if(Number.isFinite(i)) selIdx.add(i);
          }
        });
        updateSelectionUI();
    applySelectionStyles();
    applyMemberRowSelectionStyles();
        drag = null;
        return;
      }

      // finish create mode
      if(drag.kind==='create'){
        const sMin = (typeof drag._s==='number') ? drag._s : 0;
        const eMin = (typeof drag._e==='number') ? drag._e : (sMin + GRID_STEP_MIN);
        const conflicts = Array.isArray(drag._conflicts) ? drag._conflicts : [];

        // remove ghost
        try{ drag.seg.remove(); }catch(_e){}

        if(conflicts.length){
          const any = drag.timeline.querySelector('.seg[data-idx="'+conflicts[0]+'"]');
          if(any) flashConflict(any, conflicts.slice(1));
          drag = null;
          return;
        }

        // recompute with latest blocks (another edit might have happened)
        const current = normalizeBlocks(drag.team, Store.getUserDayBlocks(drag.member.id, selectedDay));
        const liveConf = findConflicts(current, -1, sMin, eMin, drag.team);
        if(liveConf.length){
          const any = drag.timeline.querySelector('.seg[data-idx="'+liveConf[0]+'"]');
          if(any) flashConflict(any, liveConf.slice(1));
          drag = null;
          renderAll();
          return;
        }

        // Ask role immediately after draw
        const member = drag.member;
        const team = drag.team;
        const actor = Auth.getUser();
        const startHM = UI.offsetToHM(team, sMin);
        const endHM = UI.offsetToHM(team, eMin);
        drag = null;

        showRolePickerAt(e.clientX, e.clientY, 'mailbox_manager', (role)=>{
          const nowCur = normalizeBlocks(team, Store.getUserDayBlocks(member.id, selectedDay));
          const conf2 = findConflicts(nowCur, -1, sMin, eMin, team);
          if(conf2.length){
            renderAll();
            const row = wrap.querySelector(`.members-row[data-id="${CSS.escape(member.id)}"]`);
            if(row){
              const any = row.querySelector('.timeline .seg');
              if(any) flashConflict(any, conf2);
            }
            return;
          }
          nowCur.push({ start: startHM, end: endHM, role: role || 'block' });
          const updated = normalizeBlocks(team, nowCur);
          Store.setUserDayBlocks(member.id, member.teamId, selectedDay, updated);
          if(actor){
            Store.addLog({
              ts: Date.now(),
              teamId: member.teamId,
              actorId: actor.id,
              actorName: actor.name||actor.username,
              action: 'SCHEDULE_CREATE',
              targetId: member.id,
              targetName: member.name||member.username,
              msg: `${actor.name||actor.username} created ${blockLabel(role||'block')} for ${member.name||member.username}`,
              detail: `${UI.DAYS[selectedDay]} ${startHM}-${endHM}`
            });
          }
          renderAll();
        });

        return;
      }
      drag.seg.classList.remove('dragging');
      const s = (typeof drag._s === 'number') ? drag._s : drag.s0;
      const e2 = (typeof drag._e === 'number') ? drag._e : drag.e0;

      // commit
      const updated = drag.blocks.slice();
      updated[drag.idx] = { ...updated[drag.idx], start: UI.offsetToHM(drag.team,s), end: UI.offsetToHM(drag.team,e2) };
      Store.setUserDayBlocks(drag.member.id, drag.member.teamId, selectedDay, updated);

      // log
      const actor = Auth.getUser();
      if(actor){
        Store.addLog({
          ts: Date.now(),
          teamId: drag.member.teamId,
          actorId: actor.id,
          actorName: actor.name||actor.username,
          action: 'SCHEDULE_UPDATE',
          targetId: drag.member.id,
          targetName: drag.member.name||drag.member.username,
          msg: `${actor.name||actor.username} updated schedule for ${drag.member.name||drag.member.username}`,
          detail: `${UI.DAYS[selectedDay]} ${updated[drag.idx].role} ${updated[drag.idx].start}-${updated[drag.idx].end}`
        });
        addAudit('SCHEDULE_UPDATE', drag.member.id, drag.member.name||drag.member.username, `${UI.DAYS[selectedDay]} ${updated[drag.idx].role} ${updated[drag.idx].start}-${updated[drag.idx].end}`);
      }
      drag = null;
      renderAll();
    });
  })();

  // Ctrl+C / Ctrl+V copy/paste within a member timeline
  const onKeydown = (ev)=>{
    if(!(ev.ctrlKey || ev.metaKey)) return;
    const tag = (ev.target && ev.target.tagName) ? ev.target.tagName.toLowerCase() : '';
    const inField = tag==='input' || tag==='textarea' || (ev.target && ev.target.isContentEditable);
    if(inField) return;

    // Copy/paste scheduling has been removed for Team Lead UX simplification.
  };
  window.addEventListener('keydown', onKeydown);


  // Delete / Backspace removes selected blocks immediately (when not typing)
  const onDeleteKey = (ev)=>{
    if(ev.key !== 'Delete' && ev.key !== 'Backspace') return;
    const tag = (ev.target && ev.target.tagName) ? ev.target.tagName.toLowerCase() : '';
    const inField = tag==='input' || tag==='textarea' || (ev.target && ev.target.isContentEditable);
    if(inField) return;
    if(selMemberId && selIdx && selIdx.size>0){
      ev.preventDefault();
      // Keyboard delete should be immediate (no confirm) for speed.
      deleteSelectedBlocks({ confirm: false });
    }
  };
  // Use capture to ensure Delete works instantly even if other handlers exist.
  document.addEventListener('keydown', onDeleteKey, true);
  // Cleanup when leaving page
  root._cleanup = ()=>{ window.removeEventListener('keydown', onKeydown); document.removeEventListener('keydown', onDeleteKey, true); };

  // Send schedule update notifications (Team Lead/Admin)
  const sendBtn = wrap.querySelector('#sendSchedule');
  const viewAcksBtn = wrap.querySelector('#viewAcks');
  const viewAuditBtn = wrap.querySelector('#viewAudit');
  const viewTrendBtn = wrap.querySelector('#viewTrend');
  const ackClose = wrap.querySelector('#ackClose');
  if(ackClose) ackClose.onclick = ()=>UI.closeModal('ackModal');
  const auditClose = wrap.querySelector('#auditClose');
  if(auditClose) auditClose.onclick = ()=>UI.closeModal('auditModal');
  const trendClose = wrap.querySelector('#trendClose');
  if(trendClose) trendClose.onclick = ()=>UI.closeModal('trendModal');

  function addAudit(action, targetId, targetName, detail){
    if(!Store.addAudit) return;
    const actor = Auth.getUser();
    if(!actor) return;
    Store.addAudit({
      id: (crypto && crypto.randomUUID) ? crypto.randomUUID() : ('a-'+Date.now()+Math.random().toString(16).slice(2)),
      ts: Date.now(),
      teamId: selectedTeamId,
      weekStartISO,
      actorId: actor.id,
      actorName: actor.name||actor.username,
      action,
      targetId: targetId||null,
      targetName: targetName||null,
      detail: detail||''
    });
  }

  function renderAckModal(notif){
    const title = wrap.querySelector('#ackTitle');
    const sub = wrap.querySelector('#ackSub');
    const body = wrap.querySelector('#ackBody');
    if(title) title.textContent = 'Acknowledgements';
    if(sub) sub.textContent = notif ? `Team ${Config.teamById(selectedTeamId).label} • Week of ${weekStartISO}` : 'No sent schedule yet for this week.';
    if(!body) return;
    if(!notif){ body.innerHTML = '<div class="muted">No schedule notification has been sent yet.</div>'; return; }
    const members = getMembersForView(selectedTeamId).filter(u=>u.role===Config.ROLES.MEMBER);
    const rows = members.map(m=>{
      const ts = notif.acks && notif.acks[m.id] ? new Date(notif.acks[m.id]).toLocaleString('en-US', { timeZone: Config.TZ }) : null;
      return `<div style="display:flex;justify-content:space-between;gap:12px;padding:10px 12px;border:1px solid rgba(255,255,255,.10);border-radius:14px;background:rgba(255,255,255,.02);margin-bottom:8px">
        <div><div style="font-weight:800">${UI.esc(m.name||m.username)}</div><div class="small muted">${UI.esc(m.username||'')}</div></div>
        <div class="small" style="text-align:right">
          ${ts ? `<span class="badge" style="color:var(--text)">✅ Acked</span><div class="small muted" style="margin-top:4px">${UI.esc(ts)}</div>` : `<span class="badge">⏳ Pending</span>`}
        </div>
      </div>`;
    }).join('');
    body.innerHTML = `<div class="small muted" style="margin-bottom:10px">${UI.esc(notif.title||'Schedule Updated')} • Sent ${new Date(notif.ts).toLocaleString('en-US', { timeZone: Config.TZ })}</div>${rows || '<div class="muted">No members found.</div>'}`;
  }

  function latestTeamNotif(){
    const list = Store.getTeamNotifs ? Store.getTeamNotifs(selectedTeamId) : [];
    return (list||[]).find(n => n && n.weekStartISO === weekStartISO) || (list||[])[0] || null;
  }

  function renderAuditModal(){
    const title = wrap.querySelector('#auditTitle');
    const sub = wrap.querySelector('#auditSub');
    const body = wrap.querySelector('#auditBody');
    if(title) title.textContent = 'Audit History';
    if(sub) sub.textContent = `Team ${Config.teamById(selectedTeamId).label} • Week of ${weekStartISO} (Manila)`;
    if(!body) return;
    const entries = Store.getWeekAudit ? Store.getWeekAudit(selectedTeamId, weekStartISO) : [];
    if(!entries.length){
      body.innerHTML = '<div class="muted">No audit events recorded for this week yet.</div>';
      return;
    }
    body.innerHTML = entries.map(e=>{
      const ts = new Date(e.ts).toLocaleString('en-US', { timeZone: Config.TZ });
      const who = UI.esc(e.actorName||'');
      const tgt = e.targetName ? ` • <span class="small" style="font-weight:800">${UI.esc(e.targetName)}</span>` : '';
      const det = e.detail ? `<div class="small muted" style="margin-top:4px;white-space:pre-wrap">${UI.esc(e.detail)}</div>` : '';
      return `<div class="audit-row">
        <div class="audit-left">
          <div style="font-weight:900">${UI.esc(e.action||'EVENT')}${tgt}</div>
          <div class="small muted">${who}</div>
          ${det}
        </div>
        <div class="audit-right small muted">${UI.esc(ts)}</div>
      </div>`;
    }).join('');
  }

  function dayHealthForWeek(team, members, weekStart, dayIdx){
    const iso = UI.addDaysISO(weekStart, Number(dayIdx)-1);
    const s = getAutoSettingsForTeam(team.id);
    const targetCall = (s.callMinPerHour||2);
    const active = (members||[]).filter(m=>{
      const leave = Store.getLeave ? Store.getLeave(m.id, iso) : null;
      const rest = isRestDay(m.teamId, m.id, iso);
      return !(leave || rest);
    });
    const planMap = {};
    for(const u of active){
      planMap[u.id] = normalizeBlocks(team, Store.getUserDayBlocks(u.id, dayIdx));
    }
    const cov = hourCoverage(team, active, planMap);
    const ok = cov.reduce((a,c)=>a+((c.mailboxMin===1 && c.callMin>=targetCall)?1:0),0);
    const tot = cov.length || 1;
    return Math.round((ok/tot)*100);
  }

  function renderTrendModal(){
    const title = wrap.querySelector('#trendTitle');
    const sub = wrap.querySelector('#trendSub');
    const body = wrap.querySelector('#trendBody');
    if(title) title.textContent = 'Health Trend';
    if(sub) sub.textContent = `Team ${Config.teamById(selectedTeamId).label} • last 8 weeks (Manila)`;
    if(!body) return;

    const team = Config.teamById(selectedTeamId);
    const members = getMembersForView(selectedTeamId).filter(u=>u.role===Config.ROLES.MEMBER);
    const weeks = [];
    for(let i=7;i>=0;i--){
      weeks.push(UI.addDaysISO(weekStartISO, -7*i));
    }
    const points = weeks.map(ws=>{
      const pcts = [1,2,3,4,5].map(d=>dayHealthForWeek(team, members, ws, d));
      const avg = Math.round(pcts.reduce((a,b)=>a+b,0)/pcts.length);
      return { ws, avg, pcts };
    });
    const max = 100, min = 0;
    const w = 560, h = 140, pad = 18;
    const xStep = (w-2*pad)/(points.length-1||1);
    const y = (v)=> pad + (h-2*pad) * (1 - (v-min)/(max-min));
    const poly = points.map((p,i)=>`${pad + i*xStep},${y(p.avg)}`).join(' ');
    body.innerHTML = `
      <div class="trend-card">
        <div class="small muted" style="margin-bottom:10px">Average Health (Mon–Fri). Lower values usually indicate coverage gaps caused by Rest Days or Leaves.</div>
        <svg class="trend-svg" viewBox="0 0 ${w} ${h}" role="img" aria-label="Health trend">
          <polyline points="${poly}" fill="none" stroke="currentColor" stroke-width="2" opacity="0.95" />
          ${points.map((p,i)=>`<circle cx="${pad + i*xStep}" cy="${y(p.avg)}" r="3" fill="currentColor" opacity="0.95" />`).join('')}
          <line x1="${pad}" y1="${y(50)}" x2="${w-pad}" y2="${y(50)}" stroke="currentColor" opacity="0.18" />
        </svg>
        <div class="trend-grid">
          ${points.map(p=>{
            return `<div class="trend-item">
              <div class="small muted">Week of</div>
              <div style="font-weight:900">${UI.esc(p.ws)}</div>
              <div class="badge" style="margin-top:6px;color:var(--text)">${UI.esc(p.avg)}%</div>
              <div class="small muted" style="margin-top:6px">Mon–Fri: ${p.pcts.join('% / ')}%</div>
            </div>`;
          }).join('')}
        </div>
      </div>
    `;
  }

  if(viewAcksBtn){
    viewAcksBtn.onclick = ()=>{
      renderAckModal(latestTeamNotif());
      UI.openModal('ackModal');
    };
  }

  if(viewAuditBtn){
    viewAuditBtn.onclick = ()=>{
      renderAuditModal();
      UI.openModal('auditModal');
    };
  }

  if(viewTrendBtn){
    viewTrendBtn.onclick = ()=>{
      renderTrendModal();
      UI.openModal('trendModal');
    };
  }

  if(sendBtn){
    sendBtn.onclick = ()=>{
      // Warn if sending for a past week (easy mistake)
      if(String(weekStartISO) < String(currentWeekStartISO())){
        const ok = window.confirm('You are about to send updates for a PAST week. Continue?');
        if(!ok) return;
      }
      const members = getMembersForView(selectedTeamId).filter(u=>u.role===Config.ROLES.MEMBER);
      if(!members.length){ alert('No members to notify on this team.'); return; }
      // Notice if some are unavailable today (rest/leave) to nudge TL for adjustments
      const isoToday = isoForDay(selectedDay);
      const unavailable = members.filter(m=>{
        const leave = Store.getLeave ? Store.getLeave(m.id, isoToday) : null;
        const rest = isRestDay(m.teamId, m.id, isoToday);
        return !!leave || !!rest;
      });
      if(unavailable.length){
        alert(`${unavailable.length} member(s) are unavailable on ${isoToday} (rest/leave). Auto mode can still adjust by skipping them, but please review coverage.`);
      }

      const team = Config.teamById(selectedTeamId);
      const notif = {
        id: (crypto && crypto.randomUUID) ? crypto.randomUUID() : ('n-'+Date.now()+Math.random().toString(16).slice(2)),
        ts: Date.now(),
        teamId: selectedTeamId,
        weekStartISO,
        fromId: me.id,
        fromName: me.name||me.username,
        title: 'Schedule Updated',
        body: `Your schedule has been updated for ${team.label} (week of ${weekStartISO}). Please acknowledge once reviewed.`,
        recipients: members.map(m=>m.id),
        acks: {}
      };
      Store.addNotif(notif);
      try{ ('BroadcastChannel' in window) && new BroadcastChannel('ums_schedule_updates').postMessage({ type:'notify', notifId: notif.id }); }catch(e){}
      Store.addLog({ ts: Date.now(), teamId: selectedTeamId, actorId: me.id, actorName: me.name||me.username, action: 'SCHEDULE_SEND', msg: `${me.name||me.username} sent schedule update notification`, detail: `WeekStart ${weekStartISO}` });
      addAudit('SCHEDULE_SEND', null, null, `Sent schedule update notification (week of ${weekStartISO})`);
      renderAckModal(notif);
      UI.openModal('ackModal');
    };
  }

  // Exports
  wrap.querySelector('#exportSchedule').onclick = ()=>{
    const members = getMembersForView(selectedTeamId);
    const rows = [["Team","Day","User","Role","Start","End"]];
    for(const m of members){
      const team = Config.teamById(m.teamId);
      for(let d=0; d<7; d++){
        const bl = Store.getUserDayBlocks(m.id, d);
        for(const b of (bl||[])) rows.push([team.label, UI.DAYS[d], m.name||m.username, Config.scheduleById(b.role)?.label||b.role, b.start, b.end]);
      }
    }
    UI.downloadCSV('team_schedules.csv', rows);
  };
  wrap.querySelector('#exportWorkload').onclick = ()=>{
    const members = getMembersForView(selectedTeamId);
    const weekStartMs = UI.manilaWeekStartMondayMs();
    const cases = Store.getCases();
    const dayLockedForGrid = isDayLocked(team.id, selectedDay);
    const rows = [["User","Team","MailboxHours","BackOfficeHours","CallOnqueHours","CasesAssignedThisWeek"]];
    for(const m of members){
      const totals = { mailbox:0, back:0, call:0 };
      for(let d=0; d<7; d++){
        const bl = Store.getUserDayBlocks(m.id, d);
        const t = Config.teamById(m.teamId);
        for(const b of (bl||[])){
          const mins = Math.max(0, UI.offsetFromShiftStart(t,b.end) - UI.offsetFromShiftStart(t,b.start));
          if(b.role==='back_office') totals.back += mins;
          else if(b.role==='call_onqueue' || b.role==='call_available') totals.call += mins;
          else if(b.role==='mailbox_manager' || b.role==='mailbox_call') totals.mailbox += mins;
        }
      }
      const toH = m=> (m/60).toFixed(2);
      const caseCount = cases.filter(c=>c.assigneeId===m.id && (c.createdAt||0) >= weekStartMs).length;
      rows.push([m.name||m.username, Config.teamById(m.teamId).label, toH(totals.mailbox), toH(totals.back), toH(totals.call), caseCount]);
    }
    UI.downloadCSV('team_workload.csv', rows);
  };

  renderDayTabs();
  renderAll();
};
