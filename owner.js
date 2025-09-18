// js/owner.js
import * as fb from "./firebase.js";
const { db, collection, doc, setDoc, addDoc, getDoc, getDocs, query, updateDoc, deleteDoc, serverTimestamp } = fb;

const ownersCol = collection(db, "owners");
const tokensCol = collection(db, "tokens"); // 🔑 valid registration tokens
const pairsCol = collection(db, "pairs");

// helper
const el = id => document.getElementById(id);

// grab token input
const tokenInput = el("owner-token");

// button events
el("btn-register").addEventListener("click", registerOwner);
el("btn-login").addEventListener("click", loginOwner);
el("btn-logout").addEventListener("click", logoutOwner);
el("btn-add").addEventListener("click", addPair);

let currentOwner = null;
let logoutTimer = null;

// random publicId generator
function generatePublicId() {
  return Math.random().toString(36).slice(2, 10);
}

// random token generator (admin side)
export function generateToken() {
  return Math.random().toString(36).slice(2, 10).toUpperCase();
}

// Hash password
function sha256(str) {
  const enc = new TextEncoder();
  return crypto.subtle.digest("SHA-256", enc.encode(str)).then(buf=>{
    return Array.from(new Uint8Array(buf)).map(b=>b.toString(16).padStart(2,"0")).join("");
  });
}

// Format WhatsApp
function formatWhatsapp(num) {
  let clean = num.replace(/\D/g, "");
  if (clean.startsWith("234")) clean = clean.slice(3);
  if (clean.startsWith("+234")) clean = clean.slice(4);
  if (clean.startsWith("0")) clean = clean.slice(1);
  return "+234" + clean;
}

async function registerOwner(){
  if (localStorage.getItem("ownerDevice")) {
    return alert("This device is already linked. Logout first.");
  }

  const name = el("owner-name").value.trim();
  let whatsapp = el("owner-whatsapp").value.trim();
  const token = el("owner-token").value.trim(); 
  const pw = el("owner-pw").value;
  if(!name||!whatsapp||!pw||!token) return alert("Fill all fields including token");

  // 🔑 validate token
  const tokenSnap = await getDoc(doc(db, "tokens", token));
  if (!tokenSnap.exists()) {
    return alert("Invalid or expired token. Ask admin for a new one.");
  }

  whatsapp = formatWhatsapp(whatsapp);
  const hash = await sha256(pw);

  // 🔑 generate a permanent publicId
  const publicId = generatePublicId();

  await setDoc(doc(db, "owners", whatsapp), { 
    name, whatsapp, 
    passwordHash: hash, 
    publicId, 
    createdAt: serverTimestamp() 
  });

  // 🔑 delete token after use
  await fb.deleteDoc(doc(db, "tokens", token));

  localStorage.setItem("ownerDevice", whatsapp);
  localStorage.setItem("ownerName", name);
  localStorage.setItem("ownerPublicId", publicId); 
  sessionStorage.setItem("loggedIn", "true");

  showOwnerArea(whatsapp, name, publicId);
  tokenInput.style.display = "none"; // hide after registration

  alert("Registered successfully!\n\nYour public link is:\n" + window.location.origin + "/public.html?o=" + publicId);
}

async function loginOwner() {
  let whatsapp = el("owner-whatsapp").value.trim();
  const pw = el("owner-pw").value;
  if (!whatsapp || !pw) return alert("Fill all fields");

  whatsapp = formatWhatsapp(whatsapp);

  const locked = localStorage.getItem("ownerDevice") || ("").trim();
  if (locked && locked !== whatsapp) {
    return alert("Device locked to " + locked);
  }

  const snap = await getDoc(doc(db, "owners", whatsapp));
  if (!snap.exists()) return alert("Owner not found");
  const data = snap.data();

  const hash = await sha256(pw);
  if (hash !== data.passwordHash) return alert("Wrong password");

  localStorage.setItem("ownerDevice", whatsapp);
  localStorage.setItem("ownerName", data.name);
  localStorage.setItem("ownerPublicId", data.publicId);
  sessionStorage.setItem("loggedIn", "true");

  showOwnerArea(whatsapp, data.name, data.publicId);
}

function logoutOwner(){
  currentOwner = null;
  sessionStorage.removeItem("loggedIn");
  el("btn-logout").style.display = "none";
  el("auth-card").style.display = "block";
  el("add-card").style.display = "none";
  el("pairs-card").style.display = "none";
  alert("Logged out");

  const whatsapp = localStorage.getItem("ownerDevice");
  const name = localStorage.getItem("ownerName");
  if (whatsapp && name) {
    el("owner-name").value = name;
    el("owner-whatsapp").value = whatsapp;
    el("owner-name").disabled = true;
    el("owner-whatsapp").disabled = true;
    el("btn-register").style.display = "none";
    el("btn-login").style.display = "inline-block";
    tokenInput.style.display = "none";   // hide token on login
  }
}

