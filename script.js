let currentUser = null;
let adminDashboardMode = "all";
let checklistBuilderItemsCache = [];
let signaturePadHasInk = false;
let currentCheckBase = "";
let currentCheckUnit = "";
let scheduleCalendarDate = new Date();

// Replace this with your real Vercel API URL.
const API_URL = "https://apparatus-api.vercel.app";

function installUnansweredReviewStyles() {
  if (document.getElementById("unansweredReviewStyles")) return;

  const style = document.createElement("style");
  style.id = "unansweredReviewStyles";
  style.textContent = `
    .unanswered-box {
      border: 1px solid #facc15;
      background: rgba(250, 204, 21, 0.08);
    }

    .unanswered-ok {
      border: 1px solid #22c55e;
      background: rgba(34, 197, 94, 0.08);
    }

    .unanswered-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 10px;
      margin-top: 8px;
      border: 1px solid rgba(148, 163, 184, 0.25);
      border-radius: 10px;
      background: rgba(15, 23, 42, 0.55);
    }

    .needs-attention {
      outline: 3px solid #facc15;
      box-shadow: 0 0 0 4px rgba(250, 204, 21, 0.18);
    }
  `;
  document.head.appendChild(style);
}


window.addEventListener("error", function (event) {
  try { hideSavingOverlay(); } catch (err) {}

  const btn = document.getElementById("saveCheckBtn");
  if (btn) {
    btn.disabled = false;
    btn.innerHTML = "Save Check";
    btn.style.opacity = "1";
  }

  const message =
    (event && event.message ? event.message : "Unknown page error") +
    (event && event.lineno ? " on line " + event.lineno : "");

  console.error("Page error:", event);
  alert("Page error: " + message);
});

window.addEventListener("unhandledrejection", function (event) {
  try { hideSavingOverlay(); } catch (err) {}

  const btn = document.getElementById("saveCheckBtn");
  if (btn) {
    btn.disabled = false;
    btn.innerHTML = "Save Check";
    btn.style.opacity = "1";
  }

  const reason = event && event.reason ? event.reason : "Unknown promise error";
  const message = reason && reason.message ? reason.message : String(reason);
  console.error("Promise error:", event);
  alert("Save error: " + message);
});


function showToast(message, type = "info") {
  const old = document.getElementById("pageToast");
  if (old) old.remove();

  const toast = document.createElement("div");

  toast.id = "pageToast";
  toast.className = "toast " + type;
  toast.innerHTML = message;

  document.body.appendChild(toast);

  setTimeout(() => {
    const t = document.getElementById("pageToast");
    if (t) t.remove();
  }, 3500);
}

function formatExpDate(input) {
  let digits = String(input.value || "").replace(/\D/g, "");

  if (digits.length > 6) {
    digits = digits.substring(0, 6);
  }

  let value = digits;

  if (digits.length <= 2) {
    value = digits;
  } else if (digits.length === 3) {
    // 627 -> 6/27
    value = digits.substring(0, 1) + "/" + digits.substring(1);
  } else if (digits.length === 4) {
    // 1127 -> 11/27
    value = digits.substring(0, 2) + "/" + digits.substring(2);
  } else if (digits.length === 5) {
    // 62027 -> 6/2027
    value = digits.substring(0, 1) + "/" + digits.substring(1);
  } else if (digits.length === 6) {
    // 102027 -> 10/2027
    value = digits.substring(0, 2) + "/" + digits.substring(2);
  }

  input.value = value;
}

function isValidMonthYear(value) {
  const text = String(value || "").trim();
  const match = text.match(/^(\d{1,2})\/(\d{2}|\d{4})$/);
  if (!match) return false;

  const month = Number(match[1]);
  return month >= 1 && month <= 12;
}



function normalizeBaseText(base) {
  return String(base || "")
    .trim()
    .toUpperCase()
    .replace(/^BASE\s*/i, "")
    .replace(/[^0-9A-Z]/g, "");
}

function deriveChecklistBaseFromUnit(unit, fallbackBase) {
  const text = String(unit || "")
    .trim()
    .toUpperCase();
  const match =
    text.match(/^BASE\s*(93|98)(?=\D|$)/) || text.match(/^(93|98)(?=\D|$)/);

  if (match && match[1]) return normalizeBaseText(match[1]);
  return normalizeBaseText(fallbackBase);
}


function getOperationalCheckDayInfo() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "long",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  }).formatToParts(new Date());

  const data = {};
  parts.forEach(part => {
    if (part.type !== "literal") data[part.type] = part.value;
  });

  let date = new Date(Number(data.year), Number(data.month) - 1, Number(data.day));
  const hour = Number(data.hour || 0);
  const minute = Number(data.minute || 0);

  // The apparatus check day resets at 06:30 Eastern.
  // Before 06:30, we still treat it as the previous check day.
  if (hour < 6 || (hour === 6 && minute < 30)) {
    date.setDate(date.getDate() - 1);
  }

  const weekday = date.toLocaleDateString("en-US", { weekday: "long" }).toUpperCase();
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");

  return {
    date: `${y}-${m}-${d}`,
    weekday: weekday,
    shortWeekday: weekday.slice(0, 3)
  };
}

function normalizeCheckDayToken(value) {
  const text = String(value || "").trim().toUpperCase();
  const map = {
    "SUNDAY": "SUN",
    "SUN": "SUN",
    "MONDAY": "MON",
    "MON": "MON",
    "TUESDAY": "TUE",
    "TUES": "TUE",
    "TUE": "TUE",
    "WEDNESDAY": "WED",
    "WEDS": "WED",
    "WED": "WED",
    "THURSDAY": "THU",
    "THURS": "THU",
    "THUR": "THU",
    "THU": "THU",
    "FRIDAY": "FRI",
    "FRI": "FRI",
    "SATURDAY": "SAT",
    "SAT": "SAT"
  };

  return map[text] || text;
}

function isCheckDueForOperationalDay(checkDays) {
  const raw = String(checkDays || "").trim();
  if (!raw) return false;

  const upper = raw.toUpperCase();

  if (
    upper === "DAILY" ||
    upper === "EVERYDAY" ||
    upper === "EVERY DAY" ||
    upper === "ALL" ||
    upper === "ALL DAYS"
  ) {
    return true;
  }

  const info = getOperationalCheckDayInfo();
  const today = normalizeCheckDayToken(info.shortWeekday);

  if (upper.includes("WEEKDAY") || upper.includes("MON-FRI") || upper.includes("M-F")) {
    return ["MON", "TUE", "WED", "THU", "FRI"].includes(today);
  }

  if (upper.includes("WEEKEND")) {
    return ["SAT", "SUN"].includes(today);
  }

  const tokens = upper
    .split(/[\s,;|/]+/)
    .map(normalizeCheckDayToken)
    .filter(Boolean);

  return tokens.includes(today);
}

function getUnitCheckDaysValue(unit) {
  return String(
    unit.checkDays ||
    unit.CheckDays ||
    unit.checkDay ||
    unit.CheckDay ||
    unit.Checkday ||
    unit.days ||
    ""
  ).trim();
}


window.onload = function () {
  installUnansweredReviewStyles();
  const savedUser = sessionStorage.getItem("currentUser");
  if (savedUser) {
    currentUser = JSON.parse(savedUser);

    const savedRoute = getSavedRouteState();
    if (savedRoute && savedRoute.route && savedRoute.route !== "login") {
      replaceRoute(savedRoute.route, savedRoute.data || {});
      handleRouteState(savedRoute);
    } else {
      showDashboard(false);
      replaceRoute("dashboard");
    }
  } else {
    resetLoginScreen();
  }
};

window.addEventListener("pageshow", function () {
  if (!sessionStorage.getItem("currentUser")) {
    resetLoginScreen();
  }
});

function hideAll() {
  document.getElementById("loginView").classList.add("hidden");
  document.getElementById("signupView").classList.add("hidden");
  document.getElementById("dashboardView").classList.add("hidden");
  const apparatusView = document.getElementById("apparatusView");
  if (apparatusView) apparatusView.classList.add("hidden");
  const scheduleView = document.getElementById("scheduleView");
  if (scheduleView) scheduleView.classList.add("hidden");
  const openShiftsView = document.getElementById("openShiftsView");
  if (openShiftsView) openShiftsView.classList.add("hidden");
  const expirationsView = document.getElementById("expirationsView");
  if (expirationsView) expirationsView.classList.add("hidden");
  document.getElementById("checkView").classList.add("hidden");
  document.getElementById("adminView").classList.add("hidden");
  document.getElementById("fleetView").classList.add("hidden");
}

function isAdminUser() {
  return (
    currentUser &&
    String(currentUser.role || "")
      .trim()
      .toUpperCase() === "ADMIN"
  );
}

function requireAdminPage() {
  if (!isAdminUser()) {
    showToast("Admin access only.", "error");
    showDashboard();
    return false;
  }
  return true;
}

function showOnlyPage(pageId) {
  hideAll();
  const page = document.getElementById(pageId);
  if (page) {
    page.classList.remove("hidden");
  }
  window.scrollTo(0, 0);
}

function saveCurrentRouteState(route, data) {
  try {
    sessionStorage.setItem(
      "currentRoute",
      JSON.stringify({
        route: route,
        data: data || {},
      }),
    );
  } catch (err) {
    console.error("Route save failed", err);
  }
}

function getSavedRouteState() {
  try {
    const raw = sessionStorage.getItem("currentRoute");
    return raw ? JSON.parse(raw) : null;
  } catch (err) {
    console.error("Route restore failed", err);
    return null;
  }
}

function pushRoute(route, data) {
  const state = { route: route, data: data || {} };
  const hashParts = [route];
  if (data && data.base) {
    hashParts.push(String(data.base).replace(/\s+/g, "_"));
  }
  if (data && data.unit) {
    hashParts.push(String(data.unit).replace(/\s+/g, "_"));
  }

  saveCurrentRouteState(route, data || {});
  history.pushState(state, "", "#" + hashParts.join("/"));
}

function replaceRoute(route, data) {
  const state = { route: route, data: data || {} };
  const hashParts = [route];
  if (data && data.base) {
    hashParts.push(String(data.base).replace(/\s+/g, "_"));
  }
  if (data && data.unit) {
    hashParts.push(String(data.unit).replace(/\s+/g, "_"));
  }

  saveCurrentRouteState(route, data || {});
  history.replaceState(state, "", "#" + hashParts.join("/"));
}

function handleRouteState(state) {
  if (!currentUser) {
    showLogin(false);
    return;
  }

  const route = state && state.route ? state.route : "dashboard";
  const data = state && state.data ? state.data : {};

  if (route === "dashboard") return showDashboard(false);
  if (route === "apparatus") return showApparatusPage(false);
  if (route === "schedule") return showSchedulePage(false);
  if (route === "openShifts") return showOpenShiftsPage(false);
  if (route === "expirations") return showExpirationsPage(false);
  if (route === "admin") return openAdmin(false);
  if (route === "fleetMap") return showFleetMap(false);
  if (route === "fleetInfo")
    return isAdminUser() ? showFleetInfo(false) : showDashboard(false);
  if (route === "unitInfo")
    return isAdminUser()
      ? openUnitInfo(data.unit || "", false)
      : showDashboard(false);
  if (route === "checkForm")
    return openCheckForm(data.unit || "", data.base || "", false);

  showDashboard(false);
}

window.addEventListener("popstate", function (event) {
  if (event.state && event.state.route) {
    saveCurrentRouteState(event.state.route, event.state.data || {});
  }
  handleRouteState(event.state);
});

function showSignup() {
  hideAll();
  clearLoginMessages();
  document.getElementById("signupView").classList.remove("hidden");
}

function resetLoginScreen() {
  const usernameField = document.getElementById("loginUsername");
  const passwordField = document.getElementById("loginPassword");
  const loginMsg = document.getElementById("loginMsg");
  const signupMsg = document.getElementById("signupMsg");
  const loginBtn =
    document.getElementById("loginBtn") ||
    document.querySelector("#loginView button");

  if (usernameField) {
    usernameField.value = "";
    usernameField.defaultValue = "";
  }

  if (passwordField) {
    passwordField.value = "";
    passwordField.defaultValue = "";
  }

  if (loginMsg) {
    loginMsg.textContent = "";
    loginMsg.innerHTML = "";
    loginMsg.style.color = "";
    loginMsg.style.display = "";
  }

  if (signupMsg) {
    signupMsg.textContent = "";
    signupMsg.innerHTML = "";
    signupMsg.style.color = "";
    signupMsg.style.display = "";
  }

  if (loginBtn) {
    loginBtn.disabled = false;
    loginBtn.innerHTML = "Login";
    loginBtn.textContent = "Login";
    loginBtn.style.opacity = "1";
  }
}

function clearLoginMessages() {
  resetLoginScreen();
}

function showLogin(addToHistory = true) {
  showOnlyPage("loginView");
  currentUser = null;
  sessionStorage.removeItem("currentUser");

  document.getElementById("headerAdmin").innerHTML = "";

  const loginView = document.getElementById("loginView");
  if (loginView) {
    loginView.className = "box loginbox force-show";
    loginView.classList.remove("hidden");
    loginView.style.display = "block";
  }

  resetLoginScreen();
}

function signup() {
  const user = {
    name: document.getElementById("signupName").value.trim(),
    username: document.getElementById("signupUsername").value.trim(),
    password: document.getElementById("signupPassword").value.trim(),
    base: document.getElementById("signupBase").value,
    inviteCode: document.getElementById("signupCode").value.trim(),
  };

  const msg = document.getElementById("signupMsg");

  if (!user.name || !user.username || !user.password || !user.inviteCode) {
    msg.style.color = "#f87171";
    msg.textContent = "Fill out all fields.";
    return;
  }

  msg.style.color = "#60a5fa";
  msg.textContent = "Creating account...";

  fetch(API_URL + "/api/users", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      action: "signup",
      name: user.name,
      username: user.username,
      password: user.password,
      base: user.base,
      inviteCode: user.inviteCode
    }),
  })
    .then((res) => res.json())
    .then((result) => {
      msg.style.color = result.success ? "#4ade80" : "#f87171";
      msg.textContent = result.message || "Account request sent.";

      if (result.success) {
        document.getElementById("signupName").value = "";
        document.getElementById("signupUsername").value = "";
        document.getElementById("signupPassword").value = "";
        document.getElementById("signupCode").value = "";

        const baseField = document.getElementById("signupBase");
        if (baseField) {
          baseField.selectedIndex = 0;
        }

        setTimeout(() => {
          showLogin();
        }, 2000);
      }
    })
    .catch((error) => {
      msg.style.color = "#f87171";
      msg.textContent = error.message;
    });
}

function login() {
  const username = document.getElementById("loginUsername").value.trim();
  const password = document.getElementById("loginPassword").value.trim();
  const msg = document.getElementById("loginMsg");

  if (!username || !password) {
    msg.style.color = "#f87171";
    msg.textContent = "Enter username and password.";
    return;
  }

  const loginBtn = document.getElementById("loginBtn");

  if (loginBtn) {
    loginBtn.disabled = true;
    loginBtn.textContent = "Logging in...";
    loginBtn.style.opacity = ".65";
  }

  msg.style.display = "block";
  msg.style.color = "#60a5fa";
  msg.textContent = "Logging in...";

  fetch(API_URL + "/api/users", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      action: "login",
      username: username,
      password: password,
    }),
  })
    .then((res) => res.json())
    .then((result) => {
      if (!result.success) {
        if (loginBtn) {
          loginBtn.disabled = false;
          loginBtn.textContent = "Login";
          loginBtn.style.opacity = "1";
        }

        msg.style.color = "#f87171";
        msg.textContent = result.message || "Login failed.";
        return;
      }

      clearLoginMessages();

      currentUser = result;
      sessionStorage.setItem("currentUser", JSON.stringify(currentUser));

      showDashboard();
    })
    .catch((error) => {
      if (loginBtn) {
        loginBtn.disabled = false;
        loginBtn.textContent = "Login";
        loginBtn.style.opacity = "1";
      }

      msg.style.color = "#f87171";
      msg.textContent = error.message;
    });
}

function showDashboard(addToHistory = true) {
  clearLoginMessages();
  showOnlyPage("dashboardView");

  if (addToHistory) pushRoute("dashboard");

  const isAdmin = isAdminUser();

  const unitInfoBtn = document.getElementById("unitInfoDashboardBtn");
  if (unitInfoBtn) {
    unitInfoBtn.classList.toggle("hidden", !isAdmin);
  }

  const welcomeText = document.getElementById("welcomeText");
  if (welcomeText) {
    welcomeText.textContent =
      "Welcome, " + currentUser.name + " | Base " + currentUser.base;
  }

  document.getElementById("headerAdmin").innerHTML = "";

  if (isAdmin) {
    document.getElementById("headerAdmin").innerHTML =
      `<button class="header-admin-btn" onclick="openAdmin()">Admin</button>`;
  }

  loadTodaySchedule();

  fetch(API_URL + "/api/messages")
    .then((res) => res.json())
    .then((data) => {
      loadMessageBoard(data.messages || []);
    })
    .catch((error) => {
      const board = document.getElementById("messageBoard");

      if (board) {
        board.innerHTML = `
          <div class="message-board">
            <div class="message-title">Crew Message Board</div>
            <div class="message-item message-urgent">
              Message board error: ${escapeHtml(error.message)}
            </div>
          </div>
        `;
      }
    });
}

function showApparatusPage(addToHistory = true) {
  if (!currentUser) {
    showLogin(false);
    return;
  }

  showOnlyPage("apparatusView");
  if (addToHistory) pushRoute("apparatus");

  renderAdminViewSwitch();
  loadDashboardApparatus();
}

function showSchedulePage(addToHistory = true) {
  if (!currentUser) {
    showLogin(false);
    return;
  }

  showOnlyPage("scheduleView");
  if (addToHistory) pushRoute("schedule");
  loadScheduleCalendar();
}

function showOpenShiftsPage(addToHistory = true) {
  if (!currentUser) {
    showLogin(false);
    return;
  }

  showOnlyPage("openShiftsView");
  if (addToHistory) pushRoute("openShifts");
  loadOpenShifts();
}


function showExpirationsPage(addToHistory = true) {
  if (!currentUser) {
    showLogin(false);
    return;
  }

  showOnlyPage("expirationsView");
  if (addToHistory) pushRoute("expirations");
  loadExpirationsDashboard();
}

function formatScheduleDisplayDate(dateText) {
  if (!dateText) return "Today's crew";

  const parts = String(dateText).split("-").map(Number);
  if (parts.length !== 3 || parts.some(isNaN)) return "Today's crew";

  const date = new Date(parts[0], parts[1] - 1, parts[2]);
  return date.toLocaleDateString("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function loadTodaySchedule() {
  const box = document.getElementById("todaySchedule");
  const dateBox = document.getElementById("todayScheduleDate");

  if (!box) return;

  box.innerHTML = `<div class="schedule-loading">Loading schedule...</div>`;
  if (dateBox) dateBox.textContent = "Loading today's crew...";

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);

  fetch(API_URL + "/api/schedule?type=today", {
    signal: controller.signal,
  })
    .then((res) => {
      clearTimeout(timeout);
      if (!res.ok) {
        throw new Error("Schedule API returned " + res.status);
      }
      return res.json();
    })
    .then((data) => {
      const success = data.success === true || data.ok === true;

      if (!success) {
        throw new Error(
          data.error || data.message || "Could not load schedule.",
        );
      }

      const shifts = Array.isArray(data.shifts) ? data.shifts : [];

      if (dateBox) {
        dateBox.textContent = formatScheduleDisplayDate(data.date);
      }
      const statusText = document.getElementById("scheduleStatusText");
      if (statusText) statusText.textContent = "Online";

      if (shifts.length === 0) {
        box.innerHTML = `<div class="schedule-empty">No shifts found for today.</div>`;
        return;
      }

      const grouped = {};

      shifts.forEach((shift) => {
        const shiftName = String(shift.shift || "Shift").trim() || "Shift";
        if (!grouped[shiftName]) grouped[shiftName] = [];
        grouped[shiftName].push(shift);
      });

      box.innerHTML = Object.keys(grouped)
        .map((shiftName) => {
          const group = grouped[shiftName];
          const time = group[0] && group[0].time ? group[0].time : "";

          const people = group
            .map((shift) => {
              const employee = shift.employee || "Unassigned";
              const isOpen =
                shift.unassigned === true ||
                String(employee).toLowerCase().includes("unassigned");

              return `
            <div class="schedule-person ${isOpen ? "schedule-open" : ""}">
              ${escapeHtml(employee)}
            </div>
          `;
            })
            .join("");

          return `
          <div class="schedule-shift">
            <div class="schedule-shift-name">${escapeHtml(shiftName)}</div>
            ${time ? `<div class="schedule-time">${escapeHtml(time)}</div>` : ""}
            <div class="schedule-people">${people}</div>
          </div>
        `;
        })
        .join("");
    })
    .catch((error) => {
      clearTimeout(timeout);
      if (dateBox) dateBox.textContent = "Schedule unavailable";
      const statusText = document.getElementById("scheduleStatusText");
      if (statusText) statusText.textContent = "Error";

      const msg =
        error && error.name === "AbortError"
          ? "Schedule API timed out."
          : error.message || "Schedule API error.";

      box.innerHTML = `
        <div class="schedule-error">
          Could not load today's schedule.<br>
          <span>${escapeHtml(msg)}</span><br>
          <button type="button" class="small-btn" onclick="loadTodaySchedule()">Try Again</button>
        </div>
      `;
    });
}


