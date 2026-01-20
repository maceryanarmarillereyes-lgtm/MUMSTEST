
function eligibleForMailbox(u){
  return ['mailbox_manager','mailbox_call'].includes(u.schedule) && u.status==='active';
}

(window.Pages=window.Pages||{}, window.Pages.mailbox = function(root){
  // IMPORTANT: Duty changes over time (including during Super Admin override).
  // The UI must update labels/counts dynamically, not only the countdown.
  const users = Store.getUsers();
  const duty0 = UI.getDutyWindow(UI.mailboxNowParts ? UI.mailboxNowParts() : null);
  const curTeamUsers0 = users.filter(u=>u.teamId===duty0.current.id);
  const nextTeamUsers0 = users.filter(u=>u.teamId===duty0.next.id);
  const curElig0 = curTeamUsers0.filter(eligibleForMailbox);

  root.innerHTML = `
    <h2 style="margin:0 0 10px">Mailbox</h2>

    <div class="duty">
      <div class="box">
        <div class="small">Current Duty</div>
        <div id="mbCurDutyLbl" style="font-size:18px;font-weight:800;margin:4px 0">${duty0.current.label}</div>
        <div class="small">Eligible: <span id="mbCurEligCnt">${curElig0.length}</span></div>
      </div>
      <div class="box mid">
        <div class="row" style="justify-content:center;gap:8px;align-items:center">
          <div class="small">Manila Time</div>
          <span class="badge override" id="mbOverridePill" title="Mailbox time override is enabled (Super Admin testing)" style="display:none">OVERRIDE</span>
        </div>
        <div class="timer" id="dutyTimer">--:--:--</div>
        <div class="small">Until duty ends</div>
        <div class="small muted" id="mbOverrideNote" style="margin-top:4px;display:none">Countdown is in override mode</div>
      </div>
      <div class="box">
        <div class="small">Next Duty</div>
        <div id="mbNextDutyLbl" style="font-size:18px;font-weight:800;margin:4px 0">${duty0.next.label}</div>
        <div class="small">Users: <span id="mbNextUsersCnt">${nextTeamUsers0.length}</span></div>
      </div>
    </div>

    <div class="row" style="justify-content:space-between;align-items:flex-end;gap:12px;flex-wrap:wrap">
      <div>
        <div class="small">Auto-assign uses round-robin among eligible users on current duty (Mailbox Manager or Mailbox+Call). Skips inactive users.</div>
      </div>
      <div class="row" style="gap:8px">
        <button class="btn" id="btnAddCase">Add Case</button>
        <button class="btn primary" id="btnAutoAssign">Auto Assign Next</button>
      </div>
    </div>

    <table class="table" style="margin-top:10px">
      <thead>
        <tr><th>Case</th><th>Assigned</th><th>Status</th><th>Actions</th></tr>
      </thead>
      <tbody>
        ${Store.getCases().map(c=>{
          const assignee = users.find(u=>u.id===c.assigneeId);
          const sched = assignee? Config.scheduleById(assignee.schedule): null;
          const badge = assignee ? `${UI.esc(assignee.name||assignee.username)} ${sched? '('+sched.icon+')':''}` : '—';
          return `<tr>
            <td>${UI.esc(c.title)}</td>
            <td>${badge}</td>
            <td class="small">${UI.esc(c.status)}</td>
            <td>
              <div class="row" style="gap:8px">
                <button class="btn" data-act="assign" data-id="${c.id}">Assign</button>
                <button class="btn danger" data-act="del" data-id="${c.id}">Delete</button>
              </div>
            </td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>

    <div class="modal" id="caseModal">
      <div class="panel">
        <div class="head">
          <div>
            <div class="announce-title" id="caseTitle">Add Case</div>
            <div class="small">Create a mailbox case and assign it.</div>
          </div>
          <button class="btn ghost" data-close="caseModal">✕</button>
        </div>
        <div class="body">
          <div class="grid2">
            <div>
              <label class="small">Case title</label>
              <input class="input" id="c_title" placeholder="Case #123" />
            </div>
            <div>
              <label class="small">Assign to (optional)</label>
              <select class="select" id="c_assignee">
                <option value="">Unassigned</option>
                ${users.map(u=>`<option value="${u.id}">${u.name||u.username} (${Config.teamById(u.teamId).label})</option>`).join('')}
              </select>
            </div>
          </div>
          <div class="err" id="c_err"></div>
          <div class="row" style="justify-content:flex-end;margin-top:12px">
            <button class="btn" data-close="caseModal">Cancel</button>
            <button class="btn primary" id="btnSaveCase">Save</button>
          </div>
        </div>
      </div>
    </div>
  `;

  // timer
  const tick = ()=>{
    const d = UI.getDutyWindow(UI.mailboxNowParts ? UI.mailboxNowParts() : null);
    const el = UI.el('#dutyTimer');
    if(el) el.textContent = UI.formatDuration(d.secLeft);

    // Keep shift labels and counts in sync with the active duty window.
    const curLbl = UI.el('#mbCurDutyLbl');
    const nextLbl = UI.el('#mbNextDutyLbl');
    const curCnt = UI.el('#mbCurEligCnt');
    const nextCnt = UI.el('#mbNextUsersCnt');
    if(curLbl) curLbl.textContent = d.current.label;
    if(nextLbl) nextLbl.textContent = d.next.label;
    if(curCnt || nextCnt){
      const all = Store.getUsers();
      const curTeamUsers = all.filter(u=>u.teamId===d.current.id);
      const nextTeamUsers = all.filter(u=>u.teamId===d.next.id);
      const curElig = curTeamUsers.filter(eligibleForMailbox);
      if(curCnt) curCnt.textContent = String(curElig.length);
      if(nextCnt) nextCnt.textContent = String(nextTeamUsers.length);
    }

    try{
      const me = (window.Auth && Auth.getUser) ? (Auth.getUser()||{}) : {};
      const isSA = (me.role === (window.Config&&Config.ROLES?Config.ROLES.SUPER_ADMIN:'SUPER_ADMIN'));
      const ov = (isSA && window.Store && Store.getMailboxTimeOverride) ? Store.getMailboxTimeOverride() : null;
      const on = !!(ov && ov.enabled && ov.ms);
      const pill = UI.el('#mbOverridePill');
      const note = UI.el('#mbOverrideNote');
      if(pill) pill.style.display = on ? 'inline-flex' : 'none';
      if(note) note.style.display = on ? 'block' : 'none';
    }catch(_){ }
  };
  tick();
  const interval = setInterval(()=>{ try{ tick(); }catch(e){ console.error('Mailbox tick error', e); } }, 1000);
  root._cleanup = ()=>clearInterval(interval);

  UI.el('#btnAddCase').onclick = ()=>openCaseModal();
  UI.el('#btnAutoAssign').onclick = ()=>autoAssignNext();

  root.addEventListener('click',(e)=>{
    const btn = e.target.closest('button');
    if(!btn) return;
    const act = btn.dataset.act;
    const id = btn.dataset.id;
    if(act==='del'){
      if(confirm('Delete case?')){
        const c = Store.getCases().find(x=>x.id===id);
        Store.saveCases(Store.getCases().filter(x=>x.id!==id));
        const actor = Auth.getUser();
        if(actor) Store.addLog({ ts: Date.now(), teamId: actor.teamId, actorId: actor.id, actorName: actor.name||actor.username, action:'CASE_DELETE', targetId:id, targetName:c?.title||'Case', msg:`${actor.name||actor.username} deleted a case`, detail: c?.title||'' });
        window.location.hash='#mailbox';
      }
    }
    if(act==='assign'){
      const c = Store.getCases().find(x=>x.id===id);
      if(!c) return;
      const u = pickNextEligible();
      if(!u) return alert('No eligible users on current duty. Assign schedules first.');
      Store.saveCases(Store.getCases().map(x=>x.id===id ? { ...x, assigneeId: u.id, status:'Assigned' } : x));
      const actor = Auth.getUser();
      const dNow = UI.getDutyWindow(UI.mailboxNowParts ? UI.mailboxNowParts() : null);
      if(actor) Store.addLog({ ts: Date.now(), teamId: dNow.current.id, actorId: actor.id, actorName: actor.name||actor.username, action:'CASE_ASSIGN', targetId:id, targetName:c.title, msg:`${actor.name||actor.username} assigned a case`, detail:`${c.title} -> ${u.name||u.username}` });
      window.location.hash='#mailbox';
    }
  });

  root.querySelectorAll('[data-close="caseModal"]').forEach(b=>b.onclick=()=>UI.closeModal('caseModal'));

  function pickNextEligible(){
    const d = UI.getDutyWindow(UI.mailboxNowParts ? UI.mailboxNowParts() : null);
    const eligible = Store.getUsers().filter(u=>u.teamId===d.current.id).filter(eligibleForMailbox);
    if(!eligible.length) return null;
    const rr = Store.getRR();
    const key = d.current.id;
    const idx = rr[key] ?? 0;
    const u = eligible[idx % eligible.length];
    rr[key] = (idx+1) % eligible.length;
    Store.saveRR(rr);
    return u;
  }

  function autoAssignNext(){
    const cases = Store.getCases();
    const next = cases.find(c=>!c.assigneeId);
    if(!next) return alert('No unassigned cases.');
    const u = pickNextEligible();
    if(!u) return alert('No eligible users on current duty. Assign schedules first.');
    next.assigneeId = u.id;
    next.status = 'Assigned';
    Store.saveCases(cases);
    const actor = Auth.getUser();
    const dNow = UI.getDutyWindow(UI.mailboxNowParts ? UI.mailboxNowParts() : null);
    if(actor) Store.addLog({ ts: Date.now(), teamId: dNow.current.id, actorId: actor.id, actorName: actor.name||actor.username, action:'CASE_AUTO_ASSIGN', targetId: next.id, targetName: next.title, msg:`${actor.name||actor.username} auto-assigned a case`, detail:`${next.title} -> ${u.name||u.username}` });
    window.location.hash='#mailbox';
  }

  function openCaseModal(){
    UI.el('#c_err').style.display='none';
    UI.el('#caseTitle').textContent='Add Case';
    UI.el('#c_title').value='';
    UI.el('#c_assignee').value='';

    UI.el('#btnSaveCase').onclick = ()=>{
      const title = UI.el('#c_title').value.trim();
      const assigneeId = UI.el('#c_assignee').value || null;
      const err = msg=>{ const el=UI.el('#c_err'); el.textContent=msg; el.style.display='block'; };
      if(!title) return err('Case title required.');
      const list = Store.getCases();
      const newCase = { id: crypto.randomUUID(), title, assigneeId, status: assigneeId ? 'Assigned' : 'Unassigned', createdAt: Date.now() };
      list.unshift(newCase);
      Store.saveCases(list);
      const actor = Auth.getUser();
      if(actor) Store.addLog({ ts: Date.now(), teamId: actor.teamId, actorId: actor.id, actorName: actor.name||actor.username, action:'CASE_CREATE', targetId:newCase.id, targetName:title, msg:`${actor.name||actor.username} created a case`, detail: title });
      UI.closeModal('caseModal');
      window.location.hash='#mailbox';
    };

    UI.openModal('caseModal');
  }
}
);
