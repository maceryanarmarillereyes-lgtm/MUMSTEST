
function canEdit(actor, target){
  if(actor.role===Config.ROLES.SUPER_ADMIN) return true;
  if(target.role===Config.ROLES.SUPER_ADMIN) return false;
  if(actor.role===Config.ROLES.ADMIN) return true;
  if(actor.role===Config.ROLES.TEAM_LEAD){
    return target.teamId===actor.teamId && target.role!==Config.ROLES.ADMIN;
  }
  return false;
}

function canSchedule(actor, target){
  // Schedule changes are an additional setting (NOT part of creation)
  // Allowed: SUPER_ADMIN / ADMIN, or TEAM_LEAD for members in their own team.
  if(!actor || !target) return false;
  if(target.role!==Config.ROLES.MEMBER) return false;
  if(actor.role===Config.ROLES.SUPER_ADMIN) return true;
  if(actor.role===Config.ROLES.ADMIN) return true;
  if(actor.role===Config.ROLES.TEAM_LEAD) return target.teamId===actor.teamId;
  return false;
}

function canCreateRole(actor, role){
  if(actor.role===Config.ROLES.SUPER_ADMIN) return true;
  if(actor.role===Config.ROLES.ADMIN) return role!==Config.ROLES.SUPER_ADMIN;
  if(actor.role===Config.ROLES.TEAM_LEAD) return role===Config.ROLES.MEMBER;
  return false;
}

