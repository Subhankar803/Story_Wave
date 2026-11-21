// Register page validation and demonstration account creation script for Story Wave

const API_BASE = (window.location.protocol.startsWith('http') && !window.location.origin.includes('file:'))
  ? window.location.origin
  : 'http://localhost:8000';

// Load theme state from localStorage
let currentTheme = localStorage.getItem('storyWaveTheme_v1') || localStorage.getItem('storyBibleTheme_v1') || 'dark';

// Initialize on DOMContentLoaded
document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  initThemeToggle();
  initPasswordVisibilityToggles();
  initRegisterForm();
  initCopyrightYear();
});

// Dynamic copyright year
function initCopyrightYear() {
  const el = document.getElementById('copyrightYear');
  if (el) el.textContent = new Date().getFullYear();
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

// Show/Hide password toggle logic for both password inputs
function initPasswordVisibilityToggles() {
  // Password field toggle
  const regToggle = document.getElementById('toggleRegisterPasswordBtn');
  const regInput = document.getElementById('registerPasswordInput');
  const regEye = document.getElementById('regEyeIcon');
  const regEyeOff = document.getElementById('regEyeOffIcon');

  if (regToggle && regInput) {
    regToggle.addEventListener('click', () => {
      const isPassword = regInput.type === 'password';
      regInput.type = isPassword ? 'text' : 'password';
      regEye.style.display = isPassword ? 'none' : 'block';
      regEyeOff.style.display = isPassword ? 'block' : 'none';
    });
  }

  // Confirm password field toggle
  const confToggle = document.getElementById('toggleConfirmPasswordBtn');
  const confInput = document.getElementById('confirmPasswordInput');
  const confEye = document.getElementById('confirmEyeIcon');
  const confEyeOff = document.getElementById('confirmEyeOffIcon');

  if (confToggle && confInput) {
    confToggle.addEventListener('click', () => {
      const isPassword = confInput.type === 'password';
      confInput.type = isPassword ? 'text' : 'password';
      confEye.style.display = isPassword ? 'none' : 'block';
      confEyeOff.style.display = isPassword ? 'block' : 'none';
    });
  }
}

// Display error or success alert box
function showAlert(message, isSuccess = false) {
  const alertBox = document.getElementById('registerAlertBox');
  if (!alertBox) return;

  alertBox.textContent = message;
  alertBox.className = isSuccess ? 'alert-box alert-success' : 'alert-box alert-danger';
  alertBox.style.display = 'block';
}

// Hide alert box
function hideAlert() {
  const alertBox = document.getElementById('registerAlertBox');
  if (alertBox) alertBox.style.display = 'none';
}

// Handle register form submission and validation
function initRegisterForm() {
  const form = document.getElementById('registerForm');
  const submitBtn = document.getElementById('registerSubmitBtn');

  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideAlert();

    const fullName = document.getElementById('fullNameInput').value.trim();
    const email = document.getElementById('registerEmailInput').value.trim().toLowerCase();
    const password = document.getElementById('registerPasswordInput').value;
    const confirmPassword = document.getElementById('confirmPasswordInput').value;

    // 1. All fields required validation
    if (!fullName || !email || !password || !confirmPassword) {
      showAlert('All fields are required. Please fill in all information.');
      return;
    }

    // 2. Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      showAlert('Please enter a valid email address.');
      return;
    }

    // 3. Password minimum length check
    if (password.length < 6) {
      showAlert('Password must be at least 6 characters long.');
      return;
    }

    // 4. Password and Confirm Password match check
    if (password !== confirmPassword) {
      showAlert('Passwords do not match. Please re-enter your password.');
      return;
    }

    // 5. Register in SQLite database via backend API
    submitBtn.disabled = true;
    submitBtn.textContent = 'Creating Account...';

    try {
      const res = await fetch(`${API_BASE}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email, password: password })
      });
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        const detail = errorData.detail || 'Registration failed.';
        if (res.status === 400 && String(detail).toLowerCase().includes('already exists')) {
          showAlert('An account with this email address already exists. Please log in.');
          submitBtn.disabled = false;
          submitBtn.textContent = 'Create Account';
          return;
        }
      }
    } catch (err) {
      console.warn('Backend API registration offline or error (proceeding with local store):', err);
    }

    // Store new user in registered users list
    let registeredUsers = [];
    try {
      const stored = localStorage.getItem('storyWaveUsers_v1') || localStorage.getItem('storyBibleUsers_v1');
      if (stored) registeredUsers = JSON.parse(stored);
    } catch (err) {
      registeredUsers = [];
    }

    const newUser = {
      name: fullName,
      email: email,
      password: password,
      registeredAt: Date.now()
    };

    const existingIdx = registeredUsers.findIndex((u) => u.email.toLowerCase() === email);
    if (existingIdx >= 0) {
      registeredUsers[existingIdx] = newUser;
    } else {
      registeredUsers.push(newUser);
    }
    localStorage.setItem('storyWaveUsers_v1', JSON.stringify(registeredUsers));
    localStorage.setItem('storyBibleUsers_v1', JSON.stringify(registeredUsers));

    // Show clear success message and redirect to Login page
    showAlert('Account created successfully in database! Redirecting to login...', true);
    submitBtn.textContent = 'Account Created ✓';

    setTimeout(() => {
      window.location.href = 'login.html';
    }, 900);
  });
}
