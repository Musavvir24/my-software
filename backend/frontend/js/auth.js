document.addEventListener("DOMContentLoaded", () => {
  const loginForm = document.getElementById("loginForm");
  const signupForm = document.getElementById("signupForm");
  const authWrapper = document.getElementById("authWrapper");

  const switchToSignup = document.getElementById("switchToSignup");
  const switchToLogin = document.getElementById("switchToLogin");

const BACKEND_URL = window.location.origin;

  // ===== Switcher =====
  if (switchToSignup) {
    switchToSignup.addEventListener("click", e => {
      e.preventDefault();
      authWrapper.classList.add("active"); // slide to signup
    });
  }

  if (switchToLogin) {
    switchToLogin.addEventListener("click", e => {
      e.preventDefault();
      authWrapper.classList.remove("active"); // slide back to login
    });
  }

  // ===== Login =====
  if (loginForm) {
    loginForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const email = document.getElementById("loginEmail").value.trim();
      const password = document.getElementById("loginPassword").value.trim();

      if (!email || !password) return alert("Please enter email and password");

      try {
        const res = await fetch(`${BACKEND_URL}/api/login`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password })
        });
        const data = await res.json();
        if (res.ok) {
          localStorage.setItem("userEmail", data.user.email);
          localStorage.setItem("userName", data.user.name);
          localStorage.setItem("isLoggedIn", "true");
          window.location.href = "dashboard.html";
        } else {
          alert(data.error || "Login failed");
        }
      } catch (err) {
        console.error(err);
        alert("Network error during login");
      }
    });
  }

  // ===== Signup =====
  if (signupForm) {
    signupForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const name = document.getElementById("signupName").value.trim();
      const email = document.getElementById("signupEmail").value.trim();
      const password = document.getElementById("signupPassword").value.trim();

      if (!name || !email || !password) return alert("Please fill in all fields");

      try {
        const res = await fetch(`${BACKEND_URL}/api/signup`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, email, password })
        });
        const data = await res.json();
        if (res.ok) {
          alert("Signed up successfully! Please log in.");
          // Slide back to login automatically
          authWrapper.classList.remove("active");
        } else {
          alert(data.error || "Signup failed");
        }
      } catch (err) {
        console.error(err);
        alert("Network error during signup");
      }
    });
  }
});