function formatOpenShiftDate(dateText) {
  if (!dateText) return "Unknown Date";

  const parts = String(dateText).split("-").map(Number);
  if (parts.length !== 3 || parts.some(isNaN)) return String(dateText);

  const date = new Date(parts[0], parts[1] - 1, parts[2]);
  return date.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function loadOpenShifts() {
  const box = document.getElementById("openShiftsList");
  const subtitle = document.getElementById("openShiftsSubtitle");

  if (!box) return;

  box.innerHTML = `<div class="open-shifts-loading">Loading open shifts...</div>`;
  if (subtitle) subtitle.textContent = "Checking schedule...";

  fetch(API_URL + "/api/schedule?type=open")
    .then((res) => {
      if (!res.ok) {
        throw new Error("Open shifts API returned " + res.status);
      }
      return res.json();
    })
    .then((data) => {
      const shifts = Array.isArray(data.shifts) ? data.shifts : [];

      if (subtitle) {
        subtitle.textContent = shifts.length === 1
          ? "1 open shift found"
          : shifts.length + " open shifts found";
      }

      if (shifts.length === 0) {
        box.innerHTML = `<div class="open-shifts-empty">No open shifts found.</div>`;
        return;
      }

      box.innerHTML = shifts.map((shift) => {
        const date = formatOpenShiftDate(shift.date);
        const shiftName = shift.shift || "Open Shift";
        const time = shift.time || "";

        return `
          <div class="open-shift-row">
            <div class="open-shift-date">${escapeHtml(date)}</div>
            <div class="open-shift-main">
              <div class="open-shift-name">${escapeHtml(shiftName)}</div>
              ${time ? `<div class="open-shift-time">${escapeHtml(time)}</div>` : ""}
            </div>
            <div class="open-shift-badge">Open</div>
          </div>
        `;
      }).join("");
    })
    .catch((error) => {
      if (subtitle) subtitle.textContent = "Open shifts unavailable";
      box.innerHTML = `
        <div class="open-shifts-error">
          Could not load open shifts.<br>
          <span>${escapeHtml(error.message || "Open shifts API error.")}</span>
        </div>
      `;
    });
}


function getCalendarMonthValue() {
  const y = scheduleCalendarDate.getFullYear();
  const m = String(scheduleCalendarDate.getMonth() + 1).padStart(2, "0");
  return y + "-" + m;
}

function changeScheduleMonth(offset) {
  scheduleCalendarDate = new Date(
    scheduleCalendarDate.getFullYear(),
    scheduleCalendarDate.getMonth() + offset,
    1
  );
  loadScheduleCalendar();
}

function formatCalendarTitle(monthValue) {
  const parts = String(monthValue || getCalendarMonthValue()).split("-").map(Number);
  const date = new Date(parts[0], parts[1] - 1, 1);
  return date.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

function renderScheduleCalendar(monthValue, shifts) {
  const calendar = document.getElementById("scheduleCalendar");
  const title = document.getElementById("scheduleCalendarTitle");
  if (!calendar) return;

  const parts = String(monthValue || getCalendarMonthValue()).split("-").map(Number);
  const year = parts[0];
  const monthIndex = parts[1] - 1;

  if (title) {
    title.textContent = formatCalendarTitle(monthValue);
  }

  const firstDay = new Date(year, monthIndex, 1);
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  const startOffset = firstDay.getDay();

  const byDate = {};
  (shifts || []).forEach(shift => {
    if (!byDate[shift.date]) byDate[shift.date] = [];
    byDate[shift.date].push(shift);
  });

  let html = `
    <div class="schedule-calendar-grid schedule-calendar-days">
      <div>Sun</div><div>Mon</div><div>Tue</div><div>Wed</div><div>Thu</div><div>Fri</div><div>Sat</div>
    </div>
    <div class="schedule-calendar-grid">
  `;

  for (let i = 0; i < startOffset; i++) {
    html += `<div class="schedule-calendar-cell empty"></div>`;
  }

  for (let day = 1; day <= daysInMonth; day++) {
    const dateKey = `${year}-${String(monthIndex + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const dayShifts = byDate[dateKey] || [];

    const shiftHtml = dayShifts.map(shift => {
      const isOpen = shift.unassigned === true || String(shift.employee || "").toLowerCase().includes("unassigned");
      return `
        <div class="calendar-shift ${isOpen ? "calendar-shift-open" : ""}">
          <div class="calendar-shift-name">${escapeHtml(shift.shift || "Shift")}</div>
          <div class="calendar-shift-time">${escapeHtml(shift.time || "")}</div>
          <div class="calendar-shift-employee">${escapeHtml(shift.employee || "")}</div>
        </div>
      `;
    }).join("");

    html += `
      <div class="schedule-calendar-cell">
        <div class="schedule-calendar-date">${day}</div>
        <div class="schedule-calendar-shifts">${shiftHtml || `<div class="calendar-no-shifts">No shifts</div>`}</div>
      </div>
    `;
  }

  html += `</div>`;
  calendar.innerHTML = html;
}

function loadScheduleCalendar() {
  const calendar = document.getElementById("scheduleCalendar");
  const title = document.getElementById("scheduleCalendarTitle");
  if (!calendar) return;

  const monthValue = getCalendarMonthValue();
  calendar.innerHTML = `<div class="schedule-calendar-loading">Loading schedule calendar...</div>`;
  if (title) title.textContent = formatCalendarTitle(monthValue);

  fetch(API_URL + "/api/schedule?type=month&month=" + encodeURIComponent(monthValue))
    .then(res => {
      if (!res.ok) throw new Error("Schedule calendar API returned " + res.status);
      return res.json();
    })
    .then(data => {
      if (!(data.ok === true || data.success === true)) {
        throw new Error(data.error || "Could not load schedule calendar.");
      }
      renderScheduleCalendar(data.month || monthValue, Array.isArray(data.shifts) ? data.shifts : []);
    })
    .catch(error => {
      calendar.innerHTML = `
        <div class="schedule-calendar-error">
          Could not load schedule calendar.<br>
          <span>${escapeHtml(error.message || "Schedule calendar API error.")}</span>
        </div>
      `;
    });
}

function renderAdminViewSwitch() {
  const switchBox = document.getElementById("adminViewSwitch");
  if (!switchBox) return;

  const isAdmin =
    currentUser &&
    String(currentUser.role || "")
      .trim()
      .toUpperCase() === "ADMIN";

  if (!isAdmin) {
    switchBox.className = "hidden";
    switchBox.innerHTML = "";
    return;
  }

  switchBox.className = "";
  switchBox.innerHTML = `
    <div class="admin-view-switch">
      <button type="button" class="${adminDashboardMode === "due" ? "active" : ""}" onclick="setAdminDashboardMode('due')">Due Today</button>
      <button type="button" class="${adminDashboardMode === "all" ? "active" : ""}" onclick="setAdminDashboardMode('all')">All Check Sheets</button>
    </div>
    <div class="admin-view-note">Admin view only</div>
  `;
}

function setAdminDashboardMode(mode) {
  adminDashboardMode = mode === "all" ? "all" : "due";
  renderAdminViewSwitch();
  loadDashboardApparatus();
}

function loadDashboardApparatus() {
  const isAdmin =
    currentUser &&
    String(currentUser.role || "")
      .trim()
      .toUpperCase() === "ADMIN";

  const userBase = String(currentUser.base || "")
    .trim()
    .toUpperCase();

  const showAllChecksheets = isAdmin && adminDashboardMode === "all";

  const grid = document.getElementById("apparatusGrid");

  grid.innerHTML = `<p style="text-align:center;color:#60a5fa;grid-column:1/-1;">Loading apparatus...</p>`;

  let url = "";

  if (showAllChecksheets || userBase === "BOTH") {
    url = API_URL + "/api/apparatus?showAll=true";
  } else {
    url =
      API_URL + "/api/apparatus?base=" + encodeURIComponent(currentUser.base);
  }

  fetch(url)
    .then((res) => res.json())
    .then((data) => {
      if (!data.ok) {
        throw new Error(data.error || "Could not load apparatus.");
      }

      let units = data.units || [];

      // Employee/Due Today view:
      // 1. Unit must be active/in service.
      // 2. Unit must have Check Days filled out.
      // 3. Unit must be due for the current operational check day.
      // 4. Unit must not already be checked for the operational check day.
      if (!showAllChecksheets) {
        units = units.filter((u) => {
          const checkDays = getUnitCheckDaysValue(u);
          return u.active === true && checkDays !== "" && isCheckDueForOperationalDay(checkDays);
        });

        const statusChecks = units.map((u) => {
          const unitName = u.unit || "";
          const checklistBase = deriveChecklistBaseFromUnit(
            unitName,
            u.homeBase || u.base || currentUser.base
          );

          const todayUrl =
            API_URL +
            "/api/check-submissions?unit=" +
            encodeURIComponent(unitName) +
            "&base=" +
            encodeURIComponent(checklistBase);

          return fetch(todayUrl)
            .then((res) => res.json())
            .then((result) => ({
              ...u,
              checkedToday: result && result.checked === true,
              checkedBy: result && result.checkedBy ? result.checkedBy : "",
              checkedDate: result && result.checkedDate ? result.checkedDate : "",
              checkedTime: result && result.checkedTime ? result.checkedTime : ""
            }))
            .catch(() => ({
              ...u,
              checkedToday: false
            }));
        });

        return Promise.all(statusChecks);
      }

      return units;
    })
    .then((units) => {
      if (!Array.isArray(units)) units = [];

      const showAllChecksheets =
        isAdminUser() && adminDashboardMode === "all";

      if (!showAllChecksheets) {
        units = units.filter((u) => u.checkedToday !== true);
      }

      const mappedUnits = units.map((u) => ({
        _id: u._id,
        unit: u.unit,
        base: u.homeBase,
        homeBase: u.homeBase,
        currentBase: u.currentBase,
        checklistBase: u.homeBase,
        active: u.active ? "YES" : "NO",
        checkDays: getUnitCheckDaysValue(u),
        oosReason: u.oosReason || "",
        checkedToday: u.checkedToday === true,
        checkedBy: u.checkedBy || "",
        checkedDate: u.checkedDate || "",
        checkedTime: u.checkedTime || ""
      }));

      showApparatus(mappedUnits);
    })
    .catch((error) => {
      grid.innerHTML = `<div class="admin-row" style="grid-column:1/-1;text-align:center;">${escapeHtml(error.message)}</div>`;
    });
}

function showApparatus(units) {
  const grid = document.getElementById("apparatusGrid");
  grid.innerHTML = "";

  units = units || [];

  if (units.length === 0) {
    grid.innerHTML = `
      <div class="admin-row" style="grid-column:1/-1;text-align:center;">
        No apparatus check sheets found for this view.
      </div>
    `;
    return;
  }

  units.forEach((entry) => {
    const unit = entry && typeof entry === "object" ? entry.unit : entry;

    // checklistBase is the truck's home/owning base and is used to load the checklist.
    // currentBase is only where the truck is currently located.
    const checklistBase =
      entry && typeof entry === "object"
        ? deriveChecklistBaseFromUnit(
            unit,
            entry.checklistBase ||
              entry.homeBase ||
              entry.base ||
              currentUser.base,
          )
        : deriveChecklistBaseFromUnit(unit, currentUser.base);

    const currentBase =
      entry && typeof entry === "object"
        ? entry.currentBase || checklistBase
        : checklistBase;

    const isAdminAllCheckSheets =
      currentUser &&
      String(currentUser.role || "")
        .trim()
        .toUpperCase() === "ADMIN" &&
      adminDashboardMode === "all";

    const checkedToday =
      entry && typeof entry === "object" && entry.checkedToday === true;

    // Due/regular checkoff view: keep the card clean and only show the unit base.
    const regularInfoText = `<div class="muted">Base ${escapeHtml(checklistBase)}</div>`;

    // Admin All Check Sheets view: only show checkoff details when it was checked today.
    let adminAllInfoText = "";
    if (isAdminAllCheckSheets && checkedToday) {
      adminAllInfoText = `
        <div class="muted"><strong>Date:</strong> ${escapeHtml(entry.checkedDate || "")}</div>
        <div class="muted"><strong>Time:</strong> ${escapeHtml(entry.checkedTime || "")}</div>
        <div class="muted"><strong>Checked By:</strong> ${escapeHtml(entry.checkedBy || "")}</div>
      `;
    }

    const card = document.createElement("div");
    card.className = "unit-card";
    card.innerHTML = `
      <div class="unit-name">${escapeHtml(unit)}</div>
      ${isAdminAllCheckSheets ? adminAllInfoText : regularInfoText}
    `;

    // Pass the checklist/home base, not the current location.
    card.onclick = () => openCheckForm(unit, checklistBase);
    grid.appendChild(card);
  });
}

function openCheckForm(unit, baseOrAddToHistory = true, addToHistory = true) {
  let base = "";

  if (typeof baseOrAddToHistory === "boolean") {
    addToHistory = baseOrAddToHistory;
    base =
      currentCheckBase ||
      (currentUser && currentUser.base ? currentUser.base : "");
  } else {
    base = String(baseOrAddToHistory || "").trim();
  }

  if (!base || base.toUpperCase() === "BOTH") {
    base =
      currentUser &&
      currentUser.base &&
      String(currentUser.base).toUpperCase() !== "BOTH"
        ? currentUser.base
        : "";
  }

  base = deriveChecklistBaseFromUnit(unit, base);

  currentCheckBase = base;
  currentCheckUnit = unit;

  showOnlyPage("checkView");
  if (addToHistory) pushRoute("checkForm", { base: base, unit: unit });

  document.getElementById("checkForm").innerHTML =
    `<p style="text-align:center;color:#60a5fa;">Loading checklist for Home Base ${escapeHtml(base)} - ${escapeHtml(unit)}...</p>`;

  const todayUrl =
    API_URL +
    "/api/check-submissions?unit=" +
    encodeURIComponent(unit) +
    "&base=" +
    encodeURIComponent(base);

  fetch(todayUrl)
    .then((res) => res.json())
    .then((result) => {
      if (!result.ok) {
        throw new Error(result.error || "Could not check today's status.");
      }

      if (result && result.checked && !isAdminUser()) {
        document.getElementById("checkForm").innerHTML = `
          <div class="unit-title">${escapeHtml(unit)}</div>
          <div class="review-box">
            <strong>This apparatus has already been checked today.</strong><br><br>
            <span class="muted">
              Base ${escapeHtml(base)} - ${escapeHtml(unit)} was checked ${result.checkedTime ? "at " + escapeHtml(result.checkedTime) : "today"}${result.checkedBy ? " by " + escapeHtml(result.checkedBy) : ""}.<br>
              It can be checked again tomorrow.
            </span>
          </div>
          <button class="back-btn" onclick="showDashboard()">Back</button>
        `;
        return;
      }

      const checklistUrl =
        API_URL +
        "/api/checklist?unit=" +
        encodeURIComponent(unit) +
        "&base=" +
        encodeURIComponent(base);
      return fetch(checklistUrl)
        .then((res) => res.json())
        .then((data) => {
          if (!data.ok) {
            throw new Error(data.error || "Checklist failed to load.");
          }

          const items = data.items || [];

          if (items.length === 0) {
            document.getElementById("checkForm").innerHTML = `
              <div class="unit-title">${escapeHtml(unit)}</div>
              <div class="review-box">
                <strong>No checklist items found.</strong><br><br>
                <span class="muted">
                  Looking for Home Base <strong>${escapeHtml(base)}</strong> and Unit <strong>${escapeHtml(unit)}</strong>.<br>
                  Check MongoDB checkItems collection for this base and unit.
                </span>
              </div>
              <div class="admin-row">
                <strong>MongoDB checkItems documents should have:</strong><br><br>
                <span class="muted">base | unit | section | subsection | shelf | item | type | qty | subitems</span><br><br>
                <span class="muted">Example: 93 | 93 Medic 1 | Medical Bag | Left Side | | Oral Glucose | ONTRUCK | 2 |</span>
              </div>
              <button class="back-btn" onclick="showDashboard()">Back</button>
            `;
            return;
          }

          buildCheckForm(unit, items);
        });
    })
    .catch((error) => {
      document.getElementById("checkForm").innerHTML = `
        <div class="unit-title">${escapeHtml(unit)}</div>
        <div class="admin-row">
          <strong style="color:#f87171;">Checklist failed to load.</strong><br><br>
          ${escapeHtml(error.message)}
        </div>
        <button class="back-btn" onclick="showDashboard()">Back</button>
      `;
    });
}

function displaySectionName(section) {
  return section || "General";
}

function itemNeedsPsiField(itemName) {
  const name = String(itemName || "").toUpperCase();

  return (
    name.includes("SCBA") ||
    name.includes("O2") ||
    name.includes("OXYGEN") ||
    name.includes("AIR BOTTLE") ||
    name.includes("OXYGEN BOTTLE")
  );
}

function parseChecklistTypes(typeValue) {
  const raw = String(typeValue || "TEXT").toUpperCase();

  if (raw === "PASSFAIL") {
    return ["ONTRUCK", "FUNCTIONAL"];
  }

  return raw
    .split(/[,+|;/]/)
    .map((t) => t.trim())
    .filter(Boolean);
}

function hasChecklistType(typeValue, wanted) {
  return parseChecklistTypes(typeValue).includes(
    String(wanted || "").toUpperCase(),
  );
}


function toggleYesNoReason(selectEl) {
  const card = selectEl ? selectEl.closest(".check-item") : null;
  if (!card) return;

  const box = card.querySelector(".yesNoReasonBox");
  const input = card.querySelector(".yesNoReason");
  if (!box || !input) return;

  const isNo = String(selectEl.value || "").trim().toUpperCase() === "NO";
  box.classList.toggle("hidden", !isNo);

  if (!isNo) {
    input.value = "";
  }
}

function initYesNoReasonListeners() {
  document.querySelectorAll("#checkForm .yesNo").forEach((select) => {
    toggleYesNoReason(select);
    select.addEventListener("change", function () {
      toggleYesNoReason(this);
      if (currentCheckUnit) saveCheckDraft(currentCheckUnit);
    });
  });
}

function validateYesNoReasons() {
  const cards = Array.from(document.querySelectorAll("#checkForm .check-item"));
  for (const card of cards) {
    const yesNo = card.querySelector(".yesNo");
    const reason = card.querySelector(".yesNoReason");

    if (
      yesNo &&
      reason &&
      String(yesNo.value || "").trim().toUpperCase() === "NO" &&
      !String(reason.value || "").trim()
    ) {
      const itemName = card.dataset.item || "this item";
      const page = card.closest(".section-page");

      if (page && !page.classList.contains("active")) {
        const pages = Array.from(document.querySelectorAll(".section-page"));
        const index = pages.indexOf(page);
        if (index >= 0) showSectionPage(index);
      }

      setTimeout(() => {
        alert("Please enter a reason for: " + itemName);
        reason.focus();
      }, 100);

      return false;
    }
  }

  return true;
}

function parseBagSubitems(value) {
  return String(value || "")
    .split(/\r?\n|;/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function getSelectedChecklistTypes() {
  const checked = Array.from(
    document.querySelectorAll(".builderTypeOption:checked"),
  ).map((box) => box.value);

  return checked.join(",");
}

function getSelectedBuilderUnitInfo() {
  const select = document.getElementById("builderUnit");
  const option = select ? select.options[select.selectedIndex] : null;
  const value = select ? String(select.value || "") : "";

  if (value.includes("||")) {
    const parts = value.split("||");
    const unit = parts.slice(1).join("||") || "";
    return {
      base: deriveChecklistBaseFromUnit(unit, parts[0] || ""),
      unit: unit,
    };
  }

  const unit = option ? String(option.dataset.unit || value) : value;
  const base = option ? String(option.dataset.base || "") : "";
  return {
    base: deriveChecklistBaseFromUnit(unit, base),
    unit: unit,
  };
}

function setSelectedBuilderUnit(base, unit) {
  const select = document.getElementById("builderUnit");
  if (!select) return;

  const wanted = String(base || "") + "||" + String(unit || "");
  const option = Array.from(select.options).find(
    (opt) =>
      opt.value === wanted ||
      (String(opt.dataset.base || "") === String(base || "") &&
        String(opt.dataset.unit || "") === String(unit || "")),
  );

  if (option) {
    select.value = option.value;
  }
}

/* ===== CHECKOFF DRAFT AUTO-SAVE ===== */
function getCheckDraftKey(unit) {
  const base = deriveChecklistBaseFromUnit(
    unit,
    currentCheckBase ||
      (currentUser && currentUser.base ? currentUser.base : ""),
  );
  const today = new Date().toLocaleDateString("en-US");
  return (
    "apparatusDraft_" +
    String(base || "BASE") +
    "_" +
    String(unit || "UNIT").replace(/\s+/g, "_") +
    "_" +
    today
  );
}

function getCheckSectionKey(unit) {
  return getCheckDraftKey(unit) + "_section";
}

function saveCheckSection(unit, index) {
  try {
    if (!unit && currentCheckUnit) unit = currentCheckUnit;
    if (!unit) return;
    localStorage.setItem(getCheckSectionKey(unit), String(index));
  } catch (err) {
    console.error("Section save failed", err);
  }
}

function restoreCheckSection(unit) {
  try {
    const raw = localStorage.getItem(getCheckSectionKey(unit));
    if (raw === null || raw === "") return;

    const index = Number(raw);
    const pages = Array.from(
      document.querySelectorAll("#checkForm .section-page"),
    );
    if (!Number.isInteger(index) || index < 0 || index >= pages.length) return;

    showSectionPage(index);

    if (index === pages.length - 1) {
      buildReviewSummary();
      setTimeout(function(){ initSignaturePad(); }, 50);
    }
  } catch (err) {
    console.error("Section restore failed", err);
  }
}

function getCheckDraftData() {
  const cards = Array.from(document.querySelectorAll("#checkForm .check-item"));

  return cards.map((card) => ({
    item: card.dataset.item || "",
    section: card.dataset.section || "",
    subsection: card.dataset.subsection || "",
    shelf: card.dataset.shelf || "",
    onApparatus: card.querySelector(".onApparatus")?.value || "",
    functional: card.querySelector(".functional")?.value || "",
    yesNo: card.querySelector(".yesNo")?.value || "",
    yesNoReason: card.querySelector(".yesNoReason")?.value || "",
    numberValue: card.querySelector(".numberValue")?.value || "",
    percentageValue: card.querySelector(".percentageValue")?.value || "",
    expDateValue: card.querySelector(".expDateValue")?.value || "",
    expDate2Value: card.querySelector(".expDate2Value")?.value || "",
    serviceDateValue: card.querySelector(".serviceDateValue")?.value || "",
    fuelValue: card.querySelector(".fuelValue")?.value || "",
    oilValue: card.querySelector(".oilValue")?.value || "",
    psiValue: card.querySelector(".psiValue")?.value || "",
    psi2Value: card.querySelector(".psi2Value")?.value || "",
    seal1Value: card.querySelector(".seal1Value")?.value || "",
    seal2Value: card.querySelector(".seal2Value")?.value || "",
    testNumberValue: card.querySelector(".testNumberValue")?.value || "",
    textValue: card.querySelector(".textValue")?.value || "",
    notes: card.querySelector(".notes")?.value || "",
    bagChecks: Array.from(card.querySelectorAll(".bagSubCheck")).map(
      (cb) => !!cb.checked,
    ),
  }));
}

function saveCheckDraft(unit) {
  try {
    const cards = document.querySelectorAll("#checkForm .check-item");
    if (!cards || cards.length === 0) return;

    const payload = {
      savedAt: new Date().toISOString(),
      unit: unit,
      base: deriveChecklistBaseFromUnit(
        unit,
        currentCheckBase ||
          (currentUser && currentUser.base ? currentUser.base : ""),
      ),
      medicalBagTag: document.getElementById("medicalBagTag")?.value || "",
      data: getCheckDraftData(),
    };

    localStorage.setItem(getCheckDraftKey(unit), JSON.stringify(payload));
  } catch (err) {
    console.error("Draft save failed", err);
  }
}

function restoreCheckDraft(unit) {
  try {
    const raw = localStorage.getItem(getCheckDraftKey(unit));
    if (!raw) return;

    const payload = JSON.parse(raw);
    const rows = payload && Array.isArray(payload.data) ? payload.data : [];
    const bagTagField = document.getElementById("medicalBagTag");
    if (bagTagField && payload.medicalBagTag) {
      bagTagField.value = String(payload.medicalBagTag || "").toUpperCase();
    }
    if (rows.length === 0) return;

    const cards = Array.from(
      document.querySelectorAll("#checkForm .check-item"),
    );

    cards.forEach((card, index) => {
      const itemName = card.dataset.item || "";
      const row = rows.find((r) => r.item === itemName) || rows[index];
      if (!row) return;

      if (card.querySelector(".onApparatus"))
        card.querySelector(".onApparatus").value = row.onApparatus || "";
      if (card.querySelector(".functional"))
        card.querySelector(".functional").value = row.functional || "";
      if (card.querySelector(".yesNo")) {
        card.querySelector(".yesNo").value = row.yesNo || "";
        toggleYesNoReason(card.querySelector(".yesNo"));
      }
      if (card.querySelector(".yesNoReason"))
        card.querySelector(".yesNoReason").value = row.yesNoReason || "";
      if (card.querySelector(".numberValue"))
        card.querySelector(".numberValue").value = row.numberValue || "";
      if (card.querySelector(".percentageValue"))
        card.querySelector(".percentageValue").value =
          row.percentageValue || "";
      if (card.querySelector(".expDateValue"))
        card.querySelector(".expDateValue").value = row.expDateValue || "";
      if (card.querySelector(".expDate2Value"))
        card.querySelector(".expDate2Value").value = row.expDate2Value || "";
      if (card.querySelector(".serviceDateValue"))
        card.querySelector(".serviceDateValue").value = row.serviceDateValue || "";
      if (card.querySelector(".fuelValue"))
        card.querySelector(".fuelValue").value = row.fuelValue || "";
      if (card.querySelector(".oilValue"))
        card.querySelector(".oilValue").value = row.oilValue || "";
      if (card.querySelector(".psiValue"))
        card.querySelector(".psiValue").value = row.psiValue || "";
      if (card.querySelector(".psi2Value"))
        card.querySelector(".psi2Value").value = row.psi2Value || "";
      if (card.querySelector(".seal1Value"))
        card.querySelector(".seal1Value").value = row.seal1Value || "";
      if (card.querySelector(".seal2Value"))
        card.querySelector(".seal2Value").value = row.seal2Value || "";
      if (card.querySelector(".testNumberValue"))
        card.querySelector(".testNumberValue").value =
          row.testNumberValue || "";
      if (card.querySelector(".textValue"))
        card.querySelector(".textValue").value = row.textValue || "";
      if (card.querySelector(".notes"))
        card.querySelector(".notes").value = row.notes || "";

      const bagChecks = Array.from(card.querySelectorAll(".bagSubCheck"));
      bagChecks.forEach((cb, i) => {
        cb.checked = !!(row.bagChecks && row.bagChecks[i]);
      });
    });

    showToast("Saved progress restored.", "info");
  } catch (err) {
    console.error("Draft restore failed", err);
  }
}

function enableCheckDraftAutoSave(unit) {
  const form = document.getElementById("checkForm");
  if (!form) return;

  form.querySelectorAll("input, select, textarea").forEach((el) => {
    el.addEventListener("input", () => saveCheckDraft(unit));
    el.addEventListener("change", () => saveCheckDraft(unit));
  });
}

function clearCheckDraft(unit) {
  try {
    localStorage.removeItem(getCheckDraftKey(unit));
    localStorage.removeItem(getCheckSectionKey(unit));
  } catch (err) {
    console.error("Draft clear failed", err);
  }
}

function clearSavedProgress(unit) {
  if (!confirm("Clear saved progress for this checkoff?")) return;
  clearCheckDraft(unit);
  showToast("Saved progress cleared.", "success");
}
/* ===== END CHECKOFF DRAFT AUTO-SAVE ===== */


function renderMedicalBagTagField() {
  return `
    <div class="admin-row medical-bag-tag-row">
      <label>Medical Bag / Unit Number</label>
      <input
        id="medicalBagTag"
        type="text"
        placeholder="Example: 93 Rescue 2"
        style="text-transform:uppercase;"
        oninput="this.value = this.value.toUpperCase(); if (currentCheckUnit) saveCheckDraft(currentCheckUnit);">
      <div class="muted">Enter the unit number/name for this medical bag, such as 93 Rescue 2 or 98 Truck 1.</div>
    </div>
  `;
}

function buildCheckForm(unit, items) {
  let pages = [];
  let pageMap = {};

  items.forEach((item) => {
    const originalSection = item.section || "";
    const displaySection = displaySectionName(originalSection);

    if (!pageMap[displaySection]) {
      pageMap[displaySection] = [];
      pages.push({ name: displaySection, items: pageMap[displaySection] });
    }

    pageMap[displaySection].push(item);
  });

  let html = `<div class="unit-title">${unit}</div>`;

  if (pages.length === 0) {
    html += `
      <div class="review-box">
        <strong>No checklist items found for this apparatus.</strong><br><br>
        <span class="muted">Check that the Checklist sheet has Base + Unit filled in, such as 93 | Medic 1 or 98 | Medic 1.</span>
      </div>
      <button class="back-btn" onclick="showDashboard()">Back</button>
    `;
    document.getElementById("checkForm").innerHTML = html;
    return;
  }

  pages.forEach((page, pageIndex) => {
    html += `
      <div class="section-page ${pageIndex === 0 ? "active" : ""}" data-page="${pageIndex}">
        <div class="page-progress">Section ${pageIndex + 1} of ${pages.length + 1}</div>
        <div class="section-title">${page.name}</div>
    `;

    if (
      String(page.name || "").trim().toUpperCase() === "MEDICAL BAG" &&
      !html.includes('id="medicalBagTag"')
    ) {
      html += renderMedicalBagTagField();
    }

    let currentShelf = "";
    let gridOpen = false;

    function closeGrid() {
      if (gridOpen) {
        html += `</div>`;
        gridOpen = false;
      }
    }
    function openGrid() {
      if (!gridOpen) {
        html += `<div class="check-grid">`;
        gridOpen = true;
      }
    }

    page.items.forEach((item) => {
      const type = String(item.type || "TEXT")
        .trim()
        .toUpperCase();
      let typeList = parseChecklistTypes(type);
      const bagSubitems = parseBagSubitems(
        item.subitems || item.bagItems || "",
      );

      // Keep the automatic PSI field for oxygen/SCBA items, even if PSI was not selected.
      if (itemNeedsPsiField(item.item) && !typeList.includes("PSI")) {
        typeList.push("PSI");
      }

      const originalSection = item.section || "";
      const shelf = item.subsection || item.shelf || "";

      if (shelf && shelf !== currentShelf) {
        closeGrid();
        currentShelf = shelf;
        html += `
          <div class="shelf-title">
            ${currentShelf}
          </div>
        `;
        openGrid();
      }

      openGrid();

      html += `
        <div class="check-item"
          data-section="${originalSection}"
          data-subsection="${item.subsection || ""}"
          data-shelf="${shelf}"
          data-item="${item.item}"
          data-type="${typeList.join(",")}"
          data-subitems="${escapeHtml((item.subitems || item.bagItems || "").replace(/"/g, "&quot;"))}">
          <div class="item-name">${item.item}</div>
          ${
            item.qty
              ? `<div class="muted"><strong>Required Qty:</strong> ${escapeHtml(item.qty)}</div>`
              : ""
          }
      `;

      if (typeList.includes("ONTRUCK")) {
        html += `
          <div class="field-row single">
            <div>
              <label>On Apparatus</label>
              <select class="onApparatus">
                <option value="">Select</option>
                <option>Yes</option>
                <option>No</option>
              </select>
            </div>
          </div>
        `;
      }

      if (typeList.includes("FUNCTIONAL")) {
        html += `
          <div class="field-row single">
            <div>
              <label>Functional</label>
              <select class="functional">
                <option value="">Select</option>
                <option>Yes</option>
                <option>No</option>
                <option>N/A</option>
              </select>
            </div>
          </div>
        `;
      }

      if (typeList.includes("YESNO")) {
        html += `
          <div class="field-row single">
            <div>
              <label>Yes / No</label>
              <select class="yesNo" onchange="toggleYesNoReason(this)">
                <option value="">Select</option>
                <option>Yes</option>
                <option>No</option>
              </select>
            </div>
          </div>

          <div class="yesNoReasonBox hidden">
            <label>Reason for No</label>
            <textarea class="yesNoReason" placeholder="Enter reason for selecting No"></textarea>
          </div>
        `;
      }

      if (typeList.includes("NUMBER")) {
        html += `<label>Number / Mileage / Hours</label><input type="number" inputmode="numeric" pattern="[0-9]*" class="numberValue" placeholder="Enter number">`;
      }

      if (typeList.includes("PERCENTAGE")) {
        html += `
          <label>Battery Percentage</label>
          <input
            type="number"
            inputmode="numeric"
            pattern="[0-9]*"
            class="percentageValue"
            min="0"
            max="100"
            placeholder="0-100">
        `;
      }

      if (typeList.includes("DATE")) {
        html += `
          <label>Expiration Date (MM/YY)</label>
          <input
            type="text"
            inputmode="numeric"
            pattern="[0-9]*"
            class="expDateValue exp-date"
            placeholder="M/YY"
            maxlength="7"
            oninput="formatExpDate(this)">
        `;
      }

      if (typeList.includes("DATE2")) {
        html += `
          <label>Expiration Date 2 (MM/YY)</label>
          <input
            type="text"
            inputmode="numeric"
            pattern="[0-9]*"
            class="expDate2Value exp-date"
            placeholder="M/YY"
            maxlength="7"
            oninput="formatExpDate(this)">
        `;
      }


      if (typeList.includes("SERVICEDATE")) {
        html += `
          <label>Service Date (M/YY)</label>
          <input
            type="text"
            inputmode="numeric"
            pattern="[0-9]*"
            class="serviceDateValue exp-date"
            placeholder="M/YY"
            maxlength="7"
            oninput="formatExpDate(this)">
        `;
      }
      if (typeList.includes("FUEL")) {
        html += `
          <label>Fuel Level</label>
          <select class="fuelValue">
            <option value="">Select Fuel Level</option>
            <option>Full</option>
            <option>3/4</option>
            <option>1/2</option>
            <option>1/4</option>
            <option>Empty</option>
          </select>
        `;
      }

      if (typeList.includes("OIL")) {
        html += `
          <label>Oil Level</label>
          <select class="oilValue">
            <option value="">Select Oil Level</option>
            <option>Full</option>
            <option>Good</option>
            <option>Low</option>
            <option>Empty</option>
            <option>N/A</option>
          </select>
        `;
      }

      if (typeList.includes("PSI")) {
        html += `
          <label>PSI</label>
          <input
            type="number"
            inputmode="numeric"
            pattern="[0-9]*"
            class="psiValue"
            min="0"
            placeholder="Enter PSI">
        `;
      }

      if (typeList.includes("PSI2")) {
        html += `
          <label>PSI 2</label>
          <input
            type="number"
            inputmode="numeric"
            pattern="[0-9]*"
            class="psi2Value"
            min="0"
            placeholder="Enter second PSI">
        `;
      }

      if (typeList.includes("SEAL1")) {
        html += `
          <label>Seal 1</label>
          <input
            type="number"
            inputmode="numeric"
            pattern="[0-9]*"
            class="seal1Value"
            min="0"
            placeholder="Enter Seal 1 number">
        `;
      }

      if (typeList.includes("SEAL2")) {
        html += `
          <label>Seal 2</label>
          <input
            type="number"
            inputmode="numeric"
            pattern="[0-9]*"
            class="seal2Value"
            min="0"
            placeholder="Enter Seal 2 number">
        `;
      }

      if (typeList.includes("TESTNUMBER")) {
        html += `
          <label>Test Number</label>
          <input
            type="number"
            inputmode="numeric"
            pattern="[0-9]*"
            class="testNumberValue"
            min="0"
            placeholder="Enter Test Number">
        `;
      }

      if (typeList.includes("BAG") || bagSubitems.length > 0) {
        html += `
          <div class="bag-subcheck-box compact-bag-box">
            <div class="bag-subcheck-title">Inside This Item</div>
        `;

        if (bagSubitems.length === 0) {
          html += `<div class="muted">No internal checklist items were added in the builder.</div>`;
        }

        bagSubitems.forEach((subItem, subIndex) => {
          html += `
            <label class="bag-subcheck-item compact-bag-row" data-bag-subitem="${escapeHtml(subItem)}">
              <input type="checkbox" class="bagSubCheck" data-subitem="${escapeHtml(subItem)}">
              <span>${escapeHtml(subItem)}</span>
            </label>
          `;
        });

        html += `          </div>
        `;
      }

      if (typeList.includes("TEXT")) {
        html += `<label>Text</label><input type="text" class="textValue" placeholder="Enter value">`;
      }

      html += `
          <label>Notes</label>
          <input type="text" class="notes">
        </div>
      `;
    });

    closeGrid();

    html += `
        <div class="page-nav">
          ${
            pageIndex === 0
              ? `<button class="back-btn" onclick="showDashboard()">Back</button>`
              : `<button class="back-btn" onclick="prevSectionPage()">Previous</button>`
          }
          <button onclick="nextSectionPage()">Next</button>
        </div>
      </div>
    `;
  });
  html += `
    <div class="section-page" data-page="${pages.length}">
      <div class="page-progress">Final Step</div>
      <div class="section-title">Review & Save</div>

      <div class="review-box">
        <strong>${unit} Review</strong><br><br>
        <span class="muted">Review the answers below before saving.</span>
      </div>

      <div id="reviewSummary"></div>

      <div class="section-title">Certification</div>

      <div class="certification-box">
        I certify that I have thoroughly inspected this apparatus and completed this checkoff to the best of my knowledge and ability. I affirm that all information entered is accurate and truthful at the time of this inspection.
      </div>

      <div class="signature-wrap">
        <label>Printed Name</label>
        <input id="signatureName" readonly>

        <label>Signature</label>
        <canvas id="signaturePad"></canvas>
        <div id="signatureHint" class="signature-hint">Sign here</div>

        <button type="button" class="signature-clear-btn" onclick="clearSignature()">Clear Signature</button>
      </div>

      <div class="page-nav">
        <button class="back-btn" onclick="prevSectionPage()">Previous</button>
        <button type="button" id="saveCheckBtn" onclick="submitCheck('${unit}')">Save Check</button>
      </div>
    </div>
  `;

  document.getElementById("checkForm").innerHTML = html;

  restoreCheckDraft(unit);
  initYesNoReasonListeners();
  enableCheckDraftAutoSave(unit);
  restoreCheckSection(unit);

  const firstPageNav = document.querySelector(
    "#checkForm .section-page.active .page-nav",
  );
  if (firstPageNav && !document.getElementById("clearSavedProgressBtn")) {
    firstPageNav.insertAdjacentHTML(
      "beforebegin",
      `
      <button id="clearSavedProgressBtn" type="button" class="back-btn" onclick="clearSavedProgress('${unit.replace(/'/g, "\'")}')">Clear Saved Progress</button>
    `,
    );
  }
}

function getCurrentSectionPageIndex() {
  const pages = Array.from(document.querySelectorAll(".section-page"));
  return pages.findIndex((page) => page.classList.contains("active"));
}

function showSectionPage(index) {
  const pages = Array.from(document.querySelectorAll(".section-page"));
  if (index < 0 || index >= pages.length) return;

  pages.forEach((page) => page.classList.remove("active"));
  pages[index].classList.add("active");

  if (currentCheckUnit) {
    saveCheckSection(currentCheckUnit, index);
  }

  window.scrollTo({ top: 0, behavior: "smooth" });
}

function nextSectionPage() {
  const current = getCurrentSectionPageIndex();
  showSectionPage(current + 1);

  const pages = Array.from(document.querySelectorAll(".section-page"));
  const newIndex = getCurrentSectionPageIndex();

  if (newIndex === pages.length - 1) {
    buildReviewSummary();
    setTimeout(function(){ initSignaturePad(); }, 50);
  }
}

function prevSectionPage() {
  const current = getCurrentSectionPageIndex();
  showSectionPage(current - 1);
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function getItemReviewAnswer(card) {
  const typeList = parseChecklistTypes(card.dataset.type);
  const lines = [];

  if (typeList.includes("ONTRUCK")) {
    const onApp = card.querySelector(".onApparatus")?.value || "";
    lines.push(`
      <div class="review-line">
        <strong>On Apparatus:</strong> ${escapeHtml(onApp)}
      </div>
    `);
  }

  if (typeList.includes("FUNCTIONAL")) {
    const functional = card.querySelector(".functional")?.value || "";
    lines.push(`
      <div class="review-line">
        <strong>Functional:</strong> ${escapeHtml(functional)}
      </div>
    `);
  }

  if (typeList.includes("YESNO")) {
    const answer = card.querySelector(".yesNo")?.value || "";
    const reason = card.querySelector(".yesNoReason")?.value || "";
    lines.push(`
      <div class="review-line">
        <strong>Answer:</strong> ${escapeHtml(answer)}
      </div>
    `);

    if (String(answer).trim().toUpperCase() === "NO") {
      lines.push(`
        <div class="review-line">
          <strong>Reason for No:</strong> ${escapeHtml(reason)}
        </div>
      `);
    }
  }

  if (typeList.includes("NUMBER")) {
    const value = card.querySelector(".numberValue")?.value || "";
    lines.push(`
      <div class="review-line">
        <strong>Number:</strong> ${escapeHtml(value)}
      </div>
    `);
  }

  if (typeList.includes("PERCENTAGE")) {
    const value = card.querySelector(".percentageValue")?.value || "";
    lines.push(`
      <div class="review-line">
        <strong>Battery:</strong> ${escapeHtml(value)}%
      </div>
    `);
  }

  if (typeList.includes("DATE")) {
    const exp = card.querySelector(".expDateValue")?.value || "";
    lines.push(`
      <div class="review-line">
        <strong>Exp:</strong> ${escapeHtml(exp)}
      </div>
    `);
  }

  if (typeList.includes("DATE2")) {
    const exp2 = card.querySelector(".expDate2Value")?.value || "";
    lines.push(`
      <div class="review-line">
        <strong>Exp 2:</strong> ${escapeHtml(exp2)}
      </div>
    `);
  }


  if (typeList.includes("SERVICEDATE")) {
    const serviceDate = card.querySelector(".serviceDateValue")?.value || "";
    lines.push(`
      <div class="review-line">
        <strong>Service Date:</strong> ${escapeHtml(serviceDate)}
      </div>
    `);
  }

  if (typeList.includes("FUEL")) {
    const fuel = card.querySelector(".fuelValue")?.value || "";
    lines.push(`
      <div class="review-line">
        <strong>Fuel:</strong> ${escapeHtml(fuel)}
      </div>
    `);
  }

  if (typeList.includes("OIL")) {
    const oil = card.querySelector(".oilValue")?.value || "";
    lines.push(`
      <div class="review-line">
        <strong>Oil Level:</strong> ${escapeHtml(oil)}
      </div>
    `);
  }

  if (typeList.includes("PSI")) {
    const psi = card.querySelector(".psiValue")?.value || "";
    lines.push(`
      <div class="review-line">
        <strong>PSI:</strong> ${escapeHtml(psi)}
      </div>
    `);
  }

  if (typeList.includes("PSI2")) {
    const psi2 = card.querySelector(".psi2Value")?.value || "";
    lines.push(`
      <div class="review-line">
        <strong>PSI 2:</strong> ${escapeHtml(psi2)}
      </div>
    `);
  }

  if (typeList.includes("SEAL1")) {
    const seal1 = card.querySelector(".seal1Value")?.value || "";
    lines.push(`
      <div class="review-line">
        <strong>Seal 1:</strong> ${escapeHtml(seal1)}
      </div>
    `);
  }

  if (typeList.includes("SEAL2")) {
    const seal2 = card.querySelector(".seal2Value")?.value || "";
    lines.push(`
      <div class="review-line">
        <strong>Seal 2:</strong> ${escapeHtml(seal2)}
      </div>
    `);
  }

  if (typeList.includes("TESTNUMBER")) {
    const testNumber = card.querySelector(".testNumberValue")?.value || "";
    lines.push(`
      <div class="review-line">
        <strong>Test Number:</strong> ${escapeHtml(testNumber)}
      </div>
    `);
  }

  if (typeList.includes("TEXT")) {
    const text = card.querySelector(".textValue")?.value || "";
    lines.push(`
      <div class="review-line">
        <strong>Text:</strong> ${escapeHtml(text)}
      </div>
    `);
  }

  const bagRows = Array.from(card.querySelectorAll(".bag-subcheck-item"));
  if (typeList.includes("BAG") || bagRows.length > 0) {
    lines.push(
      `<div class="review-line"><strong>Inside Item Checklist:</strong></div>`,
    );
    bagRows.forEach((row) => {
      const subItem =
        row.dataset.bagSubitem ||
        row.querySelector(".bagSubCheck")?.dataset.subitem ||
        "Item";
      const checked = !!row.querySelector(".bagSubCheck")?.checked;
      const answer = checked ? "Checked" : "Not Checked";
      lines.push(`
        <div class="review-line">
          ${escapeHtml(subItem)}: ${escapeHtml(answer)}
        </div>
      `);
    });

    const bagNotes = card.querySelector(".bagNotes")?.value || "";
    if (bagNotes) {
      lines.push(`
        <div class="review-line">
          <strong>Bag Notes:</strong> ${escapeHtml(bagNotes)}
        </div>
      `);
    }
  }

  const notes = card.querySelector(".notes")?.value || "";
  lines.push(`
    <div class="review-line">
      <strong>Notes:</strong> ${escapeHtml(notes)}
    </div>
  `);

  return lines.join("");
}


function getMissingFieldsForCard(card) {
  const typeList = parseChecklistTypes(card.dataset.type);
  const item = card.dataset.item || "Item";
  const missing = [];

  function add(label, selector) {
    missing.push({
      item,
      label,
      selector,
      section: card.dataset.section || "General",
      shelf: card.dataset.shelf || card.dataset.subsection || ""
    });
  }

  if (typeList.includes("ONTRUCK") && !String(card.querySelector(".onApparatus")?.value || "").trim()) {
    add("On Apparatus", ".onApparatus");
  }

  if (typeList.includes("FUNCTIONAL") && !String(card.querySelector(".functional")?.value || "").trim()) {
    add("Functional", ".functional");
  }

  if (typeList.includes("YESNO")) {
    const answer = String(card.querySelector(".yesNo")?.value || "").trim();
    if (!answer) {
      add("Yes / No", ".yesNo");
    }

    if (answer.toUpperCase() === "NO" && !String(card.querySelector(".yesNoReason")?.value || "").trim()) {
      add("Reason for No", ".yesNoReason");
    }
  }

  if (typeList.includes("OIL") && !String(card.querySelector(".oilValue")?.value || "").trim()) {
    add("Oil Level", ".oilValue");
  }

  if (typeList.includes("SERVICEDATE") && !String(card.querySelector(".serviceDateValue")?.value || "").trim()) {
    add("Service Date", ".serviceDateValue");
  }

  if (typeList.includes("PERCENTAGE")) {
    const value = String(card.querySelector(".percentageValue")?.value || "").trim();
    if (value !== "") {
      const n = Number(value);
      if (isNaN(n) || n < 0 || n > 100) {
        add("Battery must be 0-100", ".percentageValue");
      }
    }
  }

  const bagRows = Array.from(card.querySelectorAll(".bag-subcheck-item"));
  if (typeList.includes("BAG") || bagRows.length > 0) {
    bagRows.forEach((row) => {
      const checkbox = row.querySelector(".bagSubCheck");
      if (checkbox && !checkbox.checked) {
        const subItem =
          row.dataset.bagSubitem ||
          checkbox.dataset.subitem ||
          "Inside item";
        missing.push({
          item,
          label: "Inside item not checked: " + subItem,
          selector: ".bagSubCheck",
          section: card.dataset.section || "General",
          shelf: card.dataset.shelf || card.dataset.subsection || ""
        });
      }
    });
  }

  return missing;
}

function getAllMissingCheckFields() {
  const cards = Array.from(document.querySelectorAll("#checkForm .check-item"));
  const missing = [];

  cards.forEach((card, index) => {
    card.dataset.reviewIndex = String(index);

    getMissingFieldsForCard(card).forEach((entry) => {
      missing.push({
        ...entry,
        index
      });
    });
  });

  return missing;
}

function goToMissingCheckItem(index, selector) {
  const card = document.querySelector(`#checkForm .check-item[data-review-index="${index}"]`);
  if (!card) return;

  const page = card.closest(".section-page");
  const pages = Array.from(document.querySelectorAll("#checkForm .section-page"));
  const pageIndex = pages.indexOf(page);

  if (pageIndex >= 0) {
    showSectionPage(pageIndex);
  }

  setTimeout(() => {
    card.scrollIntoView({ behavior: "smooth", block: "center" });
    card.classList.add("needs-attention");

    const field = selector ? card.querySelector(selector) : null;
    if (field && typeof field.focus === "function") {
      field.focus();
    }

    setTimeout(() => {
      card.classList.remove("needs-attention");
    }, 2500);
  }, 150);
}

