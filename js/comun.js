// comun.js — código compartido por login.js y app.js (cifrado, usuarios, sesión y conexión con Google Sheets).
// Debe cargarse ANTES que login.js / app.js.

/* ---------- instalable (PWA) ---------- */
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch((e) => console.error('sw.js', e));
  });
}

/* ---------- base64 ---------- */
function bytesToBase64(bytes){
  let bin=''; const chunk=0x8000;
  for(let i=0;i<bytes.length;i+=chunk){ bin+=String.fromCharCode.apply(null, bytes.subarray(i,i+chunk)); }
  return btoa(bin);
}
function base64ToBytes(b64){
  const bin=atob(b64); const bytes=new Uint8Array(bin.length);
  for(let i=0;i<bin.length;i++){ bytes[i]=bin.charCodeAt(i); }
  return bytes;
}

/* ---------- crypto (clave extraíble para poder guardar la sesión) ---------- */
const ITERATIONS = 200000;
async function deriveKey(password, saltBytes, iterations){
  const km = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), {name:'PBKDF2'}, false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    {name:'PBKDF2', salt: saltBytes, iterations: iterations, hash:'SHA-256'},
    km, {name:'AES-GCM', length:256}, true, ['encrypt','decrypt']
  );
}
async function encryptBytes(key, bytes){
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({name:'AES-GCM', iv}, key, bytes);
  return { iv: bytesToBase64(iv), data: bytesToBase64(new Uint8Array(ct)) };
}
async function decryptBytes(key, ivB64, dataB64){
  const pt = await crypto.subtle.decrypt({name:'AES-GCM', iv: base64ToBytes(ivB64)}, key, base64ToBytes(dataB64));
  return new Uint8Array(pt);
}

/* ---------- usuarios (caché local) ---------- */
function getLocalUsers(){
  try{ return JSON.parse(localStorage.getItem('crm_users')||'[]'); }catch(e){ return []; }
}
function upsertLocalUser(rec){
  const list = getLocalUsers();
  const i = list.findIndex(u=>u.username===rec.username);
  if(i===-1) list.push(rec); else if((rec.updatedAt||0) >= (list[i].updatedAt||0)) list[i]=rec;
  localStorage.setItem('crm_users', JSON.stringify(list));
}
function normUser(u){
  return { username:String(u.username), salt:u.salt, iterations:Number(u.iterations)||ITERATIONS,
           checkIv:u.checkIv, checkCt:u.checkCt, updatedAt:Number(u.updatedAt)||0 };
}

/* ---------- usuarios: guardar/reemplazar un registro ---------- */
function setLocalUser(rec){
  const list = getLocalUsers();
  const i = list.findIndex(u=>u.username===rec.username);
  if(i===-1) list.push(rec); else list[i]=rec;
  localStorage.setItem('crm_users', JSON.stringify(list));
}

/* ---------- sesión (persiste al actualizar la página) ---------- */
async function saveSession(username, key){
  try{
    const raw = await crypto.subtle.exportKey('raw', key);
    localStorage.setItem('crm_session', JSON.stringify({ username, key: bytesToBase64(new Uint8Array(raw)) }));
    return true;
  }catch(e){ console.error(e); return false; }
}
function clearSession(){ localStorage.removeItem('crm_session'); }

/* ---------- sincronización con Google Sheets (Apps Script) ---------- */
const SYNC_URL = 'https://script.google.com/macros/s/AKfycbxXo19Df_nmlx0r127qzWO90MjOV8qa6ft7EwgoSTKNQGeWOhXkXxwAWwkiKHcQwG5d-A/exec';

async function apiCall(action, payload){
  const controller = new AbortController();
  const timeoutId = setTimeout(()=>controller.abort(), 12000);
  try{
    const res = await fetch(SYNC_URL, {
      method:'POST',
      headers:{'Content-Type':'text/plain;charset=utf-8'},
      body: JSON.stringify(Object.assign({action}, payload)),
      signal: controller.signal
    });
    if(!res.ok) throw new Error('sync http '+res.status);
    return await res.json();
  } finally { clearTimeout(timeoutId); }
}
