// js/owner.js
import * as fb from "./firebase.js";
const { db, collection, doc, setDoc, addDoc, getDoc, getDocs, query, updateDoc, deleteDoc, serverTimestamp } = fb;

const ownersCol = collection(db, "owners");
const pairsCol = collection(db, "pairs");

const el = id => document.getElementById(id);
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
  const pw = el("owner-pw").value;
  if(!name||!whatsapp||!pw) return alert("Fill all fields");

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

  localStorage.setItem("ownerDevice", whatsapp);
  localStorage.setItem("ownerName", name);
  localStorage.setItem("ownerPublicId", publicId); // ✅ save it
  sessionStorage.setItem("loggedIn", "true");

  showOwnerArea(whatsapp, name, publicId);

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

  localStorage.setItem("ownerName", data.name);
  localStorage.setItem("ownerPublicId", data.publicId); // ✅ keep it
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
    // Autofill but disable name + whatsapp
    el("owner-name").value = name;
    el("owner-whatsapp").value = whatsapp;
    el("owner-name").disabled = true;
    el("owner-whatsapp").disabled = true;

    // Hide register, only allow login
    el("btn-register").style.display = "none";
    el("btn-login").style.display = "inline-block";
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

  // show public link somewhere
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
    ownerPublicId: currentOwner.publicId, // ✅ tie to this owner
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
    if (d.ownerPublicId !== currentOwner.publicId) return; // ✅ only this owner’s pairs
    const item = document.createElement("div");
    item.className = "pair-item";
    item.innerHTML = `
      <div><b>${d.comment.slice(0,80)}${d.comment.length>80?"...":""}</b></div>
      <div class="small">${d.ownerName} · ${d.ownerWhatsApp} · ${d.claimed ? "Claimed" : "Available"}</div>
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
  const whatsappParam = params.get("w"); // WhatsApp in link (Owner Link)
  
  const whatsapp = localStorage.getItem("ownerDevice");
  const name = localStorage.getItem("ownerName");
  const publicId = localStorage.getItem("ownerPublicId");
  const loggedIn = sessionStorage.getItem("loggedIn");

  // 🔒 Device check: if link has ?w=... and it doesn't match local device → deny
  if (whatsappParam) {
    if (!whatsapp) {
      alert("This device is not registered for this owner. Access denied.");
      window.location.href = "/"; // redirect home (or block)
      return;
    }
    if (whatsapp !== whatsappParam) {
      alert("This owner link belongs to a different device. Access denied.");
      window.location.href = "/"; // redirect home (or block)
      return;
    }
  }

  if (loggedIn && whatsapp && name && publicId) {
    // Already logged in
    showOwnerArea(whatsapp,name,publicId);
  } else if (whatsapp && name && publicId && sessionStorage.getItem("loggedIn") !== "wiped") {
    // Registered before → auto fill but disable fields
    el("owner-name").value = name;
    el("owner-whatsapp").value = whatsapp;
    el("owner-name").disabled = true;
    el("owner-whatsapp").disabled = true;

    // Hide register, only allow login
    el("btn-register").style.display = "none";
    el("btn-login").style.display = "inline-block";
  } else {
    // New device → keep all empty, show register
    el("owner-name").disabled = false;
    el("owner-whatsapp").disabled = false;
    el("btn-register").style.display = "inline-block";
    el("btn-login").style.display = "none";
  }
});