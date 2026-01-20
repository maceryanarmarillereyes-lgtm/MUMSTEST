(window.Pages = window.Pages || {});

window.Pages.master_schedule = function(root){
  const me = Auth.requireUser();
  if(!me) return;

  const isSuper = me.role === Config.ROLES.SUPER_ADMIN;
  const isAdmin = isSuper || me.role === Config.ROLES.ADMIN;
  const isLead = me.role === Config.ROLES.TEAM_LEAD;

  if(!(isLead || isAdmin || isSuper) || !Config.can(me, 'view_master_schedule')){
    root.innerHTML = '<div class="h1">Master Schedule</div><div class="muted">You do not have access to this page.</div>';
    return;
  }

  let teamId = isLead ? me.teamId : (Config.TEAMS[0] && Config.TEAMS[0].id);
  let master = Store.getTeamMaster(teamId) || { updatedAt: 0, frequencyMonths: 1, members: {} };

  function membersForTeam(tid){
    const users = Store.getUsers();
    return users
      .filter(u=>u && u.teamId===tid && u.role===Config.ROLES.MEMBER)
      .sort((a,b)=>String(a.name||a.username||'').localeCompare(String(b.name||b.username||'')));
  }

  function render(){
    master = Store.getTeamMaster(teamId) || { updatedAt: 0, frequencyMonths: 1, members: {} };
    const team = Config.teamById(teamId);
    const list = membersForTeam(teamId);

    const fmtUpdated = master.updatedAt ? new Date(master.updatedAt).toLocaleString('en-US', { timeZone: Config.TZ }) : '—';

    root.innerHTML = `
      <div class="ms-hero">
        <div>
          <div class="h1" style="margin-bottom:4px">Master Schedule</div>
          <div class="small muted" style="max-width:860px">Set each member’s fixed rest day(s) and the rotation frequency. These rules automatically gray out members in the scheduling page with an <b>ON REST DAY</b> notice.</div>
          <div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap;align-items:center">
            <span class="badge">Team: <b style="color:var(--text)">${UI.esc(team.label)}</b></span>
            <span class="badge">Last updated: <b style="color:var(--text)">${UI.esc(fmtUpdated)}</b></span>
            <span class="badge">Rule: <b style="color:var(--text)">1–2 rest days</b></span>
          </div>
        </div>
        <div class="ms-actions">
          ${isLead ? '' : `
            <label class="small">Team
              <select class="input" id="msTeam">
                ${Config.TEAMS.map(t=>`<option value="${t.id}" ${t.id===teamId?'selected':''}>${UI.esc(t.label)}</option>`).join('')}
              </select>
            </label>
          `}
          <label class="small">Frequency
            <select class="input" id="msFreq">
              <option value="1" ${Number(master.frequencyMonths||1)===1?'selected':''}>Monthly</option>
              <option value="2" ${Number(master.frequencyMonths||1)===2?'selected':''}>Every 2 months</option>
              <option value="3" ${Number(master.frequencyMonths||1)===3?'selected':''}>Every 3 months</option>
              <option value="4" ${Number(master.frequencyMonths||1)===4?'selected':''}>Quarterly</option>
            </select>
          </label>
          <button class="btn primary" type="button" id="openMembers">Open Members Scheduling</button>
        </div>
      </div>

      <div class="card pad" style="margin-top:12px">
        <div class="ms-list">
          ${list.map(m=>{
            const cur = (master.members && master.members[m.id]) ? master.members[m.id] : { restWeekdays: [], startISO: UI.manilaNow().isoDate };
            const rs = Array.isArray(cur.restWeekdays) ? cur.restWeekdays : [];
            const startISO = cur.startISO || UI.manilaNow().isoDate;
            const initial = String(m.name||m.username||'?').trim().slice(0,1).toUpperCase();
            const chips = UI.DAYS.map((d,i)=>{
              const on = rs.includes(i) ? 'on' : '';
              return `<button type="button" class="chipbtn ${on}" data-wd="${i}" title="${UI.esc(d)}">${UI.esc(d.slice(0,3))}</button>`;
            }).join('');
            return `
              <div class="ms-item" data-id="${UI.esc(m.id)}">
                <div class="ms-id">
                  <div class="ms-avatar">${UI.esc(initial)}</div>
                  <div>
                    <div class="ms-title">${UI.esc(m.name||m.username)}</div>
                    <div class="small muted">${UI.esc(m.username||'')}</div>
                  </div>
                </div>
                <div>
                  <div class="small muted" style="margin-bottom:6px">Rest day(s)</div>
                  <div class="weekday-chips" data-field="rest">${chips}</div>
                  <div class="small muted" style="margin-top:6px">Select up to 2.</div>
                </div>
                <div>
                  <div class="small muted" style="margin-bottom:6px">Effective start</div>
                  <input class="input" type="date" data-field="start" value="${UI.esc(startISO)}" />
                </div>
                <div class="ms-save">
                  <button class="btn" type="button" data-save="1">Save</button>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;

    if(!isLead){
      const sel = UI.el('#msTeam', root);
      if(sel) sel.onchange = ()=>{ teamId = sel.value; render(); };
    }
    const freq = UI.el('#msFreq', root);
    if(freq) freq.onchange = ()=>{
      const t = Store.getTeamMaster(teamId) || { updatedAt: 0, frequencyMonths: 1, members: {} };
      t.frequencyMonths = Number(freq.value||1);
      t.updatedAt = Date.now();
      Store.setTeamMaster(teamId, t);
      Store.addLog({ ts: Date.now(), teamId, actorId: me.id, actorName: me.name||me.username, action: 'MASTER_SCHEDULE_FREQUENCY', msg: `${me.name||me.username} set master schedule frequency to ${t.frequencyMonths} month(s)`, detail: `Team ${teamId}` });
      render();
    };

    const openMembers = UI.el('#openMembers', root);
    if(openMembers) openMembers.onclick = ()=>{ window.location.hash = '#members'; };

    UI.els('.ms-item', root).forEach(row=>{
      const userId = row.getAttribute('data-id');
      const btn = row.querySelector('[data-save]');
      const chipWrap = row.querySelector('[data-field="rest"]');

      // chip toggle (max 2)
      if(chipWrap){
        chipWrap.querySelectorAll('button.chipbtn').forEach(ch=>{
          ch.addEventListener('click', ()=>{
            const isOn = ch.classList.contains('on');
            if(isOn){
              ch.classList.remove('on');
              return;
            }
            const onCount = chipWrap.querySelectorAll('button.chipbtn.on').length;
            if(onCount >= 2) return; // strict 1–2 rule
            ch.classList.add('on');
          });
        });
      }
      if(btn) btn.onclick = ()=>{
        const startInp = row.querySelector('[data-field="start"]');
        const rest = Array.from(row.querySelectorAll('button.chipbtn.on')).map(b=>Number(b.dataset.wd)).filter(n=>Number.isFinite(n));
        const startISO = String(startInp.value||UI.manilaNow().isoDate);
        Store.setMasterMember(teamId, userId, { restWeekdays: rest, startISO });

        const t = Store.getTeamMaster(teamId) || { updatedAt: 0, frequencyMonths: 1, members: {} };
        if(!t.frequencyMonths) t.frequencyMonths = 1;
        // persist team wrapper updatesAt too
        t.updatedAt = Date.now();
        Store.setTeamMaster(teamId, t);

        Store.addLog({ ts: Date.now(), teamId, actorId: me.id, actorName: me.name||me.username, action: 'MASTER_SCHEDULE_MEMBER', targetId: userId, msg: `${me.name||me.username} updated master rest days`, detail: `Member ${userId}` });
        // soft feedback
        btn.textContent = 'Saved';
        setTimeout(()=>{ btn.textContent='Save'; }, 900);
      };
    });
  }

  render();
};
