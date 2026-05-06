/* =====================================================
   CONFIG — paste your Apps Script Web App URL here
   ===================================================== */
const APPS_SCRIPT_URL = "PASTE_YOUR_APPS_SCRIPT_WEB_APP_URL_HERE";

/* =====================================================
   STATE
   ===================================================== */
const photos = { 1: null, 2: null, 3: null }; // compressed image data URLs
let map = null;
let marker = null;
let currentLatLng = null;

/* =====================================================
   INIT
   ===================================================== */
document.addEventListener("DOMContentLoaded", () => {
  setTodayDate();
  initMap();
  initPhotoSlots();
  initFormSubmit();
});

/* ===================== HELPERS ===================== */
function setTodayDate() {
  const d = new Date();
  const opts = { weekday: "short", year: "numeric", month: "short", day: "2-digit" };
  document.getElementById("todayDate").textContent = d.toLocaleDateString("en-IN", opts);
}

function showToast(msg, type = "") {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.className = "toast show " + type;
  setTimeout(() => { t.className = "toast"; }, 3200);
}

function showLoader(text = "Submitting…") {
  document.getElementById("loaderText").textContent = text;
  document.getElementById("loader").classList.add("active");
}

function hideLoader() {
  document.getElementById("loader").classList.remove("active");
}

/* =====================================================
   MAP — Leaflet + OpenStreetMap (free, no API key)
   ===================================================== */
function initMap() {
  // Default to a neutral starting point until we get GPS
  const defaultCenter = [20.5937, 78.9629]; // center of India
  map = L.map("map", { zoomControl: true }).setView(defaultCenter, 5);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "© OpenStreetMap"
  }).addTo(map);

  // Try to get user's GPS
  requestLocation();

  // Recenter button
  document.getElementById("recenterBtn").addEventListener("click", requestLocation);

  // Allow tapping the map to move pin manually
  map.on("click", (e) => updateMarker(e.latlng.lat, e.latlng.lng));
}

function requestLocation() {
  if (!navigator.geolocation) {
    showToast("Geolocation not supported on this device", "error");
    return;
  }

  showLoader("Getting your location…");
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      hideLoader();
      const { latitude, longitude, accuracy } = pos.coords;
      document.getElementById("accuracyInput").value = Math.round(accuracy);
      updateMarker(latitude, longitude);
      map.setView([latitude, longitude], 17);
    },
    (err) => {
      hideLoader();
      let msg = "Couldn't get location";
      if (err.code === 1) msg = "Location permission denied";
      else if (err.code === 2) msg = "Location unavailable";
      else if (err.code === 3) msg = "Location request timed out";
      showToast(msg, "error");
    },
    { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
  );
}

function updateMarker(lat, lng) {
  currentLatLng = { lat, lng };

  if (!marker) {
    marker = L.marker([lat, lng], { draggable: true }).addTo(map);
    marker.on("dragend", (e) => {
      const ll = e.target.getLatLng();
      currentLatLng = { lat: ll.lat, lng: ll.lng };
      writeCoords();
    });
  } else {
    marker.setLatLng([lat, lng]);
  }

  writeCoords();
}

function writeCoords() {
  if (!currentLatLng) return;
  const { lat, lng } = currentLatLng;
  document.getElementById("latVal").textContent = lat.toFixed(6);
  document.getElementById("lngVal").textContent = lng.toFixed(6);
  document.getElementById("latInput").value = lat;
  document.getElementById("lngInput").value = lng;
}

/* =====================================================
   PHOTOS — camera capture + client-side compression
   ===================================================== */
function initPhotoSlots() {
  document.querySelectorAll('input[type="file"][data-photo]').forEach((input) => {
    input.addEventListener("change", async (e) => {
      const file = e.target.files[0];
      if (!file) return;

      const slotNum = input.dataset.photo;
      try {
        showLoader("Processing photo…");
        const compressed = await compressImage(file, 1280, 0.75);
        photos[slotNum] = compressed;
        renderPhotoSlot(slotNum, compressed);
        hideLoader();
      } catch (err) {
        hideLoader();
        showToast("Couldn't process image", "error");
        console.error(err);
      }

      // Reset input so selecting the same file again still triggers change
      input.value = "";
    });
  });
}