function renderUnansweredReviewBox() {
  const missing = getAllMissingCheckFields();

  if (missing.length === 0) {
    return `
      <div class="admin-row unanswered-ok">
        <strong>All required fields are complete.</strong>
      </div>
    `;
  }

  return `
    <div class="admin-row unanswered-box">
      <div class="section-title">Unanswered / Needs Attention</div>
      <div class="muted">${missing.length} item${missing.length === 1 ? "" : "s"} need attention before saving.</div>
      ${missing.map((entry) => `
        <div class="unanswered-row">
          <div>
            <strong>${escapeHtml(entry.item)}</strong><br>
            <span class="muted">${escapeHtml(entry.section || "General")}${entry.shelf ? " • " + escapeHtml(entry.shelf) : ""} • ${escapeHtml(entry.label)}</span>
          </div>
          <button type="button" class="small-btn" onclick="goToMissingCheckItem(${entry.index}, '${escapeHtml(entry.selector || "")}')">
            Go To
          </button>
        </div>
      `).join("")}
    </div>
  `;
}

function buildReviewSummary() {
  const reviewBox = document.getElementById("reviewSummary");
  if (!reviewBox) return;

  const cards = Array.from(document.querySelectorAll(".check-item"));

  if (cards.length === 0) {
    reviewBox.innerHTML = `<div class="admin-row">No checklist items found.</div>`;
    return;
  }

  let html = renderUnansweredReviewBox();
  const currentBagTag = (document.getElementById("medicalBagTag")?.value || "").trim().toUpperCase();
  if (currentBagTag) {
    html += `
      <div class="admin-row review-bag-tag-line">
        <strong>Medical Bag / Unit Number:</strong> ${escapeHtml(currentBagTag)}
      </div>
    `;
  }
  let currentSection = "";
  let currentShelf = "";
  let gridOpen = false;

  function closeGrid() {
    if (gridOpen) {
      html += `</div>`;
      gridOpen = false;
    }
  }

  function openGrid() {
    if (!gridOpen) {
      html += `<div class="review-summary">`;
      gridOpen = true;
    }
  }

  cards.forEach((card) => {
    const section = card.dataset.section || "General";
    const subsection = card.dataset.subsection || "";
    const shelf = card.dataset.shelf || "";
    const item = card.dataset.item || "Item";

    if (section !== currentSection) {
      closeGrid();
      currentSection = section;
      currentShelf = "";
      html += `<div class="section-title">${escapeHtml(currentSection)}</div>`;
      openGrid();
    }

    if (shelf && shelf !== currentShelf) {
      closeGrid();
      currentShelf = shelf;
      html += `<div class="shelf-title">${escapeHtml(currentShelf)}</div>`;
      openGrid();
    }

    openGrid();

    html += `
      <div class="review-item">
        <div class="item-name">${escapeHtml(item)}</div>
        ${getItemReviewAnswer(card)}
      </div>
    `;
  });

  closeGrid();

  reviewBox.innerHTML = html;
}

