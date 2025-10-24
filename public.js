// js/public.js
import * as fb from "./firebase.js";
const { db, collection, doc, getDoc, getDocs, query, where, addDoc, updateDoc, serverTimestamp, runTransaction } = fb;

const pairsCol = collection(db, "pairs");
const claimsCol = collection(db, "claims");

const el = id => document.getElementById(id);

// 🔑 Get ownerPublicId from URL
function getOwnerPublicId(){
  const urlParams = new URLSearchParams(window.location.search);
  return urlParams.get("o");
}
const ownerPublicId = getOwnerPublicId();
if (!ownerPublicId) {
  alert("Missing owner ID in link");
  throw new Error("No ownerPublicId");
}

// device id
function ensureDeviceId(){
  let did = localStorage.getItem("collector_device_id");
  if(!did){
    did = "dev_" + Math.random().toString(36).slice(2,14);
    localStorage.setItem("collector_device_id", did);
    localStorage.setItem("collector_created_at", Date.now().toString());
  }
  return did;
}
const deviceId = ensureDeviceId();

// date helper
function todayStr(){
  const d = new Date();
  return d.toISOString().slice(0,10);
}

// claims docs
const dailyCountsDoc = (dateStr) => doc(db, "dailyCounts", dateStr + "_" + ownerPublicId); // ✅ per-owner cap
const deviceClaimsDoc = (deviceId) => doc(db, "deviceClaims", deviceId + "_" + ownerPublicId); // ✅ per-owner

async function getTodaysClaim(deviceId) {
  const devRef = deviceClaimsDoc(deviceId);
  const snap = await getDoc(devRef);
  if (!snap.exists()) return null;
  const data = snap.data();
  if (data.lastClaimDate === todayStr() && data.recentClaim) {
    return data.recentClaim;
  }
  return null;
}

async function claimPair(deviceId){
  const today = todayStr();
  const dcRef = dailyCountsDoc(today);

  return runTransaction(db, async (tx) => {
    const dSnap = await tx.get(dcRef);
    let count = 0;
    if(dSnap.exists()) count = dSnap.data().count || 0;
    if(count >= 1) throw new Error("daily cap reached");

    // ✅ Only fetch this owner's pairs
    const q = query(pairsCol, where("ownerPublicId", "==", ownerPublicId));
    const snaps = await getDocs(q);
    const available = [];
    snaps.forEach(s=>{
      const d = s.data();
      if(d.deleted) return;
      if(d.claimed) return;
      if(d.limit && d.limit <= (d.claimCount||0)) return;
      available.push({ id: s.id, data: d });
    });
    if(available.length === 0) throw new Error("no_pairs_available");

    const chosen = available[Math.floor(Math.random()*available.length)];

    const pairRef = doc(db, "pairs", chosen.id);
    tx.update(pairRef, { claimed: true, claimedAt: serverTimestamp(), claimedByDevice: deviceId });

    tx.set(dcRef, { date: today, count: count + 1 }, { merge: true });

    const claimRef = doc(claimsCol);
    tx.set(claimRef, {
      pairId: chosen.id,
      deviceId,
      ownerPublicId,
      ownerWhatsApp: chosen.data.ownerWhatsApp || null,
      claimedAt: serverTimestamp()
    });

    const devRef = deviceClaimsDoc(deviceId);
    tx.set(devRef, {
      lastClaimAt: serverTimestamp(),
      lastClaimDate: today,
      recentClaim: { pairId: chosen.id, claimedAt: serverTimestamp() }
    }, { merge: true });

    return { id: chosen.id, data: chosen.data };
  });
}

function showPairToUser(data) {
  const link = data.link;
  const comment = data.comment;
  el("pair-link").href = link;
  el("pair-link").textContent = "Open link to post (click me)";
  el("pair-comment").textContent = comment;
  el("receive-slot").style.display = "block";
  const ownerWh = data.ownerWhatsApp || "";
  const waText = encodeURIComponent("Hello, I just posted the review. See proofs attached.");
  el("btn-send").href = `https://wa.me/${ownerWh.replace(/\D/g,"")}?text=${waText}`;
  el("btn-copy").onclick = async () => {
    await navigator.clipboard.writeText(comment);
    alert("Comment copied to clipboard");
  };
}

async function onReceiveClick(){
  el("receive-message").textContent = "Checking eligibility...";
  el("btn-receive").disabled = true;
  try{
    const todaysClaim = await getTodaysClaim(deviceId);
    if (todaysClaim) {
      const pairSnap = await getDoc(doc(db, "pairs", todaysClaim.pairId));
      if (pairSnap.exists()) {
        const data = pairSnap.data();
        showPairToUser(data);
        el("receive-message").textContent = "Here is your pair again.";
        el("btn-receive").disabled = false;
        return;
      }
    }

    const result = await claimPair(deviceId);
    if(result && result.data){
      showPairToUser(result.data);
      el("receive-message").textContent = `Pair claimed. Send screenshots to WhatsApp: ${result.data.ownerWhatsApp || ""}`;
    }
  }catch(err){
    console.error(err);
    if(err.message === "daily cap reached") el("receive-message").textContent = "Daily cap reached. Come back tomorrow.";
    else if(err.message === "no_pairs_available") el("receive-message").textContent = "No pairs available right now. Try again later.";
    else el("receive-message").textContent = "Error: " + err.message;
  } finally {
    el("btn-receive").disabled = false;
  }
}

el("btn-receive").addEventListener("click", onReceiveClick);

document.addEventListener("DOMContentLoaded", async ()=>{
  const todaysClaim = await getTodaysClaim(deviceId);
  if (todaysClaim) {
    const pairSnap = await getDoc(doc(db, "pairs", todaysClaim.pairId));
    if (pairSnap.exists()) {
      const data = pairSnap.data();
      showPairToUser(data);
      el("receive-message").textContent = "Here is your pair for today.";
    }
  }
});
