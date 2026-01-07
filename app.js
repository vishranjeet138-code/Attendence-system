const employees = ["amit", "divanshu", "sujit", "ganesh", "nanki", "shiv kumar", "sheetal", "manisha", "aman", "abhishek", "khushboo", "akshay", "vikki", "sumit", "Sushant"];
const adminPasswords = { amit: "Amit2580", divyanshu: "Divyanshu2580" };
const EMP_PASSWORD = "IDFC1234";
let currentUser = "";
let isAdmin = false;

// Dark Mode Toggle
function toggleDarkMode() {
  document.body.classList.toggle("dark-mode");
  const isDark = document.body.classList.contains("dark-mode");
  localStorage.setItem("darkMode", isDark);
  const btn = document.querySelector(".dark-mode-toggle");
  if (isDark) {
    btn.innerText = "☀️ Light Mode";
  } else {
    btn.innerText = "🌙 Dark Mode";
  }
}

// Load dark mode preference on page load
function loadDarkModePreference() {
  if (localStorage.getItem("darkMode") === "true") {
    document.body.classList.add("dark-mode");
    const btn = document.querySelector(".dark-mode-toggle");
    if (btn) btn.innerText = "☀️ Light Mode";
  }
}

// Account Creation Modal Functions
function openCreateAccountModal() {
  document.getElementById("createAccountModal").style.display = "block";
  
  // Show account type dropdown only for admins
  const accountTypeGroup = document.getElementById("accountTypeGroup");
  if (isAdmin) {
    accountTypeGroup.style.display = "block";
    document.getElementById("newAccountType").value = "employee";
  } else {
    accountTypeGroup.style.display = "none";
    document.getElementById("newAccountType").value = "employee";
  }
}

function closeCreateAccountModal() {
  document.getElementById("createAccountModal").style.display = "none";
  document.getElementById("newUsername").value = "";
  document.getElementById("newPassword").value = "";
  document.getElementById("confirmPassword").value = "";
}

// Close modal when clicking outside
window.onclick = function(event) {
  const modal = document.getElementById("createAccountModal");
  if (event.target === modal) {
    modal.style.display = "none";
  }
}

// FIRESTORE HELPER FUNCTIONS
async function saveAttendance(user, date, status, time) {
  const { doc, setDoc } = await import("https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js");
  try {
    // ensure date is stored in ISO (yyyy-mm-dd) to avoid '/' in IDs
    const iso = toISODate(date);
    const id = `${user}_${iso}`;
    await setDoc(doc(window.db, "attendance", id), {
      user: user,
      date: iso,
      status: status,
      time: time
    });
  } catch (e) {
    console.error("Error saving attendance:", e);
  }
}

async function getAttendance(user, date) {
  const { doc, getDoc } = await import("https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js");
  try {
    const iso = toISODate(date);
    const snapshot = await getDoc(doc(window.db, "attendance", user + "_" + iso));
    return snapshot.exists() ? snapshot.data() : null;
  } catch (e) {
    console.error("Error getting attendance:", e);
    return null;
  }
}

