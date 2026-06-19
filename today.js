/********************** SERVICE WORKER UPDATE LISTENER **********************/
// Note: This listener is duplicated in login.js. Consider extracting to a shared module.
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.addEventListener("message", (e) => {
    if (e.data?.type === "SW_UPDATED") location.reload();
  });
}

/********************** SAFE SESSION STORAGE ACCESS **********************/
function getSessionItem(key, fallback = null) {
  try {
    return sessionStorage.getItem(key);
  } catch (err) {
    console.warn(`sessionStorage unavailable for key "${key}":`, err);
    return fallback;
  }
}

/********************** LOGIN CHECK **********************/
const loggedInEmail = getSessionItem("userEmail");
if (!loggedInEmail) {
  // Guarded redirect: only redirect if we're actually in a browser with a valid location
  if (typeof window !== "undefined" && window.location) {
    window.location.href = "index.html";
  }
}

/********************** APP HEAD FLAG **********************/
const IS_APP_HEAD = getSessionItem("isAppHead") === "true";

// Map of email -> display name (stored by login.js)
const USER_NAMES = (() => {
  try {
    return JSON.parse(getSessionItem("userNames") || "{}");
  } catch (err) {
    console.warn("Failed to parse userNames from sessionStorage:", err);
    return {};
  }
})();
const SUPABASE_URL = "https://qwzyxsbjfedkvuvdmzhk.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF3enl4c2JqZmVka3Z1dmRtemhrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ2NzYxNjYsImV4cCI6MjA5MDI1MjE2Nn0.SSH4G7szFkhNkXZmHZsYQeyjvnoHh2bza8IK5lweEm4";

const SUPABASE_HEADERS = {
  apikey: SUPABASE_ANON_KEY,
  Authorization: `Bearer ${SUPABASE_ANON_KEY}`
};

const COLUMNS = {
  id: "col1",
  name: "col3",
  mobile: "col4",
  location: "col5",
  email: "col8",          // owner email
  nextPlanDate: "col18",
  updateLink: "col21",
  updatedStage: "col22",
  leadStatus: "col24",
  lastCallDate: "col28"
};

/********************** CONSTANTS **********************/
const PAGE_SIZE = 50;
const SEARCH_DEBOUNCE_MS = 250;
const DEFAULT_COUNTRY_CODE = "91"; // India
const LOST_STATUS = "Lost";
const COMPLETED_STATUS = "Completed";

// Dropdown option values (used instead of positional indexes)
const DATE_FILTER_VALUES = {
  ALL: "all",
  TODAY: "today",
  PENDING: "pending"
};

/********************** DOM REFERENCES **********************/
const loader = document.getElementById("loader");
const list = document.getElementById("list");
const searchInput = document.getElementById("search");
const dateFilter = document.getElementById("dateFilter");
const stageFilter = document.getElementById("stageFilter");
const userTabsStrip = document.getElementById("userTabsStrip");
const dateEl = document.getElementById("date");

if (dateEl) dateEl.innerText = new Date().toDateString();

/********************** STATE **********************/
const state = {
  allData: [],
  filteredData: [],
  selectedUser: null,   // email of user currently viewed (App Head only)
  visibleCount: PAGE_SIZE
};

/********************** LOADER **********************/
function showLoader() {
  if (loader) loader.style.display = "flex";
}
function hideLoader() {
  if (loader) loader.style.display = "none";
}

