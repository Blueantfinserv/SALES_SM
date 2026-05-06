/********************** SERVICE WORKER UPDATE LISTENER **********************/
// Note: Duplicated in login.js and today.js. Consider extracting to a shared module.
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.addEventListener("message", (e) => {
    if (e.data?.type === "SW_UPDATED") location.reload();
  });
}

/********************** SUPABASE CONFIG **********************/
// NOTE: The anon key is public by design, but Row Level Security (RLS) MUST be
// enabled on the `filtered_leads` table in Supabase to prevent unauthorized access.
// TODO: Extract these constants + Supabase client init to a shared config module
//       (shared across login.js, today.js, details.js).
const SUPABASE_URL = "https://qwzyxsbjfedkvuvdmzhk.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF3enl4c2JqZmVka3Z1dmRtemhrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ2NzYxNjYsImV4cCI6MjA5MDI1MjE2Nn0.SSH4G7szFkhNkXZmHZsYQeyjvnoHh2bza8IK5lweEm4";

// Guard: ensure the Supabase CDN script actually loaded before we use it
if (!window.supabase || typeof window.supabase.createClient !== "function") {
  alert("Failed to load required resources. Please refresh the page.");
  throw new Error("Supabase client library (window.supabase) is not available.");
}

const supabaseClient = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_ANON_KEY
);

/********************** COLUMN MAPPING **********************/
// Centralized mapping of opaque Supabase column names to semantic field names.
// Should match the COLUMNS map in today.js — ideally extract to a shared module.
const COLUMNS = {
  id: "col1",
  timestamp: "col2",
  name: "col3",
  mobile: "col4",
  location: "col5",
  company: "col6",
  email: "col8",          // owner email
  nextPlanDate: "col18",
  remarks: "col19",
  updateLink: "col21",
  updatedStage: "col22",
  leadStatus: "col24"
};

/********************** CONSTANTS **********************/
const DEFAULT_COUNTRY_CODE = "91"; // India

/********************** SAFE SESSION STORAGE **********************/
function getSessionItem(key, fallback = null) {
  try {
    return sessionStorage.getItem(key);
  } catch (err) {
    console.warn(`sessionStorage unavailable for key "${key}":`, err);
    return fallback;
  }
}

/********************** DATE HELPERS **********************/
// Declared before any call site so behavior is independent of hoisting rules.
function parseDate(dateStr) {
  if (!dateStr) return null;

  // Handle dd/mm/yyyy format
  if (typeof dateStr === "string" && dateStr.includes("/")) {
    const parts = dateStr.split("/");
    if (parts.length === 3) {
      const d = new Date(parts[2], parts[1] - 1, parts[0]);
      if (!isNaN(d)) return d;
    }
  }

  const d = new Date(dateStr);
  return isNaN(d) ? null : d;
}

function formatDate(dateStr) {
  const d = parseDate(dateStr);
  if (!d) return "-";
  return d.toLocaleDateString("en-GB");
}

/********************** URL / PHONE SANITIZERS **********************/
function sanitizePhone(mobile) {
  if (!mobile) return "";
  return String(mobile).replace(/\D/g, "");
}

// Only permit safe URL schemes for hrefs (blocks javascript:, data:, etc.)
function safeUrl(url) {
  if (!url) return "#";
  const trimmed = String(url).trim();
  if (/^(https?:|mailto:|tel:|\/|\.\/|\.\.\/)/i.test(trimmed)) {
    return trimmed;
  }
  return "#";
}

/********************** GET ID FROM URL **********************/
const params = new URLSearchParams(window.location.search);
const leadId = params.get("id");

/********************** LOGIN CHECK **********************/
const loggedInEmail = getSessionItem("userEmail");

/********************** ENTRY POINT **********************/
if (!leadId) {
  alert("Invalid lead");
} else if (!loggedInEmail) {
  alert("Session expired. Please login again.");
  window.location.href = "index.html";
} else {
  fetchLead();
}

/********************** FETCH SINGLE LEAD **********************/
async function fetchLead() {
  try {
    // Query only the row we need instead of downloading the entire table.
    // This both reduces data over the wire and enforces per-lead scoping.
    const { data, error } = await supabaseClient
      .from("filtered_leads")
      .select("*")
      .eq(COLUMNS.id, leadId)
      .limit(1);

    if (error) {
      console.error("fetchLead error:", error);
      alert("Failed to load lead details");
      return;
    }

    const lead = Array.isArray(data) && data.length ? data[0] : null;

    if (!lead) {
      alert("Lead not found");
      return;
    }

    bindData({
      id: lead[COLUMNS.id],
      name: lead[COLUMNS.name],
      mobile: lead[COLUMNS.mobile],
      location: lead[COLUMNS.location],
      updatedStage: lead[COLUMNS.updatedStage],
      leadStatus: lead[COLUMNS.leadStatus],
      updateLink: lead[COLUMNS.updateLink],

      nextPlanDate: formatDate(lead[COLUMNS.nextPlanDate]),
      timestamp: formatDate(lead[COLUMNS.timestamp]),

      company: lead[COLUMNS.company],
      remarks: lead[COLUMNS.remarks]
    });
  } catch (err) {
    console.error("fetchLead failed:", err);
    alert("Something went wrong");
  }
}

/********************** BIND DATA **********************/
// Small helper to set text content safely on an element by ID
function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.innerText = value;
}

function setHref(id, url) {
  const el = document.getElementById(id);
  if (el) el.href = url;
}

function bindData(l) {
  setText("leadName", l.name || "-");
  setText("timestamp", l.timestamp || "-");
  setText("company", l.company || "-");
  setText("Location", l.location || "-");
  setText("nextPlan", l.nextPlanDate || "-");
  setText("stage", l.updatedStage || "-");
  setText("remarks", l.remarks || "No remarks added");

  const phone = sanitizePhone(l.mobile);
  const callHref = phone ? `tel:${phone}` : "#";
  const waHref = phone ? `https://wa.me/${DEFAULT_COUNTRY_CODE}${phone}` : "#";

  setHref("callBtn", callHref);
  setHref("waBtn", waHref);
  setHref("updateBtn", safeUrl(l.updateLink));
}

/********************** BACK BUTTON **********************/
function goBack() {
  history.back();
}