async function getUserAttendanceAll(user) {
  const { collection, query, where, getDocs } = await import("https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js");
  try {
    const snapshot = await getDocs(collection(window.db, "attendance"));
    let data = {};

    snapshot.forEach(doc => {
      const id = doc.id || "";
      const d = doc.data() || {};

      // Case A: document has explicit user field
      if (d.user && d.user === user) {
        const date = d.date || id.replace(user + "_", "");
        data[date] = { status: d.status || "", time: d.time || "" };
        return;
      }

      // Case B: document id starts with `user_` (legacy format)
      if (id.startsWith(user + "_")) {
        const dateFromId = id.substring((user + "_").length) || id;
        // prefer structured fields if present
        if (d.status || d.time || d.date) {
          const date = d.date || dateFromId;
          data[date] = { status: d.status || "", time: d.time || "" };
        } else {
          // if the document contains other keys (legacy), try to map them
          // e.g. fields like '1/6/2026': 'Present' or nested values
          const keys = Object.keys(d);
          if (keys.length === 1) {
            const k = keys[0];
            // if value is object with time/status
            const val = d[k];
            if (val && typeof val === 'object' && (val.status || val.time)) {
              data[k] = { status: val.status || "", time: val.time || "" };
            } else {
              // fallback: treat doc id dateFromId as date and value as status
              data[dateFromId] = { status: String(val || ""), time: "" };
            }
          } else {
            // multiple keys: assume they are date entries
            keys.forEach(k => {
              const val = d[k];
              if (typeof val === 'object') {
                data[k] = { status: val.status || "", time: val.time || "" };
              } else {
                data[k] = { status: String(val || ""), time: "" };
              }
            });
          }
        }
        return;
      }

      // Case C: document contains a `user`-less map where a key equals username
      // e.g. top-level key is username mapping to attendance object
      if (d[user]) {
        const obj = d[user];
        if (typeof obj === 'object') {
          Object.keys(obj).forEach(k => {
            const val = obj[k];
            if (typeof val === 'object') data[k] = { status: val.status || "", time: val.time || "" };
            else data[k] = { status: String(val || ""), time: "" };
          });
        }
        return;
      }
    });

    return data;
  } catch (e) {
    console.error("Error getting user attendance:", e);
    return {};
  }
}

async function saveWeekOff(user, date) {
  const { doc, setDoc } = await import("https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js");
  try {
    await setDoc(doc(window.db, "weekoffs", date), {
      user: user,
      date: date,
      applied: new Date().toLocaleString(),
      status: "Pending"
    });
  } catch (e) {
    console.error("Error saving week off:", e);
  }
}

async function getWeekOffs() {
  const { collection, getDocs } = await import("https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js");
  try {
    const snapshot = await getDocs(collection(window.db, "weekoffs"));
    let offs = [];
    snapshot.forEach(doc => {
      offs.push(Object.assign({ id: doc.id }, doc.data()));
    });
    return offs;
  } catch (e) {
    console.error("Error getting week offs:", e);
    return [];
  }
}

async function deleteAttendance(user, date) {
  // Move attendance to recycle bin instead of hard deleting
  const { doc, getDoc, setDoc, deleteDoc } = await import("https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js");
  try {
    const iso = toISODate(date);
    const originalId = user + "_" + iso;
    const dRef = doc(window.db, "attendance", originalId);
    const snap = await getDoc(dRef);
    const payload = snap.exists() ? snap.data() : { user, date: iso };

    // create recycle id to avoid conflicts
    const recycleId = `attendance_${originalId}_${Date.now()}`;
    await setDoc(doc(window.db, "recyclebin", recycleId), {
      originalCollection: "attendance",
      originalId: originalId,
      data: payload,
      deletedOn: new Date().toLocaleString(),
      deletedBy: currentUser || "admin"
    });

    // delete original
    await deleteDoc(dRef);
  } catch (e) {
    console.error("Error deleting attendance:", e);
  }
}

// Convert various date inputs to ISO yyyy-mm-dd
function toISODate(d) {
  // if already in yyyy-mm-dd
  if (typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d)) return d;
  // try Date parse
  const dt = new Date(d);
  if (!isNaN(dt)) return dt.toISOString().slice(0, 10);
  // fallback: replace slashes with dashes and remove time
  return String(d).replace(/\//g, '-').split(' ')[0];
}