/********************** HTML ESCAPING (XSS PROTECTION) **********************/
function escapeHtml(value) {
  if (value === null || value === undefined) return "";
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Only permit safe URL schemes for hrefs (blocks javascript:, data:, etc.)
function safeUrl(url) {
  if (!url) return "#";
  const trimmed = String(url).trim();
  // Allow http, https, mailto, tel, and relative URLs
  if (/^(https?:|mailto:|tel:|\/|\.\/|\.\.\/)/i.test(trimmed)) {
    return escapeHtml(trimmed);
  }
  return "#";
}

// Sanitize phone number: keep only digits (avoids broken tel:/wa.me links)
function sanitizePhone(mobile) {
  if (!mobile) return "";
  return String(mobile).replace(/\D/g, "");
}

/********************** ROBUST DATE PARSER **********************/
function parseISODate(dateStr) {
  if (!dateStr) return null;

  // Handle dd/mm/yyyy format
  if (typeof dateStr === "string" && dateStr.includes("/")) {
    const parts = dateStr.split("/");
    if (parts.length === 3) {
      const d = new Date(parts[2], parts[1] - 1, parts[0]);
      if (!isNaN(d)) {
        d.setHours(0, 0, 0, 0);
        return d;
      }
    }
  }

  const d = new Date(dateStr);
  if (isNaN(d)) return null;
  d.setHours(0, 0, 0, 0);
  return d;
}

function formatDisplayDate(dateStr) {
  const d = parseISODate(dateStr);
  if (!d) return "-";
  return d.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  });
}

function getToday() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today;
}

/********************** MAP RAW ROW -> LEAD OBJECT **********************/
function mapRow(row) {
  return {
    id: row[COLUMNS.id],
    name: row[COLUMNS.name],
    mobile: row[COLUMNS.mobile],
    location: row[COLUMNS.location],
    email: row[COLUMNS.email],
    updatedStage: row[COLUMNS.updatedStage],
    leadStatus: row[COLUMNS.leadStatus],
    updateLink: row[COLUMNS.updateLink],
    nextPlanDate: row[COLUMNS.nextPlanDate],
    lastCallDate: row[COLUMNS.lastCallDate],
    _nextPlanDate: parseISODate(row[COLUMNS.nextPlanDate])
  };
}

/********************** FETCH FROM SUPABASE **********************/
async function fetchData(emailFilter) {
  showLoader();
  list.innerHTML = "<p>Loading data...</p>";

  const emailParam = emailFilter
    ? `&${COLUMNS.email}=eq.${encodeURIComponent(emailFilter)}`
    : "";

  const url = `${SUPABASE_URL}/rest/v1/filtered_leads?select=*${emailParam}`;

  try {
    const res = await fetch(url, { headers: SUPABASE_HEADERS });
    if (!res.ok) throw new Error(`Network error: ${res.status} ${res.statusText}`);
    const data = await res.json();

    state.allData = data.map(mapRow);
    updateDropdownCounts();
    updateStageCounts();
    applyFilters();
  } catch (err) {
    console.error("fetchData failed:", err);
    list.innerHTML = "<p>Failed to load data</p>";
  } finally {
    hideLoader();
  }
}

