const employees=["amit","divanshu","sujit","ganesh","nanki","shiv kumar","sheetal","manisha","aman","abhishek","khushboo","akshay","vikki","sumit"];
const adminPasswords={amit:"Amit2580",divanshu:"Divanshu2580"};
const EMP_PASSWORD="IDFC1234";
let currentUser="";
let isAdmin=false;

// FIRESTORE HELPER FUNCTIONS
async function saveAttendance(user, date, status, time){
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
  } catch(e) {
    console.error("Error saving attendance:", e);
  }
}

async function getAttendance(user, date){
  const { doc, getDoc } = await import("https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js");
  try {
    const iso = toISODate(date);
    const snapshot = await getDoc(doc(window.db, "attendance", user + "_" + iso));
    return snapshot.exists() ? snapshot.data() : null;
  } catch(e) {
    console.error("Error getting attendance:", e);
    return null;
  }
}

async function getUserAttendanceAll(user){
  const { collection, query, where, getDocs } = await import("https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js");
    try {
      const snapshot = await getDocs(collection(window.db, "attendance"));
      let data = {};

      snapshot.forEach(doc => {
        const id = doc.id || "";
        const d = doc.data() || {};

        // Case A: document has explicit user field
        if(d.user && d.user === user){
          const date = d.date || id.replace(user + "_", "");
          data[date] = { status: d.status || "", time: d.time || "" };
          return;
        }

        // Case B: document id starts with `user_` (legacy format)
        if(id.startsWith(user + "_")){
          const dateFromId = id.substring((user + "_").length) || id;
          // prefer structured fields if present
          if(d.status || d.time || d.date){
            const date = d.date || dateFromId;
            data[date] = { status: d.status || "", time: d.time || "" };
          } else {
            // if the document contains other keys (legacy), try to map them
            // e.g. fields like '1/6/2026': 'Present' or nested values
            const keys = Object.keys(d);
            if(keys.length === 1){
              const k = keys[0];
              // if value is object with time/status
              const val = d[k];
              if(val && typeof val === 'object' && (val.status || val.time)){
                data[k] = { status: val.status || "", time: val.time || "" };
              } else {
                // fallback: treat doc id dateFromId as date and value as status
                data[dateFromId] = { status: String(val || ""), time: "" };
              }
            } else {
              // multiple keys: assume they are date entries
              keys.forEach(k => {
                const val = d[k];
                if(typeof val === 'object'){
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
        if(d[user]){
          const obj = d[user];
          if(typeof obj === 'object'){
            Object.keys(obj).forEach(k => {
              const val = obj[k];
              if(typeof val === 'object') data[k] = { status: val.status || "", time: val.time || "" };
              else data[k] = { status: String(val || ""), time: "" };
            });
          }
          return;
        }
      });

      return data;
  } catch(e) {
    console.error("Error getting user attendance:", e);
    return {};
  }
}

async function saveWeekOff(user, date){
  const { doc, setDoc } = await import("https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js");
  try {
    await setDoc(doc(window.db, "weekoffs", date), {
      user: user,
      date: date,
      applied: new Date().toLocaleString()
    });
  } catch(e) {
    console.error("Error saving week off:", e);
  }
}

async function getWeekOffs(){
  const { collection, getDocs } = await import("https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js");
  try {
    const snapshot = await getDocs(collection(window.db, "weekoffs"));
    let offs = [];
    snapshot.forEach(doc => {
      offs.push(doc.data());
    });
    return offs;
  } catch(e) {
    console.error("Error getting week offs:", e);
    return [];
  }
}

async function deleteAttendance(user, date){
  const { doc, deleteDoc } = await import("https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js");
  try {
    const iso = toISODate(date);
    await deleteDoc(doc(window.db, "attendance", user + "_" + iso));
  } catch(e) {
    console.error("Error deleting attendance:", e);
  }
}

// Convert various date inputs to ISO yyyy-mm-dd
function toISODate(d){
  // if already in yyyy-mm-dd
  if(typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d)) return d;
  // try Date parse
  const dt = new Date(d);
  if(!isNaN(dt)) return dt.toISOString().slice(0,10);
  // fallback: replace slashes with dashes and remove time
  return String(d).replace(/\//g,'-').split(' ')[0];
}

// LOGIN
async function login(){
  let u=username.value.toLowerCase().trim();
  let p=password.value;

  if(!employees.includes(u)) return alert("Invalid User");

  if(adminPasswords[u]){
    if(p!==adminPasswords[u]) return alert("Wrong Password");
    isAdmin=true;
  }else{
    if(p!==EMP_PASSWORD) return alert("Wrong Password");
  }

  currentUser=u;
  loginBox.classList.add("hidden");
  mainPanel.classList.remove("hidden");
  welcome.innerText="Welcome "+currentUser.toUpperCase();
  await loadToday();

  if(isAdmin){
    adminPanel.classList.remove("hidden");
    loadAdminDropdown();
    await loadWeekOffs();
    setTimeout(() => loadAttendance(), 500);
  }
}

// LOGOUT
function logout(){location.reload();}

// MARK PRESENT (ONCE PER DAY)
async function markPresent(){
  let today=new Date().toISOString().slice(0,10);
  let time=new Date().toLocaleTimeString();
  
  let existing = await getAttendance(currentUser, today);
  if(existing) return alert("Today attendance already marked");
  
  await saveAttendance(currentUser, today, "Present", time);
  await loadToday();
}

// SHOW TODAY ONLY
async function loadToday(){
  todayTable.innerHTML="";
  let today=new Date().toISOString().slice(0,10);
  let data = await getUserAttendanceAll(currentUser);
  if(data[today]){
    todayTable.innerHTML+=`<tr><td>${today}</td><td>${data[today].status}</td><td>${data[today].time}</td></tr>`;
  }
}

// APPLY WEEK OFF (ONLY ONE PERSON PER DATE)
async function applyWeekOff(){
  let d=weekOffDate.value;
  if(!d) return alert("Select date");

  let offs = await getWeekOffs();

  // CHECK CONFLICT
  let conflict=offs.find(o=>o.date===d);
  if(conflict){
    return alert(`${conflict.date} ko ${conflict.user.toUpperCase()} ne already Week Off dala hai`);
  }

  // SAVE
  await saveWeekOff(currentUser, d);

  alert("Week Off Applied Successfully");
  weekOffDate.value="";
  await loadWeekOffs();
}

// ADMIN FUNCTIONS
function loadAdminDropdown(){
  empSelect.innerHTML="";
  employees.forEach(e=>{
    empSelect.innerHTML+=`<option value="${e}">${e.toUpperCase()}</option>`;
  });
}

async function loadAttendance(){
  let u=empSelect.value;
  adminTable.innerHTML="";
  let data = await getUserAttendanceAll(u);
  console.log("Loading attendance for:", u);
  try{
    console.log("Data received (raw):", data);
    console.log("Data received (json):", JSON.stringify(data));
  }catch(e){
    console.log("Error stringifying data", e);
  }

  // If no records, show a friendly message row
  if(!data || Object.keys(data).length === 0){
    adminTable.innerHTML = `<tr><td colspan="4">No attendance records found for ${u.toUpperCase()}</td></tr>`;
    return;
  }

  for(let d in data){
    adminTable.innerHTML+=`
    <tr>
      <td>${d}</td>
      <td>${data[d].status}</td>
      <td>${data[d].time}</td>
      <td><button class="delete" onclick="deleteRec('${u}','${d}')">Delete</button></td>
    </tr>`;
  }
}

async function deleteRec(u,d){
  if(!confirm("Delete attendance?"))return;
  await deleteAttendance(u, d);
  await loadAttendance();
}

// WEEK OFF LIST (ADMIN)
async function loadWeekOffs(){
  weekOffTable.innerHTML="";
  let offs = await getWeekOffs();
  offs.forEach(o=>{
    weekOffTable.innerHTML+=`
    <tr>
      <td>${o.user.toUpperCase()}</td>
      <td>${o.date}</td>
      <td>${o.applied}</td>
    </tr>`;
  });
}
