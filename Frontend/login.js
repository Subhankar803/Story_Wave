// Login page authentication script for Story Wave

const API_BASE = (window.location.protocol.startsWith('http') && !window.location.origin.includes('file:'))
  ? window.location.origin
  : 'http://localhost:8000';

// Load theme state from localStorage
let currentTheme = localStorage.getItem('storyWaveTheme_v1') || localStorage.getItem('storyBibleTheme_v1') || 'dark';

// Default demo account
const DEMO_ACCOUNT = {
  name: 'Aarav Sharma',
  email: 'writer@storywave.ai',
  password: 'password123'
};

// Pending user waiting for 2-step verification (OTP)
let pendingAuthenticatedUser = null;

// Initialize on DOMContentLoaded
document.addEventListener('DOMContentLoaded', () => {
  seedDefaultUserIfNeeded();
  initTheme();
  initThemeToggle();
  initPasswordVisibilityToggle();
  initRememberedEmail();
  initDemoCredentialsButton();
  initLoginForm();
  initOtpForm();
  initCopyrightYear();
});

// Seed demo author user if not present
function seedDefaultUserIfNeeded() {
  try {
    let users = [];
    const stored = localStorage.getItem('storyWaveUsers_v1') || localStorage.getItem('storyBibleUsers_v1');
    if (stored) users = JSON.parse(stored);
    if (!users || !Array.isArray(users) || users.length === 0) {
      users = [DEMO_ACCOUNT];
      localStorage.setItem('storyWaveUsers_v1', JSON.stringify(users)); localStorage.setItem('storyBibleUsers_v1', JSON.stringify(users));
    }
  } catch (err) {
    // Continue cleanly
  }
}

// Apply initial theme
function initTheme() {
  applyTheme(currentTheme);
}

// Apply dark or light theme
function applyTheme(theme) {
  currentTheme = theme;
  const htmlEl = document.documentElement;
  const sunIcon = document.getElementById('themeSunIcon');
  const moonIcon = document.getElementById('themeMoonIcon');

  if (theme === 'dark') {
    htmlEl.classList.add('dark');
    if (sunIcon) sunIcon.style.display = 'block';
    if (moonIcon) moonIcon.style.display = 'none';
  } else {
    htmlEl.classList.remove('dark');
    if (sunIcon) sunIcon.style.display = 'none';
    if (moonIcon) moonIcon.style.display = 'block';
  }

  localStorage.setItem('storyWaveTheme_v1', theme); localStorage.setItem('storyBibleTheme_v1', theme);
}

// Bind theme toggle button
function initThemeToggle() {
  const toggleBtn = document.getElementById('themeToggleBtn');
  if (!toggleBtn) return;

  toggleBtn.addEventListener('click', () => {
    const nextTheme = currentTheme === 'dark' ? 'light' : 'dark';
    applyTheme(nextTheme);
  });
}

// Show/Hide password toggle logic
function initPasswordVisibilityToggle() {
  const toggleBtn = document.getElementById('togglePasswordBtn');
  const passwordInput = document.getElementById('passwordInput');
  const eyeIcon = document.getElementById('eyeIcon');
  const eyeOffIcon = document.getElementById('eyeOffIcon');

  if (!toggleBtn || !passwordInput) return;

  toggleBtn.addEventListener('click', () => {
    const isPassword = passwordInput.type === 'password';
    passwordInput.type = isPassword ? 'text' : 'password';

    if (isPassword) {
      eyeIcon.style.display = 'none';
      eyeOffIcon.style.display = 'block';
    } else {
      eyeIcon.style.display = 'block';
      eyeOffIcon.style.display = 'none';
    }
  });
}

// Load remembered email if present
function initRememberedEmail() {
  const rememberedEmail = localStorage.getItem('storyWaveRememberEmail_v1') || localStorage.getItem('storyBibleRememberEmail_v1');
  if (rememberedEmail) {
    const emailInput = document.getElementById('emailInput');
    const rememberMeInput = document.getElementById('rememberMeInput');
    if (emailInput) emailInput.value = rememberedEmail;
    if (rememberMeInput) rememberMeInput.checked = true;
  }
}

