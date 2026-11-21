// Overview page interactive script for Story Wave

// Load theme state from localStorage
let currentTheme = localStorage.getItem('storyWaveTheme_v1') || localStorage.getItem('storyBibleTheme_v1') || 'dark';

// Initialize on DOMContentLoaded
document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  initThemeToggle();
  initMobileNav();
  initSmoothScroll();
  checkLoggedInUser();
  initCopyrightYear();
});

// Apply initial theme
function initTheme() {
  applyTheme(currentTheme);
}

// Apply dark or light theme to document element
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

// Bind theme toggle button click handler
function initThemeToggle() {
  const toggleBtn = document.getElementById('themeToggleBtn');
  if (!toggleBtn) return;

  toggleBtn.addEventListener('click', () => {
    const nextTheme = currentTheme === 'dark' ? 'light' : 'dark';
    applyTheme(nextTheme);
  });
}

// Enhanced Mobile Drawer navigation toggle with backdrop and keyboard support
function initMobileNav() {
  const mobileBtn = document.getElementById('mobileMenuBtn');
  const drawer = document.getElementById('mobileDrawer');
  const overlay = document.getElementById('mobileDrawerOverlay');
  const closeBtn = document.getElementById('closeMobileDrawerBtn');

  if (!mobileBtn || !drawer || !overlay) return;

  function openDrawer() {
    drawer.classList.add('open');
    overlay.classList.add('active');
    mobileBtn.setAttribute('aria-expanded', 'true');
    document.body.style.overflow = 'hidden';
  }

  function closeDrawer() {
    drawer.classList.remove('open');
    overlay.classList.remove('active');
    mobileBtn.setAttribute('aria-expanded', 'false');
    document.body.style.overflow = '';
  }

  mobileBtn.addEventListener('click', () => {
    if (drawer.classList.contains('open')) {
      closeDrawer();
    } else {
      openDrawer();
    }
  });

  if (closeBtn) closeBtn.addEventListener('click', closeDrawer);
  overlay.addEventListener('click', closeDrawer);

  // Close when pressing Escape key
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && drawer.classList.contains('open')) {
      closeDrawer();
    }
  });

  // Close drawer on any link click
  drawer.querySelectorAll('a').forEach((link) => {
    link.addEventListener('click', () => {
      closeDrawer();
    });
  });
}

// Smooth scrolling for in-page navigation anchors
function initSmoothScroll() {
  document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
    anchor.addEventListener('click', (e) => {
      const targetId = anchor.getAttribute('href');
      if (targetId === '#' || !targetId) return;
      const targetEl = document.querySelector(targetId);
      if (targetEl) {
        e.preventDefault();
        targetEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
        // Update URL hash without jumping
        if (history.pushState) {
          history.pushState(null, null, targetId);
        }
      }
    });
  });
}

// Check if a user is already logged in and update navigation accordingly
function checkLoggedInUser() {
  try {
    const userRaw = localStorage.getItem('storyWaveCurrentUser_v1') || localStorage.getItem('storyBibleCurrentUser_v1');
    const loginBtn = document.getElementById('navLoginBtn');
    const registerBtn = document.getElementById('navRegisterBtn');
    const drawerLoginBtn = document.getElementById('mobileDrawerLoginBtn');
    const drawerRegisterBtn = document.getElementById('mobileDrawerRegisterBtn');

    if (!userRaw) {
      // User is LOGGED OUT: strictly reset all navigation items to default guest state
      if (loginBtn) {
        loginBtn.textContent = 'Login';
        loginBtn.href = 'login.html';
        loginBtn.title = 'Sign in to your account';
      }

      if (registerBtn) {
        registerBtn.textContent = 'Get Started';
        registerBtn.href = 'register.html';
        registerBtn.title = 'Create a free account';
      }

      if (drawerLoginBtn) {
        drawerLoginBtn.textContent = 'Login';
        drawerLoginBtn.href = 'login.html';
      }

      if (drawerRegisterBtn) {
        drawerRegisterBtn.textContent = 'Get Started Free';
        drawerRegisterBtn.href = 'register.html';
      }

      const existingLogoutBtn = document.getElementById('navLogoutBtn');
      if (existingLogoutBtn) existingLogoutBtn.remove();

      const existingDrawerLogout = document.getElementById('mobileDrawerLogoutBtn');
      if (existingDrawerLogout) existingDrawerLogout.remove();

      return;
    }

    const user = JSON.parse(userRaw);
    if (user && user.name) {
      // User is LOGGED IN: show Dashboard and user name
      if (loginBtn) {
        loginBtn.textContent = 'Dashboard';
        loginBtn.href = 'index.html';
        loginBtn.title = 'Open Story Wave Studio';
      }

      if (registerBtn) {
        registerBtn.textContent = user.name;
        registerBtn.href = 'index.html';
        registerBtn.title = `Signed in as ${user.name} (${user.email || ''})`;
      }

      // Add a clean Sign Out button in navbar if not present
      if (!document.getElementById('navLogoutBtn') && registerBtn && registerBtn.parentNode) {
        const logoutBtn = document.createElement('button');
        logoutBtn.id = 'navLogoutBtn';
        logoutBtn.className = 'btn btn-link';
        logoutBtn.textContent = 'Sign Out';
        logoutBtn.title = 'Sign out of Story Wave';
        logoutBtn.style.fontSize = '0.84rem';
        logoutBtn.style.color = 'rgba(255, 255, 255, 0.82)';
        logoutBtn.style.padding = '6px 10px';
        logoutBtn.onclick = (e) => {
          e.preventDefault();
          localStorage.removeItem('storyWaveCurrentUser_v1');
          localStorage.removeItem('storyBibleCurrentUser_v1');
          sessionStorage.removeItem('storyWaveCurrentUser_v1');
          sessionStorage.removeItem('storyBibleCurrentUser_v1');
          checkLoggedInUser();
        };
        registerBtn.parentNode.insertBefore(logoutBtn, registerBtn.nextSibling);
      }

      if (drawerLoginBtn) {
        drawerLoginBtn.textContent = 'Open Dashboard';
        drawerLoginBtn.href = 'index.html';
      }

      if (drawerRegisterBtn) {
        drawerRegisterBtn.textContent = `Signed in: ${user.name}`;
        drawerRegisterBtn.href = 'index.html';
      }

      // Add Sign Out button in mobile drawer
      if (!document.getElementById('mobileDrawerLogoutBtn') && drawerRegisterBtn && drawerRegisterBtn.parentNode) {
        const drawerActions = drawerRegisterBtn.parentNode;
        const drawerLogout = document.createElement('button');
        drawerLogout.id = 'mobileDrawerLogoutBtn';
        drawerLogout.className = 'btn btn-secondary w-full';
        drawerLogout.textContent = 'Sign Out';
        drawerLogout.style.marginTop = '6px';
        drawerLogout.onclick = (e) => {
          e.preventDefault();
          localStorage.removeItem('storyWaveCurrentUser_v1');
          localStorage.removeItem('storyBibleCurrentUser_v1');
          sessionStorage.removeItem('storyWaveCurrentUser_v1');
          sessionStorage.removeItem('storyBibleCurrentUser_v1');
          checkLoggedInUser();
        };
        drawerActions.appendChild(drawerLogout);
      }
    }
  } catch (e) {
    // If parse error occurs, continue with default guest buttons
  }
}

// Ensure copyright year is always up to date
function initCopyrightYear() {
  const el = document.getElementById('copyrightYear');
  if (el) {
    el.textContent = new Date().getFullYear();
  }
}
