// 🔄 Auto reload when service worker updates
navigator.serviceWorker?.addEventListener("message", e => {
  if (e.data?.type === "SW_UPDATED") location.reload();
});

// 🔑 SUPABASE CONFIG (fill your values)
const SUPABASE_URL = "https://qwzyxsbjfedkvuvdmzhk.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF3enl4c2JqZmVka3Z1dmRtemhrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ2NzYxNjYsImV4cCI6MjA5MDI1MjE2Nn0.SSH4G7szFkhNkXZmHZsYQeyjvnoHh2bza8IK5lweEm4";
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

/********************** LOGIN LOG FUNCTION **********************/
async function logLogin(email) {
  try {
    const { error } = await supabaseClient
      .from("login_logs")
      .insert([
        {
          email: email,
          login_time: new Date().toISOString(),
          device: navigator.userAgent
        }
      ]);

    if (error) {
      console.error("Log insert error:", error);
    }
  } catch (err) {
    console.error("Login log error:", err);
  }
}

/********************** USER DATA **********************/
const USER_NAMES = {
  "rakesh15dec14@gmail.com": "Rakesh",
  "umakantsharma727575@gmail.com": "Umakant",
  "ydvabhijeet1122@gmail.com": "Abhijeet",
  "vikramaggrawal67@gmail.com": "Vikram",
  "ashok969050@gmail.com": "Atul",
  "yogeshyogikushwah@gmail.com": "Yogendra",
  "tejprakash075@gmail.com": "Tejprakash",
  "mukulpal92@gmail.com": "Mukul",
  "amittiwaribdcet12345@gmail.com": "Ameet",
  "saketbundela6@gmail.com": "Saket",
  "rajg8606@gmail.com": "Rajat",
  "harshpilania4211@gmail.com": "Harsh",
  "aryan10kumar11@gmail.com": "Aryan",
  "amitsingh2001rkt@gmail.com":"Amit",
  "raghavraj2510@gmail.com":"Raghav",
  "mohanmathur259@gmail.com":"Sunny",
  "garvkumarbsr@gmail.com":"Garv"
};

// 📱 Mobile → Email mapping
const MOBILE_TO_EMAIL = {
  "9289583355": "rakesh15dec14@gmail.com",
  "9211500564": "umakantsharma727575@gmail.com",
  "9667182175": "ydvabhijeet1122@gmail.com",
  "8130200389": "vikramaggrawal67@gmail.com",
  "8755555208": "ashok969050@gmail.com",
  "9319696406": "yogeshyogikushwah@gmail.com",
  "9548384543": "tejprakash075@gmail.com",
  "8476921287": "mukulpal92@gmail.com",
  "7381743275": "amittiwaribdcet12345@gmail.com",
  "6204021934": "saketbundela6@gmail.com",
  "9958335425": "rajg8606@gmail.com",
  "8076786226": "harshpilania4211@gmail.com",
  "9304264007": "aryan10kumar11@gmail.com",
  "9696926247": "amitsingh2001rkt@gmail.com",
  "7351045582": "raghavraj2510@gmail.com",
  "9990895928": "mohanmathur259@gmail.com",
  "8279340681": "garvkumarbsr@gmail.com"
};

// 👁 Toggle password
window.togglePassword = function () {
  const passwordInput = document.getElementById("password");
  const toggleText = document.querySelector(".show");

  if (passwordInput.type === "password") {
    passwordInput.type = "text";
    if (toggleText) toggleText.innerText = "Hide";
  } else {
    passwordInput.type = "password";
    if (toggleText) toggleText.innerText = "Show";
  }
}

// 🔐 LOGIN FUNCTION
window.login = async function () {
  const mobile = document.getElementById("mobile").value.trim();
  const password = document.getElementById("password").value.trim();

  if (!mobile || !password) {
    alert("Please enter mobile and password");
    return;
  }

  const email = MOBILE_TO_EMAIL[mobile];

  if (!email) {
    alert("User not found");
    return;
  }

  try {
    const { data, error } = await supabaseClient.auth.signInWithPassword({
      email,
      password
    });

    if (error) {
      alert("Invalid login details");
      return;
    }

    // ✅ Save session
    sessionStorage.setItem("userEmail", email);
    sessionStorage.setItem("userNames", JSON.stringify(USER_NAMES));

    const isAppHead = email === "aryan10kumar11@gmail.com";
    sessionStorage.setItem("isAppHead", isAppHead ? "true" : "false");

    // 🔥 LOG LOGIN (NEW)
    await logLogin(email);

    // 🚀 Redirect
    window.location.href = "dashboard.html";

  } catch (err) {
    console.error(err);
    alert("Something went wrong");
  }
};