function renderPhotoSlot(slotNum, dataUrl) {
  const slot = document.querySelector(`.photo-slot[data-slot="${slotNum}"]`);
  slot.classList.add("filled");
  slot.innerHTML = `
    <input type="file" accept="image/*" capture="environment" data-photo="${slotNum}" hidden>
    <img src="${dataUrl}" alt="Photo ${slotNum}">
    <button type="button" class="photo-remove" aria-label="Remove">×</button>
  `;

  // Re-attach handlers
  slot.querySelector('input[type="file"]').addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      showLoader("Processing photo…");
      const compressed = await compressImage(file, 1280, 0.75);
      photos[slotNum] = compressed;
      renderPhotoSlot(slotNum, compressed);
      hideLoader();
    } catch (err) {
      hideLoader();
      showToast("Couldn't process image", "error");
    }
    e.target.value = "";
  });

  slot.querySelector(".photo-remove").addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    photos[slotNum] = null;
    resetPhotoSlot(slotNum);
  });
}

function resetPhotoSlot(slotNum) {
  const slot = document.querySelector(`.photo-slot[data-slot="${slotNum}"]`);
  slot.classList.remove("filled");
  slot.innerHTML = `
    <input type="file" accept="image/*" capture="environment" data-photo="${slotNum}" hidden>
    <div class="photo-placeholder">
      <span class="photo-icon">📷</span>
      <span class="photo-label">Photo ${slotNum}</span>
    </div>
  `;
  slot.querySelector('input[type="file"]').addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      showLoader("Processing photo…");
      const compressed = await compressImage(file, 1280, 0.75);
      photos[slotNum] = compressed;
      renderPhotoSlot(slotNum, compressed);
      hideLoader();
    } catch (err) {
      hideLoader();
      showToast("Couldn't process image", "error");
    }
    e.target.value = "";
  });
}

/**
 * Resize and compress an image client-side via canvas.
 * Returns a base64 JPEG data URL.
 */
function compressImage(file, maxDim = 1280, quality = 0.75) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > height && width > maxDim) {
          height = Math.round((height * maxDim) / width);
          width = maxDim;
        } else if (height > maxDim) {
          width = Math.round((width * maxDim) / height);
          height = maxDim;
        }

        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, width, height);

        const dataUrl = canvas.toDataURL("image/jpeg", quality);
        resolve(dataUrl);
      };
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/* =====================================================
   SUBMIT
   ===================================================== */
function initFormSubmit() {
  document.getElementById("visitForm").addEventListener("submit", async (e) => {
    e.preventDefault();

    // Validate location
    if (!currentLatLng) {
      showToast("Please set a location on the map", "error");
      return;
    }

    const submitBtn = document.getElementById("submitBtn");
    submitBtn.disabled = true;
    showLoader("Submitting…");

    try {
      // Collect form values
      const formEl = e.target;
      const fd = new FormData(formEl);
      const payload = {};
      fd.forEach((v, k) => { payload[k] = v; });

      // Attach photos (data URLs)
      payload.photo1 = photos[1] || "";
      payload.photo2 = photos[2] || "";
      payload.photo3 = photos[3] || "";

      // Use URLSearchParams to avoid CORS preflight (Apps Script handles it cleanly)
      const body = new URLSearchParams();
      Object.entries(payload).forEach(([k, v]) => body.append(k, v));

      const res = await fetch(APPS_SCRIPT_URL, {
        method: "POST",
        body
      });

      const data = await res.json();

      hideLoader();
      submitBtn.disabled = false;

      if (data.ok) {
        showToast("Visit submitted ✓", "success");
        // Reset form after a short delay
        setTimeout(() => {
          formEl.reset();
          photos[1] = photos[2] = photos[3] = null;
          resetPhotoSlot(1); resetPhotoSlot(2); resetPhotoSlot(3);
          requestLocation();
        }, 1200);
      } else {
        showToast("Submit failed: " + (data.error || "unknown error"), "error");
      }
    } catch (err) {
      hideLoader();
      submitBtn.disabled = false;
      showToast("Network error — please retry", "error");
      console.error(err);
    }
  });
}