// LOGIN
async function login() {
  let u = username.value.toLowerCase().trim();
  let p = password.value;

  // First, try to read explicit account document from Firestore (created via Create Account)
  try {
    const { doc, getDoc } = await import("https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js");
    const accRef = doc(window.db, "accounts", u);
    const accSnap = await getDoc(accRef);
    if (accSnap.exists()) {
      const acc = accSnap.data() || {};
      if (p !== acc.password) return alert("Wrong Password");
      currentUser = u;
      isAdmin = acc.accountType === "admin";
      loginBox.classList.add("hidden");
      mainPanel.classList.remove("hidden");
      welcome.innerText = "Welcome " + currentUser.toUpperCase();
      await loadToday();
      if (isAdmin) {
        adminPanel.classList.remove("hidden");
        loadAdminDropdown();
        await loadWeekOffs();
        setTimeout(() => loadAttendance(), 500);
      }
      return;
    }
  } catch (e) {
    console.error("Error checking accounts collection:", e);
  }

  // Fallback to legacy/local in-memory authentication
  if (!employees.includes(u)) return alert("Invalid User");

  if (adminPasswords[u]) {
    if (p !== adminPasswords[u]) return alert("Wrong Password");
    isAdmin = true;
  } else {
    if (p !== EMP_PASSWORD) return alert("Wrong Password");
  }

  currentUser = u;
  loginBox.classList.add("hidden");
  mainPanel.classList.remove("hidden");
  welcome.innerText = "Welcome " + currentUser.toUpperCase();
  await loadToday();

  if (isAdmin) {
    adminPanel.classList.remove("hidden");
    loadAdminDropdown();
    await loadWeekOffs();
    setTimeout(() => loadAttendance(), 500);
  }
}

// LOGOUT
function logout() { location.reload(); }

// MARK PRESENT (ONCE PER DAY)
async function markPresent() {
  let today = new Date().toISOString().slice(0, 10);
  let time = new Date().toLocaleTimeString();

  let existing = await getAttendance(currentUser, today);
  if (existing) return alert("Today attendance already marked");

  await saveAttendance(currentUser, today, "Present", time);
  await loadToday();
}

// SHOW TODAY ONLY
async function loadToday() {
  todayTable.innerHTML = "";
  let today = new Date().toISOString().slice(0, 10);
  let data = await getUserAttendanceAll(currentUser);
  if (data[today]) {
    todayTable.innerHTML += `<tr><td>${today}</td><td>${data[today].status}</td><td>${data[today].time}</td></tr>`;
  }
}

// APPLY WEEK OFF (ONLY ONE PERSON PER DATE)
async function applyWeekOff() {
  let d = weekOffDate.value;
  if (!d) return alert("Select date");

  let offs = await getWeekOffs();

  // CHECK CONFLICT
  let conflict = offs.find(o => o.date === d);
  if (conflict) {
    return alert(`${conflict.date} ko ${conflict.user.toUpperCase()} ne already Week Off dala hai`);
  }

  // SAVE
  await saveWeekOff(currentUser, d);

  alert("Week Off Applied Successfully");
  weekOffDate.value = "";
  await loadWeekOffs();
}

// ADMIN FUNCTIONS
function loadAdminDropdown() {
  empSelect.innerHTML = "";
  employees.forEach(e => {
    empSelect.innerHTML += `<option value="${e}">${e.toUpperCase()}</option>`;
  });
}

async function loadAttendance() {
  let u = empSelect.value;
  adminTable.innerHTML = "";
  let data = await getUserAttendanceAll(u);
  console.log("Loading attendance for:", u);
  try {
    console.log("Data received (raw):", data);
    console.log("Data received (json):", JSON.stringify(data));
  } catch (e) {
    console.log("Error stringifying data", e);
  }

  // If no records, show a friendly message row
  if (!data || Object.keys(data).length === 0) {
    adminTable.innerHTML = `<tr><td colspan="4">No attendance records found for ${u.toUpperCase()}</td></tr>`;
    return;
  }

  for (let d in data) {
    adminTable.innerHTML += `
    <tr>
      <td>${d}</td>
      <td>${data[d].status}</td>
      <td>${data[d].time}</td>
      <td><button class="delete" onclick="deleteRec('${u}','${d}')">Delete</button></td>
    </tr>`;
  }
}

async function deleteRec(u, d) {
  if (!confirm("Delete attendance?")) return;
  await deleteAttendance(u, d);
  await loadAttendance();
}