/********************** APP HEAD: BUILD USER TABS **********************/
async function buildUserTabs() {
  if (!userTabsStrip) return;

  userTabsStrip.innerHTML = `<span class="tab-placeholder">Fetching users…</span>`;

  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/filtered_leads?select=${COLUMNS.email}`,
      { headers: SUPABASE_HEADERS }
    );
    if (!res.ok) throw new Error(`Network error: ${res.status} ${res.statusText}`);
    const rows = await res.json();

    const uniqueEmails = [...new Set(rows.map(r => r[COLUMNS.email]).filter(Boolean))];
    uniqueEmails.sort((a, b) => {
      const na = USER_NAMES[a] || a;
      const nb = USER_NAMES[b] || b;
      return na.localeCompare(nb);
    });

    if (!uniqueEmails.length) {
      userTabsStrip.innerHTML = `<span class="tab-placeholder">No users found</span>`;
      return;
    }

    userTabsStrip.innerHTML = "";
    const frag = document.createDocumentFragment();

    uniqueEmails.forEach(email => {
      const displayName = USER_NAMES[email] || email;
      const btn = document.createElement("button");
      btn.className = "user-tab";
      btn.textContent = displayName; // textContent is XSS-safe
      btn.dataset.email = email;
      btn.addEventListener("click", () => selectUser(email, btn));
      frag.appendChild(btn);
    });

    userTabsStrip.appendChild(frag);
  } catch (err) {
    console.error("Failed to load user list:", err);
    userTabsStrip.innerHTML = `<span class="tab-placeholder" style="color:#e55;">Failed to load users</span>`;
  }
}

/********************** APP HEAD: SELECT A USER **********************/
function selectUser(email, clickedBtn) {
  state.selectedUser = email;

  // Highlight active tab
  document.querySelectorAll(".user-tab").forEach(b => b.classList.remove("active"));
  if (clickedBtn) clickedBtn.classList.add("active");

  // Reset filters so new user data loads fresh
  dateFilter.value = DATE_FILTER_VALUES.ALL;
  stageFilter.value = "";
  searchInput.value = "";

  fetchData(email);
}

/********************** DATE COUNTS **********************/
function updateDropdownCounts() {
  const today = getToday();
  const todayTime = today.getTime();

  const allCount = state.allData.length;

  const todayCount = state.allData.filter(l =>
    l._nextPlanDate && l._nextPlanDate.getTime() === todayTime
  ).length;

  const pendingCount = state.allData.filter(l =>
    l._nextPlanDate &&
    l._nextPlanDate.getTime() < todayTime &&
    l.leadStatus !== LOST_STATUS &&
    l.leadStatus !== COMPLETED_STATUS
  ).length;

  // Look up options by value instead of positional index (robust to HTML reordering)
  const labels = {
    [DATE_FILTER_VALUES.ALL]: `All Work (${allCount})`,
    [DATE_FILTER_VALUES.TODAY]: `Today (${todayCount})`,
    [DATE_FILTER_VALUES.PENDING]: `Pending (${pendingCount})`
  };

  Array.from(dateFilter.options).forEach(option => {
    if (labels[option.value] !== undefined) {
      option.text = labels[option.value];
    }
  });
}

/********************** STAGE COUNTS **********************/
function updateStageCounts() {
  const stageCounts = {};
  state.allData.forEach(l => {
    if (l.updatedStage) {
      stageCounts[l.updatedStage] = (stageCounts[l.updatedStage] || 0) + 1;
    }
  });

  Array.from(stageFilter.options).forEach(option => {
    if (!option.value) {
      option.text = `All Stages (${state.allData.length})`;
    } else {
      option.text = `${option.value} (${stageCounts[option.value] || 0})`;
    }
  });
}

/********************** FILTER **********************/
function applyFilters() {
  state.visibleCount = PAGE_SIZE;

  const dateType = dateFilter.value;
  const stageType = stageFilter.value;
  const searchText = searchInput.value.toLowerCase();

  const today = getToday();
  const todayTime = today.getTime();

  state.filteredData = state.allData.filter(l => {
    if (dateType === DATE_FILTER_VALUES.TODAY) {
      if (!(l._nextPlanDate && l._nextPlanDate.getTime() === todayTime)) return false;
    }
    if (dateType === DATE_FILTER_VALUES.PENDING) {
      if (!(l._nextPlanDate &&
        l._nextPlanDate.getTime() < todayTime &&
        l.leadStatus !== LOST_STATUS &&
        l.leadStatus !== COMPLETED_STATUS)) return false;
    }
    if (stageType && l.updatedStage !== stageType) return false;
    if (searchText) {
      const nameMatch = l.name && l.name.toLowerCase().includes(searchText);
      const mobileMatch = String(l.mobile || "").includes(searchText);
      if (!nameMatch && !mobileMatch) return false;
    }
    return true;
  });

  render();
}

/********************** EVENTS **********************/
dateFilter.addEventListener("change", applyFilters);
stageFilter.addEventListener("change", applyFilters);

let searchTimer;
searchInput.addEventListener("input", () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(applyFilters, SEARCH_DEBOUNCE_MS);
});

/********************** LOAD MORE **********************/
function loadMore() {
  state.visibleCount += PAGE_SIZE;
  render();
}

/********************** RENDER **********************/
function buildLeadCard(lead) {
  const div = document.createElement("div");
  div.className = "lead-card";
  div.addEventListener("click", () => openDetails(lead.id));

  const safeName = escapeHtml(lead.name || "-");
  const safeLocation = escapeHtml(lead.location || "-");
  const safeStage = escapeHtml(lead.updatedStage || "-");
  const safeLastCallDate = escapeHtml(formatDisplayDate(lead.lastCallDate));
  const safePhone = sanitizePhone(lead.mobile);
  const safeUpdateLink = safeUrl(lead.updateLink);

  // Build WhatsApp link only if phone is valid
  const waHref = safePhone
    ? `https://wa.me/${DEFAULT_COUNTRY_CODE}${safePhone}`
    : "#";
  const telHref = safePhone ? `tel:${safePhone}` : "#";

  div.innerHTML = `
    <div class="card-top">
      <div class="left">
        <div class="name">${safeName}</div>
        <div class="mobile">
          <a href="${waHref}" target="_blank" rel="noopener noreferrer" onclick="event.stopPropagation()">
            <img src="whatsapp-icon.png" class="whatsapp-icon" alt="WhatsApp">
          </a>
          <a href="${telHref}" class="call-icon" onclick="event.stopPropagation()">📞</a>
        </div>
      </div>
      <a href="${safeUpdateLink}" target="_blank" rel="noopener noreferrer" class="update-btn" onclick="event.stopPropagation()">
        Update Form
      </a>
    </div>

    <div class="divider"></div>

    <div class="card-bottom">
      <div class="location">📍${safeLocation}</div>
      <div class="stage-wrap">
        <div class="stage-badge">${safeStage}</div>
        <div class="last-call-date">${safeLastCallDate}</div>
      </div>
    </div>
  `;

  return div;
}