function showSavingOverlay() {
  if (document.getElementById("savingOverlay")) return;

  document.body.insertAdjacentHTML(
    "beforeend",
    `
    <div id="savingOverlay" style="
      position:fixed;
      inset:0;
      background:rgba(0,0,0,.78);
      display:flex;
      justify-content:center;
      align-items:center;
      z-index:99999;
      padding:20px;
    ">
      <div style="
        width:100%;
        max-width:330px;
        background:#0f1b2d;
        border:1px solid #334155;
        border-radius:14px;
        padding:26px;
        text-align:center;
        box-shadow:0 20px 60px rgba(0,0,0,.35);
      ">
        <h2 style="margin:0;color:#f8fafc;font-size:22px;">Saving Check</h2>
        <p style="color:#94a3b8;margin-bottom:0;">Please wait. Do not close this page.</p>
      </div>
    </div>
  `,
  );
}

function hideSavingOverlay() {
  const overlay = document.getElementById("savingOverlay");
  if (overlay) overlay.remove();
}

function initSignaturePad() {
  const canvas = document.getElementById("signaturePad");
  const hint = document.getElementById("signatureHint");
  const nameBox = document.getElementById("signatureName");

  if (nameBox && currentUser && currentUser.name) {
    nameBox.value = currentUser.name;
  }

  if (!canvas) return;

  // Reset old event handlers/listeners by replacing the canvas with a clean clone.
  const freshCanvas = canvas.cloneNode(true);
  canvas.parentNode.replaceChild(freshCanvas, canvas);

  const ctx = freshCanvas.getContext("2d");
  const rect = freshCanvas.getBoundingClientRect();
  const ratio = Math.max(window.devicePixelRatio || 1, 1);

  const cssWidth = Math.max(300, Math.floor(rect.width || freshCanvas.clientWidth || 300));
  const cssHeight = Math.max(180, Math.floor(rect.height || freshCanvas.clientHeight || 180));

  freshCanvas.width = Math.floor(cssWidth * ratio);
  freshCanvas.height = Math.floor(cssHeight * ratio);
  freshCanvas.style.width = cssWidth + "px";
  freshCanvas.style.height = cssHeight + "px";
  freshCanvas.style.touchAction = "none";
  freshCanvas.style.background = "#ffffff";

  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  ctx.lineWidth = 3;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = "#000000";

  signaturePadHasInk = false;
  if (hint) hint.style.display = "block";

  let drawing = false;
  let lastPoint = null;

  function getPoint(event) {
    const r = freshCanvas.getBoundingClientRect();
    const touch =
      event.touches && event.touches.length
        ? event.touches[0]
        : event.changedTouches && event.changedTouches.length
          ? event.changedTouches[0]
          : null;

    const clientX = touch ? touch.clientX : event.clientX;
    const clientY = touch ? touch.clientY : event.clientY;

    return {
      x: clientX - r.left,
      y: clientY - r.top
    };
  }

  function startDraw(event) {
    if (event.cancelable) event.preventDefault();

    drawing = true;
    signaturePadHasInk = true;
    if (hint) hint.style.display = "none";

    lastPoint = getPoint(event);

    ctx.beginPath();
    ctx.moveTo(lastPoint.x, lastPoint.y);
  }

  function moveDraw(event) {
    if (!drawing) return;
    if (event.cancelable) event.preventDefault();

    const point = getPoint(event);
    ctx.beginPath();
    ctx.moveTo(lastPoint.x, lastPoint.y);
    ctx.lineTo(point.x, point.y);
    ctx.stroke();

    lastPoint = point;
  }

  function endDraw(event) {
    if (event && event.cancelable) event.preventDefault();
    drawing = false;
    lastPoint = null;
  }

  freshCanvas.addEventListener("pointerdown", startDraw);
  freshCanvas.addEventListener("pointermove", moveDraw);
  freshCanvas.addEventListener("pointerup", endDraw);
  freshCanvas.addEventListener("pointercancel", endDraw);
  freshCanvas.addEventListener("pointerleave", endDraw);

  freshCanvas.addEventListener("touchstart", startDraw, { passive: false });
  freshCanvas.addEventListener("touchmove", moveDraw, { passive: false });
  freshCanvas.addEventListener("touchend", endDraw, { passive: false });
  freshCanvas.addEventListener("touchcancel", endDraw, { passive: false });

  freshCanvas.addEventListener("mousedown", startDraw);
  freshCanvas.addEventListener("mousemove", moveDraw);
  freshCanvas.addEventListener("mouseup", endDraw);
  freshCanvas.addEventListener("mouseleave", endDraw);
}



function clearSignature() {
  const canvas = document.getElementById("signaturePad");
  const hint = document.getElementById("signatureHint");
  if (!canvas) return;

  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  signaturePadHasInk = false;
  if (hint) hint.style.display = "block";
}



function getSignatureData() {
  const canvas = document.getElementById("signaturePad");
  if (!canvas || !signaturePadHasInk) return "";
  return canvas.toDataURL("image/png");
}




function installSignaturePadPointerFallback() {
  // Signature handling is now built directly into initSignaturePad().
  return;
}



function submitCheckOriginal(unit) {
  if (typeof buildReviewSummary === "function") buildReviewSummary();
  if (!validateYesNoReasons()) return;

  const submitButton =
    document.getElementById("saveCheckBtn") ||
    document.querySelector(".check-actions button");

  const signature = getSignatureData();
  const medicalBagTag = String(document.getElementById("medicalBagTag")?.value || "").trim();

  if (!signature) {
    alert("Signature is required before submitting this check.");
    return;
  }

  if (submitButton) {
    submitButton.disabled = true;
    submitButton.innerHTML = "Please Wait...";
    submitButton.style.opacity = ".6";
  }

  showSavingOverlay();

  const cards = document.querySelectorAll(".check-item");
  const items = [];
  let hasIssue = false;
  let missing = [];

  cards.forEach((card) => {
    const section = card.dataset.section || "";
    const subsection = card.dataset.subsection || "";
    const shelf = card.dataset.shelf || "";
    const item = card.dataset.item;
    const type = card.dataset.type;
    const typeList = parseChecklistTypes(type);

    let parts = [];
    let status = "OK";

    if (typeList.includes("ONTRUCK")) {
      const onApp = card.querySelector(".onApparatus")?.value || "";
      if (!onApp) missing.push(item + " - On Apparatus");
      parts.push("On Apparatus: " + onApp);

      if (onApp === "No") {
        status = "ISSUE";
        hasIssue = true;
      } else if (status !== "ISSUE") {
        status = "PASS";
      }
    }

    if (typeList.includes("FUNCTIONAL")) {
      const functional = card.querySelector(".functional")?.value || "";
      if (!functional) missing.push(item + " - Functional");
      parts.push("Functional: " + functional);

      if (functional === "No") {
        status = "ISSUE";
        hasIssue = true;
      } else if (status !== "ISSUE") {
        status = "PASS";
      }
    }

    if (typeList.includes("YESNO")) {
      const answer = card.querySelector(".yesNo")?.value || "";
      const yesNoReason = String(card.querySelector(".yesNoReason")?.value || "").trim();

      if (!answer) missing.push(item + " - Yes/No");
      parts.push("Answer: " + answer);

      if (answer === "No") {
        if (!yesNoReason) missing.push(item + " - Reason for No");
        parts.push("Reason for No: " + yesNoReason);
        status = "ISSUE";
        hasIssue = true;
      } else if (status !== "ISSUE") {
        status = "PASS";
      }
    }

    if (typeList.includes("NUMBER")) {
      const value = card.querySelector(".numberValue")?.value || "";
      parts.push("Number: " + value);
    }

    if (typeList.includes("PERCENTAGE")) {
      const value = card.querySelector(".percentageValue")?.value || "";

      if (value !== "") {
        const percent = Number(value);
        if (isNaN(percent) || percent < 0 || percent > 100) {
          missing.push(
            item + " - Battery percentage must be between 0 and 100",
          );
        }
      }

      parts.push("Battery: " + value + "%");
    }

    if (typeList.includes("DATE")) {
      const exp = card.querySelector(".expDateValue")?.value || "";
      parts.push("Exp: " + exp);
    }

    if (typeList.includes("DATE2")) {
      const exp2 = card.querySelector(".expDate2Value")?.value || "";
      parts.push("Exp 2: " + exp2);
    }

    if (typeList.includes("SERVICEDATE")) {
      const serviceDate = card.querySelector(".serviceDateValue")?.value || "";
      parts.push("Service Date: " + serviceDate);
    }

    if (typeList.includes("FUEL")) {
      const fuel = card.querySelector(".fuelValue")?.value || "";
      parts.push("Fuel: " + fuel);
    }

    if (typeList.includes("OIL")) {
      const oil = card.querySelector(".oilValue")?.value || "";
      if (!oil) missing.push(item + " - Oil Level");
      parts.push("Oil Level: " + oil);

      if (oil === "Low" || oil === "Empty") {
        status = "ISSUE";
        hasIssue = true;
      } else if (status !== "ISSUE") {
        status = "PASS";
      }
    }

    if (typeList.includes("PSI")) {
      const psi = String(card.querySelector(".psiValue")?.value || "").trim();

      if (psi) {
        const psiNumber = Number(psi);
        if (isNaN(psiNumber) || psiNumber < 0) {
          missing.push(item + " - PSI must be a valid number");
        }
      }

      parts.push("PSI: " + psi);
    }

    if (typeList.includes("PSI2")) {
      const psi2 = String(card.querySelector(".psi2Value")?.value || "").trim();

      if (psi2) {
        const psi2Number = Number(psi2);
        if (isNaN(psi2Number) || psi2Number < 0) {
          missing.push(item + " - PSI 2 must be a valid number");
        }
      }

      parts.push("PSI 2: " + psi2);
    }

    if (typeList.includes("SEAL1")) {
      const seal1 = String(
        card.querySelector(".seal1Value")?.value || "",
      ).trim();

      if (seal1) {
        const seal1Number = Number(seal1);
        if (isNaN(seal1Number) || seal1Number < 0) {
          missing.push(item + " - Seal 1 must be a valid number");
        }
      }

      parts.push("Seal 1: " + seal1);
    }

    if (typeList.includes("SEAL2")) {
      const seal2 = String(
        card.querySelector(".seal2Value")?.value || "",
      ).trim();

      if (seal2) {
        const seal2Number = Number(seal2);
        if (isNaN(seal2Number) || seal2Number < 0) {
          missing.push(item + " - Seal 2 must be a valid number");
        }
      }

      parts.push("Seal 2: " + seal2);
    }

    if (typeList.includes("TESTNUMBER")) {
      const testNumber = String(
        card.querySelector(".testNumberValue")?.value || "",
      ).trim();

      if (testNumber) {
        const testNumberValue = Number(testNumber);
        if (isNaN(testNumberValue) || testNumberValue < 0) {
          missing.push(item + " - Test Number must be a valid number");
        }
      }

      parts.push("Test Number: " + testNumber);
    }

    const bagRows = Array.from(card.querySelectorAll(".bag-subcheck-item"));
    if (typeList.includes("BAG") || bagRows.length > 0) {
      bagRows.forEach((row) => {
        const subItem =
          row.dataset.bagSubitem ||
          row.querySelector(".bagSubCheck")?.dataset.subitem ||
          "Bag Item";
        const checked = !!row.querySelector(".bagSubCheck")?.checked;
        const answer = checked ? "Checked" : "Not Checked";

        parts.push("Bag Item - " + subItem + ": " + answer);

        if (!checked) {
          status = "ISSUE";
          hasIssue = true;
        } else if (status !== "ISSUE") {
          status = "PASS";
        }
      });

      const bagNotes = String(
        card.querySelector(".bagNotes")?.value || "",
      ).trim();
      if (bagNotes) {
        parts.push("Bag Notes: " + bagNotes);
      }
    }

    if (typeList.includes("TEXT")) {
      const text = card.querySelector(".textValue")?.value || "";
      parts.push("Text: " + text);
    }

    const notesField = card.querySelector(".notes");
    const notes = notesField ? notesField.value : "";
    const value = parts.filter(Boolean).join(" | ");

    items.push({
      section,
      subsection,
      shelf,
      item,
      type,
      value,
      status,
      notes,
      expDateValue: card.querySelector(".expDateValue")?.value || "",
      expDate2Value: card.querySelector(".expDate2Value")?.value || "",
      yesNoReason: getValuePart(value, "Reason for No")
    });
  });

  if (missing.length > 0) {
    hideSavingOverlay();

    if (submitButton) {
      submitButton.disabled = false;
      submitButton.innerHTML = "Save Check";
      submitButton.style.opacity = "1";
    }

    alert("Please complete or fix these fields:\n\n" + missing.join("\n"));
    return;
  }

  const badExpDate = Array.from(document.querySelectorAll(".exp-date")).find((input) => {
    return input.value && !isValidMonthYear(input.value);
  });

  if (badExpDate) {
    hideSavingOverlay();

    if (submitButton) {
      submitButton.disabled = false;
      submitButton.innerHTML = "Save Check";
      submitButton.style.opacity = "1";
    }

    alert("Dates must be entered as M/YY, MM/YY, M/YYYY, or MM/YYYY.");
    badExpDate.focus();
    return;
  }

  const checkData = {
  unit: unit,
  base: deriveChecklistBaseFromUnit(
    unit,
    currentCheckBase ||
      (currentUser && currentUser.base ? currentUser.base : ""),
  ),
  checkedBy: currentUser.name,
  status: hasIssue ? "ISSUES" : "COMPLETE",
  signature: signature,
  medicalBagTag: medicalBagTag,
  signatureName: document.getElementById("signatureName")
    ? document.getElementById("signatureName").value
    : currentUser.name,

  responses: items,   // <-- backend expects this
  items: items         // <-- keep this for compatibility if other code uses it
};

  console.log("=== CHECK SUBMISSION ===");
console.log("Medical Bag:", medicalBagTag);
items.forEach((item, index) => {
    console.log("ITEM", index);
    console.log(item);
});
console.log("Check Data:", checkData);
  
  fetch(API_URL + "/api/check-submissions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      unit: checkData.unit,
      base: checkData.base,
      checkedBy: checkData.checkedBy,
      status: checkData.status,
      signature: checkData.signature,
      signatureName: checkData.signatureName,
      medicalBagTag: checkData.medicalBagTag,
      responses: checkData.items,
      allowDuplicate: isAdminUser(),
    }),
  })
    .then((res) => res.json())
    .then((result) => {
      hideSavingOverlay();

      if (!result.ok) {
        if (submitButton) {
          submitButton.disabled = false;
          submitButton.innerHTML = "Save Check";
          submitButton.style.opacity = "1";
        }

        alert(result.error || "This apparatus has already been checked today.");
        showDashboard();
        return;
      }

      clearCheckDraft(unit);
      showToast("Check submitted successfully.", "success");
      showDashboard();
    })
    .catch((error) => {
      hideSavingOverlay();

      if (submitButton) {
        submitButton.disabled = false;
        submitButton.innerHTML = "Save Check";
        submitButton.style.opacity = "1";
      }

      alert(error.message);
    });
}



function resetTodayCheckForUnit(unit, base) {
  if (!requireAdminPage()) return;

  const cleanUnit = String(unit || "").trim();
  const cleanBase = deriveChecklistBaseFromUnit(cleanUnit, base || "");

  if (!cleanUnit || !cleanBase) {
    alert("Missing unit or base for reset.");
    return;
  }

  if (!confirm("Reset today's check for " + cleanUnit + "? This will make it show back up for employees if it is due today.")) {
    return;
  }

  fetch(
    API_URL +
      "/api/check-submissions?unit=" +
      encodeURIComponent(cleanUnit) +
      "&base=" +
      encodeURIComponent(cleanBase),
    {
      method: "DELETE"
    }
  )
    .then((res) => res.json())
    .then((result) => {
      if (!result.ok) {
        throw new Error(result.error || "Could not reset today's check.");
      }

      showToast("Today's check reset for " + cleanUnit + ".", "success");

      if (typeof refreshApparatusList === "function") {
        refreshApparatusList();
      }

      if (typeof loadDashboardApparatus === "function") {
        loadDashboardApparatus();
      }
    })
    .catch((error) => {
      alert(error.message);
    });
}


function submitCheck(unit) {
  try {
    return submitCheckOriginal(unit);
  } catch (error) {
    try { hideSavingOverlay(); } catch (err) {}

    const submitButton = document.getElementById("saveCheckBtn");
    if (submitButton) {
      submitButton.disabled = false;
      submitButton.innerHTML = "Save Check";
      submitButton.style.opacity = "1";
    }

    alert("Save Check error: " + (error && error.message ? error.message : String(error)));
    console.error(error);
    return false;
  }
}

/* ADMIN PANEL */

function openAdmin(addToHistory = true) {
  if (!requireAdminPage()) return;

  showOnlyPage("adminView");
  if (addToHistory) pushRoute("admin");

  document.getElementById("adminContent").innerHTML = `
    <div class="unit-title">Admin Panel</div>

    <div class="grid">
      <div class="admin-card" onclick="loadPendingUsers()">
        <div class="unit-name">Pending Users</div>
        <div class="muted">Approve or deny accounts</div>
      </div>

      <div class="admin-card" onclick="loadAllUsers()">
        <div class="unit-name">All Users</div>
        <div class="muted">View current users</div>
      </div>

      <div class="admin-card" onclick="loadApparatusAdmin()">
        <div class="unit-name">Apparatus</div>
        <div class="muted">Add or activate units</div>
      </div>

      <div class="admin-card" onclick="loadChecklistBuilder()">
        <div class="unit-name">Checklist Builder</div>
        <div class="muted">Build apparatus check sheets</div>
      </div>

      <div class="admin-card" onclick="loadRecentChecks()">
        <div class="unit-name">Recent Checks</div>
        <div class="muted">View latest submitted checks</div>
      </div>

      <div class="admin-card" onclick="loadDailyReports()">
        <div class="unit-name">Daily Reports</div>
        <div class="muted">Export or print daily checkoffs</div>
      </div>

      <div class="admin-card" onclick="loadServiceSchedule()">
        <div class="unit-name">Service Schedule</div>
        <div class="muted">Manage maintenance items</div>
      </div>

      <div class="admin-card" onclick="loadFleetInfoAdmin()">
        <div class="unit-name">Unit Information</div>
        <div class="muted">Edit VIN, tag, mileage and reference info</div>
      </div>

      <div class="admin-card" onclick="loadTruckMoves()">
        <div class="unit-name">Move Apparatus</div>
        <div class="muted">Move units between Base 93 and Base 98</div>
      </div>

      <div class="admin-card" onclick="loadCrewMessagesAdmin()">
        <div class="unit-name">Crew Messages</div>
        <div class="muted">Post messages on the home page</div>
      </div>

      <div class="admin-card" onclick="loadExpirationAdmin()">
        <div class="unit-name">Expirations</div>
        <div class="muted">Manage medical bags and expiration dates</div>
      </div>
    </div>

    <button class="back-btn" onclick="showDashboard()">Back to Dashboard</button>

    <div id="adminResults"></div>
  `;
}

function loadPendingUsers() {
  document.getElementById("adminResults").innerHTML =
    `<p style="text-align:center;color:#60a5fa;">Loading pending users...</p>`;

  fetch(API_URL + "/api/users?type=pending")
    .then((res) => res.json())
    .then((data) => {
      if (!data.ok) {
        throw new Error(data.message || "Could not load pending users.");
      }

      const users = data.users || [];
      let html = `<div class="section-title">Pending Users</div>`;

      if (users.length === 0) {
        html += `<div class="admin-row">No pending users.</div>`;
      }

      users.forEach((u) => {
        html += `
          <div class="admin-row">
            <strong>${escapeHtml(u.name || "")}</strong><br>
            <span class="muted">Username: ${escapeHtml(u.username || "")}</span><br>
            <span class="pill">Base ${escapeHtml(u.base || "")}</span>
            <span class="pill">${escapeHtml(u.role || "USER")}</span><br><br>

            <button class="success-btn small-btn" onclick="approveUserAdmin('${u._id}')">Approve</button>
            <button class="danger-btn small-btn" onclick="denyUserAdmin('${u._id}')">Deny</button>
            <button class="admin-btn small-btn" onclick="makeAdminUser('${u._id}')">Make Admin</button>
          </div>
        `;
      });

      document.getElementById("adminResults").innerHTML = html;
    })
    .catch((error) => {
      alert(error.message);
    });
}

function loadAllUsers() {
  document.getElementById("adminResults").innerHTML =
    `<p style="text-align:center;color:#60a5fa;">Loading users...</p>`;

  fetch(API_URL + "/api/users")
    .then((res) => res.json())
    .then((data) => {
      if (!data.ok) {
        throw new Error(data.message || "Could not load users.");
      }

      const users = data.users || [];
      let html = `<div class="section-title">All Users</div>`;

      if (users.length === 0) {
        html += `<div class="admin-row">No users found.</div>`;
      }

      users.forEach((u) => {
        const userId = String(u._id || "");
        const username = String(u.username || "");
        const isSelf =
          currentUser &&
          String(currentUser.username || "").trim().toLowerCase() === username.trim().toLowerCase();

        html += `
          <div class="admin-row">
            <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;">
              <div>
                <strong>${escapeHtml(u.name || "")}</strong><br>
                <span class="muted">Username: ${escapeHtml(u.username || "")}</span><br>
                <span class="pill">Base ${escapeHtml(u.base || "")}</span>
                <span class="pill">${escapeHtml(u.role || "USER")}</span>
                <span class="pill">Approved: ${u.approved ? "YES" : "NO"}</span>
                <span class="pill">Active: ${u.active !== false ? "YES" : "NO"}</span>
              </div>
              ${
                isSelf
                  ? `<span class="muted">Current User</span>`
                  : `<button type="button" class="danger-btn small-btn" onclick="deleteUserAdmin('${escapeHtml(userId)}', '${escapeHtml(username)}')">Delete User</button>`
              }
            </div>
          </div>
        `;
      });

      html += `<button class="back-btn" onclick="openAdmin()">Back to Admin Panel</button>`;

      document.getElementById("adminResults").innerHTML = html;
    })
    .catch((error) => {
      alert(error.message);
    });
}


function deleteUserAdmin(id, username) {
  if (!id) return alert("Missing user id.");

  if (
    currentUser &&
    String(currentUser.username || "").trim().toLowerCase() === String(username || "").trim().toLowerCase()
  ) {
    return alert("You cannot delete the account you are currently logged in with.");
  }

  if (!confirm("Delete user " + (username || "") + "? This cannot be undone.")) {
    return;
  }

  fetch(API_URL + "/api/users?id=" + encodeURIComponent(id), {
    method: "DELETE"
  })
    .then((res) => res.json())
    .then((result) => {
      if (!result.ok) {
        throw new Error(result.message || "Could not delete user.");
      }

      showToast("User deleted.", "success");
      loadAllUsers();
    })
    .catch((error) => {
      alert(error.message);
    });
}

function approveUserAdmin(id) {
  fetch(API_URL + "/api/users", {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      id: id,
      action: "approve",
    }),
  })
    .then((res) => res.json())
    .then((result) => {
      if (!result.ok) {
        throw new Error(result.message || "Approval failed.");
      }

      showToast("User approved.", "success");
      loadPendingUsers();
    })
    .catch((error) => {
      alert(error.message);
    });
}

function denyUserAdmin(id) {
  if (!confirm("Deny and delete this user?")) return;

  fetch(API_URL + "/api/users", {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      id: id,
      action: "deny",
    }),
  })
    .then((res) => res.json())
    .then((result) => {
      if (!result.ok) {
        throw new Error(result.message || "User denial failed.");
      }

      showToast("User denied.", "success");
      loadPendingUsers();
    })
    .catch((error) => {
      alert(error.message);
    });
}

function makeAdminUser(id) {
  if (!confirm("Make this user an admin?")) return;

  fetch(API_URL + "/api/users", {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      id: id,
      action: "makeAdmin",
    }),
  })
    .then((res) => res.json())
    .then((result) => {
      if (!result.ok) {
        throw new Error(result.message || "Could not make user admin.");
      }

      showToast("User is now an admin.", "success");
      loadPendingUsers();
    })
    .catch((error) => {
      alert(error.message);
    });
}

function loadApparatusAdmin() {
  document.getElementById("adminResults").innerHTML = `
    <div class="section-title">Add Apparatus</div>
    <div class="admin-row">
      <label>Unit Name</label>
      <input id="newUnit" placeholder="Example: Medic 1">

      <label>Home Base</label>
      <select id="newUnitBase">
        <option value="93">Base 93</option>
        <option value="98">Base 98</option>
      </select>

      <label>Check Days</label>
      <input id="newUnitCheckDays" placeholder="Example: DAILY">

      <button onclick="addNewApparatus()">Add Apparatus</button>
    </div>

    <div id="apparatusList"></div>
  `;

  refreshApparatusList();
}