// Bind "Use Demo Login" helper button
function initDemoCredentialsButton() {
  const demoBtn = document.getElementById('fillDemoCredentialsBtn');
  if (!demoBtn) return;

  demoBtn.addEventListener('click', () => {
    const emailInput = document.getElementById('emailInput');
    const passwordInput = document.getElementById('passwordInput');
    if (emailInput && passwordInput) {
      emailInput.value = DEMO_ACCOUNT.email;
      passwordInput.value = DEMO_ACCOUNT.password;
      showAlert('Demo credentials filled! Click "Sign In to Dashboard" to enter.', true);
    }
  });
}

// Display error or success alert box
function showAlert(message, isSuccess = false) {
  const alertBox = document.getElementById('loginAlertBox');
  if (!alertBox) return;

  alertBox.textContent = message;
  alertBox.className = isSuccess ? 'alert-box alert-success' : 'alert-box alert-danger';
  alertBox.style.display = 'block';
}

// Hide alert box
function hideAlert() {
  const alertBox = document.getElementById('loginAlertBox');
  if (alertBox) alertBox.style.display = 'none';
}

// Handle login form submission and transition to 2-step verification
function initLoginForm() {
  const form = document.getElementById('loginForm');
  if (!form) return;

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    hideAlert();

    const email = document.getElementById('emailInput').value.trim().toLowerCase();
    const password = document.getElementById('passwordInput').value;
    const rememberMe = document.getElementById('rememberMeInput').checked;

    // 1. Basic input validation
    if (!email || !password) {
      showAlert('Please enter both your email address and password.');
      return;
    }

    // 2. Email format validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      showAlert('Please enter a valid email address (e.g. writer@storywave.ai).');
      return;
    }

    // 3. Load registered users
    let registeredUsers = [];
    try {
      const stored = localStorage.getItem('storyWaveUsers_v1') || localStorage.getItem('storyBibleUsers_v1');
      if (stored) registeredUsers = JSON.parse(stored);
    } catch (err) {
      registeredUsers = [];
    }

    // Verify against registered accounts or fallback to default demo
    let authenticatedUser = null;
    const matched = registeredUsers.find((u) => u.email.toLowerCase() === email && u.password === password);
    if (matched) {
      authenticatedUser = { name: matched.name, email: matched.email };
    } else if (email === DEMO_ACCOUNT.email && password === DEMO_ACCOUNT.password) {
      authenticatedUser = { name: DEMO_ACCOUNT.name, email: DEMO_ACCOUNT.email };
    }

    if (!authenticatedUser) {
      showAlert('Invalid email or password. Please verify credentials or click "Use Demo Login" to try the workspace.');
      return;
    }

    // 4. Handle remember me option
    if (rememberMe) {
      localStorage.setItem('storyWaveRememberEmail_v1', email);
      localStorage.setItem('storyBibleRememberEmail_v1', email);
    } else {
      localStorage.removeItem('storyWaveRememberEmail_v1');
      localStorage.removeItem('storyBibleRememberEmail_v1');
    }

    // 5. Store pending user and transition to Step 2: Two-Step Verification (OTP: 123456)
    pendingAuthenticatedUser = {
      name: authenticatedUser.name,
      email: authenticatedUser.email,
      password: password
    };

    form.style.display = 'none';
    const otpForm = document.getElementById('otpForm');
    if (otpForm) {
      otpForm.classList.remove('hidden');
      otpForm.style.display = 'block';
    }

    const authHeading = document.getElementById('authHeading');
    if (authHeading) authHeading.textContent = 'Two-Step Verification';

    const authSubheading = document.getElementById('authSubheading');
    if (authSubheading) authSubheading.textContent = `Security code sent for ${authenticatedUser.email}. Enter demo OTP 123456 to proceed.`;

    const otpInput = document.getElementById('otpInput');
    if (otpInput) {
      otpInput.value = '';
      otpInput.focus();
    }

    showAlert('Security check: Enter the 6-digit verification code (123456)', true);
  });
}