// WEEK OFF LIST (ADMIN)
async function loadWeekOffs() {
  weekOffTable.innerHTML = "";
  // remove expired weekoffs first
  await cleanupExpiredWeekOffs();
  let offs = await getWeekOffs();
  offs.forEach(o => {
    const status = o.status || "Pending";
    let actionButtons = "";
    if (status === "Pending") {
      actionButtons = `
        <button class="accept" onclick="acceptWeekOff('${o.id}')">Accept</button>
        <button class="reject" onclick="rejectWeekOff('${o.id}')">Reject</button>`;
    } else {
      // allow admin to delete accepted/rejected entries (move to recycle)
      actionButtons = `<span class="${status.toLowerCase()}">${status}</span> <button class="delete" onclick="deleteWeekOff('${o.id}')">Delete</button>`;
    }
    weekOffTable.innerHTML += `
    <tr>
      <td>${o.user.toUpperCase()}</td>
      <td>${o.date}</td>
      <td>${o.applied}</td>
      <td>${actionButtons}</td>
    </tr>`;
  });
}

// ACCEPT WEEK OFF
async function acceptWeekOff(id) {
  const { doc, updateDoc } = await import("https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js");
  try {
    await updateDoc(doc(window.db, "weekoffs", id), {
      status: "Accepted"
    });
    alert("Week Off Accepted");
    await loadWeekOffs();
  } catch (e) {
    console.error("Error accepting week off:", e);
    alert("Error accepting week off");
  }
}

// REJECT WEEK OFF
async function rejectWeekOff(id) {
  // On reject, move week off request to recycle bin instead of keeping it
  const { doc, getDoc, setDoc, deleteDoc } = await import("https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js");
  try {
    const wRef = doc(window.db, "weekoffs", id);
    const snap = await getDoc(wRef);
    const payload = snap.exists() ? snap.data() : { id };

    const recycleId = `weekoff_${id}_${Date.now()}`;
    await setDoc(doc(window.db, "recyclebin", recycleId), {
      originalCollection: "weekoffs",
      originalId: id,
      data: payload,
      deletedOn: new Date().toLocaleString(),
      deletedBy: currentUser || "admin"
    });

    // also move any attendance record for this user/date to recycle
    if (payload && payload.user && payload.date) {
      await deleteAttendance(payload.user, payload.date);
    }

    await deleteDoc(wRef);
    alert("Week Off moved to Recycle Bin");
    await loadWeekOffs();
    await loadRecycleBin();
  } catch (e) {
    console.error("Error rejecting week off:", e);
    alert("Error rejecting week off");
  }
}

// RECYCLE BIN HELPERS
async function getRecycleItems() {
  const { collection, getDocs } = await import("https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js");
  try {
    const snapshot = await getDocs(collection(window.db, "recyclebin"));
    let items = [];
    snapshot.forEach(doc => {
      items.push(Object.assign({ _id: doc.id }, doc.data()));
    });
    return items;
  } catch (e) {
    console.error("Error getting recycle items:", e);
    return [];
  }
}

async function loadRecycleBin() {
  const recycleTable = document.getElementById("recycleTable");
  if (!recycleTable) return;
  recycleTable.innerHTML = "";
  let items = await getRecycleItems();
  if (!items || items.length === 0) {
    recycleTable.innerHTML = `<tr><td colspan="6">Recycle Bin is empty</td></tr>`;
    return;
  }
  items.forEach(i => {
    const type = i.originalCollection || "unknown";
    const emp = (i.data && i.data.user) ? i.data.user.toUpperCase() : "-";
    const date = (i.data && (i.data.date || i.data.date)) || (i.data && (i.data.date)) || "-";
    const deletedOn = i.deletedOn || "-";
    recycleTable.innerHTML += `
      <tr>
        <td>${type}</td>
        <td>${emp}</td>
        <td>${date}</td>
        <td>${JSON.stringify(i.data)}</td>
        <td>${deletedOn}</td>
        <td>
          <button class="restore" onclick="restoreRecycleItem('${i._id}')">Restore</button>
          <button class="permdelete" onclick="permDeleteRecycleItem('${i._id}')">Delete</button>
        </td>
      </tr>`;
  });
}