function showOwnerArea(whatsapp, name, publicId){
  currentOwner = { whatsapp, name, publicId };
  el("auth-card").style.display = "none";
  el("add-card").style.display = "block";
  el("pairs-card").style.display = "block";
  el("btn-logout").style.display = "inline-block";
  el("owner-wh-display").textContent = whatsapp;
  loadPairs();
  resetLogoutTimer();

  el("public-link-display").textContent = window.location.origin + "/public.html?o=" + publicId;
}

async function addPair(){
  if(!currentOwner) return alert("Login first");
  const link = el("pair-link").value.trim();
  const comment = el("pair-comment").value.trim();
  const limitRaw = el("pair-limit").value.trim();
  let limit = limitRaw ? parseInt(limitRaw,10) : null;
  if(!link||!comment) return alert("Fill link/comment");

  await addDoc(pairsCol, {
    link, comment,
    ownerWhatsApp: currentOwner.whatsapp,
    ownerName: currentOwner.name,
    ownerPublicId: currentOwner.publicId,
    createdAt: serverTimestamp(),
    claimed: false,
    limit: isNaN(limit) ? null : limit
  });

  el("pair-link").value = "";
  el("pair-comment").value = "";
  el("pair-limit").value = "";
  loadPairs();
  alert("Pair added");
}

async function loadPairs(){
  const snaps = await getDocs(query(pairsCol));
  const list = el("pairs-list");
  list.innerHTML = "";
  snaps.forEach(s => {
    const d = s.data();
    if (d.deleted) return;
    if (d.ownerPublicId !== currentOwner.publicId) return;
    const item = document.createElement("div");
    item.className = "pair-item";
    item.innerHTML = `
      <div><b>${d.comment.slice(0,80)}${d.comment.length>80?"...":""}</b></div>
      <div class="small">${d.ownerName} · ${d.ownerWhatsApp} · ${d.claimed ? "<span style='color: limegreen; font-weight: bold;'>Claimed</span>" : "Available"}</div>
      <div class="small">Link: ${d.link}</div>
      <button data-id="${s.id}" class="btn btn-ghost" style="margin-top:6px">Delete</button>
    `;
    list.appendChild(item);

    item.querySelector("button").addEventListener("click", async () => {
      if (!confirm("Delete this pair?")) return;
      try {
        await deleteDoc(doc(db, "pairs", s.id));
        await loadPairs();
      } catch (err) {
        alert("Delete failed: " + err.message);
      }
    });
  });
}

function resetLogoutTimer(){
  if (logoutTimer) clearTimeout(logoutTimer);
  logoutTimer = setTimeout(()=>logoutOwner(), 20*60*1000);
}
["click","keydown","mousemove"].forEach(evt=>{
  document.addEventListener(evt, ()=>{ if(currentOwner) resetLogoutTimer(); });
});

document.addEventListener("DOMContentLoaded", ()=>{
  const params = new URLSearchParams(window.location.search);
  const whatsappParam = params.get("w");
  
  const whatsapp = localStorage.getItem("ownerDevice");
  const name = localStorage.getItem("ownerName");
  const publicId = localStorage.getItem("ownerPublicId");
  const loggedIn = sessionStorage.getItem("loggedIn");

  if (whatsappParam) {
    getDoc(doc(db, "owners", whatsappParam)).then(snap => {
      if (!snap.exists()) {
        alert("Owner not found");
        window.location.href = "/";
        return;
      }
      const data = snap.data();
      el("owner-name").value = data.name;
      el("owner-whatsapp").value = data.whatsapp;
      el("owner-name").disabled = true;
      el("owner-whatsapp").disabled = true;
      el("btn-register").style.display = "none";
      el("btn-login").style.display = "inline-block";
      tokenInput.style.display = "none"; 
    });
  }

  if (loggedIn && whatsapp && name && publicId) {
    showOwnerArea(whatsapp,name,publicId);
  } else if (whatsapp && name && publicId) {
    el("owner-name").value = name;
    el("owner-whatsapp").value = whatsapp;
    el("owner-name").disabled = true;
    el("owner-whatsapp").disabled = true;
    el("btn-register").style.display = "none";
    el("btn-login").style.display = "inline-block";
    tokenInput.style.display = "none"; // hide on login
  } else {
    el("owner-name").disabled = false;
    el("owner-whatsapp").disabled = false;
    el("btn-register").style.display = "inline-block";
    el("btn-login").style.display = "none";
    tokenInput.style.display = "block"; // show on registration
  }
});