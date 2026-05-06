navigator.serviceWorker?.addEventListener("message", e => {
  if (e.data?.type === "SW_UPDATED") location.reload();
});


document.addEventListener("DOMContentLoaded", async () => {

  const email = sessionStorage.getItem("userEmail");

  if (!email) {
    alert("Session expired. Please login again.");
    window.location.href = "login.html";
    return;
  }

  /* ===============================
     🔹 Navigation for data buttons
  =============================== */
  window.openPage = function(type) {
    window.location.href =
      "list.html?email=" + encodeURIComponent(email) +
      "&type=" + encodeURIComponent(type);
  };

  /* ===============================
     🔹 MY TASKS Button
  =============================== */
  const myTasksBtn = document.getElementById("myTasksBtn");  
  if (myTasksBtn) {
    myTasksBtn.addEventListener("click", () => {
      window.location.href = "today.html";
    });
  }

  /* ===============================
     🔹 Date helpers
  =============================== */
  const now = new Date();
  const todayString = now.toDateString();

  function getStartOfWeek(date) {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    return new Date(d.setDate(diff));
  }

  const startOfWeek = getStartOfWeek(now);
  startOfWeek.setHours(0,0,0,0);

  /* ===============================
     🔹 Converted Summary
  =============================== */
  try {

    const res = await fetch(
      "https://script.google.com/macros/s/AKfycbzo-HWLjn6dYMQnAYSvsU_gQW-bZT-Hoki_ZstHpWRET4fLhZz6PusQOWyWO40cWzGcYg/exec?email=" +
      encodeURIComponent(email) +
      "&type=converted"
    );

    const data = await res.json();

    if (data && data.clients) {

      let todayCount = 0;
      let weekCount = 0;

      data.clients.forEach(client => {

        if (!client.timestamp) return;

        const clientDate = new Date(client.timestamp);

        if (clientDate.toDateString() === todayString) {
          todayCount++;
        }

        if (clientDate >= startOfWeek) {
          weekCount++;
        }

      });

      const todayEl = document.getElementById("convertedToday");
      const weekEl = document.getElementById("convertedWeek");

      if (todayEl) todayEl.innerText = todayCount;
      if (weekEl) weekEl.innerText = weekCount;

      updateScore();
    }

  } catch (err) {
    console.error("Error loading converted summary:", err);
  }

  /* ===============================
     🔹 Score calculation: (meeting + intro) * 2 + (converted * 20)
  =============================== */
  function updateScore() {
    const meeting = parseInt(document.getElementById("meetingWeek")?.innerText || "0", 10);
    const intro = parseInt(document.getElementById("introWeek")?.innerText || "0", 10);
    const converted = parseInt(document.getElementById("convertedWeek")?.innerText || "0", 10);
    const score = (meeting + intro) * 2 + converted * 20;
    const el = document.getElementById("yourScore");
    if (el) el.innerText = score;
  }

  /* ===============================
     🔹 Meeting + Intro Summary
  =============================== */
  try {

    const res = await fetch(
      "https://script.google.com/macros/s/AKfycbzmQFF8Wmfsi8kxp_HMZ2Oe0FcFbGfZysZ4oWBvXh8cuZDVqTGmkif971i6-kqL8gpx_w/exec?email=" +
      encodeURIComponent(email) +
      "&type=meeting"
    );

    const data = await res.json();

    if (!data || !data.clients) return;

    let introToday = 0;
    let introWeek = 0;

    let meetingToday = 0;
    let meetingWeek = 0;

    data.clients.forEach(client => {

      if (!client.timestamp || !client.stage) return;

      const d = new Date(client.timestamp);

      const isToday = d.toDateString() === todayString;
      const isWeek = d >= startOfWeek;

      const stage = client.stage.toLowerCase();

      if (stage === "intro meeting") {

        if (isToday) introToday++;
        if (isWeek) introWeek++;

      } else {

        if (isToday) meetingToday++;
        if (isWeek) meetingWeek++;

      }

    });

    const introTodayEl = document.getElementById("introToday");
    const introWeekEl = document.getElementById("introWeek");

    const meetingTodayEl = document.getElementById("meetingToday");
    const meetingWeekEl = document.getElementById("meetingWeek");

    if (introTodayEl) introTodayEl.innerText = introToday;
    if (introWeekEl) introWeekEl.innerText = introWeek;

    if (meetingTodayEl) meetingTodayEl.innerText = meetingToday;
    if (meetingWeekEl) meetingWeekEl.innerText = meetingWeek;

    updateScore();

  } catch (err) {
    console.error("Error loading meeting/intro summary:", err);
  }

});