// Handle two-step verification (OTP code check)
function initOtpForm() {
  const otpForm = document.getElementById('otpForm');
  const otpInput = document.getElementById('otpInput');
  const otpSubmitBtn = document.getElementById('otpSubmitBtn');
  const backBtn = document.getElementById('backToLoginBtn');
  const loginForm = document.getElementById('loginForm');
  const authHeading = document.getElementById('authHeading');
  const authSubheading = document.getElementById('authSubheading');

  if (!otpForm) return;

  // Verify OTP submission and authenticate with backend SQLite DB
  otpForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideAlert();

    if (!pendingAuthenticatedUser) {
      showAlert('Session expired. Please sign in again.');
      resetToLoginForm();
      return;
    }

    const enteredOtp = otpInput ? otpInput.value.trim() : '';

    // Two-step verification check: hardcoded to 123456 as requested
    if (enteredOtp !== '123456') {
      showAlert('Invalid verification code. Please enter 123456.');
      if (otpInput) {
        otpInput.focus();
        otpInput.select();
      }
      return;
    }

    if (otpSubmitBtn) {
      otpSubmitBtn.disabled = true;
      otpSubmitBtn.textContent = 'Connecting to Database...';
    }

    // Call Backend API /auth/login with credentials & OTP to get JWT token for SQLite DB operations
    try {
      const email = pendingAuthenticatedUser.email;
      const password = pendingAuthenticatedUser.password || 'password123';
      let res = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email, password: password, otp: '123456' })
      });

      if (!res.ok) {
        // If user is not yet in SQLite DB, register now and login
        await fetch(`${API_BASE}/auth/register`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: email, password: password })
        }).catch(() => {});

        res = await fetch(`${API_BASE}/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: email, password: password, otp: '123456' })
        });
      }

      if (res.ok) {
        const tokenData = await res.json();
        if (tokenData.access_token) {
          localStorage.setItem('storyWaveToken', tokenData.access_token);
        }
      }
    } catch (err) {
      console.warn('Backend API login warning (continuing with session):', err);
    }

    // Store active user session in localStorage
    const sessionData = JSON.stringify({
      name: pendingAuthenticatedUser.name,
      email: pendingAuthenticatedUser.email,
      loginTimestamp: Date.now(),
      twoFactorVerified: true
    });
    localStorage.setItem('storyWaveCurrentUser_v1', sessionData);
    localStorage.setItem('storyBibleCurrentUser_v1', sessionData);
    localStorage.removeItem('storyWaveGuestUsageCount_v1');

    showAlert(`Two-step verification verified! Welcome back, ${pendingAuthenticatedUser.name}!`, true);
    if (otpSubmitBtn) {
      otpSubmitBtn.textContent = 'Opening Studio...';
    }

    setTimeout(() => {
      window.location.href = 'index.html';
    }, 500);
  });

  // Back to Sign In button
  if (backBtn) {
    backBtn.addEventListener('click', () => {
      resetToLoginForm();
    });
  }

  // Click-to-fill demo OTP code helper
  const fillDemoOtpBtn = document.getElementById('fillDemoOtpBtn');
  if (fillDemoOtpBtn && otpInput) {
    fillDemoOtpBtn.addEventListener('click', () => {
      otpInput.value = '123456';
      otpInput.focus();
    });
  }

  function resetToLoginForm() {
    if (otpForm) {
      otpForm.classList.add('hidden');
      otpForm.style.display = 'none';
    }
    if (loginForm) loginForm.style.display = 'block';
    if (authHeading) authHeading.textContent = 'Welcome Back';
    if (authSubheading) authSubheading.textContent = 'Enter your email and password to access your story workspace.';
    hideAlert();
  }
}

// Dynamic copyright year
function initCopyrightYear() {
  const el = document.getElementById('copyrightYear');
  if (el) el.textContent = new Date().getFullYear();
}
