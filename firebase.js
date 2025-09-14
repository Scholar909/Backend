// js/firebase.js
// Simple Firestore helper. Add your Firebase project config below.
// Note: this is modular Firebase v11 usage in the browser.
// Replace firebaseConfig with your project's values.

import { initializeApp } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js";
import { getFirestore, collection, doc, setDoc, addDoc, getDoc, getDocs, query, where, updateDoc, deleteDoc, serverTimestamp, orderBy, limit, runTransaction }
  from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyDRQUnCtIZSpq4Jxed_4lwy9LYup37009c",
  authDomain: "whatsapp-stuffs.firebaseapp.com",
  databaseURL: "https://whatsapp-stuffs-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "whatsapp-stuffs",
  storageBucket: "whatsapp-stuffs.firebasestorage.app",
  messagingSenderId: "777872998496",
  appId: "1:777872998496:web:ae4b7f2dc278a3c1aa0305"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

/*
Firestore collections used:
- owners           (id: ownerId) {name, whatsapp, passwordHash}
- pairs            (auto id) {linkEncrypted, comment, ownerId, createdAt, claimed: false}
- claims           (auto id) {pairId, deviceId, ownerWhatsApp, claimedAt}
- dailyCounts      (id: YYYY-MM-DD) {date, count}
- deviceClaims     (id: deviceId) {lastClaimAt, claims: [{pairId, claimedAt}]}
*/

export { db, collection, doc, setDoc, addDoc, getDoc, getDocs, query, where, updateDoc, deleteDoc, serverTimestamp, orderBy, limit, runTransaction };