async function restoreRecycleItem(recycleId) {
  const { doc, getDoc, setDoc, deleteDoc } = await import("https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js");
  try {
    const rRef = doc(window.db, "recyclebin", recycleId);
    const snap = await getDoc(rRef);
    if (!snap.exists()) return alert("Item not found");
    const payload = snap.data();
    const origColl = payload.originalCollection;
    const origId = payload.originalId;
    const data = payload.data || {};

    await setDoc(doc(window.db, origColl, origId), data);
    await deleteDoc(rRef);
    alert("Item restored");
    await loadRecycleBin();
    if (origColl === "weekoffs") await loadWeekOffs();
    if (origColl === "attendance") await loadAttendance();
  } catch (e) {
    console.error("Error restoring item:", e);
    alert("Error restoring item");
  }
}

async function permDeleteRecycleItem(recycleId) {
  const { doc, deleteDoc } = await import("https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js");
  try {
    if (!confirm("Permanently delete this item?")) return;
    await deleteDoc(doc(window.db, "recyclebin", recycleId));
    await loadRecycleBin();
  } catch (e) {
    console.error("Error permanently deleting recycle item:", e);
    alert("Error deleting item");
  }
}

// Delete a weekoff (move to recycle and remove attendance)
async function deleteWeekOff(id) {
  const { doc, getDoc, setDoc, deleteDoc } = await import("https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js");
  try {
    const wRef = doc(window.db, "weekoffs", id);
    const snap = await getDoc(wRef);
    if (!snap.exists()) return alert("Week off not found");
    const payload = snap.data();
    const recycleId = `weekoff_${id}_${Date.now()}`;
    await setDoc(doc(window.db, "recyclebin", recycleId), {
      originalCollection: "weekoffs",
      originalId: id,
      data: payload,
      deletedOn: new Date().toLocaleString(),
      deletedBy: currentUser || "admin"
    });

    if (payload && payload.user && payload.date) {
      await deleteAttendance(payload.user, payload.date);
    }

    await deleteDoc(wRef);
    alert("Week Off moved to Recycle Bin");
    await loadWeekOffs();
    await loadRecycleBin();
  } catch (e) {
    console.error("Error deleting week off:", e);
    alert("Error deleting week off");
  }
}

// Cleanup expired weekoffs: for any weekoff with date < today, move attendance to recycle and remove weekoff
async function cleanupExpiredWeekOffs() {
  const offs = await getWeekOffs();
  const today = new Date().toISOString().slice(0, 10);
  for (const o of offs) {
    const offDate = toISODate(o.date || o.id);
    if (offDate < today) {
      try {
        // move attendance to recycle
        if (o.user && o.date) await deleteAttendance(o.user, o.date);

        // move weekoff doc to recycle
        const { doc, setDoc, deleteDoc } = await import("https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js");
        const recycleId = `weekoff_expired_${o.id || o.date}_${Date.now()}`;
        await setDoc(doc(window.db, "recyclebin", recycleId), {
          originalCollection: "weekoffs",
          originalId: o.id || o.date,
          data: o,
          deletedOn: new Date().toLocaleString(),
          deletedBy: "system_expiry"
        });
        await deleteDoc(doc(window.db, "weekoffs", o.id || o.date));
      } catch (e) {
        console.error("Error expiring weekoff:", e);
      }
    }
  }
}

// Toggle Recycle Bin visibility (hidden by default)
function toggleRecycleBin() {
  const sec = document.getElementById("recycleSection");
  const btn = document.getElementById("toggleRecycleBtn");
  if (!sec) return;
  if (sec.classList.contains("hidden")) {
    sec.classList.remove("hidden");
    btn.innerText = "Hide Recycle Bin";
    loadRecycleBin();
  } else {
    sec.classList.add("hidden");
    btn.innerText = "Show Recycle Bin";
  }
}

