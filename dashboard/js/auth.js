(function(){
  const Auth = {
    hash(s){
      const str = String(s ?? '');
      let h = 2166136261;
      for(let i=0;i<str.length;i++){ h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
      return 'h' + (h>>>0).toString(16);
    },
    login(login, password){
      // Defensive login:
      // - tolerate corrupted storage
      // - allow Store.ensureSeed recovery
      // - support legacy "password" field if present
      let u = null;
      try{ u = window.Store.findUserByLogin(login); }catch(_){ u = null; }
      if(!u){
        // Attempt repair of the user DB, then retry once.
        try{ if(window.Store && Store.ensureSeed) Store.ensureSeed(); }catch(_){ }
        try{ u = window.Store.findUserByLogin(login); }catch(_){ u = null; }
      }
      if(!u) return { ok:false, message:'User not found.' };
      if((u.status||'active')!=='active') return { ok:false, message:'Account is disabled.' };

      // Back-compat: if a legacy plain password exists, migrate it.
      if(!u.passwordHash && u.password){
        try{
          u.passwordHash = Auth.hash(u.password);
          delete u.password;
          // Persist migrated record to prevent future login failures.
          try{ Store.updateUser(u.id, { passwordHash: u.passwordHash, password: undefined }); }catch(_){ }
        }catch(_){ }
      }
      if(u.passwordHash !== Auth.hash(password)) return { ok:false, message:'Incorrect password.' };
      try{ window.Store.setSession({ userId: u.id, at: Date.now() }); }catch(_){ }
      return { ok:true, user: u };
    },
    logout(){ window.Store.clearSession(); },
    getUser(){
      const sess = window.Store.getSession();
      if(!sess || !sess.userId) return null;
      return window.Store.getUsers().find(u=>u.id===sess.userId) || null;
    },
    requireUser(){
      const u = Auth.getUser();
      if(!u){ window.location.href = './login.html'; return null; }
      return u;
    }
  };
  window.Auth = Auth;
})();