function refreshApparatusList() {
  const list = document.getElementById("apparatusList");
  if (list) {
    list.innerHTML = `<p style="text-align:center;color:#60a5fa;">Loading apparatus...</p>`;
  }

  fetch(API_URL + "/api/apparatus?showAll=true")
    .then((res) => res.json())
    .then((data) => {
      if (!data.ok) {
        throw new Error(data.error || "Could not load apparatus.");
      }

      const units = data.unitInfo || [];
      let html = `<div class="section-title">Current Apparatus</div>`;

      if (units.length === 0) {
        html += `<div class="admin-row">No apparatus found.</div>`;
      }

      units.forEach((u) => {
        const id = String(u._id || "");
        const active = u.active !== false;
        const statusClass = active
          ? "apparatus-in-service"
          : "apparatus-out-service";

        html += `
          <div class="admin-row ${statusClass}">
            <strong>${escapeHtml(u.unit || "")}</strong><br>
            <span class="pill">Home Base ${escapeHtml(u.homeBase || "")}</span>
            <span class="pill">Current Base ${escapeHtml(u.currentBase || "")}</span>
            <span class="pill">Status: ${active ? "In Service" : "Out Of Service"}</span>
            <span class="pill">Check Days: ${escapeHtml(u.checkDays || "")}</span>
            ${!active && u.oosReason ? `<br><span class="muted"><strong>OOS Reason:</strong> ${escapeHtml(u.oosReason)}</span>` : ""}

            <label>Check Days</label>
            <input id="checkDays_${id}" value="${escapeHtml(u.checkDays || "")}" placeholder="DAILY">

            <label>Out Of Service Reason</label>
            <input id="oosReason_${id}" value="${escapeHtml(u.oosReason || "")}" placeholder="Reason if out of service">

            <button type="button" class="small-btn" onclick="saveUnitCheckDays('${id}')">Save Check Days</button>

            <button type="button" class="success-btn small-btn" onclick="setUnitInService('${id}')" ${active ? "disabled" : ""}>
              Set In Service
            </button>

            <button type="button" class="danger-btn small-btn" onclick="setUnitOutOfService('${id}')" ${!active ? "disabled" : ""}>
              Set Out Of Service
            </button>
            <button type="button" class="warning-btn small-btn" onclick="resetTodayCheckForUnit('${escapeHtml(u.unit || "")}', '${escapeHtml(u.homeBase || u.base || u.currentBase || "")}')">
              Reset Today's Check
            </button>
          </div>
        `;
      });

      if (list) {
        list.innerHTML = html;
      }
    })
    .catch((error) => {
      alert(error.message);
    });
}

function loadTruckMoves() {
  document.getElementById("adminResults").innerHTML =
    `<p style="text-align:center;color:#60a5fa;">Loading apparatus...</p>`;

  fetch(API_URL + "/api/apparatus?showAll=true")
    .then((res) => res.json())
    .then((data) => {
      if (!data.ok) {
        throw new Error(data.error || "Could not load apparatus.");
      }

      const units = data.units || [];

      let html = `
        <div class="section-title">Move Apparatus</div>

        <div class="admin-row">

          <label>Select Apparatus</label>

          <select id="moveUnit">
      `;

      units.forEach((u) => {
        const currentBase = u.currentBase || u.homeBase || "";

        html += `
          <option value="${u._id}">
            ${u.unit} - Current Base ${currentBase}
          </option>
        `;
      });

      html += `
          </select>

          <label>Move To Base</label>

          <select id="moveBase">
            <option value="93">Base 93</option>
            <option value="98">Base 98</option>
          </select>

          <br><br>

          <button onclick="submitMoveUnit()">
            Move Apparatus
          </button>

        </div>

        <button class="back-btn" onclick="openAdmin()">
          Back to Admin Panel
        </button>
      `;

      document.getElementById("adminResults").innerHTML = html;
    })
    .catch((error) => {
      alert(error.message);
    });
}

function submitMoveUnit() {
  const unitId = document.getElementById("moveUnit").value;

  const newBase = document.getElementById("moveBase").value;

  if (!unitId) {
    alert("Select an apparatus.");
    return;
  }

  fetch(API_URL + "/api/apparatus", {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      id: unitId,
      currentBase: newBase,
    }),
  })
    .then((res) => res.json())
    .then((result) => {
      if (!result.ok) {
        throw new Error(result.error || "Move failed.");
      }

      showToast("Apparatus moved successfully.", "success");

      loadTruckMoves();
      loadDashboardApparatus();
    })
    .catch((error) => {
      alert(error.message);
    });
}

function addNewApparatus() {
  const unit = document.getElementById("newUnit").value.trim();
  const base = document.getElementById("newUnitBase").value;
  const checkDays =
    document.getElementById("newUnitCheckDays").value.trim() || "DAILY";

  if (!unit) {
    alert("Enter a unit name.");
    return;
  }

  fetch(API_URL + "/api/apparatus", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      unit: unit,
      homeBase: base,
      currentBase: base,
      active: true,
      checkDays: checkDays,
      sortOrder: 999,
    }),
  })
    .then((res) => res.json())
    .then((result) => {
      if (!result.ok) {
        throw new Error(result.error || "Could not add apparatus.");
      }

      document.getElementById("newUnit").value = "";
      document.getElementById("newUnitCheckDays").value = "";
      showToast("Apparatus added.", "success");
      refreshApparatusList();
    })
    .catch((error) => {
      alert(error.message);
    });
}

function saveUnitCheckDays(id) {
  const input = document.getElementById("checkDays_" + id);
  const checkDays = input ? input.value.trim() : "";

  fetch(API_URL + "/api/apparatus", {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      id: id,
      checkDays: checkDays,
    }),
  })
    .then((res) => res.json())
    .then((result) => {
      if (!result.ok) {
        throw new Error(result.error || "Could not save check days.");
      }

      showToast("Check days saved.", "success");
      refreshApparatusList();
    })
    .catch((error) => {
      alert(error.message);
    });
}

function refreshAfterApparatusStatusChange() {
  if (document.getElementById("apparatusList")) {
    refreshApparatusList();
  }
  if (document.getElementById("apparatusGrid")) {
    loadDashboardApparatus();
  }
}

function setUnitInService(id) {
  id = String(id || "").trim();
  if (!id) {
    alert("Missing apparatus id. Refresh the page and try again.");
    return;
  }

  fetch(API_URL + "/api/apparatus", {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      id: id,
      active: true,
      oosReason: "",
    }),
  })
    .then((res) => res.json())
    .then((result) => {
      if (!result.ok) {
        throw new Error(result.error || "Could not set unit in service.");
      }

      if (result.matched === 0) {
        throw new Error(
          "No apparatus matched that id. Refresh the page and try again.",
        );
      }

      showToast("Unit set in service.", "success");
      refreshAfterApparatusStatusChange();
    })
    .catch((error) => alert(error.message));
}

function setUnitOutOfService(id) {
  id = String(id || "").trim();
  if (!id) {
    alert("Missing apparatus id. Refresh the page and try again.");
    return;
  }

  const reasonInput = document.getElementById("oosReason_" + id);
  const reason = reasonInput ? reasonInput.value.trim() : "";

  fetch(API_URL + "/api/apparatus", {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      id: id,
      active: false,
      oosReason: reason,
    }),
  })
    .then((res) => res.json())
    .then((result) => {
      if (!result.ok) {
        throw new Error(result.error || "Could not set unit out of service.");
      }

      if (result.matched === 0) {
        throw new Error(
          "No apparatus matched that id. Refresh the page and try again.",
        );
      }

      showToast("Unit set out of service.", "success");
      refreshAfterApparatusStatusChange();
    })
    .catch((error) => alert(error.message));
}

function setUnitStatus(id, active) {
  if (active === true || String(active || "").toUpperCase() === "YES") {
    return setUnitInService(id);
  }

  return setUnitOutOfService(id);
}

function toggleUnit(id, active) {
  return setUnitStatus(id, active);
}

function loadChecklistBuilder() {
  document.getElementById("adminResults").innerHTML = `
    <div class="section-title" id="checklistBuilderFormTitle">Add Checklist Item</div>

    <div class="admin-row">
      <input type="hidden" id="builderEditRow" value="">

      <label>Apparatus</label>
      <select id="builderUnit" onchange="cancelChecklistBuilderEdit(); refreshChecklistBuilder()"></select>

      <label>Section</label>
      <input id="builderSection" placeholder="Example: Cab, Airway, Compartment 1" oninput="toggleShelfField()">

      <div id="subsectionField" class="hidden">
        <label>Medical Bag Subsection</label>
        <select id="builderSubsection">
          <option value="">Select Medical Bag Subsection</option>
          <option value="Left Side">Left Side</option>
          <option value="Right Side">Right Side</option>
          <option value="Flap">Front Flap</option>
          <option value="Middle Compartment">Middle Compartment</option>
          <option value="Top Flap">Top Flap</option>
          <option value="Airway Bag">Airway Bag</option>
          <option value="Outside">Outside</option>
        </select>
      </div>

      <div id="shelfChoice" class="hidden">
        <label>
          <input type="checkbox" id="hasShelf" onchange="toggleShelfInput()" style="width:auto;min-height:auto;margin-right:8px;">
          This section has shelves
        </label>
      </div>

      <div id="shelfField" class="hidden">
        <label>Shelf</label>
        <input id="builderShelf" placeholder="Example: Top Shelf, Middle Shelf, Bottom Shelf">
      </div>

      <label>Item</label>
      <input id="builderItem" placeholder="Example: Suction, Mileage, AED">

      <label>Required Qty</label>
      <input id="builderQty" placeholder="Example: 2 (optional)">

      <label>Types (choose one or more)</label>
      <div id="builderType" class="type-check-grid">
        <label><input type="checkbox" class="builderTypeOption" value="ONTRUCK"> ONTRUCK - On Apparatus</label>
        <label><input type="checkbox" class="builderTypeOption" value="FUNCTIONAL"> FUNCTIONAL</label>
        <label><input type="checkbox" class="builderTypeOption" value="YESNO"> YES/NO</label>
        <label><input type="checkbox" class="builderTypeOption" value="NUMBER"> NUMBER - Mileage / Hours</label>
        <label><input type="checkbox" class="builderTypeOption" value="PERCENTAGE"> PERCENTAGE - Battery %</label>
        <label><input type="checkbox" class="builderTypeOption" value="DATE"> DATE - Expiration Date</label>
        <label><input type="checkbox" class="builderTypeOption" value="DATE2"> DATE 2 - Second Expiration Date</label>
<label><input type="checkbox" class="builderTypeOption" value="SERVICEDATE"> Service Date</label>
        <label><input type="checkbox" class="builderTypeOption" value="FUEL"> FUEL - Fuel Level</label>
        <label><input type="checkbox" class="builderTypeOption" value="OIL"> OIL LEVEL</label>
        <label><input type="checkbox" class="builderTypeOption" value="PSI"> PSI - Bottle Pressure</label>
        <label><input type="checkbox" class="builderTypeOption" value="PSI2"> PSI 2 - Second Bottle Pressure</label>
        <label><input type="checkbox" class="builderTypeOption" value="SEAL1"> SEAL 1 - Number</label>
        <label><input type="checkbox" class="builderTypeOption" value="SEAL2"> SEAL 2 - Number</label>
        <label><input type="checkbox" class="builderTypeOption" value="TESTNUMBER"> TEST NUMBER</label>
        <label><input type="checkbox" class="builderTypeOption" value="BAG"> BAG - Checklist inside item</label>
        <label><input type="checkbox" class="builderTypeOption" value="TEXT"> TEXT - Text Entry</label>
      </div>

      <label>Bag / Item Checklist Items</label>
      <textarea id="builderSubitems" placeholder="Optional. Put one item per line. Example:
Adult BVM
OPA Kit
NPA Kit
O2 Tubing"></textarea>

      <div class="muted">
        Use this when the main item is a bag, kit, box, pouch, or container that needs its own internal checklist.
      </div>

      <button id="builderSaveBtn" onclick="saveChecklistBuilderItem()">Add Item</button>
      <button id="builderCancelEditBtn" class="back-btn hidden" onclick="cancelChecklistBuilderEdit()">Cancel Edit</button>
    </div>

    <div id="checklistBuilderList"></div>
  `;

  fetch(API_URL + "/api/apparatus?showAll=true")
    .then((res) => res.json())
    .then((data) => {
      if (!data.ok) {
        throw new Error(data.error || "Could not load apparatus.");
      }

      const units = data.units || [];
      const select = document.getElementById("builderUnit");

      select.innerHTML = "";

      units.forEach((u) => {
        if (u.active !== true) return;

        const opt = document.createElement("option");

        const unit = String(u.unit || "").trim();
        const base = deriveChecklistBaseFromUnit(
          unit,
          u.homeBase || u.base || "",
        );

        opt.value = base + "||" + unit;
        opt.dataset.base = base;
        opt.dataset.unit = unit;
        opt.textContent = unit + " - Base " + base;

        select.appendChild(opt);
      });

      refreshChecklistBuilder();
    })
    .catch((error) => {
      alert(error.message);
    });
}

function toggleShelfField() {
  const section = document.getElementById("builderSection").value.toLowerCase();
  const subsectionField = document.getElementById("subsectionField");
  const builderSubsection = document.getElementById("builderSubsection");
  const shelfChoice = document.getElementById("shelfChoice");
  const shelfField = document.getElementById("shelfField");
  const hasShelf = document.getElementById("hasShelf");
  const shelfInput = document.getElementById("builderShelf");

  if (section.includes("medical bag")) {
    subsectionField.classList.remove("hidden");
    shelfChoice.classList.add("hidden");
    shelfField.classList.add("hidden");

    if (hasShelf) hasShelf.checked = false;
    if (shelfInput) shelfInput.value = "";

    return;
  }

  subsectionField.classList.add("hidden");
  if (builderSubsection) builderSubsection.value = "";

  if (section.includes("compartment")) {
    shelfChoice.classList.remove("hidden");
  } else {
    shelfChoice.classList.add("hidden");
    shelfField.classList.add("hidden");
    if (hasShelf) hasShelf.checked = false;
    if (shelfInput) shelfInput.value = "";
  }
}

function toggleShelfInput() {
  const hasShelf = document.getElementById("hasShelf").checked;
  const shelfField = document.getElementById("shelfField");
  const shelfInput = document.getElementById("builderShelf");

  if (hasShelf) {
    shelfField.classList.remove("hidden");
  } else {
    shelfField.classList.add("hidden");
    if (shelfInput) shelfInput.value = "";
  }
}

function clearChecklistBuilderForm(keepUnit = true) {
  const currentUnitInfo = getSelectedBuilderUnitInfo();

  const editRow = document.getElementById("builderEditRow");
  const title = document.getElementById("checklistBuilderFormTitle");
  const saveBtn = document.getElementById("builderSaveBtn");
  const cancelBtn = document.getElementById("builderCancelEditBtn");

  if (editRow) editRow.value = "";
  if (title) title.textContent = "Add Checklist Item";
  if (saveBtn) saveBtn.textContent = "Add Item";
  if (cancelBtn) cancelBtn.classList.add("hidden");

  if (document.getElementById("builderSection"))
    if (document.getElementById("builderItem"))
      // Section kept after add so you can keep adding to same compartment/shelf
      // Subsection kept after add
      // Shelf kept after add
      document.getElementById("builderItem").value = "";
  if (document.getElementById("builderQty"))
    document.getElementById("builderQty").value = "";
  if (document.getElementById("builderSubitems"))
    document.getElementById("builderSubitems").value = "";
  if (document.getElementById("hasShelf"))
    document.getElementById("hasShelf").checked = false;
  document
    .querySelectorAll(".builderTypeOption")
    .forEach((box) => (box.checked = false));

  if (
    keepUnit &&
    currentUnitInfo.unit &&
    document.getElementById("builderUnit")
  ) {
    setSelectedBuilderUnit(currentUnitInfo.base, currentUnitInfo.unit);
  }

  toggleShelfField();
}

function cancelChecklistBuilderEdit() {
  clearChecklistBuilderForm(false);
}

function setSelectedChecklistTypes(typeText) {
  const selected = String(typeText || "")
    .split(/[,|+]/)
    .map((t) => t.trim().toUpperCase())
    .filter(Boolean);

  document.querySelectorAll(".builderTypeOption").forEach((box) => {
    box.checked = selected.includes(String(box.value || "").toUpperCase());
  });
}

function editChecklistBuilderItem(id) {
  const item = checklistBuilderItemsCache.find(
    (i) => String(i._id) === String(id),
  );

  if (!item) {
    alert(
      "Could not find this item. Reload the checklist builder and try again.",
    );
    return;
  }

  const title = document.getElementById("checklistBuilderFormTitle");
  const saveBtn = document.getElementById("builderSaveBtn");
  const cancelBtn = document.getElementById("builderCancelEditBtn");

  document.getElementById("builderEditRow").value = item._id;

  setSelectedBuilderUnit(item.base || "", item.unit || "");

  document.getElementById("builderSection").value = item.section || "";

  toggleShelfField();

  if (document.getElementById("builderSubsection")) {
    document.getElementById("builderSubsection").value = item.subsection || "";
  }

  if (item.shelf) {
    const shelfChoice = document.getElementById("shelfChoice");
    const shelfField = document.getElementById("shelfField");
    const hasShelf = document.getElementById("hasShelf");

    if (shelfChoice) shelfChoice.classList.remove("hidden");
    if (shelfField) shelfField.classList.remove("hidden");
    if (hasShelf) hasShelf.checked = true;
  }

  if (document.getElementById("builderShelf")) {
    document.getElementById("builderShelf").value = item.shelf || "";
  }

  document.getElementById("builderItem").value = item.item || "";
  document.getElementById("builderQty").value = item.qty || "";

  if (document.getElementById("builderSubitems")) {
    document.getElementById("builderSubitems").value =
      item.subitems || item.bagItems || "";
  }

  setSelectedChecklistTypes(item.type || "");

  if (title) title.textContent = "Edit Checklist Item";
  if (saveBtn) saveBtn.textContent = "Save Changes";
  if (cancelBtn) cancelBtn.classList.remove("hidden");

  document
    .getElementById("checklistBuilderFormTitle")
    .scrollIntoView({ behavior: "smooth", block: "start" });
}

function saveChecklistBuilderItem() {
  const editRow = document.getElementById("builderEditRow")
    ? document.getElementById("builderEditRow").value
    : "";
  const unitInfo = getSelectedBuilderUnitInfo();

  const unit = unitInfo.unit;
  const base = deriveChecklistBaseFromUnit(unit, unitInfo.base);
  const section = document.getElementById("builderSection").value.trim();
  const subsection = document.getElementById("builderSubsection")
    ? document.getElementById("builderSubsection").value.trim()
    : "";
  const shelf = document.getElementById("builderShelf")
    ? document.getElementById("builderShelf").value.trim()
    : "";
  const item = document.getElementById("builderItem").value.trim();
  const type = getSelectedChecklistTypes();
  const qty = document.getElementById("builderQty").value.trim();
  const subitems = document.getElementById("builderSubitems")
    ? document.getElementById("builderSubitems").value.trim()
    : "";

  if (!unit || !section || !item || !type) {
    alert("Fill out all checklist fields.");
    return;
  }

  if (section.toLowerCase().includes("medical bag") && !subsection) {
    alert("Choose a Medical Bag subsection.");
    return;
  }

  const payload = {
    base: base,
      medicalBagTag: (document.getElementById("medicalBagTag")?.value || "").trim().toUpperCase(),
    unit: unit,
    section: section,
    subsection: subsection,
    shelf: shelf,
    item: item,
    type: type,
    qty: qty,
    subitems: subitems,
  };

  if (editRow) {
    payload.id = editRow;
  }

  fetch(API_URL + "/api/checklist", {
    method: editRow ? "PATCH" : "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  })
    .then((res) => res.json())
    .then((result) => {
      if (!result.ok) {
        throw new Error(result.error || "Checklist item save failed.");
      }

      showToast(
        editRow ? "Checklist item updated." : "Checklist item added.",
        "success",
      );
      clearChecklistBuilderForm(true);
      refreshChecklistBuilder();
    })
    .catch((error) => {
      alert(error.message);
    });
}

function addChecklistBuilderItem() {
  saveChecklistBuilderItem();
}

function refreshChecklistBuilder() {
  const selectedUnitInfo = getSelectedBuilderUnitInfo();
  const selectedBase = selectedUnitInfo.base;
  const selectedUnit = selectedUnitInfo.unit;

  const url =
    API_URL +
    "/api/checklist?unit=" +
    encodeURIComponent(selectedUnit) +
    "&base=" +
    encodeURIComponent(selectedBase);

  fetch(url)
    .then((res) => res.json())
    .then((data) => {
      if (!data.ok) {
        throw new Error(data.error || "Could not load checklist items.");
      }

      const items = data.items || [];
      checklistBuilderItemsCache = items;

      let html = `
        <div class="section-title">Base ${escapeHtml(selectedBase)} - ${escapeHtml(selectedUnit)} Checklist Items</div>

        <div class="builder-toolbar">
          <button class="admin-btn" onclick="saveChecklistOrder()">Save Item Order</button>
          <button class="back-btn" onclick="refreshChecklistBuilder()">Reload List</button>
        </div>

        <div class="builder-help">
          Drag items by the handle to reorder them, then click <strong>Save Item Order</strong>.
          On phones/tablets, use Move Up and Move Down.
        </div>

        <div id="builderReorderList">
      `;

      if (items.length === 0) {
        html += `<div class="admin-row">No checklist items found for this apparatus.</div>`;
      }

      items.forEach((i, index) => {
        html += `
          <div class="admin-row builder-reorder-row"
               draggable="true"
               data-row="${i._id}"
               data-index="${index}">

            <div class="drag-handle" title="Drag to reorder">☰</div>

            <div>
              <span class="pill">Base ${escapeHtml(i.base || selectedBase)}</span>
              <span class="pill">${escapeHtml(i.section || "")}</span>
              ${i.subsection ? `<span class="pill">${escapeHtml(i.subsection)}</span>` : ""}
              ${i.shelf ? `<span class="pill">${escapeHtml(i.shelf)}</span>` : ""}
              <span class="pill">${escapeHtml(i.type || "")}</span>
              ${i.qty ? `<span class="pill">Qty: ${escapeHtml(i.qty)}</span>` : ""}
              ${i.subitems ? `<span class="pill">Inside Items: ${parseBagSubitems(i.subitems).length}</span>` : ""}<br><br>

              <strong>${escapeHtml(i.item || "")}</strong>
            </div>

            <div class="builder-order-buttons">
              <button class="back-btn" onclick="moveChecklistBuilderItem(this, -1)">Move Up</button>
              <button class="admin-btn" onclick="editChecklistBuilderItem('${i._id}')">Edit</button>
              <button class="back-btn" onclick="moveChecklistBuilderItem(this, 1)">Move Down</button>
              <button class="danger-btn" onclick="deleteChecklistBuilderItem('${i._id}')">Delete</button>
            </div>
          </div>
        `;
      });

      html += `</div>`;

      document.getElementById("checklistBuilderList").innerHTML = html;
      enableChecklistDragReorder();
    })
    .catch((error) => {
      alert(error.message);
    });
}

function enableChecklistDragReorder() {
  const list = document.getElementById("builderReorderList");
  if (!list) return;

  let draggedItem = null;

  function moveDraggedItemOver(row, clientY) {
    if (!draggedItem || draggedItem === row) return;

    const box = row.getBoundingClientRect();
    const halfway = box.top + box.height / 2;

    if (clientY < halfway) {
      list.insertBefore(draggedItem, row);
    } else {
      list.insertBefore(draggedItem, row.nextSibling);
    }
  }

  function autoScroll(clientY) {
    const edge = 90;
    const speed = 18;
    const h = window.innerHeight || document.documentElement.clientHeight;

    if (clientY < edge) {
      window.scrollBy(0, -speed);
    } else if (clientY > h - edge) {
      window.scrollBy(0, speed);
    }
  }

  if (!list.dataset.dragWheelInstalled) {
    list.dataset.dragWheelInstalled = "true";

    document.addEventListener("wheel", function (event) {
      if (!draggedItem) return;
      window.scrollBy(0, event.deltaY);
    }, { passive: true });
  }

  list.querySelectorAll(".builder-reorder-row").forEach((row) => {
    row.setAttribute("draggable", "true");

    row.addEventListener("dragstart", (e) => {
      draggedItem = row;
      row.classList.add("dragging");
      if (e.dataTransfer) {
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", row.dataset.row || "");
      }
    });

    row.addEventListener("dragend", () => {
      row.classList.remove("dragging");
      draggedItem = null;
    });

    row.addEventListener("dragover", (e) => {
      e.preventDefault();
      autoScroll(e.clientY);
      moveDraggedItemOver(row, e.clientY);
    });
  });
}



function moveChecklistBuilderItem(button, direction) {
  const row = button.closest(".builder-reorder-row");
  const list = document.getElementById("builderReorderList");
  if (!row || !list) return;

  if (direction < 0 && row.previousElementSibling) {
    list.insertBefore(row, row.previousElementSibling);
  }

  if (direction > 0 && row.nextElementSibling) {
    list.insertBefore(row.nextElementSibling, row);
  }
}

function saveChecklistOrder() {
  const selectedUnitInfo = getSelectedBuilderUnitInfo();
  const selectedBase = selectedUnitInfo.base;
  const selectedUnit = selectedUnitInfo.unit;

  const ids = Array.from(
    document.querySelectorAll("#builderReorderList .builder-reorder-row"),
  ).map((row) => row.dataset.row);

  if (!selectedUnit) {
    alert("Select an apparatus first.");
    return;
  }

  if (ids.length === 0) {
    alert("No checklist items to reorder.");
    return;
  }

  const updates = ids.map((id, index) => {
    return fetch(API_URL + "/api/checklist", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        id: id,
        order: index + 1,
      }),
    }).then((res) => res.json());
  });

  Promise.all(updates)
    .then((results) => {
      const failed = results.find((r) => !r.ok);

      if (failed) {
        throw new Error(failed.error || "Order was not saved.");
      }

      showToast("Checklist order saved.", "success");
      refreshChecklistBuilder();
    })
    .catch((error) => {
      alert(error.message);
    });
}