(window.Pages=window.Pages||{}, window.Pages.users = function(root){
  const actor = Auth.getUser();
  let users = Store.getUsers();

  root.innerHTML = `
    <div class="row" style="justify-content:space-between;align-items:flex-end;gap:12px;flex-wrap:wrap">
      <div>
        <h2 style="margin:0 0 6px">User Management</h2>
        <div class="small">Create users and assign roles, teams, and schedules. Super User (MEYS) controls everything.</div>
      </div>
      <div class="row" style="gap:8px">
        <button class="btn" id="btnExportUsers">Export Users</button>
        <button class="btn" id="btnImportUsers">Import Users</button>
        <button class="btn primary" id="btnAddUser">Add User</button>
      </div>
    </div>

    <table class="table" style="margin-top:10px">
      <thead>
        <tr><th>Name</th><th>Login</th><th>Role</th><th>Team</th><th>Schedule</th><th>Actions</th></tr>
      </thead>
      <tbody>
        ${users.map(u=>{
          const team = Config.teamById(u.teamId);
          const sched = Config.scheduleById(u.schedule);
          const can = canEdit(actor,u);
          return `
            <tr>
              <td>${UI.esc(u.name||u.username)}</td>
              <td><div class="small">${UI.esc(u.username)}</div><div class="small">${UI.esc(u.email||'')}</div></td>
              <td>${UI.esc(u.role)}</td>
              <td>${UI.esc(team.label)}</td>
              <td>${sched? UI.schedulePill(sched.id): '<span class="small">—</span>'}</td>
              <td>
                <div class="row" style="gap:8px">
                  <button class="btn" data-act="profile" data-id="${u.id}">Profile</button>
                  <button class="btn" data-act="edit" data-id="${u.id}" ${can?'':'disabled'}>Edit</button>
                  <button class="btn danger" data-act="del" data-id="${u.id}" ${can && u.username!=='MEYS'?'':'disabled'}>Delete</button>
                </div>
              </td>
            </tr>
          `;
        }).join('')}
      </tbody>
    </table>

    <div class="modal" id="profileModal" aria-hidden="true">
      <div class="panel">
        <div class="head">
          <div>
            <div class="announce-title" id="p_title">User Profile</div>
            <div class="small" id="p_sub">Manage account and scheduling.</div>
          </div>
          <button class="btn ghost" data-close="profileModal">✕</button>
        </div>
        <div class="body">
          <div class="tabs">
            <button class="tab active" id="tabAccount" type="button">Account</button>
            <button class="tab" id="tabScheduling" type="button">Scheduling</button>
          </div>

          <div id="panelAccount"></div>
          <div id="panelScheduling" style="display:none"></div>
        </div>
      </div>
    </div>

    <div class="modal" id="userModal" aria-hidden="true">
      <div class="panel">
        <div class="head">
          <div>
            <div class="announce-title" id="userModalTitle">Add User</div>
            <div class="small">Create credentials so members can log in.</div>
          </div>
          <button class="btn ghost" data-close="userModal">✕</button>
        </div>
        <div class="body">
          <div class="grid2">
            <div>
              <label class="small">Full name</label>
              <input class="input" id="u_name" placeholder="Juan Dela Cruz" />
            </div>
            <div>
              <label class="small">Username</label>
              <input class="input" id="u_username" placeholder="jdelacruz" />
            </div>
            <div>
              <label class="small">Email (optional)</label>
              <input class="input" id="u_email" placeholder="user@company.com" />
            </div>
            <div>
              <label class="small">Password</label>
              <input class="input" id="u_password" type="password" placeholder="••••••••" />
            </div>
            <div>
              <label class="small">Role</label>
              <select class="select" id="u_role"></select>
            </div>
            <div>
              <label class="small">Team</label>
              <select class="select" id="u_team"></select>
            </div>
            <!-- Schedule and Status removed from creation (managed in Profile > Scheduling) -->
          </div>
          <div class="err" id="u_err"></div>
          <div class="row" style="justify-content:flex-end;margin-top:12px">
            <button class="btn" data-close="userModal">Cancel</button>
            <button class="btn primary" id="btnSaveUser">Save</button>
          </div>
        </div>
      </div>
    </div>
  `;

  // fill selects
  const roleSel = UI.el('#u_role');
  const teamSel = UI.el('#u_team');
  // schedule assignment is handled in the Profile modal

  roleSel.innerHTML = Object.values(Config.ROLES)
    .filter(r=>canCreateRole(actor,r))
    .map(r=>`<option value="${r}">${r}</option>`).join('');

  teamSel.innerHTML = Config.TEAMS.map(t=>`<option value="${t.id}">${t.label}</option>`).join('');
  // (no schedule select in Add User)

  // events
  UI.el('#btnAddUser').onclick = ()=>openUserModal(actor, null);
  UI.el('#btnExportUsers').onclick = ()=>UI.downloadJSON('users.json', Store.getUsers());
  UI.el('#btnImportUsers').onclick = async()=>{
    const data = await UI.pickJSON();
    if(!Array.isArray(data)) return alert('Invalid JSON. Expected an array of users.');
    // apply restrictions
    const incoming = data.filter(u=>u && u.username);
    const cleaned = incoming.map(u=>({
      id: u.id || crypto.randomUUID(),
      username: String(u.username),
      email: u.email||'',
      name: u.name||u.username,
      role: u.role||Config.ROLES.MEMBER,
      teamId: u.teamId||Config.TEAMS[0].id,
      schedule: u.schedule||'back_office',
      status: u.status||'active',
      passwordHash: u.passwordHash || '',
      createdAt: u.createdAt || Date.now(),
    }));

    const existing = Store.getUsers();
    const meys = existing.find(u=>u.username==='MEYS');

    let finalUsers = cleaned;
    // Enforce: only SUPER_ADMIN can import SUPER_ADMIN
    if(actor.role!==Config.ROLES.SUPER_ADMIN){
      finalUsers = finalUsers.map(u=> (u.role===Config.ROLES.SUPER_ADMIN ? { ...u, role: Config.ROLES.MEMBER } : u));
    }
    // Team lead imports only their team
    if(actor.role===Config.ROLES.TEAM_LEAD){
      finalUsers = finalUsers.map(u=>({ ...u, role: Config.ROLES.MEMBER, teamId: actor.teamId }));
    }

    // keep MEYS always
    finalUsers = [meys, ...finalUsers.filter(u=>u.username!=='MEYS')];
    Store.saveUsers(finalUsers);
    window.location.hash = '#users';
  };

  root.addEventListener('click', (e)=>{
    const btn = e.target.closest('button');
    if(!btn) return;
    const act = btn.dataset.act;
    const id = btn.dataset.id;
    if(act==='edit'){
      const u = Store.getUsers().find(x=>x.id===id);
      if(u) openUserModal(actor, u);
    }
    if(act==='profile'){
      const u = Store.getUsers().find(x=>x.id===id);
      if(u) openProfileModal(actor, u);
    }
    if(act==='del'){
      const u = Store.getUsers().find(x=>x.id===id);
      if(!u) return;
      if(u.username==='MEYS') return;
      if(confirm(`Delete ${u.username}?`)){
        Store.deleteUser(id);
        window.location.hash = '#users';
      }
    }
  });

  // modal close
  root.querySelectorAll('[data-close="userModal"]').forEach(b=>b.onclick=()=>UI.closeModal('userModal'));
  root.querySelectorAll('[data-close="profileModal"]').forEach(b=>b.onclick=()=>UI.closeModal('profileModal'));

  function openUserModal(actor, user){
    UI.el('#u_err').style.display='none';
    UI.el('#userModalTitle').textContent = user ? 'Edit User' : 'Add User';

    UI.el('#u_name').value = user?.name || '';
    UI.el('#u_username').value = user?.username || '';
    UI.el('#u_email').value = user?.email || '';
    UI.el('#u_password').value = '';
    UI.el('#u_role').value = user?.role || roleSel.value;
    UI.el('#u_team').value = user?.teamId || Config.TEAMS[0].id;
    // schedule/status managed separately

    // lock editing Super Admin unless actor is Super Admin
    if(user?.role===Config.ROLES.SUPER_ADMIN && actor.role!==Config.ROLES.SUPER_ADMIN){
      UI.el('#btnSaveUser').disabled=true;
    } else {
      UI.el('#btnSaveUser').disabled=false;
    }

    UI.el('#btnSaveUser').onclick = async ()=>{
      const name = UI.el('#u_name').value.trim();
      const username = UI.el('#u_username').value.trim();
      const email = UI.el('#u_email').value.trim();
      const password = UI.el('#u_password').value;
      const role = UI.el('#u_role').value;
      const teamId = UI.el('#u_team').value;
      // schedule/status not part of creation form

      const err = (msg)=>{ const el=UI.el('#u_err'); el.textContent=msg; el.style.display='block'; };

      if(!name) return err('Name is required.');
      if(!username) return err('Username is required.');
      if(!/^[a-zA-Z0-9._-]{3,}$/.test(username)) return err('Username must be at least 3 characters and use letters/numbers/._-');

      // uniqueness
      const existing = Store.getUsers();
      // Defensive: legacy/corrupt user records may be missing username.
      const dup = existing.find(u=>String(u?.username||'').toLowerCase()===username.toLowerCase() && u?.id!==user?.id);
      if(dup) return err('Username already exists.');

      // role restrictions
      if(!canCreateRole(actor, role) && user?.role!==role) return err('You do not have permission to set that role.');
      if(actor.role===Config.ROLES.TEAM_LEAD && teamId!==actor.teamId) return err('Team Lead can only manage users in their team.');

      if(user){
        const patch = { name, username, email, role, teamId };
        if(password) patch.passwordHash = Auth.hash(password);
        Store.updateUser(user.id, patch);
        Store.addLog({
          ts: Date.now(),
          teamId: teamId,
          actorId: actor.id,
          actorName: actor.name||actor.username,
          action: 'USER_UPDATE',
          targetId: user.id,
          targetName: user.name||user.username,
          msg: `${actor.name||actor.username} updated user ${name}`,
          detail: `Role=${role}, Team=${Config.teamById(teamId).label}`
        });
      } else {
        if(!password) return err('Password is required for new users.');

        // If Supabase is configured, create the user in Supabase Auth via Edge Function
        // so the account works on any device/browser.
        if (window.SB && SB.isEnabled && SB.isEnabled()) {
          try {
            await SB.adminCreateUser({
              email,
              password,
              user_metadata: { full_name: name, username },
              profile: { username, full_name: name, role, team_id: teamId, status: 'active' }
            });
            await SB.syncUsersToLocalStore(Store);
          } catch (e) {
            const msg = (e && (e.message || e.error_description)) ? (e.message || e.error_description) : String(e);
            return err(`Failed to create user in Supabase: `);
          }

          UI.closeModal('userModal');
          window.location.reload();
          return;
        }

        const newUser = {
          id: crypto.randomUUID(),
          name, username, email,
          role, teamId,
          schedule: null,
          status: 'active',
          passwordHash: Auth.hash(password),
          createdAt: Date.now(),
        };
        Store.addUser(newUser);
        Store.addLog({
          ts: Date.now(),
          teamId: teamId,
          actorId: actor.id,
          actorName: actor.name||actor.username,
          action: 'USER_CREATE',
          targetId: newUser.id,
          targetName: name,
          msg: `${actor.name||actor.username} created user ${name}`,
          detail: `Username=${username}, Role=${role}, Team=${Config.teamById(teamId).label}`
        });
      }
      UI.closeModal('userModal');
      // Auto refresh so the newly created user is shown immediately
      window.location.reload();
    };

    UI.openModal('userModal');
  }

  function openProfileModal(actor, user){
    const team = Config.teamById(user.teamId);
    const sched = Config.scheduleById(user.schedule);
    const canSched = canSchedule(actor, user);

    UI.el('#p_title').textContent = `${user.name||user.username}`;
    UI.el('#p_sub').textContent = `Role: ${user.role} • Team: ${team.label}`;

    const account = UI.el('#panelAccount');
    const scheduling = UI.el('#panelScheduling');

    account.innerHTML = `
      <div class="kv"><div class="small">Username</div><div>${UI.esc(user.username)}</div></div>
      <div class="kv"><div class="small">Email</div><div>${UI.esc(user.email||'—')}</div></div>
      <div class="kv"><div class="small">Role</div><div>${UI.esc(user.role)}</div></div>
      <div class="kv"><div class="small">Status</div><div>${UI.esc(user.status||'active')}</div></div>
    `;

    scheduling.innerHTML = `
      <div class="small" style="margin-bottom:10px">Scheduling is a separate admin setting (not part of user creation).</div>
      <div class="grid2">
        <div>
          <label class="small">Current Schedule</label>
          <div>${sched ? UI.schedulePill(sched.id) : '<span class="small">—</span>'}</div>
        </div>
        <div>
          <label class="small">Assign Schedule</label>
          <select class="select" id="p_schedule" ${canSched ? '' : 'disabled'}>
            <option value="">— None —</option>
            ${Object.values(Config.SCHEDULES).map(s=>`<option value="${s.id}">${s.icon} ${s.label}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="row" style="justify-content:flex-end;margin-top:12px">
        <button class="btn primary" id="btnApplySchedule" ${canSched ? '' : 'disabled'}>Apply</button>
      </div>
      ${canSched?'' : '<div class="err" style="display:block;margin-top:10px">You do not have permission to change scheduling for this user.</div>'}
    `;

    // tabs
    const tabAccount = UI.el('#tabAccount');
    const tabScheduling = UI.el('#tabScheduling');
    tabAccount.onclick = ()=>{ tabAccount.classList.add('active'); tabScheduling.classList.remove('active'); account.style.display='block'; scheduling.style.display='none'; };
    tabScheduling.onclick = ()=>{ tabScheduling.classList.add('active'); tabAccount.classList.remove('active'); account.style.display='none'; scheduling.style.display='block'; };

    // default select
    const sel = scheduling.querySelector('#p_schedule');
    if(sel) sel.value = user.schedule || '';

    const applyBtn = scheduling.querySelector('#btnApplySchedule');
    if(applyBtn) applyBtn.onclick = ()=>{
      if(!canSched) return;
      const newSched = sel.value || null;
      Store.updateUser(user.id, { schedule: newSched });
      UI.closeModal('profileModal');
      window.location.reload();
    };

    // open modal
    UI.openModal('profileModal');
    // default to Account tab
    tabAccount.onclick();
  }
}
);
