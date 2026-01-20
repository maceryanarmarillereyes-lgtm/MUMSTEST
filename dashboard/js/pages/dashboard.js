
(window.Pages=window.Pages||{}, window.Pages.dashboard = function(root){
  const u = Auth.getUser();
  const team = Config.teamById(u.teamId);
  root.innerHTML = `
    <h2 style="margin:0 0 10px">Welcome, ${UI.esc(u.name||u.username)}</h2>
    <div class="chips" style="margin-bottom:12px">
      <span class="chip">Role: ${UI.esc(u.role)}</span>
      <span class="chip">Team: ${UI.esc(team.label)}</span>
      <span class="chip">Timezone: ${UI.esc(Config.TZ)}</span>
    </div>
    <div class="card pad" style="background:rgba(255,255,255,.02)">
      <div class="small">Tip: Go to <b>User Management</b> to create accounts. Assign each user a schedule to show icons in Mailbox.</div>
    </div>
  `;
}
);