function deleteChecklistBuilderItem(id) {
  if (!confirm("Delete this checklist item?")) return;

  fetch(API_URL + "/api/checklist?id=" + encodeURIComponent(id), {
    method: "DELETE",
  })
    .then((res) => res.json())
    .then((result) => {
      if (!result.ok) {
        throw new Error(result.error || "Could not delete checklist item.");
      }

      showToast("Checklist item deleted.", "success");
      refreshChecklistBuilder();
    })
    .catch((error) => {
      alert(error.message);
    });
}

function renderSignatureBlock(signature, signatureName, check) {
  signature = String(signature || "").trim();
  signatureName = String(signatureName || "").trim();
  check = check || {};

  const printedNameHtml = signatureName
    ? `<div class="signature-report-name"><strong>Printed Name:</strong> ${escapeHtml(signatureName)}</div>`
    : "";

  const checkInfoHtml = `
    <div class="review-line"><strong>Checked By:</strong> ${escapeHtml(check.checkedBy || "")}</div>
    <div class="review-line"><strong>Date:</strong> ${escapeHtml(check.checkDate || check.date || "")}</div>
    <div class="review-line"><strong>Time:</strong> ${escapeHtml(check.checkTime || check.time || "")}</div>
  `;

  const certificationHtml = `
    <div class="certification-box">
      I certify that I have thoroughly inspected this apparatus and completed this checkoff to the best of my knowledge and ability. I affirm that all information entered is accurate and truthful at the time of this inspection.
    </div>
  `;

  if (!signature) {
    return `
      <div class="section-title signature-section-title">Certification & Signature</div>
      <div class="admin-row signature-report-block">
        ${certificationHtml}
        ${printedNameHtml}
        ${checkInfoHtml}
        <span class="muted">No signature saved for this check.</span>
      </div>
    `;
  }

  if (signature.startsWith("data:image")) {
    return `
      <div class="section-title signature-section-title">Certification & Signature</div>
      <div class="admin-row signature-report-block">
        ${certificationHtml}
        ${printedNameHtml}
        ${checkInfoHtml}
        <div class="signature-report-label">Signature</div>
        <img src="${signature}" alt="Signature" class="signature-report-img">
      </div>
    `;
  }

  return `
    <div class="section-title signature-section-title">Certification & Signature</div>
    <div class="admin-row signature-report-block">
      ${certificationHtml}
      ${printedNameHtml}
      ${checkInfoHtml}
      <label>Saved Signature Data</label>
      <textarea readonly class="signature-report-text">${escapeHtml(signature)}</textarea>
    </div>
  `;
}



function formatDateForRecentSearch(dateValue) {
  const raw = String(dateValue || "").trim();

  if (!raw) return "";

  // Allows 03062026, 03/06/2026, 03-06-2026
  const digits = raw.replace(/\D/g, "");

  if (digits.length === 8) {
    const mm = digits.substring(0, 2);
    const dd = digits.substring(2, 4);
    const yyyy = digits.substring(4, 8);
    return mm + "/" + dd + "/" + yyyy;
  }

  // Allows browser date format if it ever gets pasted: 2026-03-06
  const parts = raw.split("-");
  if (parts.length === 3 && parts[0].length === 4) {
    return parts[1] + "/" + parts[2] + "/" + parts[0];
  }

  return raw;
}

function formatRecentDateInput(input) {
  let value = String(input.value || "")
    .replace(/\D/g, "")
    .substring(0, 8);

  if (value.length > 4) {
    input.value =
      value.substring(0, 2) +
      "/" +
      value.substring(2, 4) +
      "/" +
      value.substring(4);
  } else if (value.length > 2) {
    input.value = value.substring(0, 2) + "/" + value.substring(2);
  } else {
    input.value = value;
  }
}

function filterRecentChecksByDate() {
  const input = document.getElementById("recentCheckDate");
  const selectedDate = input ? formatDateForRecentSearch(input.value) : "";
  renderRecentChecksList(window.recentChecksCache || [], selectedDate);
}

function clearRecentCheckDate() {
  const input = document.getElementById("recentCheckDate");
  if (input) input.value = "";
  renderRecentChecksList(window.recentChecksCache || [], "");
}

function printCurrentCheckReport() {
  window.print();
}

function loadRecentChecks() {
  document.getElementById("adminResults").innerHTML =
    `<p style="text-align:center;color:#60a5fa;">Loading recent checks...</p>`;

  fetch(API_URL + "/api/recent-checks?limit=100")
    .then((res) => res.json())
    .then((data) => {
      const checks = data.checks || [];

      let html = `
        <div class="section-title">Recent Checks</div>
      `;

      if (checks.length === 0) {
        html += `
          <div class="admin-row">
            No checks submitted yet.
          </div>
        `;
      }

      checks.forEach((c) => {
        html += `
          <div class="admin-row">
            <strong>${escapeHtml(c.unit)}</strong><br>

            <span class="muted">
              ${escapeHtml(c.checkDate || "")}
              ${escapeHtml(c.checkTime || "")}
            </span><br>

            <span class="pill">
              Checked By: ${escapeHtml(c.checkedBy || "")}
            </span>

            <button
              class="small-btn"
              onclick="viewMongoCheck('${c._id}')">
              View Full Report
            </button>
          </div>
        `;
      });

      document.getElementById("adminResults").innerHTML = html;
    })
    .catch((error) => {
      alert(error.message);
    });
}

function getReportSectionName(d) {
  return String(d.section || d.compartment || "General").trim() || "General";
}

function getReportSubsectionName(d) {
  return String(d.subsection || "").trim();
}

function getReportShelfName(d) {
  return String(d.shelf || "").trim();
}

function renderChecklistStyleReport(check, checkId) {
  check = check || {};
  const details = Array.isArray(check.responses) ? check.responses : [];

  let html = `
    <button class="print-report-btn" onclick="printCurrentCheckReport()">Print / Save PDF</button>

    <div id="printReportArea">
      <div class="section-title">${escapeHtml(check.unit || "")} Check Report</div>

      <div class="admin-row">
        <strong>Unit:</strong> ${escapeHtml(check.unit || "")}<br>
        <strong>Base:</strong> ${escapeHtml(check.base || "")}<br>
        <strong>Status:</strong> ${escapeHtml(check.status || "")}<br>
        <strong>Checked By:</strong> ${escapeHtml(check.checkedBy || "")}<br>
        <strong>Date/Time:</strong> ${escapeHtml((check.checkDate || check.date || "") + " " + (check.checkTime || check.time || ""))}<br>
        <strong>Check ID:</strong> ${escapeHtml(check._id || check.checkId || checkId || "")}
      </div>
  `;

  if (details.length === 0) {
    html += `<div class="admin-row">No checklist responses were saved with this report.</div>`;
  }

  let currentSection = "";
  let currentSubsection = "";
  let currentShelf = "";

  details.forEach((d) => {
    const section = getReportSectionName(d);
    const subsection = getReportSubsectionName(d);
    const shelf = getReportShelfName(d);

    if (section !== currentSection) {
      currentSection = section;
      currentSubsection = "";
      currentShelf = "";
      html += `<div class="section-title">${escapeHtml(currentSection)}</div>`;
    }

    if (subsection && subsection !== currentSubsection) {
      currentSubsection = subsection;
      currentShelf = "";
      html += `<div class="report-subsection-title">${escapeHtml(currentSubsection)}</div>`;
    }

    if (shelf && shelf !== subsection && shelf !== currentShelf) {
      currentShelf = shelf;
      html += `<div class="shelf-title">${escapeHtml(currentShelf)}</div>`;
    }

    html += `
      <div class="admin-row report-response-row">
        <div class="item-name">${escapeHtml(d.item || "")}</div>
        ${formatDetailAnswer(d)}
      </div>
    `;
  });

  html += renderSignatureBlock(
    check.signature || "",
    check.signatureName || check.checkedBy || "",
    check
  );

  html += `
    </div>
    <button class="back-btn" onclick="loadRecentChecks()">Back to Recent Checks</button>
  `;

  return html;
}

function viewMongoCheck(id) {
  document.getElementById("adminResults").innerHTML =
    `<p style="text-align:center;color:#60a5fa;">Loading check report...</p>`;

  fetch(API_URL + "/api/recent-checks?id=" + encodeURIComponent(id))
    .then((res) => res.json())
    .then((data) => {
      if (!data.ok) {
        throw new Error(data.error || "Could not load check report.");
      }

      const check = data.check;

      if (!check) {
        document.getElementById("adminResults").innerHTML = `
          <div class="section-title">Check Details</div>
          <div class="admin-row">No details found for this check.</div>
          <button class="back-btn" onclick="loadRecentChecks()">Back to Recent Checks</button>
        `;
        return;
      }

      document.getElementById("adminResults").innerHTML = renderChecklistStyleReport(check, id);
    })
    .catch((error) => {
      alert(error.message);
    });
}



function renderRecentChecksList(checks, selectedDate) {
  checks = checks || [];

  let filtered = checks;

  if (selectedDate) {
    filtered = checks.filter(
      (c) => String(c.date || "").trim() === selectedDate,
    );
  }

  let html = `
    <div class="section-title">Recent Checks</div>

    <div class="recent-search-box">
      <label>Search Checkoffs by Date</label>
      <div class="recent-search-grid">
        <input type="text" id="recentCheckDate" placeholder="03062026" maxlength="10" oninput="formatRecentDateInput(this)" onkeydown="if(event.key === 'Enter') filterRecentChecksByDate()">
        <button type="button" class="small-btn" onclick="filterRecentChecksByDate()">Search</button>
        <button type="button" class="small-btn back-btn" onclick="clearRecentCheckDate()">Clear</button>
      </div>
      <div class="muted" style="margin-top:8px;">
        Showing ${filtered.length} check${filtered.length === 1 ? "" : "s"}${selectedDate ? " for " + selectedDate : ""}.
      </div>
    </div>
  `;

  if (filtered.length === 0) {
    html += `<div class="admin-row">No checks found${selectedDate ? " for " + selectedDate : ""}.</div>`;
  }

  filtered.forEach((c) => {
    const issueCount = c.issues && c.issues.length ? c.issues.length : 0;

    html += `
      <div class="admin-row">
        <strong>${escapeHtml(c.unit)}</strong><br>
        <span class="muted">Checked By: ${escapeHtml(c.checkedBy)}</span><br>
        <span class="muted">Date/Time: ${escapeHtml(c.date)} ${escapeHtml(c.time || "")}</span><br>
        <span class="muted">Check ID: ${escapeHtml(c.checkId)}</span><br>
        <span class="pill">Status: ${escapeHtml(c.status)}</span>
        ${issueCount ? `<span class="pill">Issues: ${issueCount}</span>` : ""}
        ${c.signature ? `<span class="pill">Signature Saved</span>` : `<span class="pill">No Signature</span>`}
        <br>
        <button class="small-btn" onclick="viewCheckDetails(\`${String(c.checkId).replace(/`/g, "")}\`)">View Full Report</button>
      </div>
    `;
  });

  html += `<button class="back-btn" onclick="openAdmin()">Back to Admin Panel</button>`;

  document.getElementById("adminResults").innerHTML = html;
}

function getValuePart(value, label) {
  const text = String(value || "");
  const parts = text.split("|").map((p) => p.trim());
  const match = parts.find((p) =>
    p.toLowerCase().startsWith(label.toLowerCase() + ":"),
  );
  if (!match) return "";
  return match.substring(match.indexOf(":") + 1).trim();
}

function formatDetailAnswer(d) {
  d = d || {};
  const typeList = parseChecklistTypes(d.type || "");
  const value = String(d.value || d.answer || "");
  const lines = [];

  function addLine(label, val) {
    if (val === undefined || val === null) val = "";
    lines.push(
      `<div class="review-line"><strong>${escapeHtml(label)}:</strong> ${escapeHtml(val)}</div>`
    );
  }

  if (typeList.includes("ONTRUCK") || value.includes("On Apparatus:")) {
    addLine("On Apparatus", getValuePart(value, "On Apparatus") || d.onApparatus || "");
  }

  if (typeList.includes("FUNCTIONAL") || value.includes("Functional:")) {
    addLine("Functional", getValuePart(value, "Functional") || d.functional || "");
  }

  if (typeList.includes("YESNO") || value.includes("Answer:")) {
    const answer = getValuePart(value, "Answer") || d.yesNo || d.answer || "";
    addLine("Answer", answer);

    const reason = getValuePart(value, "Reason for No") || d.yesNoReason || "";
    if (String(answer).trim().toUpperCase() === "NO" || reason) {
      addLine("Reason for No", reason);
    }
  }

  if (typeList.includes("NUMBER") || value.includes("Number:")) {
    addLine("Number", getValuePart(value, "Number"));
  }

  if (typeList.includes("PERCENTAGE") || value.includes("Battery:")) {
    addLine("Battery", getValuePart(value, "Battery"));
  }

  if (typeList.includes("DATE") || value.includes("Exp:")) {
    addLine("Exp", getValuePart(value, "Exp"));
  }

  if (typeList.includes("DATE2") || value.includes("Exp 2:")) {
    addLine("Exp 2", getValuePart(value, "Exp 2"));
  }

  if (typeList.includes("FUEL") || value.includes("Fuel:")) {
    addLine("Fuel", getValuePart(value, "Fuel"));
  }

  if (typeList.includes("OIL") || value.includes("Oil Level:")) {
    addLine("Oil Level", getValuePart(value, "Oil Level"));
  }

  if (typeList.includes("PSI") || value.includes("PSI:")) {
    addLine("PSI", getValuePart(value, "PSI"));
  }

  if (typeList.includes("PSI2") || value.includes("PSI 2:")) {
    addLine("PSI 2", getValuePart(value, "PSI 2"));
  }

  if (typeList.includes("SEAL1") || value.includes("Seal 1:")) {
    addLine("Seal 1", getValuePart(value, "Seal 1"));
  }

  if (typeList.includes("SEAL2") || value.includes("Seal 2:")) {
    addLine("Seal 2", getValuePart(value, "Seal 2"));
  }

  if (typeList.includes("TESTNUMBER") || value.includes("Test Number:")) {
    addLine("Test Number", getValuePart(value, "Test Number"));
  }

  if (typeList.includes("TEXT") || value.includes("Text:")) {
    addLine("Text", getValuePart(value, "Text"));
  }

  const parts = value.split("|").map((p) => p.trim()).filter(Boolean);
  parts.forEach((part) => {
    if (part.startsWith("Bag Item - ")) {
      const cleaned = part.replace(/^Bag Item - /, "");
      const idx = cleaned.indexOf(":");
      if (idx >= 0) {
        addLine(cleaned.substring(0, idx), cleaned.substring(idx + 1).trim());
      } else {
        addLine("Bag Item", cleaned);
      }
    }

    if (part.startsWith("Bag Notes:")) {
      addLine("Bag Notes", part.substring(part.indexOf(":") + 1).trim());
    }
  });

  if (lines.length === 0 && value) {
    addLine("Value", value);
  }

  lines.push(
    `<div class="review-line"><strong>Notes:</strong> ${escapeHtml(d.notes || "")}</div>`
  );

  if (d.status) {
    lines.push(
      `<div class="review-line"><strong>Status:</strong> ${escapeHtml(d.status)}</div>`
    );
  }

  return lines.join("");
}



function openCheckDetails(checkId) {
  document.getElementById("adminResults").innerHTML =
    `<p style="text-align:center;color:#60a5fa;">Loading check report...</p>`;

  fetch(API_URL + "/api/recent-checks?id=" + encodeURIComponent(checkId))
    .then((res) => res.json())
    .then((data) => {
      if (!data.ok) {
        throw new Error(data.error || "Could not load check report.");
      }

      const check = data.check;

      if (!check) {
        document.getElementById("adminResults").innerHTML =
          `<div class="admin-row">No details found for this check.</div>
           <button class="back-btn" onclick="loadRecentChecks()">Back to Recent Checks</button>`;
        return;
      }

      document.getElementById("adminResults").innerHTML = renderChecklistStyleReport(check, checkId);
    })
    .catch((error) => {
      alert(error.message);
    });
}



function loadServiceSchedule() {
  document.getElementById("adminResults").innerHTML =
    `<p style="text-align:center;color:#60a5fa;">Loading service schedule...</p>`;

  fetch(API_URL + "/api/service-schedule")
    .then((res) => res.json())
    .then((data) => {
      if (!data.ok) {
        throw new Error(data.error || "Could not load service schedule.");
      }

      const services = data.services || [];

      let html = `
        <div class="section-title">Service Schedule</div>

        <div class="admin-row">
          <div class="item-name">Add Service Item</div>

          <label>Unit</label>
          <input id="serviceUnit" placeholder="Example: Medic 1">

          <label>Service Item</label>
          <input id="serviceItem" placeholder="Example: Oil Change">

          <label>Current Value</label>
          <input id="serviceCurrent" placeholder="Example: 125000">

          <label>Due At</label>
          <input id="serviceDue" placeholder="Example: 126000 or 12/31/2026">

          <label>Type</label>
          <select id="serviceType">
            <option value="MILES">MILES</option>
            <option value="HOURS">HOURS</option>
            <option value="DATE">DATE</option>
          </select>

          <button onclick="addServiceScheduleItem()">
            Add Service Item
          </button>
        </div>
      `;

      if (services.length === 0) {
        html += `
          <div class="admin-row">
            No service items found.
          </div>
        `;
      }

      services.forEach((s) => {
        const type = String(s.type || "").toUpperCase();
        const current = Number(s.currentValue || 0);
        const due = Number(s.dueAt || 0);

        let statusColor = "#4ade80";
        let statusText = "GOOD";

        if (type === "MILES" || type === "HOURS") {
          const remaining = due - current;
          const warningPoint = type === "MILES" ? 500 : 50;

          if (remaining <= 0) {
            statusColor = "#ef4444";
            statusText = Math.abs(remaining) + " " + type + " OVERDUE";
          } else if (remaining <= warningPoint) {
            statusColor = "#facc15";
            statusText = remaining + " " + type + " LEFT";
          } else {
            statusText = remaining + " " + type + " LEFT";
          }
        } else if (type === "DATE") {
          const dueDate = new Date(s.dueAt);
          const today = new Date();
          today.setHours(0, 0, 0, 0);

          if (!isNaN(dueDate.getTime())) {
            dueDate.setHours(0, 0, 0, 0);
            const daysLeft = Math.ceil(
              (dueDate - today) / (1000 * 60 * 60 * 24),
            );

            if (daysLeft < 0) {
              statusColor = "#ef4444";
              statusText = Math.abs(daysLeft) + " DAYS OVERDUE";
            } else if (daysLeft <= 30) {
              statusColor = "#facc15";
              statusText = daysLeft + " DAYS LEFT";
            } else {
              statusText = daysLeft + " DAYS LEFT";
            }
          }
        }

        html += `
          <div class="admin-row">
            <strong>${escapeHtml(s.unit || "")}</strong><br>
            <span class="item-name">${escapeHtml(s.serviceItem || "")}</span><br>

            <span class="pill">${escapeHtml(type)}</span>
            <span class="pill">Active: ${s.active !== false ? "YES" : "NO"}</span>

            <br><br>

            <span style="color:${statusColor};font-weight:700;">
              ${escapeHtml(statusText)}
            </span>

            <label>Current Value</label>
            <input id="current_${s._id}" value="${escapeHtml(s.currentValue || "")}">

            <label>Due At</label>
            <input id="due_${s._id}" value="${escapeHtml(s.dueAt || "")}">

            <label>Active</label>
            <select id="active_${s._id}">
              <option value="YES" ${s.active !== false ? "selected" : ""}>YES</option>
              <option value="NO" ${s.active === false ? "selected" : ""}>NO</option>
            </select>

            <button class="success-btn small-btn" onclick="saveServiceItem('${s._id}')">
              Save
            </button>

            <button class="danger-btn small-btn" onclick="deleteServiceItemAdmin('${s._id}')">
              Delete
            </button>
          </div>
        `;
      });

      document.getElementById("adminResults").innerHTML = html;
    })
    .catch((error) => {
      alert(error.message);
    });
}

function addServiceScheduleItem() {
  const unit = document.getElementById("serviceUnit").value.trim();
  const item = document.getElementById("serviceItem").value.trim();
  const current = document.getElementById("serviceCurrent").value.trim();
  const due = document.getElementById("serviceDue").value.trim();
  const type = document.getElementById("serviceType").value;

  if (!unit || !item || !current || !due || !type) {
    alert("Fill out all service item fields.");
    return;
  }

  fetch(API_URL + "/api/service-schedule", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      unit: unit,
      serviceItem: item,
      currentValue: current,
      dueAt: due,
      type: type,
    }),
  })
    .then((res) => res.json())
    .then((result) => {
      if (!result.ok) {
        throw new Error(result.error || "Could not add service item.");
      }

      showToast("Service item added.", "success");
      loadServiceSchedule();
    })
    .catch((error) => {
      alert(error.message);
    });
}

function saveServiceItem(id) {
  const current = document.getElementById(`current_${id}`).value.trim();
  const due = document.getElementById(`due_${id}`).value.trim();
  const active = document.getElementById(`active_${id}`).value;

  if (!current || !due || !active) {
    alert("Current value, due at, and active status are required.");
    return;
  }

  fetch(API_URL + "/api/service-schedule", {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      id: id,
      currentValue: current,
      dueAt: due,
      active: active === "YES",
    }),
  })
    .then((res) => res.json())
    .then((result) => {
      if (!result.ok) {
        throw new Error(result.error || "Could not save service item.");
      }

      showToast("Service item saved.", "success");
      loadServiceSchedule();
    })
    .catch((error) => {
      alert(error.message);
    });
}

function deleteServiceItemAdmin(id) {
  if (!confirm("Delete this service item?")) return;

  fetch(API_URL + "/api/service-schedule?id=" + encodeURIComponent(id), {
    method: "DELETE",
  })
    .then((res) => res.json())
    .then((result) => {
      if (!result.ok) {
        throw new Error(result.error || "Could not delete service item.");
      }

      showToast("Service item deleted.", "success");
      loadServiceSchedule();
    })
    .catch((error) => {
      alert(error.message);
    });
}

function getTodayForInput() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function viewCheckDetails(checkId) {
  document.getElementById("adminResults").innerHTML =
    `<p style="text-align:center;color:#60a5fa;">Loading check report...</p>`;

  fetch(API_URL + "/api/recent-checks?id=" + encodeURIComponent(checkId))
    .then((res) => res.json())
    .then((data) => {
      if (!data.ok) {
        throw new Error(data.error || "Could not load check report.");
      }

      const check = data.check;

      if (!check) {
        document.getElementById("adminResults").innerHTML = `
          <div class="section-title">Check Details</div>
          <div class="admin-row">No details found for this check.</div>
          <button class="back-btn" onclick="loadRecentChecks()">Back to Recent Checks</button>
        `;
        return;
      }

      document.getElementById("adminResults").innerHTML = renderChecklistStyleReport(check, checkId);
    })
    .catch((error) => {
      alert(error.message);
    });
}