function render() {
  list.innerHTML = "";

  // App Head: show a prompt if no user selected yet
  if (IS_APP_HEAD && !state.selectedUser) {
    list.innerHTML = `
      <div class="ah-prompt">
        <div class="ah-prompt-icon">👆</div>
        <div class="ah-prompt-text">Select a team member above to view their data</div>
      </div>`;
    renderLoadMore(); // ensure button is hidden
    return;
  }

  if (!state.filteredData.length) {
    list.innerHTML = "<p>No records found</p>";
    renderLoadMore(); // ensure button is hidden
    return;
  }

  const slice = state.filteredData.slice(0, state.visibleCount);
  const frag = document.createDocumentFragment();

  slice.forEach(lead => frag.appendChild(buildLeadCard(lead)));

  list.appendChild(frag);
  renderLoadMore();
}

function renderLoadMore() {
  let btn = document.getElementById("loadMoreBtn");
  if (!btn) {
    btn = document.createElement("button");
    btn.id = "loadMoreBtn";
    btn.innerText = "Load More";
    btn.addEventListener("click", loadMore);
    list.after(btn);
  }
  // Always hide if no filtered data or everything already shown
  const hasMore = state.filteredData.length > 0 && state.visibleCount < state.filteredData.length;
  btn.style.display = hasMore ? "block" : "none";
}

function openDetails(id) {
  if (id === null || id === undefined) return;
  window.location.href = `details.html?id=${encodeURIComponent(id)}`;
}

/********************** INIT **********************/
function init() {
  if (IS_APP_HEAD) {
    if (userTabsStrip) userTabsStrip.style.display = "flex";

    const listWrapper = document.getElementById("listWrapper");
    if (listWrapper) listWrapper.classList.add("tabs-visible");

    buildUserTabs();
    render(); // show empty prompt immediately
  } else {
    fetchData(loggedInEmail);
  }
}

init();