// CREATE NEW ACCOUNT
async function createNewAccount() {
  const username = document.getElementById("newUsername").value.toLowerCase().trim();
  const accountType = document.getElementById("newAccountType").value;
  const password = document.getElementById("newPassword").value;
  const confirmPassword = document.getElementById("confirmPassword").value;

  if (!username) return alert("Please enter username");
  if (!password) return alert("Please enter password");
  if (password !== confirmPassword) return alert("Passwords do not match");
  if (employees.includes(username)) return alert("Username already exists");

  // Only admin can create admin accounts
  if (accountType === "admin" && !isAdmin) {
    return alert("Only admin can create admin accounts");
  }

  // Add employee to list
  employees.push(username);
  if (accountType === "admin") {
    adminPasswords[username] = password;
  }

  // Save to Firestore
  const { doc, setDoc } = await import("https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js");
  try {
    await setDoc(doc(window.db, "accounts", username), {
      username: username,
      password: password,
      accountType: accountType,
      createdOn: new Date().toLocaleString(),
      createdBy: currentUser
    });
    alert("Account created successfully!");
    closeCreateAccountModal();
  } catch (e) {
    console.error("Error creating account:", e);
    alert("Error creating account");
  }
}

// PDF DOWNLOAD FUNCTIONS
async function downloadAttendancePDF(period) {
  // Load jsPDF and the autoTable plugin sequentially, then generate PDF
  function loadScript(url) {
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = url;
      s.onload = () => resolve();
      s.onerror = () => reject(new Error('Failed to load ' + url));
      document.head.appendChild(s);
    });
  }

  try {
    await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js');
    // autotable plugin must be loaded after jspdf
    await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.5.28/jspdf.plugin.autotable.min.js');

    const { jsPDF } = window.jspdf;
    let data = await getUserAttendanceAll(currentUser);
    let today = new Date();
    let filteredData = {};

    if (period === 'week') {
      let sevenDaysAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
      for (let d in data) {
        const dt = new Date(d);
        if (!isNaN(dt) && dt >= sevenDaysAgo && dt <= today) filteredData[d] = data[d];
      }
    } else if (period === 'month') {
      let thirtyDaysAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);
      for (let d in data) {
        const dt = new Date(d);
        if (!isNaN(dt) && dt >= thirtyDaysAgo && dt <= today) filteredData[d] = data[d];
      }
    }

    if (Object.keys(filteredData).length === 0) return alert('No attendance data for selected period');

    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    let yPosition = 20;

    doc.setFontSize(16);
    doc.text('Attendance Report', pageWidth / 2, yPosition, { align: 'center' });
    yPosition += 10;

    doc.setFontSize(11);
    doc.text(`Employee: ${currentUser.toUpperCase()}`, 20, yPosition);
    yPosition += 7;

    doc.text(`Period: ${period === 'week' ? 'Last 7 Days' : 'Last 30 Days'}`, 20, yPosition);
    yPosition += 10;

    const headers = ['Date', 'Status', 'Time'];
    const rows = [];
    for (let d in filteredData) rows.push([d, filteredData[d].status, filteredData[d].time]);

    // autoTable should now be available
    if (typeof doc.autoTable !== 'function') {
      console.warn('autoTable not found on jsPDF object; attempting fallback');
    }

    doc.autoTable({
      head: [headers],
      body: rows,
      startY: yPosition,
      theme: 'grid',
      styles: { fontSize: 10, cellPadding: 3 }
    });

    const filename = `Attendance_${currentUser}_${period}.pdf`;
    doc.save(filename);
  } catch (e) {
    console.error('Error generating PDF:', e);
    alert('Error generating PDF: ' + e.message);
  }
}

// Load dark mode on startup
document.addEventListener("DOMContentLoaded", loadDarkModePreference);