function loadCrewMessagesAdmin() {
  document.getElementById("adminResults").innerHTML = `
    <div class="section-title">Crew Messages</div>

    <div class="admin-row">
      <label>Unit / Area</label>
      <input id="crewMsgUnit" placeholder="Example: Medic 1, Base 93, All Units">

      <label>Priority</label>
      <select id="crewMsgPriority">
        <option value="Info">Info</option>
        <option value="Important">Important</option>
        <option value="Urgent">Urgent</option>
      </select>

      <label>Send To</label>
      <select id="crewMsgToType">
        <option value="Everyone">Everyone</option>
        <option value="Base 93">Base 93</option>
        <option value="Base 98">Base 98</option>
        <option value="Admin">Admin Only</option>
      </select>

      <label>Message</label>
      <textarea id="crewMsgText" placeholder="Enter message for crews"></textarea>

      <button onclick="postCrewMessage()">Post Message</button>
    </div>

    <div id="crewMessagesList">
      <p style="text-align:center;color:#60a5fa;">Loading messages...</p>
    </div>
  `;

  refreshCrewMessagesAdmin();
}

function refreshCrewMessagesAdmin() {
  fetch(API_URL + "/api/messages")
    .then((res) => res.json())
    .then((data) => {
      if (!data.ok) {
        throw new Error(data.error || "Could not load messages.");
      }

      const messages = data.messages || [];
      let html = `<div class="section-title">Active Messages</div>`;

      if (messages.length === 0) {
        html += `<div class="admin-row">No active messages.</div>`;
      }

      messages.forEach((m) => {
        html += `
          <div class="admin-row">
            <strong>${escapeHtml(m.priority || "Info")}</strong><br>
            <span class="muted">${escapeHtml(m.message || "")}</span><br><br>
            <span class="pill">Unit: ${escapeHtml(m.unit || "All")}</span>
            <span class="pill">To: ${escapeHtml(m.toType || "Everyone")}</span>
            <span class="pill">From: ${escapeHtml(m.fromUser || "")}</span><br><br>

            <button class="danger-btn small-btn" onclick="disableCrewMessage('${m._id}')">
              Remove Message
            </button>
          </div>
        `;
      });

      document.getElementById("crewMessagesList").innerHTML = html;
    })
    .catch((error) => alert(error.message));
}

function postCrewMessage() {
  const unit = document.getElementById("crewMsgUnit").value.trim();
  const priority = document.getElementById("crewMsgPriority").value;
  const toType = document.getElementById("crewMsgToType").value;
  const message = document.getElementById("crewMsgText").value.trim();

  if (!message) {
    alert("Enter a message.");
    return;
  }

  fetch(API_URL + "/api/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      unit: unit,
      priority: priority,
      message: message,
      fromUser: currentUser ? currentUser.name : "",
      toType: toType,
    }),
  })
    .then((res) => res.json())
    .then((result) => {
      if (!result.ok) {
        throw new Error(result.error || "Could not post message.");
      }

      document.getElementById("crewMsgUnit").value = "";
      document.getElementById("crewMsgText").value = "";

      showToast("Crew message posted.", "success");
      refreshCrewMessagesAdmin();

      return fetch(API_URL + "/api/messages");
    })
    .then((res) => res.json())
    .then((data) => {
      loadMessageBoard(data.messages || []);
    })
    .catch((error) => alert(error.message));
}

function disableCrewMessage(id) {
  if (!id) {
    alert("Missing message id.");
    return;
  }

  if (!confirm("Remove this message?")) return;

  fetch(API_URL + "/api/messages", {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      id: id,
      active: false
    })
  })
    .then((res) => res.json())
    .then((result) => {
      if (!result.ok) {
        throw new Error(result.error || "Could not remove message.");
      }

      if (result.matched === 0) {
        throw new Error("Message was not found in MongoDB.");
      }

      showToast("Message removed.", "success");
      refreshCrewMessagesAdmin();

      fetch(API_URL + "/api/messages")
        .then((res) => res.json())
        .then((data) => {
          loadMessageBoard(data.messages || []);
        })
        .catch(() => {});
    })
    .catch((error) => alert(error.message));
}


function loadDailyReports() {
  const today = getTodayForInput();

  document.getElementById("adminResults").innerHTML = `
    <div class="section-title">Daily Reports</div>

    <div class="admin-row">
      <label>Report Date</label>
      <input id="dailyReportDate" type="date" value="${today}">

      <button onclick="generateDailyReport()">Generate Report</button>
    </div>

    <div id="dailyReportResults"></div>
  `;
}

function generateDailyReport() {
  const date = document.getElementById("dailyReportDate").value;
  const results = document.getElementById("dailyReportResults");

  results.innerHTML = `<p style="text-align:center;color:#60a5fa;">Generating daily report...</p>`;

  fetch(API_URL + "/api/daily-report?date=" + encodeURIComponent(date))
    .then((res) => res.json())
    .then((report) => {
      if (!report.ok) {
        throw new Error(report.error || "Could not generate daily report.");
      }

      renderDailyReport(report);
    })
    .catch((error) => {
      results.innerHTML = `<div class="admin-row" style="color:#f87171;">${escapeHtml(error.message)}</div>`;
    });
}

function renderDailyReport(report) {
  report = report || {};
  const checks = report.checks || [];
  const missingUnits = report.missingUnits || [];

  let html = `
    <div class="section-title">Daily Apparatus Check Report - ${escapeHtml(report.displayDate || "")}</div>

    <div class="report-summary-grid">
      <div class="report-stat">
        <strong>${escapeHtml(report.unitsChecked || 0)}/${escapeHtml(report.totalUnits || 0)}</strong>
        Units Checked
      </div>
      <div class="report-stat">
        <strong>${escapeHtml(report.issueCount || 0)}</strong>
        Issues Found
      </div>
      <div class="report-stat">
        <strong>${escapeHtml(missingUnits.length)}</strong>
        Not Checked
      </div>
    </div>

    <button class="success-btn" onclick="printDailyReport()">Print / Save as PDF</button>

    <div id="dailyReportPrintArea" class="report-print-area">
      <div class="admin-row">
        <div class="unit-title">Daily Apparatus Check Report</div>
        <div style="text-align:center;" class="muted">Date: ${escapeHtml(report.displayDate || "")}</div>
      </div>
  `;

  if (missingUnits.length > 0) {
    html += `
      <div class="report-unit">
        <strong>Units Not Checked</strong><br><br>
        ${missingUnits.map((unit) => `<div class="report-issue">${escapeHtml(unit)}</div>`).join("")}
      </div>
    `;
  }

  if (checks.length === 0) {
    html += `<div class="report-unit">No checks found for this date.</div>`;
  }

  checks.forEach((check) => {
    html += `
      <div class="report-unit">
        <h2 style="margin-top:0;color:#f8fafc;">${escapeHtml(check.unit)}</h2>
        <div><strong>Checked By:</strong> ${escapeHtml(check.checkedBy)}</div>
        <div><strong>Time:</strong> ${escapeHtml(check.time)}</div>
        <div><strong>Status:</strong> ${escapeHtml(check.status)}</div>
        <br>
    `;

    if (check.issues && check.issues.length > 0) {
      html += `<strong class="report-issue">Issues Found</strong>`;
      check.issues.forEach((issue) => {
        html += `
          <div class="admin-row">
            <strong>${escapeHtml(issue.item)}</strong><br>
            ${issue.section ? `<span class="pill">${escapeHtml(issue.section)}</span>` : ""}
            ${issue.shelf ? `<span class="pill">${escapeHtml(issue.shelf)}</span>` : ""}
            <div class="review-line"><strong>Answer:</strong> ${escapeHtml(issue.value)}</div>
            <div class="review-line"><strong>Notes:</strong> ${escapeHtml(issue.notes || "")}</div>
          </div>
        `;
      });
    } else {
      html += `<div style="color:#4ade80;font-weight:700;">No issues reported.</div>`;
    }

    html += `</div>`;
  });

  html += `
      <div class="report-unit">
        <strong>Officer Review</strong><br><br><br>
        _________________________________<br>
        Officer Signature<br><br><br>
        _________________________________<br>
        Date
      </div>
    </div>
  `;

  document.getElementById("dailyReportResults").innerHTML = html;
}

