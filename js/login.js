// login.js — pantalla de inicio de sesión (requiere comun.js)
(function(){
const $ = id => document.getElementById(id);
const APP_URL = 'index.html';

// Si ya hay sesión guardada, ir directo a la app
if(localStorage.getItem('crm_session')){ location.replace(APP_URL); return; }

// Devuelve la lista de usuarios de la nube, o null si no se pudo consultar
async function cloudUsers(){
  try{
    const r = await apiCall('getUsers', {});
    const list = Array.isArray(r) ? r : (r && Array.isArray(r.users) ? r.users : null);
    return list ? list.filter(u=>u && u.username).map(normUser) : null;
  }catch(e){ return null; }
}

/* ---------- UI ---------- */
const errBox = $('auth-error');
function showErr(m){ errBox.textContent = m; errBox.classList.remove('hidden'); }
function clearErr(){ errBox.classList.add('hidden'); }
function busy(btn, on, text){
  if(on){ btn.dataset.t = btn.textContent; btn.textContent = text; btn.disabled = true; }
  else { btn.textContent = btn.dataset.t || btn.textContent; btn.disabled = false; }
}
function switchTo(signup){
  $('auth-login').classList.toggle('hidden', signup);
  $('auth-signup').classList.toggle('hidden', !signup);
  $('auth-title').textContent = signup ? 'Crear cuenta' : 'Iniciar sesión';
  clearErr();
}
$('show-signup').onclick = ()=>switchTo(true);
$('show-login').onclick = ()=>switchTo(false);
[['login-pass','btn-login'],['signup-pass2','btn-signup']].forEach(([i,b])=>{
  $(i).addEventListener('keydown', e=>{ if(e.key==='Enter') $(b).click(); });
});

function fillUserList(){
  const dl = $('user-list'); dl.innerHTML = '';
  getLocalUsers().forEach(u=>{ const o = document.createElement('option'); o.value = u.username; dl.appendChild(o); });
}
fillUserList();
cloudUsers().then(list=>{ if(list){ list.forEach(setLocalUser); fillUserList(); } });

/* ---------- iniciar sesión: primero se consulta la nube ---------- */
$('btn-login').onclick = async function(){
  clearErr();
  const name = $('login-user').value.trim();
  const pass = $('login-pass').value;
  if(!name || !pass){ showErr('Escribe usuario y contraseña.'); return; }
  busy(this, true, 'Verificando…');
  try{
    const same = u => u.username.toLowerCase() === name.toLowerCase();
    const cloud = await cloudUsers();
    const cands = [];
    const c = cloud && cloud.find(same);
    if(c) cands.push({rec:c, fromCloud:true});
    const l = getLocalUsers().find(same);
    if(l && !(c && l.salt===c.salt && l.checkCt===c.checkCt)) cands.push({rec:l, fromCloud:false});
    if(!cands.length){
      showErr(cloud ? 'Ese usuario no existe. Crea una cuenta.' : 'No se pudo consultar el servidor. Revisa tu conexión e inténtalo de nuevo.');
      return;
    }
    for(const {rec, fromCloud} of cands){
      try{
        const key = await deriveKey(pass, base64ToBytes(rec.salt), rec.iterations);
        const chk = await decryptBytes(key, rec.checkIv, rec.checkCt);
        if(new TextDecoder().decode(chk) !== 'CRM_OK') continue;
        if(fromCloud) setLocalUser(rec);
        if(!(await saveSession(rec.username, key))){ showErr('No se pudo guardar la sesión en este navegador.'); return; }
        location.replace(APP_URL);
        return;
      }catch(e){ /* probar el siguiente candidato */ }
    }
    showErr('Contraseña incorrecta.');
  } finally { busy(this, false); }
};

/* ---------- crear cuenta: se verifica en la nube que el usuario no exista ---------- */
$('btn-signup').onclick = async function(){
  clearErr();
  const name = $('signup-user').value.trim();
  const p1 = $('signup-pass').value, p2 = $('signup-pass2').value;
  if(!name || !p1){ showErr('Completa usuario y contraseña.'); return; }
  if(p1 !== p2){ showErr('Las contraseñas no coinciden.'); return; }
  busy(this, true, 'Creando…');
  try{
    const same = u => u.username.toLowerCase() === name.toLowerCase();
    const cloud = await cloudUsers();
    if(!cloud){ showErr('No se pudo verificar si el usuario ya existe. Revisa tu conexión.'); return; }
    if(cloud.some(same) || getLocalUsers().some(same)){ showErr('Ese usuario ya existe.'); return; }
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const key = await deriveKey(p1, salt, ITERATIONS);
    const check = await encryptBytes(key, new TextEncoder().encode('CRM_OK'));
    const rec = { username:name, salt:bytesToBase64(salt), iterations:ITERATIONS,
                  checkIv:check.iv, checkCt:check.data, updatedAt:Date.now() };
    try{ await apiCall('saveUser', {user:rec}); }
    catch(e){ showErr('No se pudo guardar la cuenta en el servidor. Inténtalo de nuevo.'); return; }
    setLocalUser(rec);
    if(!(await saveSession(name, key))){ showErr('No se pudo guardar la sesión en este navegador.'); return; }
    location.replace(APP_URL);
  } finally { busy(this, false); }
};
})();