function printDailyReport() {
  const reportArea = document.getElementById("dailyReportPrintArea");
  if (!reportArea) {
    alert("Generate a report first.");
    return;
  }

  const printWindow = window.open("", "_blank");
  printWindow.document.write(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Daily Apparatus Check Report</title>
      <style>
        body{font-family:Arial,sans-serif;color:#111827;padding:24px;}
        h1,h2{margin-bottom:6px;}
        .unit-title{text-align:center;font-size:24px;font-weight:700;margin-bottom:8px;}
        .admin-row,.report-unit{border:1px solid #d1d5db;border-radius:10px;padding:14px;margin-top:12px;break-inside:avoid;}
        .pill{display:inline-block;padding:3px 7px;border-radius:999px;background:#e5e7eb;font-size:12px;margin:3px;}
        .review-line{margin-top:7px;}
        .report-issue{color:#b91c1c;font-weight:700;}
        .muted{color:#4b5563;}
      

/* ===== BIG PHONE / TABLET TOUCH MODE =====
   Apps Script on iPhone sometimes renders wider than a normal mobile viewport.
   This forces the checkoff screen to feel like a real mobile app even when the
   browser reports 800px+ width. */
@media screen and (max-width: 1100px), (pointer: coarse) {
  html, body {
    width: 100% !important;
    max-width: 100% !important;
    overflow-x: hidden !important;
    font-size: 20px !important;
    -webkit-text-size-adjust: 125% !important;
  }

  body {
    line-height: 1.35 !important;
  }

  .box,
  .panel {
    width: 100% !important;
    max-width: 100% !important;
    margin: 0 !important;
    padding: 18px !important;
    border-left: none !important;
    border-right: none !important;
    border-radius: 0 !important;
    min-height: 100vh !important;
  }

  .header {
    padding: 14px 14px !important;
  }

  .header h1 {
    font-size: 24px !important;
    line-height: 1.25 !important;
  }

  #headerAdmin {
    position: static !important;
    transform: none !important;
    margin-bottom: 10px !important;
  }

  .header-admin-btn {
    width: 100% !important;
    min-height: 62px !important;
    font-size: 20px !important;
    border-radius: 14px !important;
  }

  .welcome {
    font-size: 20px !important;
    margin-bottom: 18px !important;
  }

  .grid,
  .check-grid,
  .review-summary,
  .report-summary-grid,
  .field-row,
  .field-row.single,
  .check-actions,
  .page-nav {
    display: grid !important;
    grid-template-columns: 1fr !important;
    gap: 16px !important;
    width: 100% !important;
    max-width: 100% !important;
  }

  .grid > *,
  .check-grid > *,
  .review-summary > *,
  .report-summary-grid > * {
    grid-column: 1 / -1 !important;
    width: 100% !important;
    max-width: 100% !important;
  }

  .unit-card,
  .admin-card {
    width: 100% !important;
    min-height: 105px !important;
    padding: 28px 18px !important;
    border-radius: 18px !important;
  }

  .unit-name {
    font-size: 28px !important;
    line-height: 1.25 !important;
  }

  .unit-title {
    font-size: 30px !important;
    line-height: 1.25 !important;
    margin-bottom: 20px !important;
  }

  .section-title,
  .shelf-title {
    font-size: 22px !important;
    line-height: 1.25 !important;
    padding: 16px !important;
    border-radius: 14px !important;
    margin-top: 18px !important;
    margin-bottom: 14px !important;
  }

  .page-progress {
    font-size: 18px !important;
    margin: 8px 0 16px !important;
  }

  .check-item,
  .admin-row,
  .review-item,
  .review-box,
  .report-unit,
  .report-stat,
  .message-board,
  .message-item {
    width: 100% !important;
    max-width: 100% !important;
    padding: 20px !important;
    border-radius: 18px !important;
  }

  .check-item {
    gap: 14px !important;
    margin-bottom: 16px !important;
  }

  .item-name {
    font-size: 24px !important;
    line-height: 1.3 !important;
    margin-bottom: 8px !important;
  }

  .muted,
  .review-line,
  .pill,
  .message-item,
  .msg,
  .link {
    font-size: 18px !important;
    line-height: 1.4 !important;
  }

  label,
  .check-item label {
    font-size: 18px !important;
    line-height: 1.25 !important;
    margin-top: 10px !important;
    margin-bottom: 8px !important;
  }

  input,
  select,
  button,
  textarea {
    min-height: 68px !important;
    font-size: 22px !important;
    line-height: 1.25 !important;
    padding: 16px !important;
    border-radius: 16px !important;
  }

  input,
  select {
    background: #07111f !important;
  }

  button {
    min-height: 70px !important;
    font-size: 22px !important;
    margin-top: 18px !important;
  }

  .small-btn {
    width: 100% !important;
    min-height: 64px !important;
    margin: 8px 0 !important;
  }

  .message-title {
    font-size: 24px !important;
  }

  .toast {
    left: 12px !important;
    right: 12px !important;
    top: 70px !important;
    max-width: none !important;
    font-size: 18px !important;
  }

  .page-nav {
    position: sticky !important;
    bottom: 0 !important;
    z-index: 9999 !important;
    background: rgba(15, 27, 45, .98) !important;
    border-top: 1px solid #24364d !important;
    padding: 12px 12px calc(12px + env(safe-area-inset-bottom)) !important;
    margin: 22px -18px -18px !important;
  }

  .page-nav button {
    width: 100% !important;
    margin: 0 !important;
  }

  #saveCheckBtn {
    background: #16a34a !important;
  }
}


/* ===== CHECKLIST BUILDER DRAG REORDER ===== */
.builder-toolbar{
  display:grid;
  grid-template-columns:1fr 1fr;
  gap:10px;
  margin:12px 0;
}
.builder-help{
  color:#94a3b8;
  font-size:14px;
  margin:8px 0 12px;
}
.builder-reorder-row{
  display:grid;
  grid-template-columns:auto 1fr auto;
  gap:12px;
  align-items:center;
  cursor:grab;
  user-select:none;
}
.builder-reorder-row:active{
  cursor:grabbing;
}
.builder-reorder-row.dragging{
  opacity:.45;
  border-color:#60a5fa;
}
.drag-handle{
  font-size:24px;
  color:#93c5fd;
  line-height:1;
}
.builder-order-buttons{
  display:flex;
  gap:6px;
  flex-wrap:wrap;
  justify-content:flex-end;
}
.builder-order-buttons button{
  width:auto;
  min-height:34px;
  padding:6px 10px;
  margin:0;
  font-size:13px;
}
@media (max-width:700px), (pointer:coarse){
  .builder-toolbar{
    grid-template-columns:1fr;
  }
  .builder-reorder-row{
    grid-template-columns:1fr;
  }
  .drag-handle{
    display:none;
  }
  .builder-order-buttons{
    justify-content:stretch;
  }
  .builder-order-buttons button{
    flex:1;
  }
}

    

/* ===== ADMIN DASHBOARD VIEW SWITCH ===== */
.admin-view-switch{
  display:grid;
  grid-template-columns:1fr 1fr;
  gap:10px;
  margin:14px 0 18px;
  padding:12px;
  background:#07111f;
  border:1px solid #334155;
  border-radius:12px;
}
.admin-view-switch button{
  margin:0;
  min-height:46px;
  border-radius:10px;
  background:#334155;
}
.admin-view-switch button.active{
  background:#0ea5e9;
  color:#fff;
}
.admin-view-note{
  text-align:center;
  color:#94a3b8;
  font-size:13px;
  margin-top:-8px;
  margin-bottom:10px;
}


/* ===== COMPACT INSIDE-BAG CHECKLIST ===== */
.compact-bag-box{
  padding:10px 12px !important;
  margin-top:10px !important;
}
.compact-bag-box .bag-subcheck-title{
  margin-bottom:6px !important;
  padding-bottom:6px !important;
  border-bottom:1px solid #25364d;
}
.compact-bag-row{
  display:flex !important;
  align-items:center !important;
  gap:10px !important;
  margin:0 !important;
  padding:6px 0 !important;
  border-top:1px solid #1f2f44 !important;
  font-size:15px !important;
  font-weight:700 !important;
  line-height:1.2 !important;
}
.compact-bag-row:first-of-type{
  border-top:none !important;
}
.compact-bag-row input[type="checkbox"],
.bagSubCheck{
  width:22px !important;
  min-width:22px !important;
  height:22px !important;
  min-height:22px !important;
  padding:0 !important;
  margin:0 !important;
  border-radius:4px !important;
  flex:0 0 22px !important;
}
.compact-bag-notes-label{
  margin-top:8px !important;
  margin-bottom:4px !important;
  font-size:13px !important;
}
.compact-bag-box .bagNotes{
  min-height:36px !important;
  height:36px !important;
  padding:8px 10px !important;
  font-size:14px !important;
  border-radius:8px !important;
}
@media screen and (max-width:1100px), (pointer:coarse){
  .compact-bag-row{
    font-size:18px !important;
    padding:8px 0 !important;
    gap:12px !important;
  }
  .compact-bag-row input[type="checkbox"],
  .bagSubCheck{
    width:26px !important;
    min-width:26px !important;
    height:26px !important;
    min-height:26px !important;
  }
  .compact-bag-box .bagNotes{
    min-height:46px !important;
    height:46px !important;
    font-size:16px !important;
    padding:10px 12px !important;
  }
}

    </style>
    </head>
    <body>
      ${reportArea.innerHTML}
    </body>
    </html>
  `);
  printWindow.document.close();
  printWindow.focus();
  printWindow.print();
}

function logout() {
  currentUser = null;
  sessionStorage.removeItem("currentUser");
  sessionStorage.clear();
  localStorage.removeItem("currentUser");
  showLogin(false);
  history.replaceState(
    { route: "login", data: {} },
    "",
    location.pathname + location.search,
  );
}

function loadMessageBoard(messages) {
  const board = document.getElementById("messageBoard");
  if (!board) return;

  let html = `
    <div class="message-board">
      <div class="message-title">
        Crew Message Board
      </div>
  `;

  if (!messages || messages.length === 0) {
    html += `
      <div class="message-item message-info">
        No active crew messages.
      </div>
    `;
    html += "</div>";
    board.innerHTML = html;
    return;
  }

  messages.forEach((msg) => {
    let cls = "message-info";
    const priority = String(msg.priority || "")
      .trim()
      .toUpperCase();

    if (priority === "IMPORTANT") cls = "message-important";
    if (priority === "URGENT") cls = "message-urgent";

    html += `
      <div class="message-item ${cls}">
        ${escapeHtml(msg.message)}
      </div>
    `;
  });

  html += "</div>";

  board.innerHTML = html;
}

/* ===== FLEET MAP / UNIT INFORMATION FRONTEND ===== */
function normalizeBaseLabel(base) {
  const b = String(base || "").trim();
  if (!b) return "Unknown Base";
  return b.toUpperCase().startsWith("BASE") ? b : "Base " + b;
}

function showFleetMap(addToHistory = true) {
  showOnlyPage("fleetView");

  if (addToHistory) pushRoute("fleetMap");

  document.getElementById("fleetContent").innerHTML = `
    <div class="unit-title">Fleet Map</div>
    <p style="text-align:center;color:#60a5fa;">Loading fleet map...</p>
  `;

  fetch(API_URL + "/api/apparatus?showAll=true")
    .then((res) => res.json())
    .then((data) => {
      if (!data.ok) {
        throw new Error(data.error || "Could not load fleet map.");
      }

      const units = (data.units || []).map((u) => ({
        unit: u.unit,
        base: u.homeBase,
        homeBase: u.homeBase,
        currentBase: u.currentBase,
        active: u.active ? "YES" : "NO",
        oosReason: u.oosReason || "",
        checkDays: u.checkDays || "",
      }));

      renderFleetMap(units);
    })
    .catch((error) => {
      document.getElementById("fleetContent").innerHTML = `
        <div class="unit-title">Fleet Map</div>
        <div class="admin-row" style="text-align:center;color:#f87171;">
          ${escapeHtml(error.message)}
        </div>
        <button class="back-btn" onclick="showDashboard()">Back to Dashboard</button>
      `;
    });
}

function renderFleetMap(units) {
  units = units || [];
  const grouped = {};

  units.forEach((u) => {
    const base = normalizeBaseLabel(
      u.currentBase || u.base || u.homeBase || "Unknown",
    );
    if (!grouped[base]) grouped[base] = [];
    grouped[base].push(u);
  });

  let bases = Object.keys(grouped).sort((a, b) =>
    a.localeCompare(b, undefined, { numeric: true }),
  );

  let html = `
    <div class="unit-title">Fleet Map</div>
    <div class="fleet-toolbar">
      <input id="fleetMapSearch" placeholder="Search unit or base" oninput="filterFleetMapCards()">
      ${isAdminUser() ? `<button class="small-btn" onclick="showFleetInfo()">Unit Info</button>` : ""}
      <button class="small-btn back-btn" onclick="showDashboard()">Back</button>
    </div>
  `;

  if (units.length === 0) {
    html += `<div class="admin-row" style="text-align:center;">No fleet units found.</div>`;
  } else {
    html += `<div class="fleet-base-grid" id="fleetMapCards">`;

    bases.forEach((base) => {
      html += `
        <div class="fleet-base-card" data-search="${escapeHtml(base.toLowerCase())} ${escapeHtml(
          grouped[base]
            .map((u) => u.unit)
            .join(" ")
            .toLowerCase(),
        )}">
          <div class="section-title" style="margin-top:0;">${escapeHtml(base)}</div>
      `;

      grouped[base].forEach((u) => {
        const active = String(u.active || "").toUpperCase() === "YES";
        const canOpenInfo = isAdminUser();
        html += `
          <div class="fleet-unit-row" ${canOpenInfo ? `onclick="openUnitInfo('${escapeJs(u.unit)}')" style="cursor:pointer;"` : ""}>
            <strong>${escapeHtml(u.unit)}</strong><br>
            <span class="${active ? "fleet-status-good" : "fleet-status-bad"}">${active ? "In Service" : "Out Of Service"}</span><br>
            ${!active && u.oosReason ? `<span class="muted"><strong>Reason:</strong> ${escapeHtml(u.oosReason)}</span><br>` : ""}
            <span class="muted">Home Base: ${escapeHtml(normalizeBaseLabel(u.homeBase || u.base))}</span>
            ${canOpenInfo ? `<br><span class="muted">Click for unit info</span>` : ""}
          </div>
        `;
      });

      html += `</div>`;
    });

    html += `</div>`;
  }

  document.getElementById("fleetContent").innerHTML = html;
}

function filterFleetMapCards() {
  const q = String(document.getElementById("fleetMapSearch")?.value || "")
    .toLowerCase()
    .trim();
  document
    .querySelectorAll("#fleetMapCards .fleet-base-card")
    .forEach((card) => {
      card.style.display =
        !q || String(card.dataset.search || "").includes(q) ? "" : "none";
    });
}

function showFleetInfo(addToHistory = true) {
  if (!requireAdminPage()) return;

  showOnlyPage("fleetView");

  if (addToHistory) pushRoute("fleetInfo");

  document.getElementById("fleetContent").innerHTML = `
    <div class="unit-title">Unit Information</div>
    <p style="text-align:center;color:#60a5fa;">Loading unit information...</p>
  `;

  fetch(API_URL + "/api/unit-info")
    .then((res) => res.json())
    .then((data) => {
      if (!data.ok) {
        throw new Error(data.error || "Could not load unit information.");
      }

      renderFleetInfo(data.unitInfo || []);
    })
    .catch((error) => {
      document.getElementById("fleetContent").innerHTML = `
        <div class="unit-title">Unit Information</div>
        <div class="admin-row" style="text-align:center;color:#f87171;">
          ${escapeHtml(error.message)}
        </div>
        <button class="back-btn" onclick="showDashboard()">Back to Dashboard</button>
      `;
    });
}

function renderFleetInfo(units) {
  units = units || [];

  let html = `
    <div class="unit-title">Unit Information</div>
    <div class="fleet-toolbar">
      <input id="fleetInfoSearch" placeholder="Search unit, VIN, tag, tire size" oninput="filterFleetInfoCards()">
      <button class="small-btn" onclick="showFleetMap()">Fleet Map</button>
      <button class="small-btn back-btn" onclick="showDashboard()">Back</button>
    </div>
  `;

  if (units.length === 0) {
    html += `
      <div class="admin-row" style="text-align:center;">
        No unit information found. An admin can add unit info from the Admin Panel.
      </div>
    `;
  } else {
    html += `<div class="fleet-info-grid" id="fleetInfoCards">`;
    units.forEach((u) => (html += fleetInfoCardHtml(u, true)));
    html += `</div>`;
  }

  document.getElementById("fleetContent").innerHTML = html;
}

function fleetInfoCardHtml(u, clickable) {
  const title = [u.year, u.make, u.model].filter(Boolean).join(" ");
  const search = JSON.stringify(
    Object.values(u || {})
      .join(" ")
      .toLowerCase(),
  ).slice(1, -1);

  return `
    <div class="fleet-info-card" data-search="${escapeHtml(search)}" ${clickable ? `onclick="openUnitInfo('${escapeJs(u.unit)}')" style="cursor:pointer;"` : ""}>
      <div class="item-name">${escapeHtml(u.unit)}</div>
      <div class="muted">${escapeHtml(title || "No year/make/model entered")}</div>
      <div class="fleet-info-lines">
        <div><strong>VIN</strong>${escapeHtml(u.vin || "-")}</div>
        <div><strong>Tag</strong>${escapeHtml(u.tag || "-")}</div>
        <div><strong>Mileage</strong>${escapeHtml(u.mileage || "-")}</div>
        <div><strong>Fuel Type</strong>${escapeHtml(u.fuelType || "-")}</div>
        <div><strong>Oil Type</strong>${escapeHtml(u.oilType || "-")}</div>
        <div><strong>Tire Size</strong>${escapeHtml(u.tireSize || "-")}</div>
        <div><strong>Insurance Exp</strong>${escapeHtml(u.insuranceExp || "-")}</div>
        <div><strong>Registration Exp</strong>${escapeHtml(u.registrationExp || "-")}</div>
      </div>
      ${u.notes ? `<div class="review-line" style="margin-top:10px;"><strong>Notes:</strong> ${escapeHtml(u.notes)}</div>` : ""}
    </div>
  `;
}

function filterFleetInfoCards() {
  const q = String(document.getElementById("fleetInfoSearch")?.value || "")
    .toLowerCase()
    .trim();
  document
    .querySelectorAll("#fleetInfoCards .fleet-info-card")
    .forEach((card) => {
      card.style.display =
        !q || String(card.dataset.search || "").includes(q) ? "" : "none";
    });
}

function openUnitInfo(unit, addToHistory = true) {
  if (!requireAdminPage()) return;

  showOnlyPage("fleetView");

  if (addToHistory) {
    pushRoute("unitInfo", { unit: unit });
  }

  document.getElementById("fleetContent").innerHTML = `
    <div class="unit-title">${escapeHtml(unit)}</div>
    <p style="text-align:center;color:#60a5fa;">Loading unit information...</p>
  `;

  fetch(API_URL + "/api/unit-info")
    .then((res) => res.json())
    .then((data) => {
      if (!data.ok) {
        throw new Error(data.error || "Could not load unit information.");
      }

      const units = data.units || [];

      const found = units.find(
        (u) =>
          String(u.unit || "").toUpperCase() ===
          String(unit || "").toUpperCase(),
      );

      let html = `<div class="unit-title">${escapeHtml(unit)}</div>`;

      if (found) {
        html += fleetInfoCardHtml(found, false);
      } else {
        html += `
          <div class="admin-row" style="text-align:center;">
            No information card has been added for this unit yet.
          </div>
        `;
      }

      html += `
        <div class="check-actions">
          <button onclick="showFleetMap()">Back to Fleet Map</button>
          <button class="back-btn" onclick="showDashboard()">Dashboard</button>
        </div>
      `;

      document.getElementById("fleetContent").innerHTML = html;
    })
    .catch((error) => {
      document.getElementById("fleetContent").innerHTML = `
        <div class="unit-title">${escapeHtml(unit)}</div>
        <div class="admin-row" style="text-align:center;color:#f87171;">
          ${escapeHtml(error.message)}
        </div>
        <button class="back-btn" onclick="showFleetMap()">Back</button>
      `;
    });
}

function escapeJs(value) {
  return String(value || "")
    .replace(/\\/g, "\\\\")
    .replace(/'/g, "\\'")
    .replace(/\n/g, " ")
    .replace(/\r/g, " ");
}

function loadFleetInfoAdmin() {
  document.getElementById("adminResults").innerHTML =
    `<p style="text-align:center;color:#60a5fa;">Loading unit information editor...</p>`;

  fetch(API_URL + "/api/unit-info")
    .then((res) => res.json())
    .then((data) => {
      if (!data.ok) {
        throw new Error(data.error || "Could not load unit information.");
      }

      const units = data.unitInfo || [];

      let html = `
        <div class="section-title">Unit Information</div>

        <div class="admin-row">
          <div class="item-name">Add New Unit Info</div>
          ${fleetInfoAdminFields("new", {})}
          <button class="success-btn" onclick="saveFleetInfoAdmin('new')">
            Add Unit Info
          </button>
        </div>

        <div class="section-title">Current Unit Information</div>
      `;

      if (units.length === 0) {
        html += `<div class="admin-row">No unit information found.</div>`;
      }

      units.forEach((u) => {
        html += `
          <div class="admin-row">
            <div class="item-name">${escapeHtml(u.unit || "")}</div>
            ${fleetInfoAdminFields(u._id, u)}

            <button class="success-btn small-btn" onclick="saveFleetInfoAdmin('${u._id}')">
              Save
            </button>

            <button class="danger-btn small-btn" onclick="deleteFleetInfoAdmin('${u._id}')">
              Delete
            </button>
          </div>
        `;
      });

      document.getElementById("adminResults").innerHTML = html;
    })
    .catch((error) => alert(error.message));
}

function fleetInfoAdminFields(id, u) {
  return `
    <label>Unit</label>
    <input id="fleet_unit_${id}" value="${escapeHtml(u.unit || "")}" placeholder="Example: Medic 1">

    <div class="field-row">
      <div>
        <label>Year</label>
        <input id="fleet_year_${id}" value="${escapeHtml(u.year || "")}" placeholder="Example: 2018">
      </div>
      <div>
        <label>Make</label>
        <input id="fleet_make_${id}" value="${escapeHtml(u.make || "")}" placeholder="Example: Ford">
      </div>
    </div>

    <label>Model</label>
    <input id="fleet_model_${id}" value="${escapeHtml(u.model || "")}" placeholder="Example: F-550">

    <div class="field-row">
      <div>
        <label>VIN</label>
        <input id="fleet_vin_${id}" value="${escapeHtml(u.vin || "")}">
      </div>
      <div>
        <label>Tag</label>
        <input id="fleet_tag_${id}" value="${escapeHtml(u.tag || "")}">
      </div>
    </div>

    <div class="field-row">
      <div>
        <label>Mileage</label>
        <input id="fleet_mileage_${id}" value="${escapeHtml(u.mileage || "")}">
      </div>
      <div>
        <label>Fuel Type</label>
        <input id="fleet_fuel_${id}" value="${escapeHtml(u.fuelType || "")}" placeholder="Diesel / Gas">
      </div>
    </div>

    <div class="field-row">
      <div>
        <label>Oil Type</label>
        <input id="fleet_oil_${id}" value="${escapeHtml(u.oilType || "")}" placeholder="Example: 15W-40">
      </div>
      <div>
        <label>Tire Size</label>
        <input id="fleet_tires_${id}" value="${escapeHtml(u.tireSize || "")}">
      </div>
    </div>

    <div class="field-row">
      <div>
        <label>Insurance Exp</label>
        <input id="fleet_ins_${id}" value="${escapeHtml(u.insuranceExp || "")}" placeholder="MM/DD/YYYY">
      </div>
      <div>
        <label>Registration Exp</label>
        <input id="fleet_reg_${id}" value="${escapeHtml(u.registrationExp || "")}" placeholder="MM/DD/YYYY">
      </div>
    </div>

    <label>Notes</label>
    <textarea id="fleet_notes_${id}" placeholder="Extra notes">${escapeHtml(u.notes || "")}</textarea>
  `;
}

function collectFleetInfoAdmin(id) {
  return {
    row: id === "new" ? "" : id,
    unit: document.getElementById(`fleet_unit_${id}`).value.trim(),
    year: document.getElementById(`fleet_year_${id}`).value.trim(),
    make: document.getElementById(`fleet_make_${id}`).value.trim(),
    model: document.getElementById(`fleet_model_${id}`).value.trim(),
    vin: document.getElementById(`fleet_vin_${id}`).value.trim(),
    tag: document.getElementById(`fleet_tag_${id}`).value.trim(),
    mileage: document.getElementById(`fleet_mileage_${id}`).value.trim(),
    fuelType: document.getElementById(`fleet_fuel_${id}`).value.trim(),
    oilType: document.getElementById(`fleet_oil_${id}`).value.trim(),
    tireSize: document.getElementById(`fleet_tires_${id}`).value.trim(),
    insuranceExp: document.getElementById(`fleet_ins_${id}`).value.trim(),
    registrationExp: document.getElementById(`fleet_reg_${id}`).value.trim(),
    notes: document.getElementById(`fleet_notes_${id}`).value.trim(),
  };
}

function saveFleetInfoAdmin(id) {
  const info = collectFleetInfoAdmin(id);

  if (!info.unit) {
    showToast("Unit is required.", "error");
    return;
  }

  const isNew = String(id) === "new";

  const url = API_URL + "/api/unit-info";

  const payload = {
    unit: info.unit,
    year: info.year,
    make: info.make,
    model: info.model,
    vin: info.vin,
    tag: info.tag,
    mileage: info.mileage,
    fuelType: info.fuelType,
    oilType: info.oilType,
    tireSize: info.tireSize,
    insuranceExp: info.insuranceExp,
    registrationExp: info.registrationExp,
    notes: info.notes,
  };

  if (!isNew) {
    payload.id = id;
  }

  fetch(url, {
    method: isNew ? "POST" : "PATCH",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  })
    .then((res) => res.json())
    .then((result) => {
      if (!result.ok) {
        throw new Error(result.error || "Fleet info save failed.");
      }

      showToast("Fleet info saved.", "success");
      loadFleetInfoAdmin();
    })
    .catch((error) => {
      showToast(error.message, "error");
    });
}

function deleteFleetInfoAdmin(id) {
  if (!confirm("Delete this unit information card?")) return;

  fetch(API_URL + "/api/unit-info", {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      id: id,
      unit: "",
      active: false,
      deleted: true,
    }),
  })
    .then((res) => res.json())
    .then((result) => {
      if (!result.ok) {
        throw new Error(result.error || "Delete failed.");
      }

      showToast("Fleet info deleted.", "success");
      loadFleetInfoAdmin();
    })
    .catch((error) => {
      showToast(error.message, "error");
    });
}

function deleteFleetInfoAdmin(id) {
  if (!confirm("Delete this unit information card?")) return;

  fetch(API_URL + "/api/unit-info?id=" + encodeURIComponent(id), {
    method: "DELETE",
  })
    .then((res) => res.json())
    .then((result) => {
      if (!result.ok) {
        throw new Error(result.error || "Delete failed.");
      }

      showToast("Fleet info deleted.", "success");
      loadFleetInfoAdmin();
    })
    .catch((error) => {
      showToast(error.message, "error");
    });
}



/* ===== EXPIRATIONS / MEDICAL BAGS ===== */
function formatExpirationDate(value) {
  if (!value) return "";
  const text = String(value || "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    const parts = text.split("-");
    return parts[1] + "/" + parts[2] + "/" + parts[0];
  }
  return text;
}

function getExpirationStatusClass(daysLeft) {
  if (daysLeft < 0) return "expired";
  if (daysLeft <= 30) return "warning";
  return "safe";
}

function getExpirationStatusText(daysLeft) {
  if (daysLeft < 0) return Math.abs(daysLeft) + " days past";
  if (daysLeft === 0) return "Expires today";
  return daysLeft + " days left";
}

function loadExpirationsDashboard() {
  const summary = document.getElementById("expirationsSummary");
  const box = document.getElementById("expirationsContent");
  if (!box) return;

  if (summary) summary.innerHTML = "";
  box.innerHTML = `<p style="text-align:center;color:#60a5fa;">Loading expirations...</p>`;

  fetch(API_URL + "/api/expirations?type=dashboard")
    .then((res) => res.json())
    .then((data) => {
      if (!data.ok) throw new Error(data.error || "Could not load expirations.");

      const bags = data.bags || data.units || [];
      const totals = data.totals || { expired: 0, warning: 0, safe: 0, bags: 0, unassigned: 0 };

      if (summary) {
        summary.innerHTML = `
          <div class="report-summary-grid">
            <div class="report-stat"><strong>${totals.bags || 0}</strong><span class="muted">Medical Bags</span></div>
            <div class="report-stat"><strong>${totals.expired || 0}</strong><span class="muted">Expired</span></div>
            <div class="report-stat"><strong>${totals.warning || 0}</strong><span class="muted">Expiring Within 30 Days</span></div>
            <div class="report-stat"><strong>${totals.safe || 0}</strong><span class="muted">Safe</span></div>
            <div class="report-stat"><strong>${totals.unassigned || 0}</strong><span class="muted">Unassigned</span></div>
          </div>
        `;
      }

      if (bags.length === 0) {
        box.innerHTML = `<div class="admin-row">No medical bag expiration records found yet.</div>`;
        return;
      }

      box.innerHTML = bags.map((bag) => {
        const bagTag = bag.bagTag || bag.tag || bag.medicalBagTag || "";
        const assignedUnit = bag.assignedUnit || bag.currentUnit || bag.unit || "";
        const assignedBase = bag.assignedBase || bag.base || "";
        const items = bag.items || [];

        const itemHtml = items.length
          ? items.map((item) => {
              const cls = getExpirationStatusClass(Number(item.daysLeft || 0));
              return `
                <div class="expiration-item ${cls}">
                  <div class="expiration-item-name">${escapeHtml(item.item || "")}</div>
                  <div class="muted">${escapeHtml(item.section || "Medical Bag")} • ${escapeHtml(formatExpirationDate(item.expiration))}</div>
                  <div class="expiration-days">${escapeHtml(getExpirationStatusText(Number(item.daysLeft || 0)))}</div>
                </div>
              `;
            }).join("")
          : `<div class="muted">No expiration items entered for this bag.</div>`;

        const assignedHtml = assignedUnit
          ? `<div class="muted">Assigned: <strong>${escapeHtml(assignedUnit)}</strong>${assignedBase ? " • Base " + escapeHtml(assignedBase) : ""}</div>`
          : `<div class="muted">Assigned: <strong>Unassigned</strong></div>`;

        return `
          <div class="expiration-unit-card">
            <div class="expiration-unit-title">${escapeHtml(bagTag || "NO BAG TAG")}</div>
            ${assignedHtml}
            ${bag.description ? `<div class="muted">${escapeHtml(bag.description)}</div>` : ""}
            <div class="expiration-items-grid">${itemHtml}</div>
          </div>
        `;
      }).join("");
    })
    .catch((error) => {
      box.innerHTML = `<div class="admin-row">${escapeHtml(error.message)}</div>`;
    });
}



function loadExpirationAdmin() {
  if (!requireAdminPage()) return;

  document.getElementById("adminResults").innerHTML = `
    <div class="section-title">Medical Bags / Expirations</div>

    <div class="admin-row">
      <label>Add Medical Bag / Unit Number</label>
      <input id="newBagTag" placeholder="Example: 93 Rescue 2">
      <label>Description</label>
      <input id="newBagDescription" placeholder="Example: Red medical bag">
      <button onclick="saveMedicalBagAdmin()">Add / Save Bag</button>
    </div>

    <div class="admin-row">
      <label>Bag Tag</label>
      <input id="newExpBagTag" placeholder="Example: 93 Rescue 2">
      <label>Item</label>
      <input id="newExpItem" placeholder="Example: Oral Glucose">
      <label>Expiration Date</label>
      <input id="newExpDate" type="date">
      <label>Section</label>
      <input id="newExpSection" placeholder="Medical Bag">
      <button onclick="saveExpirationItemAdmin()">Add Expiration Item</button>
    </div>

    <div class="admin-row">
      <label>Assign Bag to Apparatus</label>
      <input id="assignUnit" placeholder="Example: Medic 1">
      <input id="assignBagTag" placeholder="Example: 93 Rescue 2">
      <button onclick="assignBagAdmin()">Assign Bag</button>
    </div>

    <div id="expirationAdminList">
      <p style="text-align:center;color:#60a5fa;">Loading bags...</p>
    </div>
  `;

  refreshExpirationAdminList();
}

function saveMedicalBagAdmin() {
  const tag = document.getElementById("newBagTag").value.trim();
  const description = document.getElementById("newBagDescription").value.trim();

  if (!tag) return alert("Enter a bag tag.");

  fetch(API_URL + "/api/expirations", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "saveBag",
      tag,
      description
    })
  })
    .then((res) => res.json())
    .then((data) => {
      if (!data.ok) throw new Error(data.error || "Could not save bag.");
      showToast("Medical bag saved.", "success");
      document.getElementById("newBagTag").value = "";
      document.getElementById("newBagDescription").value = "";
      refreshExpirationAdminList();
    })
    .catch((error) => alert(error.message));
}

function saveExpirationItemAdmin() {
  const bagTag = document.getElementById("newExpBagTag").value.trim();
  const item = document.getElementById("newExpItem").value.trim();
  const expiration = document.getElementById("newExpDate").value;
  const section = document.getElementById("newExpSection").value.trim() || "Medical Bag";

  if (!bagTag || !item || !expiration) {
    return alert("Enter bag tag, item, and expiration date.");
  }

  fetch(API_URL + "/api/expirations", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "saveItem",
      bagTag,
      item,
      expiration,
      section
    })
  })
    .then((res) => res.json())
    .then((data) => {
      if (!data.ok) throw new Error(data.error || "Could not save item.");
      showToast("Expiration item saved.", "success");
      document.getElementById("newExpItem").value = "";
      document.getElementById("newExpDate").value = "";
      refreshExpirationAdminList();
    })
    .catch((error) => alert(error.message));
}

function assignBagAdmin() {
  const unit = document.getElementById("assignUnit").value.trim();
  const bagTag = document.getElementById("assignBagTag").value.trim();

  if (!unit || !bagTag) return alert("Enter unit and bag tag.");

  fetch(API_URL + "/api/expirations", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "assignBag",
      unit,
      bagTag,
      updatedBy: currentUser ? currentUser.name : ""
    })
  })
    .then((res) => res.json())
    .then((data) => {
      if (!data.ok) throw new Error(data.error || "Could not assign bag.");
      showToast("Bag assigned.", "success");
      refreshExpirationAdminList();
    })
    .catch((error) => alert(error.message));
}

function refreshExpirationAdminList() {
  const box = document.getElementById("expirationAdminList");
  if (!box) return;

  box.innerHTML = `<p style="text-align:center;color:#60a5fa;">Loading bags...</p>`;

  fetch(API_URL + "/api/expirations?type=admin")
    .then((res) => res.json())
    .then((data) => {
      if (!data.ok) throw new Error(data.error || "Could not load bags.");

      const bags = data.bags || [];
      if (bags.length === 0) {
        box.innerHTML = `<div class="admin-row">No medical bags added yet.</div>`;
        return;
      }

      box.innerHTML = bags.map((bag) => {
        const items = bag.items || [];
        const itemHtml = items.length
          ? items.map((item) => `
              <div class="expiration-admin-item">
                <strong>${escapeHtml(item.item || "")}</strong>
                <span class="muted">${escapeHtml(formatExpirationDate(item.expiration))} • ${escapeHtml(item.section || "")}</span>
                <button class="danger-btn small-btn" onclick="deleteExpirationItemAdmin('${escapeHtml(item._id || "")}')">Delete</button>
              </div>
            `).join("")
          : `<div class="muted">No items for this bag yet.</div>`;

        return `
          <div class="admin-row">
            <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;">
              <div>
                <strong>${escapeHtml(bag.tag || "")}</strong>
                <span class="pill">${escapeHtml(bag.currentUnit || "Unassigned")}</span><br>
                <span class="muted">${escapeHtml(bag.description || "")}</span>
              </div>
              <button type="button" class="danger-btn small-btn" onclick="deleteMedicalBagAdmin('${escapeHtml(bag._id || "")}', '${escapeHtml(bag.tag || "")}')">
                Delete Bag
              </button>
            </div>
            <div class="expiration-admin-items">${itemHtml}</div>
          </div>
        `;
      }).join("");
    })
    .catch((error) => {
      box.innerHTML = `<div class="admin-row">${escapeHtml(error.message)}</div>`;
    });
}


function deleteMedicalBagAdmin(id, tag) {
  if (!id) return alert("Missing medical bag id.");

  const label = tag || "this medical bag";
  if (!confirm("Delete " + label + "? This will hide the bag from the expiration board.")) {
    return;
  }

  fetch(API_URL + "/api/expirations?type=bag&id=" + encodeURIComponent(id), {
    method: "DELETE"
  })
    .then((res) => res.json())
    .then((data) => {
      if (!data.ok) throw new Error(data.error || "Could not delete medical bag.");
      showToast("Medical bag deleted.", "success");
      refreshExpirationAdminList();
      if (typeof loadExpirationsDashboard === "function") {
        loadExpirationsDashboard();
      }
    })
    .catch((error) => alert(error.message));
}

function deleteExpirationItemAdmin(id) {
  if (!id) return;
  if (!confirm("Delete this expiration item?")) return;

  fetch(API_URL + "/api/expirations?type=item&id=" + encodeURIComponent(id), {
    method: "DELETE"
  })
    .then((res) => res.json())
    .then((data) => {
      if (!data.ok) throw new Error(data.error || "Could not delete item.");
      showToast("Expiration item deleted.", "success");
      refreshExpirationAdminList();
    })
    .catch((error) => alert(error.message));
}
/* ===== END EXPIRATIONS / MEDICAL BAGS ===== */


async function deleteMedicalBag(id, tag) {
  if (!confirm("Delete medical bag " + tag + "?")) return;
  const res = await fetch(API_URL + "/api/expirations?type=bag&id=" + encodeURIComponent(id), {
    method: "DELETE"
  });
  const data = await res.json();
  if (data.ok) {
    showToast("Medical bag deleted.", "success");
    if (typeof loadExpirationsDashboard === "function") loadExpirationsDashboard();
    if (typeof loadExpirationsAdmin === "function") loadExpirationsAdmin();
  } else {
    alert(data.error || "Delete failed");
  }
}


/* ===== DATABASE CHECKOFF DRAFTS ===== */
async function saveCheckDraft(unit) {
  try {
    const cards = document.querySelectorAll("#checkForm .check-item");
    if (!cards || cards.length === 0 || !currentUser) return;

    await fetch(API_URL + "/api/check-submissions?draft=true", {
      method: "POST",
      headers: {"Content-Type":"application/json"},
      body: JSON.stringify({
        action: "saveDraft",
        username: currentUser.username,
        unit: unit,
        base: deriveChecklistBaseFromUnit(unit, currentCheckBase || currentUser.base),
        medicalBagTag: document.getElementById("medicalBagTag")?.value || "",
        data: getCheckDraftData()
      })
    });
  } catch(e){ console.error(e); }
}

async function restoreCheckDraft(unit) {
  try {
    if (!currentUser) return;

    const res = await fetch(
      API_URL + "/api/check-submissions?draft=true&username=" +
      encodeURIComponent(currentUser.username) +
      "&unit=" + encodeURIComponent(unit)
    );
    const payload = await res.json();
    if (!payload.ok || !payload.draft) return;

    const rows = payload.draft.data || [];
    const bagTagField = document.getElementById("medicalBagTag");
    if (bagTagField && payload.draft.medicalBagTag) {
      bagTagField.value = payload.draft.medicalBagTag;
    }

    const cards = Array.from(document.querySelectorAll("#checkForm .check-item"));
    cards.forEach((card, index) => {
      const row = rows[index];
      if (!row) return;
      Object.keys(row).forEach(k=>{
        const el = card.querySelector("." + k);
        if (el) el.value = row[k] || "";
      });
    });

    showToast("Saved progress restored from database.","success");
  } catch(e){ console.error(e); }
}

async function clearCheckDraft(unit) {
  try {
    if (!currentUser) return;
    await fetch(
      API_URL + "/api/check-submissions?draft=true&username=" +
      encodeURIComponent(currentUser.username) +
      "&unit=" + encodeURIComponent(unit),
      { method:"DELETE" }
    );
  } catch(e){ console.error(e); }
}
/* ===== END DATABASE CHECKOFF DRAFTS ===== */
