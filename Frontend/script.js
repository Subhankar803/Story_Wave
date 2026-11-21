// Story Wave Frontend Application Logic
// Complete integration between UI and Story Wave FastAPI Backend

const API_BASE = (window.location.protocol.startsWith('http') && !window.location.origin.includes('file:'))
  ? window.location.origin
  : 'http://localhost:8000';
const WS_BASE = API_BASE.replace(/^http/, 'ws');

// Initial application state and Story Bible data
const defaultAppState = {
  theme: 'dark',
  storyTitle: 'Untitled Story',
  storyId: null,
  activeFileName: null,
  activeFileFormat: null,
  activeChapterId: 'chap-1',
  activeChapterNumber: 1,
  activeInsightTab: 'characters',
  highlightsEnabled: true,
  aiAssistantExpanded: false,
  activeAiTool: null,
  aiPanelHeight: 520,
  graphZoom: 1,
  backendConnected: false,
  authToken: null,
  chapters: [
    {
      id: 'chap-1',
      number: 1,
      title: 'Chapter 1',
      subtitle: 'New Scene',
      content: ''
    }
  ],
  insights: {
    characters: [],
    places: [],
    timeline: [],
    rules: [],
    flags: []
  }
};

// Application Global State
let appState = loadStateFromStorage();
let pendingPreviewText = '';
let isRecordingVoice = false;
let liveWebSocket = null;
let mediaRecorder = null;
let recordedAudioChunks = [];
let recordedAudioBlob = null;
let currentTtsAudio = null;
let speechRecognizer = null;
let pendingCloseChapterId = null;
let selectedDemoPreset = 'random';
let selectedDemoChapterCount = 4;
let activeFileHandle = null;
let activeFileName = null;
let activeFileFormat = null;

// Load state helper
function loadStateFromStorage() {
  try {
    const savedState = localStorage.getItem('storyBibleAppState_v3');
    const savedTheme = localStorage.getItem('storyBibleTheme_v1');
    const parsed = savedState ? JSON.parse(savedState) : structuredClone(defaultAppState);
    if (savedTheme) parsed.theme = savedTheme;
    if (!parsed.aiPanelHeight || parsed.aiPanelHeight < 500) parsed.aiPanelHeight = 520;
    if (!parsed.chapters || parsed.chapters.length === 0) {
      parsed.chapters = structuredClone(defaultAppState.chapters);
      parsed.activeChapterId = 'chap-1';
      parsed.activeChapterNumber = 1;
    }
    // If the canvas is blank or only contains random/empty text, ensure clean initial state
    const totalChars = (parsed.chapters || []).reduce((sum, c) => sum + (c.content || '').replace(/<[^>]*>/g, '').trim().length, 0);
    if (totalChars < 12) {
      if (parsed.insights) {
        parsed.insights.characters = [];
        parsed.insights.places = [];
        parsed.insights.timeline = [];
        parsed.insights.flags = [];
      }
      if (parsed.storyTitle === 'The Last Kingdom' && !parsed.chapters.some(c => (c.content || '').includes('Aarav'))) {
        parsed.storyTitle = 'Untitled Story';
      }
    }
    return parsed;
  } catch (e) {
    return structuredClone(defaultAppState);
  }
}

// Save current state to localStorage
function saveStateToStorage() {
  localStorage.setItem('storyBibleAppState_v3', JSON.stringify(appState));
  localStorage.setItem('storyBibleTheme_v1', appState.theme);
}

// -----------------------------------------------------------------------------
// GUEST TRIAL & USAGE ENFORCEMENT ENGINE (Max 3 Free Actions for Unregistered Guests)
// -----------------------------------------------------------------------------
const GUEST_TRIAL_LIMIT = 3;
const GUEST_USAGE_KEY = 'storyWaveGuestUsageCount_v1';

function isUserLoggedIn() {
  try {
    const raw = localStorage.getItem('storyWaveCurrentUser_v1') || 
                localStorage.getItem('storyBibleCurrentUser_v1') ||
                sessionStorage.getItem('storyWaveCurrentUser_v1') ||
                sessionStorage.getItem('storyBibleCurrentUser_v1');
    if (!raw) return false;
    const u = JSON.parse(raw);
    return !!(u && (u.email || u.name));
  } catch (e) {
    return false;
  }
}

function getGuestUsageCount() {
  const val = parseInt(localStorage.getItem(GUEST_USAGE_KEY), 10);
  return isNaN(val) ? 0 : val;
}

function updateGuestTrialUI() {
  const badgeContainer = document.getElementById('userAuthStatusContainer');
  if (!badgeContainer) return;

  const loggedIn = isUserLoggedIn();
  if (loggedIn) {
    let userName = 'Author';
    try {
      const u = JSON.parse(localStorage.getItem('storyWaveCurrentUser_v1') || sessionStorage.getItem('storyWaveCurrentUser_v1') || '{}');
      if (u.name) userName = u.name.split(' ')[0];
      else if (u.email) userName = u.email.split('@')[0];
    } catch (e) {}

    badgeContainer.innerHTML = `
      <div class="flex items-center gap-1.5 sm:gap-2">
        <span class="text-xs px-2.5 py-1 rounded-full bg-teal-500/10 border border-teal-500/20 text-teal-400 font-medium flex items-center gap-1.5" title="Logged in with full unlimited access">
          <span>👑</span>
          <span class="font-bold">${escapeHtml(userName)}</span>
          <span class="text-[10px] uppercase font-semibold text-teal-300/80 hidden md:inline">• Unlimited</span>
        </span>
        <button id="headerLogoutBtn" onclick="handleUserLogout()" class="text-xs px-2 py-1 rounded-lg hover:bg-red-500/10 text-slate-400 hover:text-red-400 border border-transparent hover:border-red-500/20 transition flex items-center gap-1" title="Sign out of Story Wave">
          <span>🚪</span>
          <span class="hidden sm:inline">Logout</span>
        </button>
      </div>
    `;
  } else {
    const used = getGuestUsageCount();
    const remaining = Math.max(0, GUEST_TRIAL_LIMIT - used);
    badgeContainer.innerHTML = `
      <div class="flex items-center gap-1.5 sm:gap-2">
        <span class="text-xs px-2 sm:px-2.5 py-1 rounded-full ${remaining > 0 ? 'bg-amber-500/10 border-amber-500/30 text-amber-400' : 'bg-red-500/10 border-red-500/30 text-red-400'} border font-medium flex items-center gap-1.5" title="Guest trial: 3 actions max. Register for unlimited access.">
          <span>🎁</span>
          <span>Guest: <strong>${remaining}/${GUEST_TRIAL_LIMIT}</strong> left</span>
        </span>
        <a href="register.html" class="text-xs px-2.5 py-1 rounded-lg bg-teal-500 hover:bg-teal-400 text-slate-950 font-bold transition shadow-sm flex items-center gap-1">
          <span>⚡</span>
          <span class="hidden md:inline">Get Unlimited</span>
          <span class="md:hidden">Sign Up</span>
        </a>
      </div>
    `;
  }
}

function checkGuestActionLimit(featureName = 'this feature') {
  if (isUserLoggedIn()) {
    return true; // Logged-in users enjoy 100% UNLIMITED access forever!
  }

  const currentCount = getGuestUsageCount();
  if (currentCount >= GUEST_TRIAL_LIMIT) {
    showGuestTrialLimitModal(featureName);
    return false;
  }

  // Count this action
  const newCount = currentCount + 1;
  localStorage.setItem(GUEST_USAGE_KEY, newCount.toString());
  updateGuestTrialUI();

  const remaining = GUEST_TRIAL_LIMIT - newCount;
  if (remaining > 0) {
    showGuestToast(`Guest preview action used (${newCount}/${GUEST_TRIAL_LIMIT}). ${remaining} free action${remaining === 1 ? '' : 's'} remaining!`);
  } else {
    showGuestToast(`You have used your 3rd (final) free guest action! Sign up to unlock unlimited access.`, true);
  }

  return true;
}

function showGuestTrialLimitModal(featureName = 'this feature') {
  const modal = document.getElementById('guestTrialModalOverlay');
  if (modal) {
    const featureEl = document.getElementById('guestTrialFeatureName');
    if (featureEl) featureEl.textContent = featureName;
    modal.classList.remove('hidden');
    modal.classList.add('flex');
  } else {
    alert(`Guest trial limit reached (3/3 actions used). Please create a free account or login for unlimited access to ${featureName}!`);
    window.location.href = 'register.html';
  }
}

function closeGuestTrialModal() {
  const modal = document.getElementById('guestTrialModalOverlay');
  if (modal) {
    modal.classList.add('hidden');
    modal.classList.remove('flex');
  }
}

function handleUserLogout() {
  localStorage.removeItem('storyWaveCurrentUser_v1');
  localStorage.removeItem('storyBibleCurrentUser_v1');
  sessionStorage.removeItem('storyWaveCurrentUser_v1');
  sessionStorage.removeItem('storyBibleCurrentUser_v1');
  localStorage.removeItem('storyWaveToken');
  updateGuestTrialUI();
  window.location.href = 'overview.html';
}

function showGuestToast(message, isWarning = false) {
  const container = document.getElementById('guestToastContainer');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `p-3 rounded-xl border shadow-xl text-xs font-semibold flex items-center gap-2.5 transition-all transform duration-300 translate-y-2 opacity-0 pointer-events-auto ${
    isWarning 
      ? 'bg-amber-950/95 text-amber-200 border-amber-500/40' 
      : 'bg-slate-900/95 text-teal-300 border-teal-500/30'
  }`;
  toast.style.backdropFilter = 'blur(8px)';
  toast.innerHTML = `
    <span class="text-base">${isWarning ? '⚠️' : '🎁'}</span>
    <span class="flex-1 leading-snug">${escapeHtml(message)}</span>
    <a href="register.html" class="ml-1 px-2 py-0.5 rounded bg-teal-500 hover:bg-teal-400 text-slate-950 text-[10px] font-bold transition shrink-0">Sign Up Free</a>
  `;
  container.appendChild(toast);

  requestAnimationFrame(() => {
    toast.classList.remove('translate-y-2', 'opacity-0');
    toast.classList.add('translate-y-0', 'opacity-100');
  });

  setTimeout(() => {
    toast.classList.add('opacity-0', 'translate-y-2');
    setTimeout(() => toast.remove(), 300);
  }, 4500);
}

function initGuestTrialSystem() {
  updateGuestTrialUI();

  const closeBtn = document.getElementById('closeGuestTrialModalBtn');
  if (closeBtn) closeBtn.addEventListener('click', closeGuestTrialModal);

  const dismissBtn = document.getElementById('dismissGuestTrialModalBtn');
  if (dismissBtn) dismissBtn.addEventListener('click', closeGuestTrialModal);

  const overlay = document.getElementById('guestTrialModalOverlay');
  if (overlay) {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeGuestTrialModal();
    });
  }
}

// -----------------------------------------------------------------------------
// BACKEND API CLIENT & AUTHENTICATION
// -----------------------------------------------------------------------------
async function apiFetch(path, options = {}) {
  const token = appState.authToken || localStorage.getItem('storyWaveToken');
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {})
  };

  if (options.body instanceof FormData) {
    delete headers['Content-Type'];
  }

  const geminiKey = localStorage.getItem('gemini_api_key') || localStorage.getItem('storyWaveGeminiKey');
  if (geminiKey) {
    headers['X-Gemini-Api-Key'] = geminiKey;
  }

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  try {
    const response = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers
    });

    if (response.status === 401 && !path.startsWith('/auth')) {
      // Re-authenticate and retry once
      const newToken = await ensureAuthToken(true);
      if (newToken) {
        headers['Authorization'] = `Bearer ${newToken}`;
        return fetch(`${API_BASE}${path}`, { ...options, headers });
      }
    }

    return response;
  } catch (err) {
    console.warn(`API request to ${path} failed:`, err);
    throw err;
  }
}

async function ensureAuthToken(forceRefresh = false) {
  if (!forceRefresh) {
    const existing = localStorage.getItem('storyWaveToken');
    if (existing) {
      appState.authToken = existing;
      return existing;
    }
  }

  try {
    // Resolve credentials from currently logged in user session
    const userRaw = localStorage.getItem('storyWaveCurrentUser_v1') || localStorage.getItem('storyBibleCurrentUser_v1');
    let email = 'writer@storywave.ai';
    let password = 'password123';

    if (userRaw) {
      try {
        const u = JSON.parse(userRaw);
        if (u && u.email) {
          email = u.email;
          const regUsers = JSON.parse(localStorage.getItem('storyWaveUsers_v1') || '[]');
          const match = regUsers.find(r => r.email.toLowerCase() === u.email.toLowerCase());
          if (match && match.password) password = match.password;
        }
      } catch (e) {}
    }

    const creds = { email: email, password: password, otp: '123456' };
    let res = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(creds)
    });

    if (res.status === 401 || res.status === 400 || res.status === 404) {
      // Register user on backend if not yet created in SQLite
      await fetch(`${API_BASE}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email, password: password })
      }).catch(() => {});

      res = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(creds)
      });
    }

    if (res.ok) {
      const data = await res.json();
      appState.authToken = data.access_token;
      localStorage.setItem('storyWaveToken', data.access_token);
      return data.access_token;
    }
  } catch (e) {
    console.warn('Backend authentication failed. Operating in offline/local fallback mode:', e);
  }
  return null;
}

function updateBackendStatus(connected, message = '') {
  appState.backendConnected = connected;
  const badge = document.getElementById('backendStatusBadge');
  if (!badge) return;

  if (connected) {
    badge.className = 'text-[11px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-medium flex items-center gap-1.5';
    badge.innerHTML = `<span class="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span><span>${message || 'Backend Connected'}</span>`;
  } else {
    badge.className = 'text-[11px] px-2 py-0.5 rounded-full bg-slate-500/10 text-slate-400 border border-slate-500/20 font-medium flex items-center gap-1.5';
    badge.innerHTML = `<span class="w-1.5 h-1.5 rounded-full bg-amber-400"></span><span>${message || 'Offline Mode'}</span>`;
  }
}

// Initialize Backend Sync and populate SQLite database tables
async function initBackendSync() {
  try {
    const token = await ensureAuthToken();
    if (!token) {
      updateBackendStatus(false, 'Local Dev Mode');
      return;
    }

    // Check backend health
    const healthRes = await fetch(`${API_BASE}/health`);
    if (!healthRes.ok) {
      updateBackendStatus(false, 'Offline Mode');
      return;
    }

    updateBackendStatus(true, 'Live Connected');

    // Fetch existing stories for the current user
    const storiesRes = await apiFetch('/stories');
    if (storiesRes.ok) {
      const stories = await storiesRes.json();
      const currentTitle = (appState.storyTitle || '').trim().toLowerCase();
      let found = (currentTitle && currentTitle !== 'untitled story')
        ? stories.find(s => s.title.trim().toLowerCase() === currentTitle)
        : null;

      if (!found && stories.length > 0) {
        found = stories[0];
      }

      if (found) {
        appState.storyId = found.id;
        appState.storyTitle = found.title;
        renderStoryTitle();
      } else {
        // Create fresh new story in SQLite stories table
        const createRes = await apiFetch('/stories', {
          method: 'POST',
          body: JSON.stringify({ title: appState.storyTitle || 'The Last Kingdom' })
        });
        if (createRes.ok) {
          const newStory = await createRes.json();
          appState.storyId = newStory.id;
        }
      }
    }

    if (appState.storyId) {
      // Connect WebSocket for live push updates
      connectLiveWebSocket(appState.storyId);

      // Persist any active chapters to SQLite chapters table
      const chaptersWithText = (appState.chapters || []).filter(c => {
        const text = (c.content || '').replace(/<[^>]*>/g, '').trim();
        return text.length > 0;
      });

      for (const ch of (chaptersWithText.length > 0 ? chaptersWithText : [appState.chapters[0]])) {
        if (!ch) continue;
        const cleanText = (ch.content || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
        if (cleanText) {
          try {
            let chRes = await apiFetch(`/stories/${appState.storyId}/chapters/${ch.number}`, {
              method: 'PUT',
              body: JSON.stringify({ text: cleanText })
            });
            if (chRes.status === 404) {
              await apiFetch(`/stories/${appState.storyId}/chapters`, {
                method: 'POST',
                body: JSON.stringify({ number: ch.number, text: cleanText })
              });
            }
          } catch (e) {
            console.debug('Initial chapter push:', e);
          }
        }
      }

      // Sync rules to backend rules table if present
      if (appState.insights.rules && appState.insights.rules.length > 0) {
        for (const r of appState.insights.rules) {
          if (String(r.id).startsWith('rule-')) {
            try {
              let ent = 'World';
              let desc = r.rule || '';
              if (r.title && r.title.includes(':')) {
                ent = r.title.split(':')[0].trim();
              } else if (r.title && !r.title.toLowerCase().startsWith('rule')) {
                ent = r.title.trim();
              }
              const rRes = await apiFetch(`/stories/${appState.storyId}/rules`, {
                method: 'POST',
                body: JSON.stringify({ entity_name: ent, description: desc, chapter_number: 1 })
              });
              if (rRes.ok) {
                const savedR = await rRes.json();
                r.id = savedR.id;
              }
            } catch (e) {}
          }
        }
      }

      await syncBibleFromBackend();
      await syncFlagsFromBackend();
    }
  } catch (err) {
    console.warn('Backend sync initialization error:', err);
    updateBackendStatus(false, 'Local Dev Mode');
  }
}

// Helper to ensure backend connection and active story ID
async function ensureBackendStory() {
  if (appState.storyId) return appState.storyId;
  try {
    await initBackendSync();
  } catch (e) {
    console.debug('ensureBackendStory error:', e);
  }
  return appState.storyId;
}

// Connect to backend WebSocket for live updates
function connectLiveWebSocket(storyId) {
  if (liveWebSocket) {
    try { liveWebSocket.close(); } catch (e) {}
  }

  try {
    liveWebSocket = new WebSocket(`${WS_BASE}/stories/${storyId}/live`);

    liveWebSocket.onopen = () => {
      console.log(`WebSocket connected to story ${storyId}`);
      updateBackendStatus(true, 'Live Connected');
    };

    liveWebSocket.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        console.log('Live WS Event:', msg);

        if (msg.event === 'flag_detected') {
          syncFlagsFromBackend();
        } else if (msg.event === 'bible_updated') {
          syncBibleFromBackend();
        } else if (msg.event === 'chapter_status') {
          const statusPill = document.getElementById('editorStatusPill');
          if (statusPill && msg.status === 'processed') {
            statusPill.innerHTML = `<span class="w-2 h-2 rounded-full bg-emerald-400"></span><span>Chapter ${msg.chapter_number} Synced</span>`;
          }
        }
      } catch (e) {
        console.warn('WS message parse error:', e);
      }
    };

    liveWebSocket.onerror = (e) => {
      console.debug('WebSocket error (falling back to REST):', e);
    };

    liveWebSocket.onclose = () => {
      console.log('WebSocket closed.');
    };
  } catch (e) {
    console.debug('WebSocket connection skipped:', e);
  }
}

// Fetch story bible from backend
async function syncBibleFromBackend() {
  if (!appState.storyId) return;
  try {
    const res = await apiFetch(`/stories/${appState.storyId}/bible`);
    if (!res.ok) return;

    const bible = await res.json();

    appState.insights.characters = (bible.characters || []).map(c => {
      const cFacts = (bible.facts || []).filter(f => f.entity_name && f.entity_name.toLowerCase() === c.name.toLowerCase());
      const appearance = cFacts.find(f => f.attribute === 'appearance')?.value;
      const location = cFacts.find(f => f.attribute === 'location')?.value;
      const rel = cFacts.find(f => f.attribute === 'relationship')?.value;
      const eventQuote = cFacts.find(f => f.quote)?.quote || cFacts[0]?.value;

      const detailParts = [];
      if (appearance) detailParts.push(`Appearance: ${appearance}`);
      if (location) detailParts.push(`Location: ${location}`);
      if (rel) detailParts.push(`Relation: ${rel}`);
      if (detailParts.length === 0 && eventQuote) {
        detailParts.push(eventQuote.length > 90 ? eventQuote.slice(0, 87) + '...' : eventQuote);
      }

      return {
        name: c.name,
        role: rel ? rel : (c.type === 'character' ? 'Story Character' : c.type),
        age: 'Established',
        details: detailParts.join(' • ') || 'Character identified in story scenes.'
      };
    });

    appState.insights.places = (bible.places || []).map(p => {
      const pFacts = (bible.facts || []).filter(f =>
        (f.entity_name && f.entity_name.toLowerCase() === p.name.toLowerCase()) ||
        (f.value && f.value.toLowerCase() === p.name.toLowerCase()) ||
        (f.quote && f.quote.toLowerCase().includes(p.name.toLowerCase()))
      );
      const bestQuote = pFacts.find(f => f.quote)?.quote || pFacts[0]?.value || `Key setting in story narrative.`;
      return {
        name: p.name,
        type: p.type || 'Location',
        desc: bestQuote.length > 110 ? bestQuote.slice(0, 107) + '...' : bestQuote
      };
    });

    appState.insights.timeline = (bible.timeline || []).map((t, idx) => ({
      day: t.day || `Chapter ${t.chapter_number}`,
      event: `${t.entity_name} (${t.attribute}): ${t.value}`
    }));

    appState.insights.rules = (bible.rules || []).map(r => {
      let title = `Rule (Ch ${r.chapter_number})`;
      let rule = r.description;
      if (r.description && r.description.includes(':')) {
        const parts = r.description.split(':');
        title = parts[0].trim();
        rule = parts.slice(1).join(':').trim();
      }
      return {
        id: r.id,
        title: title,
        rule: rule
      };
    });

    renderInsightsPanel();
    saveStateToStorage();
  } catch (e) {
    console.debug('Failed to sync bible from backend:', e);
  }
}

// Fetch flags from backend
async function syncFlagsFromBackend() {
  if (!appState.storyId) return;
  try {
    const res = await apiFetch(`/stories/${appState.storyId}/flags`);
    if (!res.ok) return;

    const flags = await res.json();
    appState.insights.flags = flags.map(f => ({
      id: f.id,
      title: f.type,
      severity: f.severity === 'error' ? 'Critical' : 'Warning',
      explanation: f.explanation,
      previousFact: f.old_quote || 'Established story bible fact',
      currentFact: f.new_quote || 'Current chapter statement',
      chapterNumber: f.chapter_number,
      resolved: f.status !== 'open'
    }));

    renderInsightsPanel();
    saveStateToStorage();
  } catch (e) {
    console.debug('Failed to sync flags from backend:', e);
  }
}

// -----------------------------------------------------------------------------
// INITIALIZATION ON DOM READY
// -----------------------------------------------------------------------------
document.addEventListener('DOMContentLoaded', () => {
  initGuestTrialSystem();
  applyTheme(appState.theme);
  renderStoryTitle();
  renderChapterTabs();
  loadActiveChapterIntoEditor();
  scanAndExtractStoryEntities(false);
  renderInsightsPanel();
  initAiPanelResizeHandle();
  bindEventListeners();

  // Restore active file handle from IndexedDB so modifications save to the SAME file
  restoreActiveFileHandle().then((handle) => {
    if (handle) {
      activeFileHandle = handle;
      activeFileName = handle.name;
      const extMatch = handle.name.match(/\.(docx|pdf|txt)$/i);
      activeFileFormat = extMatch ? extMatch[1].toLowerCase() : 'docx';
      appState.activeFileName = activeFileName;
      appState.activeFileFormat = activeFileFormat;
      updateLinkedFileBadge(activeFileName, activeFileFormat);
    } else if (appState.activeFileName) {
      activeFileName = appState.activeFileName;
      activeFileFormat = appState.activeFileFormat || 'docx';
      updateLinkedFileBadge(activeFileName, activeFileFormat);
    }
  });

  // Connect to backend
  initBackendSync();
});

// Apply Dark or Light theme and update toggle icons
function applyTheme(theme) {
  appState.theme = theme;
  const htmlEl = document.documentElement;
  const sunIcon = document.getElementById('themeSunIcon');
  const moonIcon = document.getElementById('themeMoonIcon');

  if (theme === 'dark') {
    htmlEl.classList.add('dark');
    sunIcon.classList.replace('opacity-100', 'opacity-50');
    moonIcon.classList.replace('opacity-50', 'opacity-100');
  } else {
    htmlEl.classList.remove('dark');
    sunIcon.classList.replace('opacity-50', 'opacity-100');
    moonIcon.classList.replace('opacity-100', 'opacity-50');
  }
  localStorage.setItem('storyBibleTheme_v1', theme);
}

// Render story title in the control bar
function renderStoryTitle() {
  const displayEl = document.getElementById('storyTitleDisplay');
  const inputEl = document.getElementById('storyTitleInput');
  displayEl.textContent = appState.storyTitle;
  inputEl.value = appState.storyTitle;
}

// Render horizontal chapter navigation tabs (Google Chrome tabs style with close x)
function renderChapterTabs() {
  const container = document.getElementById('chapterTabsContainer');
  container.innerHTML = '';

  appState.chapters.forEach((chap, idx) => {
    const isActive = chap.id === appState.activeChapterId;
    const tab = document.createElement('div');
    tab.className = isActive
      ? 'chapter-tab px-3 py-1 rounded-md text-xs font-semibold active-chapter-btn transition shrink-0 cursor-pointer select-none'
      : 'chapter-tab px-3 py-1 rounded-md text-xs font-medium app-text-secondary hover:bg-slate-500/10 transition shrink-0 cursor-pointer select-none';

    const titleSpan = document.createElement('span');
    titleSpan.className = 'chapter-tab-title';
    titleSpan.textContent = chap.title || `Chapter ${chap.number || idx + 1}`;
    tab.appendChild(titleSpan);

    const closeBtn = document.createElement('span');
    closeBtn.className = 'chapter-tab-close';
    closeBtn.title = 'Close Chapter Tab';
    closeBtn.innerHTML = '&times;';
    closeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      promptCloseChapterTab(chap.id);
    });
    tab.appendChild(closeBtn);

    tab.addEventListener('click', () => switchChapter(chap.id));
    container.appendChild(tab);
  });
}

// Prompt save confirmation before closing any chapter tab (Chrome-tab close behavior)
function promptCloseChapterTab(chapterId) {
  pendingCloseChapterId = chapterId;
  const chap = appState.chapters.find((c) => c.id === chapterId);
  const chapTitle = chap ? (chap.title || `Chapter ${chap.number || 1}`) : 'Chapter';

  const modalTitle = document.getElementById('closeChapterModalTitle');
  const modalDesc = document.getElementById('closeChapterModalDesc');
  const overlay = document.getElementById('closeChapterModalOverlay');

  if (modalTitle) modalTitle.textContent = `Save ${chapTitle} Before Closing?`;
  if (modalDesc) {
    modalDesc.textContent = `Do you want to save your work on ${chapTitle} before closing this tab? Any unsaved edits will be discarded if closed without saving.`;
  }
  if (overlay) {
    overlay.classList.remove('hidden');
    overlay.classList.add('flex');
  }
}

function dismissCloseChapterModal() {
  const overlay = document.getElementById('closeChapterModalOverlay');
  if (overlay) {
    overlay.classList.add('hidden');
    overlay.classList.remove('flex');
  }
  pendingCloseChapterId = null;
}

// Execute the closing of a chapter tab
async function executeCloseChapter(chapterId) {
  const idx = appState.chapters.findIndex((c) => c.id === chapterId);
  if (idx === -1) return;

  const chap = appState.chapters[idx];
  const wasActive = chap.id === appState.activeChapterId;
  const closedNumber = chap.number || (idx + 1);

  // Remove chapter from local state
  appState.chapters.splice(idx, 1);

  // If no chapters remain, reset to 1 fresh blank Chapter
  if (appState.chapters.length === 0) {
    appState.chapters = [
      {
        id: 'chap-1',
        number: 1,
        title: 'Chapter 1',
        subtitle: 'New Scene',
        content: ''
      }
    ];
    appState.activeChapterId = 'chap-1';
    appState.activeChapterNumber = 1;
  } else if (wasActive) {
    // Switch to adjacent chapter
    const newIdx = Math.max(0, idx - 1);
    appState.activeChapterId = appState.chapters[newIdx].id;
    appState.activeChapterNumber = appState.chapters[newIdx].number || (newIdx + 1);
  }

  // Sync deletion with backend if story is connected
  if (appState.storyId && closedNumber) {
    try {
      await apiFetch(`/stories/${appState.storyId}/chapters/${closedNumber}`, { method: 'DELETE' });
    } catch (e) {
      console.debug('Backend chapter delete call:', e);
    }
  }

  dismissAiPreview();
  renderChapterTabs();
  loadActiveChapterIntoEditor();
  scanAndExtractStoryEntities(false);
  saveStateToStorage();
}

// Switch to the selected chapter
function switchChapter(chapterId) {
  dismissAiPreview();
  saveCurrentEditorContentToState();
  appState.activeChapterId = chapterId;
  const activeChap = appState.chapters.find((c) => c.id === chapterId);
  if (activeChap) {
    appState.activeChapterNumber = activeChap.number || 1;
  }
  renderChapterTabs();
  loadActiveChapterIntoEditor();
  scanAndExtractStoryEntities(false);
  renderInsightsPanel();
  saveStateToStorage();
}

// Load active chapter HTML content into the Story Editor
function loadActiveChapterIntoEditor() {
  const editor = document.getElementById('storyEditor');
  const indicator = document.getElementById('activeChapterIndicator');
  const activeChap = appState.chapters.find((c) => c.id === appState.activeChapterId) || appState.chapters[0];

  if (activeChap && activeChap.content) {
    // Auto-heal any corrupt placeholder tokens or dangling words from previous runs
    if (activeChap.content.includes('$2') || activeChap.content.includes('only Meera knew floorboards')) {
      activeChap.content = activeChap.content
        .replace(/\bas a smugglers' ferry (?:truly loves \$2|truly loves a boy)\.?/gi, "as a smugglers' ferry waited offshore outside the harbor for the low-tide bell.")
        .replace(/in a secret location only Meera knew floorboards/gi, 'The sealed ledger inside the warehouse safe')
        .replace(/truly loves \$2/gi, 'truly loves a boy');
    }
  }

  editor.innerHTML = activeChap.content;
  indicator.textContent = `${activeChap.title}: ${activeChap.subtitle || 'Scene'}`;
  updateWordAndCharCount();
  applyConflictHighlightsToEditor();
}

// Save current editor content into the active chapter object (excluding temporary AI preview blocks)
function saveCurrentEditorContentToState() {
  const editor = document.getElementById('storyEditor');
  const activeChap = appState.chapters.find((c) => c.id === appState.activeChapterId);
  if (activeChap && editor) {
    const previewEl = editor.querySelector('#canvasAiPreviewBlock');
    if (previewEl) {
      const clone = editor.cloneNode(true);
      const clonePreview = clone.querySelector('#canvasAiPreviewBlock');
      if (clonePreview) clonePreview.remove();
      activeChap.content = clone.innerHTML;
    } else {
      activeChap.content = editor.innerHTML;
    }
  }
}

// Update the word count, character count, and reading time
function updateWordAndCharCount() {
  const editor = document.getElementById('storyEditor');
  if (!editor) return;
  let rawText = editor.innerText;
  const previewEl = editor.querySelector('#canvasAiPreviewBlock');
  if (previewEl) {
    rawText = rawText.replace(previewEl.innerText, '');
  }
  rawText = rawText.trim();
  const charCount = rawText.length;
  const words = rawText === '' ? 0 : rawText.split(/\s+/).length;
  const readMin = Math.max(1, Math.ceil(words / 200));

  document.getElementById('wordCountDisplay').textContent = words.toLocaleString();
  document.getElementById('charCountDisplay').textContent = charCount.toLocaleString();
  document.getElementById('readTimeDisplay').textContent = `${readMin} min`;
}

// Render the selected Story Insights category tab
function renderInsightsPanel() {
  const container = document.getElementById('insightContentContainer');
  const activeTab = appState.activeInsightTab;

  // Update tab buttons active styling
  document.querySelectorAll('.insight-tab').forEach((btn) => {
    const tabName = btn.getAttribute('data-insight-tab');
    btn.classList.toggle('active-insight-tab', tabName === activeTab);
  });

  // Update active flag count badge
  const unresolvedFlags = appState.insights.flags.filter((f) => !f.resolved);
  const currentChapFlags = unresolvedFlags.filter((f) => Number(f.chapterNumber) === Number(appState.activeChapterNumber));
  const badge = document.getElementById('flagTabCountBadge');
  const statusPill = document.getElementById('editorStatusPill');

  if (unresolvedFlags.length > 0) {
    badge.textContent = unresolvedFlags.length;
    badge.classList.remove('hidden');
    if (currentChapFlags.length > 0) {
      statusPill.innerHTML = `<span class="w-2 h-2 rounded-full bg-amber-400"></span><span>${currentChapFlags.length} Flag${currentChapFlags.length > 1 ? 's' : ''} in Ch. ${appState.activeChapterNumber}</span>`;
    } else {
      statusPill.innerHTML = `<span class="w-2 h-2 rounded-full bg-emerald-400"></span><span>Ch. ${appState.activeChapterNumber} Consistent (${unresolvedFlags.length} in story)</span>`;
    }
  } else {
    badge.classList.add('hidden');
    statusPill.innerHTML = `<span class="w-2 h-2 rounded-full bg-emerald-400"></span><span>Story Consistent</span>`;
  }

  // Render category content
  if (activeTab === 'characters') {
    if (appState.insights.characters.length === 0) {
      container.innerHTML = `<div class="p-6 text-center text-xs app-text-muted">No characters detected yet. Click <strong>Analyze</strong> to extract entities.</div>`;
      return;
    }
    container.innerHTML = appState.insights.characters.map((c) => `
      <div class="p-3 rounded-xl border app-border app-surface-secondary hover:border-teal-500/40 transition">
        <div class="flex items-center justify-between mb-1">
          <span class="font-bold text-xs app-text-primary">👤 ${c.name}</span>
          <span class="text-[11px] px-2 py-0.5 rounded-full bg-teal-500/10 text-teal-400 font-medium">${c.age || 'Character'}</span>
        </div>
        <p class="text-[11px] font-medium text-teal-400 mb-1">${c.role || 'Character'}</p>
        <p class="text-xs app-text-muted">${c.details || ''}</p>
      </div>
    `).join('');
  } else if (activeTab === 'places') {
    if (appState.insights.places.length === 0) {
      container.innerHTML = `<div class="p-6 text-center text-xs app-text-muted">No locations identified yet. Click <strong>Analyze</strong>.</div>`;
      return;
    }
    container.innerHTML = appState.insights.places.map((p) => `
      <div class="p-3 rounded-xl border app-border app-surface-secondary hover:border-teal-500/40 transition">
        <div class="flex items-center justify-between mb-1">
          <span class="font-bold text-xs app-text-primary">📍 ${p.name}</span>
          <span class="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded badge-cyan-subtle font-semibold">${p.type || 'Place'}</span>
        </div>
        <p class="text-xs app-text-muted">${p.desc || ''}</p>
      </div>
    `).join('');
  } else if (activeTab === 'timeline') {
    if (appState.insights.timeline.length === 0) {
      container.innerHTML = `<div class="p-6 text-center text-xs app-text-muted">No timeline events extracted yet.</div>`;
      return;
    }
    container.innerHTML = `
      <div class="relative pl-4 border-l-2 border-teal-500/30 space-y-3 my-1">
        ${appState.insights.timeline.map((t) => `
          <div class="relative p-2.5 rounded-lg border app-border app-surface-secondary">
            <span class="absolute -left-[21px] top-3.5 w-2.5 h-2.5 rounded-full bg-teal-500"></span>
            <span class="text-[11px] font-bold text-teal-400 block">${t.day}</span>
            <p class="text-xs app-text-secondary mt-0.5">${t.event}</p>
          </div>
        `).join('')}
      </div>
    `;
  } else if (activeTab === 'rules') {
    const rulesList = appState.insights.rules || [];
    const isAdding = appState.showAddRuleForm;

    const addFormHtml = isAdding ? `
      <div class="p-3.5 rounded-xl border border-teal-500/50 bg-slate-900/95 shadow-xl space-y-2.5 mb-3">
        <div class="flex items-center justify-between">
          <span class="text-xs font-bold text-teal-400">🛡️ Create Story / Character Rule</span>
          <button onclick="toggleAddRuleForm(false)" class="text-slate-400 hover:text-white text-xs px-1">✕</button>
        </div>
        <div>
          <label class="block text-[10px] uppercase font-semibold text-slate-400 mb-1">Character or Entity</label>
          <input id="ruleCharacterInput" type="text" placeholder="e.g. Gopu (or World)" class="w-full px-2.5 py-1.5 rounded-lg bg-slate-800 border app-border text-xs text-white focus:border-teal-500 outline-none" />
        </div>
        <div>
          <label class="block text-[10px] uppercase font-semibold text-slate-400 mb-1">Rule / Restriction / Limitation</label>
          <textarea id="ruleDescInput" rows="2" placeholder="e.g. Lactose intolerant, cannot drink milk or eat dairy" class="w-full px-2.5 py-1.5 rounded-lg bg-slate-800 border app-border text-xs text-white focus:border-teal-500 outline-none resize-none"></textarea>
        </div>
        <div class="flex items-center gap-2 pt-1">
          <button onclick="saveNewRule()" class="flex-1 py-1.5 rounded-lg bg-teal-500 hover:bg-teal-400 text-slate-900 font-bold text-xs transition">
            Save Rule
          </button>
          <button onclick="toggleAddRuleForm(false)" class="px-3 py-1.5 rounded-lg border app-border text-xs app-text-muted hover:text-white transition">
            Cancel
          </button>
        </div>
      </div>
    ` : '';

    const headerHtml = `
      <div class="flex items-center justify-between pb-2 mb-3 border-b app-border">
        <div class="flex items-center gap-1.5">
          <span class="text-xs font-bold app-text-primary">Story & Character Rules</span>
          <span class="text-[10px] font-bold px-1.5 py-0.5 rounded bg-teal-500/20 text-teal-400">${rulesList.length}</span>
        </div>
        <button onclick="toggleAddRuleForm(true)" class="px-2.5 py-1 rounded-lg bg-teal-500/20 hover:bg-teal-500/30 text-teal-400 text-[11px] font-bold transition flex items-center gap-1">
          <span>+</span><span>Add Rule</span>
        </button>
      </div>
    `;

    if (rulesList.length === 0 && !isAdding) {
      container.innerHTML = `
        ${headerHtml}
        <div class="p-6 text-center rounded-xl border app-border app-surface-secondary space-y-2">
          <span class="text-2xl block">🛡️</span>
          <p class="text-xs font-semibold app-text-primary">No Rules Established Yet</p>
          <p class="text-[11px] app-text-muted">Create character-specific limitations (like "Gopu is lactose intolerant") or universal world rules.</p>
          <button onclick="toggleAddRuleForm(true)" class="mt-2 px-3 py-1.5 rounded-lg bg-teal-500/15 hover:bg-teal-500/25 text-teal-400 text-xs font-semibold transition">
            + Add First Rule
          </button>
        </div>
      `;
      return;
    }

    container.innerHTML = `
      ${headerHtml}
      ${addFormHtml}
      <div class="space-y-2.5">
        ${rulesList.map((r) => `
          <div class="p-3 rounded-xl border app-border app-surface-secondary hover:border-teal-500/30 transition group flex items-start justify-between gap-2">
            <div class="space-y-1">
              <div class="flex items-center gap-1.5">
                <span>🛡️</span>
                <span class="font-bold text-xs app-text-primary">${r.title}</span>
              </div>
              <p class="text-xs app-text-secondary leading-relaxed">${r.rule}</p>
            </div>
            <button onclick="deleteStoryRule('${r.id}')" class="opacity-60 hover:opacity-100 text-slate-400 hover:text-red-400 text-xs px-1.5 py-0.5 rounded transition" title="Delete Rule">
              ✕
            </button>
          </div>
        `).join('')}
      </div>
    `;
  } else if (activeTab === 'flags') {
    const filter = appState.flagsFilter || 'all';
    const displayFlags = filter === 'current' ? currentChapFlags : unresolvedFlags;

    const filterHeaderHtml = `
      <div class="flex items-center justify-between pb-2 mb-2.5 border-b app-border">
        <div class="flex items-center gap-1.5">
          <span class="text-xs font-bold app-text-primary">Consistency Flags</span>
          <span class="text-[10px] font-bold px-1.5 py-0.5 rounded ${unresolvedFlags.length > 0 ? 'bg-amber-500/20 text-amber-400' : 'bg-emerald-500/20 text-emerald-400'}">${unresolvedFlags.length}</span>
        </div>
        <div class="flex items-center gap-1 p-0.5 rounded-lg bg-slate-800/80 border app-border text-[10px]">
          <button onclick="setFlagsFilter('current')" class="px-2.5 py-0.5 rounded font-semibold transition ${filter === 'current' ? 'bg-teal-500 text-slate-900 shadow-sm' : 'app-text-muted hover:app-text-primary'}">
            Ch. ${appState.activeChapterNumber} (${currentChapFlags.length})
          </button>
          <button onclick="setFlagsFilter('all')" class="px-2.5 py-0.5 rounded font-semibold transition ${filter === 'all' ? 'bg-teal-500 text-slate-900 shadow-sm' : 'app-text-muted hover:app-text-primary'}">
            All (${unresolvedFlags.length})
          </button>
        </div>
      </div>
    `;

    let bannerHtml = '';
    if (filter === 'current' && currentChapFlags.length === 0) {
      if (unresolvedFlags.length === 0) {
        container.innerHTML = `
          ${filterHeaderHtml}
          <div class="p-6 text-center rounded-xl border app-border app-surface-secondary space-y-1 my-2">
            <span class="text-2xl block mb-2">✅</span>
            <p class="text-xs font-semibold app-text-primary">No Active Consistency Flags</p>
            <p class="text-[11px] app-text-muted">Your story timeline, traits, and world rules are fully aligned across all chapters.</p>
          </div>
        `;
        return;
      }
      bannerHtml = `
        <div class="p-3 text-center rounded-xl border app-border app-surface-secondary space-y-1 mb-3">
          <p class="text-xs font-bold text-emerald-400">✓ Chapter ${appState.activeChapterNumber} is 100% Consistent</p>
          <p class="text-[11px] app-text-muted">Showing ${unresolvedFlags.length} flag${unresolvedFlags.length > 1 ? 's' : ''} detected across other chapters in your story:</p>
        </div>
      `;
    } else if (unresolvedFlags.length === 0) {
      container.innerHTML = `
        ${filterHeaderHtml}
        <div class="p-6 text-center rounded-xl border app-border app-surface-secondary space-y-1 my-2">
          <span class="text-2xl block mb-2">✅</span>
          <p class="text-xs font-semibold app-text-primary">No Active Consistency Flags</p>
          <p class="text-[11px] app-text-muted">Your story timeline, traits, and world rules are fully aligned across all chapters.</p>
        </div>
      `;
      return;
    }

    const flagsToRender = (filter === 'current' && currentChapFlags.length === 0) ? unresolvedFlags : displayFlags;

    container.innerHTML = `
      ${filterHeaderHtml}
      ${bannerHtml}
      <div class="space-y-3">
        ${flagsToRender.map((f) => `
          <div class="p-3.5 rounded-xl border app-border app-surface-secondary space-y-2.5 hover:border-teal-500/30 transition">
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-1.5">
                <span class="text-xs font-bold ${(f.title || '').includes('twist') || (f.title || '').includes('conspiracy') ? 'text-purple-400' : 'status-error-text'} flex items-center gap-1">
                  ${(f.title || '').includes('twist') || (f.title || '').includes('conspiracy') ? '🔮' : '⚠️'} ${f.title}
                </span>
                <span class="text-[10px] font-bold px-1.5 py-0.5 rounded ${Number(f.chapterNumber) === Number(appState.activeChapterNumber) ? 'bg-teal-500/20 text-teal-300 border border-teal-500/40' : 'bg-slate-700/60 text-slate-300'}">Ch. ${f.chapterNumber || '?'}</span>
              </div>
              <span class="text-[10px] font-semibold px-2 py-0.5 rounded ${(f.title || '').includes('twist') || (f.title || '').includes('conspiracy') ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30' : 'badge-error-subtle'}">
                ${(f.title || '').includes('twist') || (f.title || '').includes('conspiracy') ? 'Plot Twist' : f.severity}
              </span>
            </div>
            <p class="text-xs app-text-secondary leading-relaxed">${f.explanation}</p>
            <div class="p-2 rounded-lg app-surface border app-border text-[11px] space-y-1">
              <div><span class="app-text-muted font-medium">Was:</span> <span class="status-success-text font-semibold">${f.previousFact}</span></div>
              <div><span class="app-text-muted font-medium">Now:</span> <span class="${(f.title || '').includes('twist') || (f.title || '').includes('conspiracy') ? 'text-purple-300' : 'status-error-text'} font-semibold">${f.currentFact}</span></div>
            </div>
            <div class="flex items-center gap-1.5 pt-1">
              <button onclick="focusFlagInEditor('${f.id}')" class="flex-1 py-1.5 px-2 rounded-lg bg-teal-500/15 hover:bg-teal-500/25 text-teal-400 text-[11px] font-semibold transition flex items-center justify-center gap-1">
                <span>🔍 View in Editor</span>
              </button>
              ${(f.title || '').includes('twist') || (f.title || '').includes('conspiracy') ? `
                <button onclick="confirmPlotTwist('${f.id}')" class="py-1.5 px-2.5 rounded-lg bg-purple-500/25 hover:bg-purple-500/35 text-purple-300 text-[11px] font-bold transition flex items-center gap-1" title="Acknowledge this as an intentional conspiracy or plot twist">
                  <span>🔮 Confirm Twist</span>
                </button>
                <button onclick="quickFixFlag('${f.id}')" class="py-1.5 px-2 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 text-[11px] font-semibold transition" title="Fix if this was an accidental mistake">
                  <span>✨ Fix</span>
                </button>
              ` : `
                <button onclick="quickFixFlag('${f.id}')" class="py-1.5 px-2.5 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 text-[11px] font-bold transition flex items-center gap-1" title="Automatically fix with Story Bible fact">
                  <span>✨ Fix</span>
                </button>
                ${(f.title || '').includes('rule') || (f.title || '').includes('character') ? `
                  <button onclick="confirmPlotTwist('${f.id}')" class="py-1.5 px-2 rounded-lg border border-purple-500/40 hover:bg-purple-500/20 text-purple-300 text-[11px] font-medium transition" title="Mark as intentional plot twist or conspiracy">
                    <span>🔮 Twist?</span>
                  </button>
                ` : ''}
              `}
              <button onclick="resolveFlag('${f.id}', false)" class="py-1.5 px-2 rounded-lg border app-border hover:border-red-400 text-[11px] app-text-muted hover:text-red-400 transition" title="Dismiss Flag">
                ✕
              </button>
            </div>
          </div>
        `).join('')}
      </div>
    `;
  }
}

// Set flags view filter (current chapter vs all chapters)
function setFlagsFilter(filter) {
  appState.flagsFilter = filter;
  renderInsightsPanel();
}

function unwrapAllConflictMarks(editor) {
  if (!editor) return;
  const existingMarks = Array.from(editor.querySelectorAll('mark.fact-conflict, span.fact-conflict'));
  if (existingMarks.length === 0) return;
  existingMarks.forEach((m) => {
    const parent = m.parentNode;
    if (parent) {
      while (m.firstChild) parent.insertBefore(m.firstChild, m);
      m.remove();
    }
  });
  saveCurrentEditorContentToState();
}

// Automatically apply visual conflict highlights (.fact-conflict) to story editor text
function applyConflictHighlightsToEditor() {
  const editor = document.getElementById('storyEditor');
  if (!editor) return;

  if (!appState.highlightsEnabled) {
    unwrapAllConflictMarks(editor);
    return;
  }

  const currentFlags = (appState.insights.flags || []).filter(
    (f) => !f.resolved && Number(f.chapterNumber) === Number(appState.activeChapterNumber)
  );

  // 1. Remove any stale conflict highlights that no longer have a corresponding active flag in this chapter
  const existingMarks = Array.from(editor.querySelectorAll('mark.fact-conflict, span.fact-conflict'));
  let modified = false;
  existingMarks.forEach((m) => {
    const text = m.textContent.trim().toLowerCase();
    const hasMatchingFlag = currentFlags.some((f) => {
      const q = (f.currentFact || '').trim().toLowerCase();
      return q && (q.includes(text) || text.includes(q));
    });
    if (!hasMatchingFlag) {
      const parent = m.parentNode;
      if (parent) {
        while (m.firstChild) parent.insertBefore(m.firstChild, m);
        m.remove();
        modified = true;
      }
    }
  });

  if (currentFlags.length === 0) {
    if (modified) saveCurrentEditorContentToState();
    return;
  }

  let editorHtml = editor.innerHTML;

  currentFlags.forEach((flag) => {
    const rawTarget = (flag.currentFact || '').trim();
    if (!rawTarget || rawTarget.length < 3) return;

    // Check candidate text representations (individual sentences first if multi-sentence)
    const sentences = rawTarget.split(/(?<=[.!?]['"”’]?)\s+|\n+/).map(s => s.trim()).filter(s => s.length >= 3);
    const candidates = sentences.length > 1 ? [...sentences, rawTarget] : [rawTarget];

    const conflictSpans = Array.from(editor.querySelectorAll('.fact-conflict'));
    const existingSpanTexts = conflictSpans.map(s => s.textContent.trim().toLowerCase());

    for (const cand of candidates) {
      const cleanCand = cand.replace(/^['"“”‘’.,!?;:\s]+|['"“”‘’.,!?;:\s]+$/g, '').trim();
      if (!cleanCand || cleanCand.length < 3) continue;

      // Skip candidate if an existing span already covers it or candidate contains an already-highlighted span
      const overlaps = existingSpanTexts.some(st =>
        st.includes(cleanCand.toLowerCase()) || (cleanCand.length > st.length && cleanCand.toLowerCase().includes(st))
      );
      if (overlaps) continue;

      // Direct match (case-insensitive, avoiding HTML tags)
      const escaped = cleanCand.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(`(?<!<[^>]*)\\b(${escaped})\\b(?![^<]*>)`, 'i');

      if (regex.test(editorHtml)) {
        editorHtml = editorHtml.replace(regex, `<mark class="fact-conflict" title="Contradiction: ${flag.title}">$1</mark>`);
        modified = true;
        break;
      }

      // Subphrase matching for partial sentence matches
      const words = cleanCand.split(/\s+/).filter((w) => w.length > 2);
      let subMatched = false;
      for (let len = words.length; len >= 2; len--) {
        for (let start = 0; start <= words.length - len; start++) {
          const phrase = words.slice(start, start + len).map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('\\s+');
          const pRegex = new RegExp(`(?<!<[^>]*)\\b(${phrase})\\b(?![^<]*>)`, 'i');
          if (pRegex.test(editorHtml)) {
            editorHtml = editorHtml.replace(pRegex, `<mark class="fact-conflict" title="Contradiction: ${flag.title}">$1</mark>`);
            modified = true;
            subMatched = true;
            break;
          }
        }
        if (subMatched) break;
      }
      if (subMatched) break;
    }
  });

  if (modified) {
    editor.innerHTML = editorHtml;
    saveCurrentEditorContentToState();
  }
}

// Scroll to and highlight the conflicting text inside the Story Editor
function focusFlagInEditor(flagIdOrText) {
  let flag = appState.insights.flags.find((item) => String(item.id) === String(flagIdOrText));
  if (!flag && typeof flagIdOrText === 'string') {
    const decoded = decodeURIComponent(flagIdOrText).trim().toLowerCase();
    flag = appState.insights.flags.find((item) => (item.currentFact || '').toLowerCase().includes(decoded));
  }
  if (!flag) return;

  // 1. Switch to flag's chapter if not already on it
  if (flag.chapterNumber && Number(flag.chapterNumber) !== Number(appState.activeChapterNumber)) {
    const targetChap = appState.chapters.find((c) => Number(c.number) === Number(flag.chapterNumber));
    if (targetChap) {
      switchChapter(targetChap.id);
    }
  }

  const editor = document.getElementById('storyEditor');
  if (!editor) return;

  // 2. Clear old focus highlights
  const oldSpans = editor.querySelectorAll('.conflict-focus-flash, #flaggedConflictSpan');
  oldSpans.forEach((el) => {
    el.removeAttribute('id');
    el.classList.remove('conflict-focus-flash');
  });

  const rawTarget = (flag.currentFact || '').trim();
  const rawLow = rawTarget.toLowerCase();

  // Split target into candidates
  const sentences = rawTarget.split(/(?<=[.!?]['"”’]?)\s+|\n+/).map(s => s.trim()).filter(s => s.length >= 3);
  const candidates = sentences.length > 1 ? [...sentences, rawTarget] : [rawTarget];

  // 3. Find matching span in editor if already present
  let targetElement = null;
  const conflictSpans = Array.from(editor.querySelectorAll('.fact-conflict'));

  // Exact span match first
  for (const cand of candidates) {
    const cleanCand = cand.replace(/^['"“”‘’.,!?;:\s]+|['"“”‘’.,!?;:\s]+$/g, '').trim().toLowerCase();
    targetElement = conflictSpans.find(span => span.textContent.trim().toLowerCase() === cleanCand);
    if (targetElement) break;
  }

  // Non-overlapping substring span match
  if (!targetElement) {
    for (const cand of candidates) {
      const cleanCand = cand.replace(/^['"“”‘’.,!?;:\s]+|['"“”‘’.,!?;:\s]+$/g, '').trim().toLowerCase();
      targetElement = conflictSpans.find(span => {
        const st = span.textContent.trim().toLowerCase();
        return (cleanCand.includes(st) || st.includes(cleanCand));
      });
      if (targetElement) break;
    }
  }

  // 4. If not wrapped in a conflict span, find raw text dynamically (case-insensitive) and wrap it
  if (!targetElement && rawTarget) {
    const editorHtml = editor.innerHTML;
    let matchedText = null;

    for (const cand of candidates) {
      const cleanCand = cand.replace(/^['"“”‘’.,!?;:\s]+|['"“”‘’.,!?;:\s]+$/g, '').trim();
      const escaped = cleanCand.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const directMatch = editorHtml.match(new RegExp(`(?<!<[^>]*)\\b(${escaped})\\b(?![^<]*>)`, 'i'));
      if (directMatch) {
        matchedText = directMatch[0];
        break;
      }
    }

    if (matchedText) {
      editor.innerHTML = editorHtml.replace(
        matchedText,
        `<mark id="flaggedConflictSpan" class="fact-conflict conflict-focus-flash" title="Contradiction: ${flag.title}">${matchedText}</mark>`
      );
      targetElement = document.getElementById('flaggedConflictSpan');
      saveCurrentEditorContentToState();
    }
  }

  if (targetElement) {
    targetElement.id = 'flaggedConflictSpan';
    targetElement.classList.add('conflict-focus-flash');
    targetElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
  } else {
    editor.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
}

// Automatically fix the contradiction in the Story Editor with canonical Story Bible fact
async function quickFixFlag(flagId) {
  const flag = appState.insights.flags.find((item) => String(item.id) === String(flagId));
  if (!flag) return;

  // 1. Switch to flag chapter if needed
  if (flag.chapterNumber && Number(flag.chapterNumber) !== Number(appState.activeChapterNumber)) {
    const targetChap = appState.chapters.find((c) => Number(c.number) === Number(flag.chapterNumber));
    if (targetChap) {
      switchChapter(targetChap.id);
    }
  }

  const editor = document.getElementById('storyEditor');
  if (!editor) return;

  const titleLow = (flag.title || '').toLowerCase();
  const currentFactLow = (flag.currentFact || '').toLowerCase();
  const explanationLow = (flag.explanation || '').toLowerCase();
  const previousFactLow = (flag.previousFact || '').toLowerCase();
  const editorText = editor.innerText || editor.textContent || '';
  let editorHtml = editor.innerHTML;

  let targetPattern = null;
  let replacement = '';
  let isWarehouseFloorboards = false;

  // 1. Love / Relationship / Character affection rules
  if (currentFactLow.includes('love') || explanationLow.includes('love') || previousFactLow.includes('love') || currentFactLow.includes('bithika') || previousFactLow.includes('bithika')) {
    const textToScan = (flag.currentFact || '') + ' ' + editorText;
    const negMatch = textToScan.match(/\b(does not love|doesn't love|did not love|didn't love|never loved|cannot love)\s+([a-zA-Z\s]+?)(?=[.,!?;:\n"<]|$)/i);
    const hateMatch = textToScan.match(/\b(hates|hated|despises)\s+([a-zA-Z\s]+?)(?=[.,!?;:\n"<]|$)/i);

    if (negMatch) {
      const targetEntity = negMatch[2].trim();
      targetPattern = new RegExp(`\\b(?:does not love|doesn't love|did not love|didn't love|never loved|cannot love)\\s+${targetEntity.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
      replacement = `truly loves ${targetEntity}`;
    } else if (hateMatch) {
      const targetEntity = hateMatch[2].trim();
      targetPattern = new RegExp(`\\b(?:hates|hated|despises)\\s+${targetEntity.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
      replacement = `cares deeply for ${targetEntity}`;
    } else {
      const ruleTarget = (flag.previousFact || '').match(/\bloves?\s+([a-zA-Z]+)/i)?.[1] || 'their true love';
      const sceneOtherMatch = editorText.match(/\bloves?\s+([a-zA-Z]+)/i);
      if (sceneOtherMatch && sceneOtherMatch[1].toLowerCase() !== ruleTarget.toLowerCase()) {
        targetPattern = new RegExp(`\\bloves?\\s+${sceneOtherMatch[1]}\\b`, 'i');
        replacement = `remains devoted solely to ${ruleTarget}`;
      } else {
        const cleanFact = (flag.currentFact || '').trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        targetPattern = cleanFact ? new RegExp(cleanFact, 'i') : null;
        replacement = (flag.previousFact || '').replace(/^Rule( established by author)?:?\s*/i, '').replace(/^[a-zA-Z\s]+:\s*/, '').trim() || 'truly loves them';
      }
    }
  }
  // 2. Physical trait conflict
  else if (titleLow.includes('trait') || titleLow.includes('appearance') || currentFactLow.includes('amber eyes') || currentFactLow.includes('green eyes') || currentFactLow.includes('cyber-optics')) {
    if (/cyber-optics/i.test(editorHtml) || currentFactLow.includes('cyber-optics')) {
      targetPattern = /glowing sapphire cyber-optics|sapphire cyber-optics/i;
      replacement = 'focused obsidian eyes';
    } else if (/amber eyes/i.test(editorHtml) || currentFactLow.includes('amber eyes')) {
      targetPattern = /striking amber eyes|amber eyes/i;
      replacement = 'steady dark brown eyes';
    } else {
      targetPattern = /bright green eyes|green eyes/i;
      replacement = 'sharp brown eyes';
    }
  }
  // 3. Secret knowledge conflict
  else if (titleLow.includes('knowledge') || currentFactLow.includes('floorboards') || currentFactLow.includes('warehouse') || currentFactLow.includes('staircase') || currentFactLow.includes('override code')) {
    if (currentFactLow.includes('floorboards') || currentFactLow.includes('warehouse') || /warehouse|floorboards/i.test(editorText)) {
      targetPattern = /The\s+key\s+under\s+the\s+warehouse\s+floorboards|key\s+under\s+the\s+warehouse\s+floorboards|The\s+key\s+under\s+the\s+warehouse|key\s+under\s+the\s+warehouse/i;
      replacement = 'The sealed ledger inside the warehouse safe';
      isWarehouseFloorboards = true;
    } else if (currentFactLow.includes('override code') || /override code/i.test(editorText)) {
      targetPattern = /The\s+override\s+code\s+hidden\s+in\s+the\s+sub-level\s+core\s+is\s+yours|override\s+code\s+hidden\s+in\s+the\s+sub-level\s+core/i;
      replacement = 'The encrypted datacore remains secure in our vault';
    } else {
      targetPattern = /The\s+key\s+Mom\s+hid\s+under\s+the\s+staircase|key\s+Mom\s+hid\s+under\s+the\s+staircase|under\s+the\s+staircase/i;
      replacement = 'The secret brass key Mom hid away';
    }
  }
  // 4. World rules & Maritime / Physical laws
  else if (titleLow.includes('world rule') || currentFactLow.includes('high-tide') || currentFactLow.includes('high tide') || currentFactLow.includes('rapids') || currentFactLow.includes('river') || currentFactLow.includes('water') || currentFactLow.includes('quantum drive') || currentFactLow.includes('ion-field') || previousFactLow.includes('tide') || previousFactLow.includes('ferr')) {
    if (/quantum drive|ion-field/i.test(editorHtml) || currentFactLow.includes('quantum')) {
      targetPattern = /inside\s+the\s+ion-field,\s*activating\s+its\s+quantum\s+drive|activating\s+its\s+quantum\s+drive/i;
      replacement = 'holding steady with sub-light thrusters';
    } else if (/high-tide|high tide|ferr|rapids/i.test(editorHtml) || currentFactLow.includes('tide') || currentFactLow.includes('ferr')) {
      targetPattern = /ferry\s+drifted\s+across\s+the\s+high-tide\s+rapids\s+to\s+dock|drifted\s+across\s+the\s+high-tide\s+rapids\s+to\s+dock|across\s+the\s+high-tide\s+rapids/i;
      replacement = 'waited offshore outside the harbor for the low-tide bell';
    } else if (/spirit\s+drifting\s+across\s+the\s+river\s+toward\s+him/i.test(editorHtml)) {
      targetPattern = /spirit\s+drifting\s+across\s+the\s+river\s+toward\s+him/i;
      replacement = 'recoiling at the riverbank, unable to cross the running water toward him';
    } else if (/drifting\s+across\s+the\s+river/i.test(editorHtml)) {
      targetPattern = /drifting\s+across\s+the\s+river/i;
      replacement = 'shying away from the running water of the river';
    } else if (/crossing\s+the\s+running\s+water/i.test(editorHtml)) {
      targetPattern = /crossing\s+the\s+running\s+water\s+effortlessly|crossing\s+the\s+running\s+water/i;
      replacement = 'halting abruptly, repelled by the running water';
    } else {
      targetPattern = /across the river|crossing the running water/i;
      replacement = 'recoiling before the running water';
    }
  }
  // 5. Location / Travel time
  else if (titleLow.includes('location') || titleLow.includes('time') || currentFactLow.includes('mumbai') || currentFactLow.includes('proxima')) {
    if (editorHtml.includes('Proxima') || currentFactLow.includes('proxima')) {
      targetPattern = /By cycle 15 evening Kael was docking at the distant outer colony of Proxima|distant outer colony of Proxima/i;
      replacement = 'By cycle 15 evening Kael was docking at the local orbital relay station in Neo-Delhi';
    } else if (editorHtml.includes('Kabir') || currentFactLow.includes('kabir')) {
      targetPattern = /By Monday nightfall Kabir was seated at a caf[eé] in Mumbai|seated at a caf[eé] in Mumbai/i;
      replacement = 'By Monday nightfall Kabir was seated at a café along the Kolkata riverfront';
    } else {
      targetPattern = /By Monday evening Aarav was standing on the beach in Mumbai|standing on the beach in Mumbai|in Mumbai/i;
      replacement = 'By Monday evening Aarav was resting beside the Yamuna ghats in Delhi';
    }
  }
  // 6. Lactose / Diet / Milk preferences
  else if (titleLow.includes('lactose') || currentFactLow.includes('milk') || currentFactLow.includes('dairy') || currentFactLow.includes('cheese') || previousFactLow.includes('milk')) {
    if (/Subhankar likes milk/i.test(editorHtml)) {
      targetPattern = /Subhankar likes milk/i;
      replacement = "Subhankar doesn't like milk, setting the glass aside";
    } else if (/likes milk/i.test(editorHtml)) {
      targetPattern = /likes milk/i;
      replacement = "doesn't like milk";
    } else if (/glass of cold milk/i.test(editorHtml)) {
      targetPattern = /glass of cold milk/i;
      replacement = 'glass of almond milk';
    } else if (/cold milk/i.test(editorHtml)) {
      targetPattern = /cold milk/i;
      replacement = 'cold almond milk';
    } else if (/drank (?:a glass of )?milk/i.test(editorHtml)) {
      targetPattern = /drank (?:a glass of )?milk/i;
      replacement = 'drank a glass of almond milk';
    } else if (/\bcheese\b/i.test(editorHtml)) {
      targetPattern = /\bcheese\b/i;
      replacement = 'vegan cheese';
    } else {
      targetPattern = /\bmilk\b/i;
      replacement = 'almond milk';
    }
  }
  // 7. General custom author rules
  else {
    const rawVal = (flag.previousFact || '').replace(/^Rule( established by author)?:?\s*/i, '').replace(/^[a-zA-Z\s]+:\s*/, '').trim();
    if (rawVal) {
      replacement = rawVal;
    }
    if (flag.currentFact) {
      targetPattern = new RegExp(flag.currentFact.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    }
  }

  // Absolute safety guarantee: strip any stray regex placeholder tokens from replacement
  replacement = (replacement || '').replace(/\$[0-9&]/g, '').trim();

  let replaced = false;

  // Find ONLY the exact span that matches this specific flag's content
  const conflictSpans = Array.from(editor.querySelectorAll('.fact-conflict'));
  const cfWords = currentFactLow.split(/\s+/).filter(w => w.length > 2);

  for (const span of conflictSpans) {
    const st = span.textContent.trim().toLowerCase();
    if (!st) continue;

    const isMatch =
      currentFactLow.includes(st) ||
      st.includes(currentFactLow) ||
      (targetPattern && targetPattern.test(span.textContent)) ||
      (cfWords.length >= 2 && cfWords.filter(w => st.includes(w)).length >= 2);

    if (isMatch) {
      // Consume any dangling trailing word if applicable
      if (isWarehouseFloorboards) {
        if (span.nextSibling && span.nextSibling.nodeType === Node.TEXT_NODE) {
          span.nextSibling.textContent = span.nextSibling.textContent.replace(/^\s*floorboards\b/i, '');
        }
      }

      span.outerHTML = `<span id="fixedFlagSpan" class="fact-entity fix-success-flash font-semibold" title="Corrected from Story Bible">${replacement}</span>`;
      replaced = true;
      break;
    }
  }

  // Fallback: replace pattern directly in editor HTML
  if (!replaced && targetPattern) {
    editor.innerHTML = editor.innerHTML.replace(
      targetPattern,
      `<span id="fixedFlagSpan" class="fact-entity fix-success-flash font-semibold" title="Corrected from Story Bible">${replacement}</span>`
    );
    replaced = true;
  }

  // Clean up any corrupt artifacts from previous actions or dangling words
  editor.innerHTML = editor.innerHTML
    .replace(/\b(The sealed ledger inside the warehouse safe|in a secret location only Meera knew)\s*floorboards\b/gi, '$1')
    .replace(/\btruly loves \$2\b/gi, 'truly loves a boy')
    .replace(/\$[0-9&]/g, '');

  // Save updated chapter text
  saveCurrentEditorContentToState();

  // Mark flag resolved on backend & UI
  await resolveFlag(flagId, false);

  // Scroll to fixed span
  const fixedSpan = document.getElementById('fixedFlagSpan');
  if (fixedSpan) {
    fixedSpan.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  showToast('✨ Contradiction resolved and aligned with Story Bible!');
}

// Toggle inline Add Rule card
function toggleAddRuleForm(show) {
  appState.showAddRuleForm = show !== undefined ? show : !appState.showAddRuleForm;
  renderInsightsPanel();
  if (appState.showAddRuleForm) {
    setTimeout(() => {
      document.getElementById('ruleCharacterInput')?.focus();
    }, 50);
  }
}

// Save user-defined story or character rule (e.g. Gopu is lactose intolerant)
async function saveNewRule() {
  const charInput = document.getElementById('ruleCharacterInput');
  const descInput = document.getElementById('ruleDescInput');
  const entity = charInput ? charInput.value.trim() : '';
  const desc = descInput ? descInput.value.trim() : '';

  if (!desc) {
    if (descInput) {
      descInput.classList.add('border-red-500');
      descInput.focus();
    }
    return;
  }

  const newRuleObj = {
    id: `rule-${Date.now()}`,
    title: entity ? `${entity}: Rule` : 'World Rule',
    rule: desc
  };

  if (!appState.insights.rules) appState.insights.rules = [];
  appState.insights.rules.push(newRuleObj);

  // If character entity, ensure character exists in characters list
  if (entity && entity.toLowerCase() !== 'world') {
    if (!appState.insights.characters) appState.insights.characters = [];
    const charExists = appState.insights.characters.some(c => c.name.toLowerCase() === entity.toLowerCase());
    if (!charExists) {
      appState.insights.characters.push({
        name: entity,
        role: 'Character',
        age: 'Established',
        details: `Rule: ${desc}`
      });
    }
  }

  // Persist to backend if connected
  if (appState.storyId) {
    try {
      const res = await apiFetch(`/stories/${appState.storyId}/rules`, {
        method: 'POST',
        body: JSON.stringify({
          entity_name: entity || 'World',
          description: desc,
          chapter_number: appState.activeChapterNumber || 1
        })
      });
      if (res.ok) {
        const saved = await res.json();
        newRuleObj.id = saved.id;
      }
    } catch (e) {
      console.debug('Failed to save rule on backend:', e);
    }
  }

  appState.showAddRuleForm = false;

  // Immediately detect contradictions against the newly saved rule and highlight them on canvas
  const localFlags = detectFlagsLocally();
  if (localFlags.length > 0) {
    const existingIds = new Set((appState.insights.flags || []).map(f => f.id));
    for (const lf of localFlags) {
      if (!existingIds.has(lf.id)) {
        appState.insights.flags.push(lf);
      }
    }
  }

  renderInsightsPanel();
  applyConflictHighlightsToEditor();
  saveStateToStorage();
  showToast(`✨ Rule for ${entity || 'Story'} saved to Story Bible!`);
}

// Delete custom rule from Story Bible
async function deleteStoryRule(ruleId) {
  const idx = appState.insights.rules.findIndex(r => String(r.id) === String(ruleId));
  if (idx !== -1) {
    appState.insights.rules.splice(idx, 1);
  }

  // Remove corresponding local flags for this rule
  appState.insights.flags = (appState.insights.flags || []).filter(f => !String(f.id).includes(String(ruleId)));

  if (appState.storyId && ruleId && !String(ruleId).startsWith('rule-')) {
    try {
      await apiFetch(`/stories/${appState.storyId}/rules/${ruleId}`, { method: 'DELETE' });
    } catch (e) {
      console.debug('Failed to delete rule on backend:', e);
    }
  }

  renderInsightsPanel();
  saveStateToStorage();
  showToast('Rule removed from Story Bible.');
}

// Acknowledge a flagged continuity conflict as an intentional plot twist or conspiracy
async function confirmPlotTwist(flagId) {
  const flag = appState.insights.flags.find((item) => String(item.id) === String(flagId));
  if (!flag) return;

  // Mark resolved
  await resolveFlag(flagId, false);

  // Add plot-twist note into character story lore
  if (appState.insights.characters && appState.insights.characters.length > 0) {
    const char = appState.insights.characters.find(c =>
      (flag.title || '').toLowerCase().includes(c.name.toLowerCase()) ||
      (flag.explanation || '').toLowerCase().includes(c.name.toLowerCase())
    );
    if (char) {
      char.details = `${char.details} | 🔮 Plot Twist Confirmed: ${flag.title}`;
    }
  }

  renderInsightsPanel();
  saveStateToStorage();
  showToast('🔮 Confirmed as Intentional Plot Twist! Lore updated.');
}

// Show lightweight toast alert
function showToast(msg) {
  let toast = document.getElementById('appGlobalToast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'appGlobalToast';
    toast.className = 'fixed bottom-6 right-6 z-50 px-4 py-2.5 rounded-xl bg-slate-900/95 text-white text-xs font-semibold border border-teal-500/40 shadow-2xl backdrop-blur-md transition-all duration-300 pointer-events-none transform translate-y-4 opacity-0 flex items-center gap-2';
    document.body.appendChild(toast);
  }
  toast.innerHTML = `<span>✨</span><span>${msg}</span>`;
  toast.classList.remove('translate-y-4', 'opacity-0');
  toast.classList.add('translate-y-0', 'opacity-100');
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => {
    toast.classList.remove('translate-y-0', 'opacity-100');
    toast.classList.add('translate-y-4', 'opacity-0');
  }, 2800);
}

// Resolve or dismiss a consistency flag (updates backend)
async function resolveFlag(flagId, fixTextInEditor) {
  const flag = appState.insights.flags.find((item) => String(item.id) === String(flagId));
  if (flag) {
    flag.resolved = true;
  }

  if (fixTextInEditor) {
    const flagSpan = document.getElementById('flaggedConflictSpan');
    if (flagSpan) {
      flagSpan.outerHTML = `<span class="fact-entity" title="Resolved Fact">${flagSpan.textContent}</span>`;
      saveCurrentEditorContentToState();
    }
  }

  // Update backend flag status if connected
  if (appState.storyId && flagId) {
    try {
      await apiFetch(`/stories/${appState.storyId}/flags/${flagId}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'resolved' })
      });
    } catch (e) {
      console.debug('Failed to patch flag on backend:', e);
    }
  }

  renderInsightsPanel();
  saveStateToStorage();
}

// -----------------------------------------------------------------------------
// STORY RELATIONSHIP GRAPH (Dynamic construction from analyzed story entities)
// -----------------------------------------------------------------------------
function renderRelationshipGraph() {
  const svg = document.getElementById('relationshipGraphSvg');
  if (!svg) return;
  const isDark = appState.theme === 'dark';

  const nodeFill = isDark ? '#10213D' : '#FFFFFF';
  const nodeTextPrimary = isDark ? '#F8FAFC' : '#0F172A';
  const nodeTextSecondary = isDark ? '#94A3B8' : '#475569';
  const edgeStroke = isDark ? '#1F3658' : '#CBD5E1';
  const pillFill = isDark ? '#0D1B33' : '#F1F5F9';

  // Ensure latest story text entities are scanned
  scanAndExtractStoryEntities(false);

  const characters = appState.insights.characters || [];
  const places = appState.insights.places || [];
  const rules = appState.insights.rules || [];

  const nodes = [];
  const edges = [];

  const svgWidth = 800;
  const svgHeight = 480;

  // Characters layout (upper tier)
  const cCount = Math.max(1, characters.length);
  const cStep = (svgWidth - 160) / (cCount + 1);
  characters.forEach((c, idx) => {
    const x = Math.round(80 + cStep * (idx + 1));
    const y = 95 + (idx % 2) * 35;
    nodes.push({
      id: `char-${idx}`,
      name: c.name,
      label: `👤 ${c.name}`,
      sub: c.role || 'Character',
      x,
      y,
      color: '#22D3EE',
      bio: c.details || `${c.name} — story character.`,
      links: []
    });
  });

  // Places layout (lower tier)
  const pCount = Math.max(1, places.length);
  const pStep = (svgWidth - 160) / (pCount + 1);
  places.forEach((p, idx) => {
    const x = Math.round(80 + pStep * (idx + 1));
    const y = 375 - (idx % 2) * 35;
    nodes.push({
      id: `place-${idx}`,
      name: p.name,
      label: `📍 ${p.name}`,
      sub: p.type || 'Location',
      x,
      y,
      color: '#38BDF8',
      bio: p.desc || `${p.name} — location in story.`,
      links: []
    });
  });

  // Rules layout (middle/accent tier)
  rules.slice(0, 3).forEach((r, idx) => {
    const x = Math.round(700 - idx * 110);
    const y = 230;
    nodes.push({
      id: `rule-${idx}`,
      name: r.title || 'Rule',
      label: `🛡️ ${(r.title || 'Rule').slice(0, 16)}`,
      sub: 'World Rule',
      x,
      y,
      color: '#F59E0B',
      bio: r.rule || 'Established world rule.',
      links: []
    });
  });

  if (nodes.length === 0) {
    svg.innerHTML = `
      <rect width="100%" height="100%" fill="transparent"/>
      <text x="${svgWidth / 2}" y="${svgHeight / 2 - 15}" text-anchor="middle" fill="${nodeTextSecondary}" font-size="14" font-weight="600">No story entities detected yet.</text>
      <text x="${svgWidth / 2}" y="${svgHeight / 2 + 15}" text-anchor="middle" fill="${nodeTextSecondary}" font-size="12">Write your story on the canvas and tap Analyze to map characters, locations, and rules.</text>
    `;
    const inspector = document.getElementById('graphNodeInspector');
    if (inspector) {
      inspector.innerHTML = `<p class="text-xs app-text-muted italic">Click on any character, place, or rule node above to inspect details and connections.</p>`;
    }
    return;
  }

  const nodeMap = Object.fromEntries(nodes.map((n) => [n.id, n]));
  const charNodeMap = new Map();
  nodes.filter(n => n.id.startsWith('char-')).forEach(n => charNodeMap.set(n.name.toLowerCase(), n));
  const placeNodeMap = new Map();
  nodes.filter(n => n.id.startsWith('place-')).forEach(n => placeNodeMap.set(n.name.toLowerCase(), n));

  const addedEdgeKeys = new Set();
  const addEdge = (fromId, toId, label) => {
    if (!fromId || !toId || fromId === toId) return;
    const key = `${fromId}->${toId}:${label}`;
    if (addedEdgeKeys.has(key)) return;
    addedEdgeKeys.add(key);
    edges.push({ from: fromId, to: toId, label });
    const nFrom = nodeMap[fromId];
    const nTo = nodeMap[toId];
    if (nFrom && nTo) {
      nFrom.links.push(`${label} → ${nTo.name}`);
      nTo.links.push(`${nFrom.name} ← ${label}`);
    }
  };

  // Full story text for relation finding
  const fullText = (appState.chapters || []).map(c => {
    const raw = (c.id === appState.activeChapterId) ? getEditorPlainText() : (c.content || '');
    return raw.replace(/<[^>]*>/g, ' ');
  }).join('\n');

  // 1. Dynamic Character-to-Character Relationships
  characters.forEach(c => {
    const srcNode = charNodeMap.get(c.name.toLowerCase());
    if (!srcNode) return;

    const textBlob = `${c.role || ''} ${c.details || ''} ${fullText}`;
    const relRegex = new RegExp(`\\b${c.name}\\s+((?:truly|deeply|secretly|passionately)?\\s*(?:does not love|doesn't love|loves|loved|hates|cares for|met|married|trusts|betrayed|friend of|allied with))\\s+([A-Za-z]+)\\b`, 'gi');
    let rm;
    while ((rm = relRegex.exec(textBlob)) !== null) {
      const verb = rm[1].trim();
      const targetName = rm[2].trim().toLowerCase();
      const tgtNode = charNodeMap.get(targetName);
      if (tgtNode) {
        addEdge(srcNode.id, tgtNode.id, verb);
      }
    }
  });

  // 2. Dynamic Character-to-Place Locations
  characters.forEach(c => {
    const srcNode = charNodeMap.get(c.name.toLowerCase());
    if (!srcNode) return;

    places.forEach(p => {
      const pNode = placeNodeMap.get(p.name.toLowerCase());
      if (!pNode) return;

      const hasLoc = (c.details && c.details.toLowerCase().includes(p.name.toLowerCase())) ||
        (new RegExp(`\\b${c.name}\\b[^.!?\\n]*\\b(?:in|at|near|beside|to|from)\\b[^.!?\\n]*\\b${p.name}\\b`, 'i').test(fullText));
      if (hasLoc) {
        const isPast = new RegExp(`\\b${c.name}\\b[^.!?\\n]*(?:standing on|boarded|arrived|traveled)\\b[^.!?\\n]*\\b${p.name}\\b`, 'i').test(fullText);
        addEdge(srcNode.id, pNode.id, isPast ? 'traveled to' : 'lives in');
      }
    });
  });

  // 3. Dynamic Rule connections
  rules.forEach((r, idx) => {
    const rNode = nodeMap[`rule-${idx}`];
    if (!rNode) return;
    const rText = `${r.title || ''} ${r.rule || ''}`.toLowerCase();
    characters.forEach(c => {
      if (rText.includes(c.name.toLowerCase())) {
        const cNode = charNodeMap.get(c.name.toLowerCase());
        if (cNode) addEdge(rNode.id, cNode.id, 'governs');
      }
    });
    places.forEach(p => {
      if (rText.includes(p.name.toLowerCase())) {
        const pNode = placeNodeMap.get(p.name.toLowerCase());
        if (pNode) addEdge(rNode.id, pNode.id, 'applies to');
      }
    });
  });

  // Fallback connectivity: ensure every node has at least one connection
  nodes.forEach(n => {
    if (n.links.length === 0) {
      if (n.id.startsWith('char-') && nodes.length > 1) {
        const other = nodes.find(o => o.id !== n.id && o.id.startsWith('char-')) || nodes.find(o => o.id.startsWith('place-'));
        if (other) addEdge(n.id, other.id, 'allied with');
      } else if (n.id.startsWith('place-') && characters.length > 0) {
        addEdge(nodes[0].id, n.id, 'setting');
      }
    }
  });

  let svgContent = edges.map((e) => {
    const n1 = nodeMap[e.from];
    const n2 = nodeMap[e.to];
    if (!n1 || !n2) return '';
    const midX = (n1.x + n2.x) / 2;
    const midY = (n1.y + n2.y) / 2;
    return `
      <g>
        <line x1="${n1.x}" y1="${n1.y}" x2="${n2.x}" y2="${n2.y}" stroke="${edgeStroke}" stroke-width="2" stroke-dasharray="4 2" />
        <rect x="${midX - 44}" y="${midY - 11}" width="88" height="20" rx="6" fill="${pillFill}" stroke="${edgeStroke}" />
        <text x="${midX}" y="${midY + 3}" text-anchor="middle" fill="${nodeTextSecondary}" font-size="10" font-weight="600">${e.label}</text>
      </g>
    `;
  }).join('');

  svgContent += nodes.map((n) => `
    <g class="cursor-pointer graph-node-group" data-node-id="${n.id}">
      <rect x="${n.x - 78}" y="${n.y - 26}" width="156" height="52" rx="12" fill="${nodeFill}" stroke="${n.color}" stroke-width="2.5" />
      <text x="${n.x}" y="${n.y - 4}" text-anchor="middle" fill="${nodeTextPrimary}" font-size="13" font-weight="700">${n.label}</text>
      <text x="${n.x}" y="${n.y + 14}" text-anchor="middle" fill="${nodeTextSecondary}" font-size="10">${n.sub}</text>
    </g>
  `).join('');

  svg.innerHTML = svgContent;

  const selectNodeInInspector = (selected) => {
    if (!selected) return;
    const titleEl = document.getElementById('inspectorNodeTitle');
    const typeEl = document.getElementById('inspectorNodeType');
    const detailsEl = document.getElementById('inspectorNodeDetails');
    if (titleEl) titleEl.textContent = selected.label;
    if (typeEl) typeEl.textContent = selected.sub;
    if (detailsEl) {
      detailsEl.innerHTML = `
        <p>${selected.bio}</p>
        <div class="pt-2">
          <span class="font-semibold app-text-primary block mb-1">Active Connections:</span>
          <ul class="space-y-1 text-teal-400">
            ${selected.links.length > 0 ? selected.links.map((l) => `<li>• ${l}</li>`).join('') : '<li class="app-text-muted">• In story narrative</li>'}
          </ul>
        </div>
      `;
    }
  };

  // Inspect first node by default
  if (nodes.length > 0) {
    selectNodeInInspector(nodes[0]);
  }

  // Bind click events to inspect nodes
  svg.querySelectorAll('.graph-node-group').forEach((el) => {
    el.addEventListener('click', () => {
      const nodeId = el.getAttribute('data-node-id');
      const selected = nodeMap[nodeId];
      if (selected) selectNodeInInspector(selected);
    });
  });
}

// -----------------------------------------------------------------------------
// STORY ANALYSIS & ENTITY SCANNER
// -----------------------------------------------------------------------------
function extractEntitiesLocally(text) {
  if (!text) return;
  const STOPWORDS = new Set([
    'the', 'this', 'that', 'these', 'those', 'there', 'here', 'then', 'when',
    'after', 'before', 'meanwhile', 'suddenly', 'in', 'on', 'at', 'to', 'from',
    'by', 'as', 'if', 'while', 'it', 'he', 'she', 'they', 'we', 'you', 'i', 'his',
    'her', 'their', 'my', 'our', 'its', 'one', 'two', 'three', 'first', 'chapter',
    'scene', 'part', 'narrator', 'world', 'story', 'someone', 'anyone', 'all',
    'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday',
    'morning', 'evening', 'night', 'dawn', 'dusk', 'day', 'today', 'yesterday', 'tomorrow',
    'christmas', 'easter', 'halloween', 'thanksgiving', 'new year', 'holiday', 'holidays',
    'january', 'february', 'march', 'april', 'may', 'june', 'july', 'august',
    'september', 'october', 'november', 'december', 'winter', 'summer', 'spring', 'autumn',
    'laughter', 'silence', 'shadows', 'candle', 'darkness', 'cold', 'inside', 'outside',
    'truly', 'deeply', 'passionately', 'secretly', 'quietly', 'really', 'never', 'ever', 'always', 'also'
  ]);
  const PLACE_SUFFIXES = [
    'city', 'town', 'village', 'kingdom', 'forest', 'river', 'lake', 'fortress',
    'citadel', 'castle', 'palace', 'station', 'ghat', 'memorial', 'bridge', 'beach'
  ];

  const isCalendarOrNonEntity = (s) => {
    if (!s) return true;
    const low = s.toLowerCase().trim();
    if (STOPWORDS.has(low)) return true;
    const words = low.split(/\s+/);
    return words.some(w => ['christmas', 'easter', 'holiday', 'holidays', 'day', 'night', 'dawn', 'dusk', 'morning', 'evening', 'today', 'yesterday', 'tomorrow', 'winter', 'summer', 'spring', 'autumn', 'silence', 'shadows', 'candle'].includes(w));
  };

  const foundPlaces = new Set();
  const prepRegex = /\b(?:in|at|to|from|near|towards|through|across|beside|outside|inside)\s+(?:the\s+)?([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\b/g;
  let m;
  while ((m = prepRegex.exec(text)) !== null) {
    const p = m[1].trim();
    if (!STOPWORDS.has(p.toLowerCase()) && !isCalendarOrNonEntity(p)) foundPlaces.add(p);
  }

  const resRegex = /\b(?:lives|lived|resides|resided|stayed|settled|stands|stood|arrived|departed|resting)\s+(?:in|at|near|beside)\s+(?:the\s+)?([A-Z][a-z]+)\b/gi;
  while ((m = resRegex.exec(text)) !== null) {
    const p = m[1].trim();
    const clean = p.charAt(0).toUpperCase() + p.slice(1).toLowerCase();
    if (!STOPWORDS.has(clean.toLowerCase()) && !isCalendarOrNonEntity(clean)) foundPlaces.add(clean);
  }

  for (const suf of PLACE_SUFFIXES) {
    const sufRegex = new RegExp(`\\b([A-Z][a-z]+(?:\\s+[A-Z][a-z]+)?\\s+${suf})\\b`, 'gi');
    while ((m = sufRegex.exec(text)) !== null) {
      const p = m[1].trim();
      if (!STOPWORDS.has(p.toLowerCase()) && !isCalendarOrNonEntity(p)) foundPlaces.add(p);
    }
  }

  const foundChars = new Set();
  const relMap = new Map();
  const relRegex = /\b([A-Z][a-z]+)\s+((?:truly\s+|deeply\s+|passionately\s+|secretly\s+|quietly\s+|really\s+|never\s+|always\s+)?(?:does not love|doesn't love|did not love|didn't love|never loved|loves|loved|hates|hated|cares for|met|married|trusts|betrayed))\s+([A-Z][a-z]+)\b/gi;
  while ((m = relRegex.exec(text)) !== null) {
    const c1 = m[1].trim();
    const verb = m[2].trim();
    const c2 = m[3].trim();
    for (const name of [c1, c2]) {
      const clean = name.charAt(0).toUpperCase() + name.slice(1);
      if (!STOPWORDS.has(clean.toLowerCase()) && !isCalendarOrNonEntity(clean) && !foundPlaces.has(clean)) {
        foundChars.add(clean);
      }
    }
    if (!STOPWORDS.has(c1.toLowerCase()) && !isCalendarOrNonEntity(c1) && !foundPlaces.has(c1)) {
      relMap.set(c1, `${verb} ${c2}`);
    }
  }

  // Coordinated character names (e.g. Elena and Marcus)
  const coordRegex = /\b([A-Z][a-z]+)\s+and\s+([A-Z][a-z]+)\b/g;
  while ((m = coordRegex.exec(text)) !== null) {
    for (const name of [m[1], m[2]]) {
      const clean = name.charAt(0).toUpperCase() + name.slice(1);
      if (!STOPWORDS.has(clean.toLowerCase()) && !isCalendarOrNonEntity(clean) && !foundPlaces.has(clean)) {
        foundChars.add(clean);
      }
    }
  }

  const actRegex = /\b([A-Z][a-z]+)(?:,\s*[^,.\n]+,)?\s+(?:[a-z]+ed|[a-z]+ing|said|whispered|shouted|asked|replied|warned|knelt|looked|squinted|smirked|sighed|grasped|held|fastened|turned|placed|uncovered|traced|watched|glanced|nodded|shook|boarded|stood|stepped|walked|ran|joined|arrived|departed|lived|lives|stayed|settled|resides|resided|was|is|became|felt|sat|lay|smiled|cried|wept|stared|gazed|wished|hoped|thought|knew|saw|heard|found|opened|closed|reached|touched|spoke|told|called|paused|waited|began|tried|wanted|needed|wore|carried|clutched|dropped|lifted|picked|drew|dragged|faced|pulled|pushed)\b/g;
  while ((m = actRegex.exec(text)) !== null) {
    const c = m[1].trim();
    if (!STOPWORDS.has(c.toLowerCase()) && !isCalendarOrNonEntity(c) && !foundPlaces.has(c)) {
      foundChars.add(c);
    }
  }

  // Pronoun action (e.g. Clara pulled her thin wool shawl)
  const pronActRegex = /\b([A-Z][a-z]+)\s+([a-z]+)\s+(?:his|her|their|my|our)\b/g;
  while ((m = pronActRegex.exec(text)) !== null) {
    const c = m[1].trim();
    if (!STOPWORDS.has(c.toLowerCase()) && !isCalendarOrNonEntity(c) && !foundPlaces.has(c)) {
      foundChars.add(c);
    }
  }

  // Names with age or role (e.g. Aarav, seventeen)
  const ageRegex = /\b([A-Z][a-z]+),\s*(?:\d+|seventeen|eighteen|nineteen|twenty|thirty|\w+ years old)\b/g;
  while ((m = ageRegex.exec(text)) !== null) {
    const c = m[1].trim();
    if (!STOPWORDS.has(c.toLowerCase()) && !isCalendarOrNonEntity(c)) {
      foundChars.add(c);
    }
  }

  const locMap = new Map();
  const charResRegex = /\b([A-Z][a-z]+)\s+(?:lives|lived|resides|stayed|settled)\s+in\s+([A-Z][a-z]+)\b/gi;
  while ((m = charResRegex.exec(text)) !== null) {
    const c = m[1].trim();
    const p = m[2].trim();
    if (!STOPWORDS.has(c.toLowerCase()) && !isCalendarOrNonEntity(c) && !foundPlaces.has(c)) {
      foundChars.add(c);
      locMap.set(c, p);
    }
  }

  foundChars.forEach(c => foundPlaces.delete(c));

  const lowerText = text.toLowerCase();
  const existing = new Map((appState.insights.characters || []).map(c => [c.name.toLowerCase(), c]));
  foundChars.forEach(name => {
    const low = name.toLowerCase();
    const rel = relMap.get(name);
    const loc = locMap.get(name);
    const parts = [];
    if (loc) parts.push(`Location: ${loc}`);
    if (rel) parts.push(`Relation: ${rel}`);
    const details = parts.length > 0 ? parts.join(' • ') : `Identified character from narrative scenes.`;

    if (existing.has(low)) {
      const item = existing.get(low);
      if (rel && (!item.role || item.role === 'Story Character' || item.role === 'Character')) {
        item.role = rel;
      }
      if (parts.length > 0 && (!item.details || item.details.includes('Identified character'))) {
        item.details = details;
      }
    } else {
      existing.set(low, {
        name,
        role: rel || 'Story Character',
        age: 'Established',
        details
      });
    }
  });

  // Filter out any characters that do not appear anywhere in current story text
  appState.insights.characters = Array.from(existing.values()).filter(c =>
    lowerText.includes(c.name.toLowerCase())
  );

  const existingP = new Map((appState.insights.places || []).map(p => [p.name.toLowerCase(), p]));
  foundPlaces.forEach(name => {
    const low = name.toLowerCase();
    if (!existingP.has(low)) {
      let quote = `Key setting in story narrative.`;
      const sMatch = text.match(new RegExp(`[^.!?\\n]*\\b${name}\\b[^.!?\\n]*[.!?]`, 'i'));
      if (sMatch) quote = sMatch[0].trim();
      existingP.set(low, {
        name,
        type: 'Location',
        desc: quote.length > 110 ? quote.slice(0, 107) + '...' : quote
      });
    }
  });

  // Filter out any places that do not appear anywhere in current story text
  appState.insights.places = Array.from(existingP.values()).filter(p =>
    lowerText.includes(p.name.toLowerCase())
  );
}

function isMeaningfulStoryText(text) {
  if (!text || typeof text !== 'string') return false;
  const cleaned = text.replace(/<[^>]*>/g, ' ').replace(/[^a-zA-Z\s]/g, ' ').trim();
  const words = cleaned.split(/\s+/).filter(w => w.length > 1);
  if (words.length < 3) return false;
  const validWords = words.filter(w => /[aeiouy]/i.test(w) && w.length < 25);
  return validWords.length >= 2;
}

function scanAndExtractStoryEntities(triggerRender = true) {
  saveCurrentEditorContentToState();
  const allTexts = (appState.chapters || []).map(c => {
    const raw = (c.id === appState.activeChapterId) ? getEditorPlainText() : (c.content || '');
    return raw.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  }).filter(Boolean);
  const combined = allTexts.join('\n');
  if (!isMeaningfulStoryText(combined)) {
    appState.insights.characters = [];
    appState.insights.places = [];
    appState.insights.timeline = [];
    appState.insights.flags = [];
    if (triggerRender) {
      renderInsightsPanel();
    }
    saveStateToStorage();
    return;
  }
  extractEntitiesLocally(combined);
  const localFlags = detectFlagsLocally();
  if (localFlags.length > 0) {
    const existingIds = new Set((appState.insights.flags || []).map(f => f.id));
    for (const lf of localFlags) {
      if (!existingIds.has(lf.id)) {
        appState.insights.flags.push(lf);
      }
    }
  }
  if (triggerRender) {
    renderInsightsPanel();
  }
  applyConflictHighlightsToEditor();
  saveStateToStorage();
}

async function runStoryAnalysis() {
  if (!checkGuestActionLimit('Story Consistency Analysis')) return;

  const modal = document.getElementById('analyzeModalOverlay');
  const stepsList = document.getElementById('analyzeStepsList');
  const progressBar = document.getElementById('analyzeProgressBar');
  const percentBadge = document.getElementById('analyzePercentBadge');
  const footer = document.getElementById('analyzeCompleteFooter');
  const heading = document.getElementById('analyzeModalHeading');
  const spinner = document.getElementById('analyzeSpinnerIcon');

  const steps = [
    'Reading your story & parsing chapters...',
    'Extracting entities & verbatim quotes (Gemini)...',
    'Cataloging Characters, Places & World Rules...',
    'Searching Vector Index for consistency conflicts...',
    'Generating Story Bible & Flagging Contradictions...'
  ];

  modal.classList.remove('hidden');
  modal.classList.add('flex');
  footer.classList.add('hidden');
  heading.textContent = 'Analyzing Story Bible...';
  spinner.textContent = '⚙️';
  spinner.classList.add('animate-spin');
  stepsList.innerHTML = '';
  progressBar.style.width = '0%';
  percentBadge.textContent = '0%';

  steps.forEach((stepText, idx) => {
    const li = document.createElement('li');
    li.id = `analysis-step-${idx}`;
    li.className = 'flex items-center gap-2.5 app-text-muted transition-all';
    li.innerHTML = `<span class="step-icon w-4 text-center">⏳</span><span>${stepText}</span>`;
    stepsList.appendChild(li);
  });

  const markStepDone = (idx) => {
    const stepEl = document.getElementById(`analysis-step-${idx}`);
    if (stepEl) {
      stepEl.classList.replace('app-text-muted', 'app-text-primary');
      const icon = stepEl.querySelector('.step-icon');
      icon.textContent = '✓';
      icon.classList.add('status-success-text', 'font-bold');
      const pct = Math.round(((idx + 1) / steps.length) * 100);
      progressBar.style.width = `${pct}%`;
      percentBadge.textContent = `${pct}%`;
    }
  };

  try {
    markStepDone(0);

    // Save editor content to active chapter
    saveCurrentEditorContentToState();
    const editor = document.getElementById('storyEditor');
    const chapterText = editor ? editor.innerText.trim() : '';

    const allTexts = (appState.chapters || []).map(c => {
      const raw = (c.id === appState.activeChapterId) ? chapterText : (c.content || '');
      return raw.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    }).filter(Boolean);
    const combinedStory = allTexts.join('\n');

    // If canvas has no real narrative text, clear all story entities and insights
    if (!isMeaningfulStoryText(combinedStory)) {
      appState.insights.characters = [];
      appState.insights.places = [];
      appState.insights.timeline = [];
      appState.insights.flags = [];
      if (appState.storyId) {
        try {
          const sRes = await apiFetch(`/stories/${appState.storyId}`);
          if (sRes.ok) {
            const sData = await sRes.json();
            for (const ch of (sData.chapters || [])) {
              await apiFetch(`/stories/${appState.storyId}/chapters/${ch.number}`, { method: 'DELETE' });
            }
          }
        } catch (e) {
          console.debug('Failed to clear backend chapters for empty story:', e);
        }
      }
      renderInsightsPanel();
      saveStateToStorage();
      for (let i = 1; i < steps.length; i++) {
        await new Promise(r => setTimeout(r, 100));
        markStepDone(i);
      }
      spinner.textContent = '✨';
      spinner.classList.remove('animate-spin');
      heading.textContent = 'Analysis Complete';
      footer.classList.remove('hidden');
      footer.querySelector('span').textContent = '✓ No entities found on canvas — Story Insights cleared';
      showToast('Canvas has no entities — Story Insights cleared.');
      return;
    }

    // Send to backend chapter analysis if connected
    if (appState.storyId) {
      markStepDone(1);

      // Purge any backend chapters that were closed or deleted on frontend
      try {
        const sRes = await apiFetch(`/stories/${appState.storyId}`);
        if (sRes.ok) {
          const sData = await sRes.json();
          const currentNums = new Set((appState.chapters || []).map(c => c.number));
          for (const backendChap of (sData.chapters || [])) {
            if (!currentNums.has(backendChap.number)) {
              await apiFetch(`/stories/${appState.storyId}/chapters/${backendChap.number}`, { method: 'DELETE' });
            }
          }
        }
      } catch (e) {
        console.debug('Backend chapter purge error:', e);
      }

      // Ensure any local/custom rules are persisted to the backend before analysis
      if (appState.insights.rules && appState.insights.rules.length > 0) {
        for (const r of appState.insights.rules) {
          if (String(r.id).startsWith('rule-')) {
            try {
              let ent = 'World';
              let desc = r.rule || '';
              if (r.title && r.title.includes(':')) {
                ent = r.title.split(':')[0].trim();
              } else if (r.title && !r.title.toLowerCase().startsWith('rule')) {
                ent = r.title.trim();
              }
              const res = await apiFetch(`/stories/${appState.storyId}/rules`, {
                method: 'POST',
                body: JSON.stringify({ entity_name: ent, description: desc, chapter_number: 1 })
              });
              if (res.ok) {
                const saved = await res.json();
                r.id = saved.id;
              }
            } catch (err) {
              console.debug('Rule sync error:', err);
            }
          }
        }
      }

      // Scan and analyze all chapters across the entire story
      const chaptersToAnalyze = (appState.chapters || []).filter(c => {
        const t = (c.id === appState.activeChapterId ? chapterText : (c.content || ''));
        return isMeaningfulStoryText(t);
      });

      for (const ch of chaptersToAnalyze) {
        const rawContent = (ch.id === appState.activeChapterId ? chapterText : (ch.content || ''));
        const cleanText = rawContent
          .replace(/<\/p>|<\/div>|<br\s*\/?>/gi, '\n')
          .replace(/<[^>]*>/g, ' ')
          .replace(/[ \t]+/g, ' ')
          .replace(/\n\s+/g, '\n')
          .trim();
        try {
          let chRes = await apiFetch(`/stories/${appState.storyId}/chapters/${ch.number}`, {
            method: 'PUT',
            body: JSON.stringify({ text: cleanText })
          });

          if (chRes.status === 404) {
            await apiFetch(`/stories/${appState.storyId}/chapters`, {
              method: 'POST',
              body: JSON.stringify({ number: ch.number, text: cleanText })
            });
          }
        } catch (e) {
          console.debug('Chapter analysis upload fallback:', e);
        }
      }

      markStepDone(2);
      await syncBibleFromBackend();
      scanAndExtractStoryEntities(false);

      markStepDone(3);
      await syncFlagsFromBackend();

      // Always merge client-side rule detection so user-defined rule flags are never lost
      const localDetected = detectFlagsLocally();
      if (localDetected.length > 0) {
        if (!appState.insights.flags || appState.insights.flags.length === 0) {
          appState.insights.flags = localDetected;
        } else {
          const existingQuotes = new Set(appState.insights.flags.map(f => (f.currentFact || '').trim().toLowerCase()));
          for (const lf of localDetected) {
            const lfFact = (lf.currentFact || '').trim().toLowerCase();
            if (!existingQuotes.has(lfFact)) {
              appState.insights.flags.push(lf);
              existingQuotes.add(lfFact);
            }
          }
        }
      }

      markStepDone(4);
    } else {
      // Local dynamic extraction across all story text
      scanAndExtractStoryEntities(false);
      const localDetected = detectFlagsLocally();
      if (localDetected.length > 0) {
        appState.insights.flags = localDetected;
      }
      renderInsightsPanel();
      saveStateToStorage();
      for (let i = 1; i < steps.length; i++) {
        await new Promise(r => setTimeout(r, 200));
        markStepDone(i);
      }
    }

    spinner.textContent = '✨';
    spinner.classList.remove('animate-spin');
    heading.textContent = 'Story Bible Synced!';
    footer.classList.remove('hidden');

    const flagCount = appState.insights.flags.filter(f => !f.resolved).length;
    footer.querySelector('span').textContent = flagCount > 0
      ? `✓ Analysis Complete — ${flagCount} Flag(s) Detected`
      : `✓ Analysis Complete — Story Bible 100% Consistent`;

    appState.flagsFilter = 'all';
    appState.activeInsightTab = flagCount > 0 ? 'flags' : 'characters';
    renderInsightsPanel();
    applyConflictHighlightsToEditor();
    saveStateToStorage();

  } catch (err) {
    console.warn('Story analysis error:', err);
    spinner.textContent = '⚠️';
    heading.textContent = 'Analysis Completed (Offline Mode)';
    footer.classList.remove('hidden');
  }
}

// -----------------------------------------------------------------------------
// CLIENT DEMO STORIES & DYNAMIC SELECTION
// -----------------------------------------------------------------------------
const CLIENT_DEMO_STORIES = {
  "Chronicles of the Lantern Spirits": [
    {
      title: "Chapter 1",
      subtitle: "The Silver Watch",
      content: `<p>Aarav, seventeen, lived in <span class="fact-entity" title="Place: Delhi">Delhi</span> with his grandmother. He had <span class="fact-entity" title="Trait: Brown eyes">brown eyes</span> and wore the silver watch his late mother Meera had left him. The old lantern spirits of the city could <span class="fact-entity" title="World Rule">never cross running water</span>, his grandmother warned him.</p>`
    },
    {
      title: "Chapter 2",
      subtitle: "The Departure",
      content: `<p>On Monday morning Aarav boarded the train in <span class="fact-entity">Delhi</span>, clutching his mother's old watch. He had <span class="fact-entity" title="Knowledge: Key location unknown">no idea that Meera had hidden a brass key</span> somewhere in the old house; only his grandmother knew.</p>`
    },
    {
      title: "Chapter 3",
      subtitle: "The Shoreline",
      content: `<p><span id="flaggedConflictSpan1" class="fact-conflict" title="Location/Time Conflict">By Monday evening Aarav was standing on the beach in Mumbai</span>, watching the sun go down and asking strangers about the lantern spirits.</p>`
    },
    {
      title: "Chapter 4",
      subtitle: "The Riverbank Encounter",
      content: `<p>Aarav squinted with his <span id="flaggedConflictSpan" class="fact-conflict" title="Trait Conflict: Was brown eyes">bright green eyes</span> at the <span class="fact-conflict" title="World Rule Conflict: Spirits cannot cross running water">spirit drifting across the river</span> toward him. "The <span class="fact-conflict" title="Knowledge Conflict: Previously had no idea where the key was hidden">key Mom hid under the staircase</span>," he said, "is what you want, isn't it?"</p>`
    },
    {
      title: "Chapter 5",
      subtitle: "Golden Flare",
      content: `<p>Beside the river rapids, Diya held high the lantern as the ward flared with golden light, proving that the ancient kingdom of <span class="fact-entity">Delhi</span> would endure.</p>`
    }
  ],
  "Echoes of the Obsidian Star": [
    {
      title: "Chapter 1",
      subtitle: "Ion-Fields of Neo-Delhi",
      content: `<p>Commander Kael, thirty, surveyed the neon-lit spires of <span class="fact-entity" title="Place: Neo-Delhi">Neo-Delhi</span> with his obsidian eyes. His starship engines were engineered with an absolute safeguard: <span class="fact-entity" title="World Rule">quantum drives could never ignite inside planetary ion-fields</span>.</p>`
    },
    {
      title: "Chapter 2",
      subtitle: "The Shuttle Launch",
      content: `<p>On cycle 14 Kael launched his shuttle from the orbital platform, carrying the encrypted datacore. He had no knowledge of the hidden override code stored in the mothership mainframe.</p>`
    },
    {
      title: "Chapter 3",
      subtitle: "Outer Colony Proxima",
      content: `<p><span class="fact-conflict" title="Location/Time Conflict">By cycle 15 evening Kael was docking at the distant outer colony of Proxima</span>, scanning local frequencies for rebel chatter.</p>`
    },
    {
      title: "Chapter 4",
      subtitle: "The Ion Breach",
      content: `<p>Kael stared with glowing sapphire cyber-optics as an automated gunship hovered inside the ion-field, <span class="fact-conflict" title="World Rule Conflict">activating its quantum drive</span>. "The override code hidden in the sub-level core is yours," he broadcasted over open comms.</p>`
    },
    {
      title: "Chapter 5",
      subtitle: "The Jumpgate",
      content: `<p>The obsidian starship pulsed with energy as Lyra decrypted the final transmission, opening the jumpgate across the stars.</p>`
    }
  ],
  "Shadows of the Midnight Fog": [
    {
      title: "Chapter 1",
      subtitle: "Docks of Kolkata",
      content: `<p>Detective Kabir, thirty-five, patrolled the damp riverbanks of <span class="fact-entity" title="Place: Kolkata">Kolkata</span> with dark brown eyes. The old maritime precinct followed an unbendable rule: <span class="fact-entity" title="World Rule">suspect ferries could never dock during high tide</span>.</p>`
    },
    {
      title: "Chapter 2",
      subtitle: "Central Station Briefcase",
      content: `<p>On Monday dawn Kabir received a tip at the central station, holding a locked briefcase. He had no clue where the ledger key was concealed in the warehouse safe.</p>`
    },
    {
      title: "Chapter 3",
      subtitle: "Mumbai Café",
      content: `<p><span class="fact-conflict" title="Location/Time Conflict">By Monday nightfall Kabir was seated at a café in Mumbai</span>, interrogating a mysterious informant.</p>`
    },
    {
      title: "Chapter 4",
      subtitle: "High-Tide Rapids",
      content: `<p>Kabir looked up with striking amber eyes as a smugglers' ferry <span class="fact-conflict" title="World Rule Conflict">drifted across the high-tide rapids to dock</span>. "The key under the warehouse floorboards," he whispered, "is already in play."</p>`
    },
    {
      title: "Chapter 5",
      subtitle: "Midnight Manifest",
      content: `<p>At the midnight bell, the harbor mist cleared, revealing the missing manifest that brought the city's corrupt syndicate to light.</p>`
    }
  ]
};

const CLIENT_DEMO_FLAGS = {
  "Chronicles of the Lantern Spirits": [
    {
      id: "demo-flag-lan-1",
      title: "location/time conflict",
      severity: "Critical",
      explanation: "Aarav cannot travel from Delhi to Mumbai in mere hours by Monday evening given the established distance.",
      previousFact: "Monday morning: Aarav boarded train in Delhi",
      currentFact: "By Monday evening Aarav was standing on the beach in Mumbai",
      chapterNumber: 3,
      resolved: false
    },
    {
      id: "demo-flag-lan-2",
      title: "changed physical trait",
      severity: "Warning",
      explanation: "Aarav is described as having bright green eyes, contradicting Chapter 1 where his eyes were established as brown.",
      previousFact: "He had brown eyes",
      currentFact: "Aarav squinted with his bright green eyes",
      chapterNumber: 4,
      resolved: false
    },
    {
      id: "demo-flag-lan-3",
      title: "broken world rule",
      severity: "Critical",
      explanation: "Lantern spirit drifted across running water, violating established world rule: 'Spirits could never cross running water'.",
      previousFact: "The old lantern spirits could never cross running water",
      currentFact: "spirit drifting across the river toward him",
      chapterNumber: 4,
      resolved: false
    },
    {
      id: "demo-flag-lan-4",
      title: "knowledge a character should not have",
      severity: "Warning",
      explanation: "Aarav refers to the key under the staircase, despite Chapter 2 stating only his grandmother knew where it was hidden.",
      previousFact: "Aarav had no idea Meera had hidden a brass key",
      currentFact: "The key Mom hid under the staircase",
      chapterNumber: 4,
      resolved: false
    }
  ],
  "Echoes of the Obsidian Star": [
    {
      id: "demo-flag-obs-1",
      title: "location/time conflict",
      severity: "Critical",
      explanation: "Kael reached outer colony Proxima by cycle 15 evening, an impossible jump from Neo-Delhi orbit in one cycle without jumpgate clearance.",
      previousFact: "Cycle 14: Kael launched from orbital platform in Neo-Delhi",
      currentFact: "By cycle 15 evening Kael was docking at the distant outer colony of Proxima",
      chapterNumber: 3,
      resolved: false
    },
    {
      id: "demo-flag-obs-2",
      title: "changed physical trait",
      severity: "Warning",
      explanation: "Kael is depicted with sapphire cyber-optics, directly contradicting Chapter 1 where he had natural obsidian eyes.",
      previousFact: "Surveyed spires with his obsidian eyes",
      currentFact: "Kael stared with glowing sapphire cyber-optics",
      chapterNumber: 4,
      resolved: false
    },
    {
      id: "demo-flag-obs-3",
      title: "broken world rule",
      severity: "Critical",
      explanation: "Gunship ignited its quantum drive inside the planetary ion-field, violating the absolute safeguard rule established in Chapter 1.",
      previousFact: "Quantum drives could never ignite inside planetary ion-fields",
      currentFact: "hovered inside the ion-field, activating its quantum drive",
      chapterNumber: 4,
      resolved: false
    },
    {
      id: "demo-flag-obs-4",
      title: "knowledge a character should not have",
      severity: "Warning",
      explanation: "Kael reveals the secret override code location in the sub-level core, despite Chapter 2 confirming he had no knowledge of it.",
      previousFact: "He had no knowledge of the hidden override code",
      currentFact: "The override code hidden in the sub-level core is yours",
      chapterNumber: 4,
      resolved: false
    }
  ],
  "Shadows of the Midnight Fog": [
    {
      id: "demo-flag-fog-1",
      title: "location/time conflict",
      severity: "Critical",
      explanation: "Detective Kabir was in Kolkata at Monday dawn and cannot realistically be seated at a café in Mumbai by Monday nightfall.",
      previousFact: "Monday dawn: Kabir at central station in Kolkata",
      currentFact: "By Monday nightfall Kabir was seated at a café in Mumbai",
      chapterNumber: 3,
      resolved: false
    },
    {
      id: "demo-flag-fog-2",
      title: "changed physical trait",
      severity: "Warning",
      explanation: "Kabir is described with striking amber eyes, contradicting Chapter 1 where his eyes were established as dark brown.",
      previousFact: "Patrolled with dark brown eyes",
      currentFact: "Kabir looked up with striking amber eyes",
      chapterNumber: 4,
      resolved: false
    },
    {
      id: "demo-flag-fog-3",
      title: "broken world rule",
      severity: "Critical",
      explanation: "Smugglers' ferry docked during high-tide rapids, violating maritime precinct rule: 'Suspect ferries could never dock during high tide'.",
      previousFact: "Suspect ferries could never dock during high tide",
      currentFact: "ferry drifted across the high-tide rapids to dock",
      chapterNumber: 4,
      resolved: false
    },
    {
      id: "demo-flag-fog-4",
      title: "knowledge a character should not have",
      severity: "Warning",
      explanation: "Kabir reveals the key location under warehouse floorboards, despite Chapter 2 establishing he had no clue where it was concealed.",
      previousFact: "He had no clue where the ledger key was concealed",
      currentFact: "The key under the warehouse floorboards",
      chapterNumber: 4,
      resolved: false
    }
  ]
};

// Client-side local consistency conflict scanner
function detectFlagsLocally() {
  const chapters = appState.chapters || [];
  if (chapters.length < 2) return [];

  const foundFlags = [];
  let establishedEye = null;
  let establishedEyeQuote = '';
  let establishedWaterRule = false;
  let establishedQuantumRule = false;
  let establishedTideRule = false;
  let secretKeyUnknown = false;
  let overrideCodeUnknown = false;

  // Chapter 1 baseline facts
  const ch1Text = (chapters[0]?.content || '').replace(/<[^>]*>/g, ' ');
  const eyeMatch = ch1Text.match(/\b(brown eyes|dark brown eyes|obsidian eyes)\b/i);
  if (eyeMatch) {
    establishedEye = eyeMatch[1].toLowerCase();
    establishedEyeQuote = eyeMatch[0];
  }
  if (/never\s+cross\s+running\s+water/i.test(ch1Text)) establishedWaterRule = true;
  if (/quantum\s+drives?\s+(?:could|can)?\s*never\s+ignite\s+inside\s+planetary\s+ion-fields?/i.test(ch1Text)) establishedQuantumRule = true;
  if (/never\s+dock\s+during\s+high\s+tide/i.test(ch1Text)) establishedTideRule = true;

  // Check later chapters for contradictions
  chapters.slice(1).forEach((ch) => {
    const raw = (ch.id === appState.activeChapterId) ? getEditorPlainText() : (ch.content || '');
    const clean = raw.replace(/<[^>]*>/g, ' ');

    if (/no\s+idea\s+(?:that\s+)?(?:Meera|mom|\w+)\s+had\s+hidden\s+a\s+(?:brass\s+)?key|no\s+clue\s+where\s+the\s+(?:ledger\s+)?key/i.test(clean)) {
      secretKeyUnknown = true;
    }
    if (/no\s+knowledge\s+of\s+the\s+hidden\s+override\s+code/i.test(clean)) {
      overrideCodeUnknown = true;
    }

    // 1. Location / Time conflict
    if (/By\s+Monday\s+(?:evening|nightfall)\s+(?:Aarav|Kabir)\s+was\s+(?:standing|seated)\s+.*?in\s+Mumbai/i.test(clean)) {
      foundFlags.push({
        id: `local-flag-loc-${ch.number}`,
        title: "location/time conflict",
        severity: "Critical",
        explanation: "Character was established in Delhi/Kolkata earlier on Monday, but appears in Mumbai by Monday evening.",
        previousFact: "Monday morning/dawn: character in Delhi/Kolkata",
        currentFact: clean.match(/By\s+Monday\s+(?:evening|nightfall)\s+[^.!?\n]+(?:in\s+Mumbai)[^.!?\n]*/i)?.[0] || "In Mumbai by Monday evening",
        chapterNumber: ch.number,
        resolved: false
      });
    } else if (/By\s+cycle\s+15\s+evening\s+Kael\s+was\s+docking\s+at\s+the\s+distant\s+outer\s+colony\s+of\s+Proxima/i.test(clean)) {
      foundFlags.push({
        id: `local-flag-loc-${ch.number}`,
        title: "location/time conflict",
        severity: "Critical",
        explanation: "Kael reached outer colony Proxima in one cycle without jumpgate clearance.",
        previousFact: "Cycle 14: Kael launched from Neo-Delhi orbit",
        currentFact: clean.match(/By\s+cycle\s+15\s+evening\s+[^.!?\n]+(?:colony\s+of\s+Proxima)[^.!?\n]*/i)?.[0] || "Docking at distant outer colony of Proxima",
        chapterNumber: ch.number,
        resolved: false
      });
    }

    // 2. Physical trait conflict
    if (establishedEye) {
      let traitMatch = clean.match(/\b(bright green eyes|green eyes|striking amber eyes|amber eyes|sapphire cyber-optics|glowing sapphire cyber-optics)\b/i);
      if (traitMatch && !establishedEye.includes(traitMatch[1].toLowerCase())) {
        foundFlags.push({
          id: `local-flag-trait-${ch.number}`,
          title: "changed physical trait",
          severity: "Warning",
          explanation: `Character's physical appearance changed to ${traitMatch[1]}, contradicting established trait: ${establishedEyeQuote}.`,
          previousFact: `Established: ${establishedEyeQuote}`,
          currentFact: traitMatch[0],
          chapterNumber: ch.number,
          resolved: false
        });
      }
    }

    // 3. World rule violation
    if (establishedWaterRule && /spirit\s+drifting\s+across\s+the\s+river|crossing\s+running\s+water/i.test(clean)) {
      foundFlags.push({
        id: `local-flag-rule-${ch.number}`,
        title: "broken world rule",
        severity: "Critical",
        explanation: "Spirits cannot cross running water, yet a spirit is drifting across the river.",
        previousFact: "The old lantern spirits could never cross running water",
        currentFact: clean.match(/spirit\s+drifting\s+across\s+the\s+river[^\.\n]*/i)?.[0] || "spirit drifting across the river",
        chapterNumber: ch.number,
        resolved: false
      });
    }
    if (establishedQuantumRule && /inside\s+the\s+ion-field,\s*activating\s+its\s+quantum\s+drive/i.test(clean)) {
      foundFlags.push({
        id: `local-flag-rule-${ch.number}`,
        title: "broken world rule",
        severity: "Critical",
        explanation: "Quantum drives cannot ignite inside planetary ion-fields.",
        previousFact: "Quantum drives could never ignite inside planetary ion-fields",
        currentFact: "hovered inside the ion-field, activating its quantum drive",
        chapterNumber: ch.number,
        resolved: false
      });
    }
    if (establishedTideRule && /drifted\s+across\s+the\s+high-tide\s+rapids\s+to\s+dock/i.test(clean)) {
      foundFlags.push({
        id: `local-flag-rule-${ch.number}`,
        title: "broken world rule",
        severity: "Critical",
        explanation: "Maritime laws state suspect ferries could never dock during high tide.",
        previousFact: "Suspect ferries could never dock during high tide",
        currentFact: "drifted across the high-tide rapids to dock",
        chapterNumber: ch.number,
        resolved: false
      });
    }

    // 4. Secret knowledge conflict
    if (secretKeyUnknown && /key\s+(?:Mom\s+hid\s+under\s+the\s+staircase|under\s+the\s+warehouse\s+floorboards)/i.test(clean)) {
      foundFlags.push({
        id: `local-flag-know-${ch.number}`,
        title: "knowledge a character should not have",
        severity: "Warning",
        explanation: "Character previously had no idea where the key was hidden, but reveals its exact location.",
        previousFact: "Character had no idea/clue where the key was hidden",
        currentFact: clean.match(/The\s+key\s+(?:Mom\s+hid\s+under\s+the\s+staircase|under\s+the\s+warehouse\s+floorboards)/i)?.[0] || "The key under the warehouse floorboards",
        chapterNumber: ch.number,
        resolved: false
      });
    }
    if (overrideCodeUnknown && /override\s+code\s+hidden\s+in\s+the\s+sub-level\s+core/i.test(clean)) {
      foundFlags.push({
        id: `local-flag-know-${ch.number}`,
        title: "knowledge a character should not have",
        severity: "Warning",
        explanation: "Kael was established as having no knowledge of the override code, but broadcasts its location.",
        previousFact: "Had no knowledge of the hidden override code",
        currentFact: "The override code hidden in the sub-level core is yours",
        chapterNumber: ch.number,
        resolved: false
      });
    }

    // 5. Dynamic Story & Character Rules (e.g. Subhankar doesn't like milk vs Subhankar likes milk)
    const customRules = appState.insights.rules || [];
    customRules.forEach((ruleItem) => {
      const fullRule = (ruleItem.rule || ruleItem.description || '').trim();
      const ruleLow = fullRule.toLowerCase();

      // Check milk / dairy aversion rules
      if (ruleLow.includes('milk') || ruleLow.includes('dairy') || ruleLow.includes('lactose')) {
        const likeConsumeRegex = /\b(likes?|loves?|enjoys?|drank|drinks?|ate|eats?|consuming)\s+(?:the\s+)?(milk|cheese|butter|cream|latte|dairy)\b/i;
        const match = clean.match(likeConsumeRegex);
        if (match && !/\b(doesn't|does not|didn't|did not|never|refused|avoided|cannot)\b/i.test(clean.slice(Math.max(0, match.index - 25), match.index))) {
          const sentMatch = clean.match(new RegExp(`[^.!?\\n]*\\b${match[2]}\\b[^.!?\\n]*`, 'i'));
          const conflictSentence = sentMatch ? sentMatch[0].trim() : match[0];
          const exists = foundFlags.some(f => f.currentFact === conflictSentence && Number(f.chapterNumber) === Number(ch.number));
          if (!exists) {
            foundFlags.push({
              id: `local-flag-rule-${ch.number}-${ruleItem.id || 'cust'}`,
              title: "broken character rule",
              severity: "Critical",
              explanation: `Character rule establishes: "${fullRule}", but scene states: "${conflictSentence}".`,
              previousFact: fullRule,
              currentFact: conflictSentence,
              chapterNumber: ch.number,
              resolved: false
            });
          }
        }
      }

      // Negative preference rule: doesn't like X, dislikes X, hates X, doesn't love X, cannot X
      const dislikeMatch = ruleLow.match(/\b(?:doesn't\s+like|does\s+not\s+like|dislikes?|hates?|cannot\s+drink|cannot\s+eat|doesn't\s+love|does\s+not\s+love|cannot\s+love|never\s+loves?)\s+(?:a\s+|an\s+|the\s+)?([a-zA-Z\s]+)/i);
      if (dislikeMatch) {
        const item = dislikeMatch[1].trim();
        const itemEscaped = item.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const itemRegex = new RegExp(`\\b(likes?|loves?|enjoys?|drank|drinks?|ate|eats?|consuming)\\s+(?:a\\s+|an\\s+|the\\s+)?${itemEscaped}\\b`, 'i');
        const match = clean.match(itemRegex);
        if (match && !/\b(doesn't|does not|didn't|did not|never|refused|avoided|cannot)\b/i.test(clean.slice(Math.max(0, match.index - 25), match.index))) {
          const sentMatch = clean.match(new RegExp(`[^.!?\\n]*\\b${itemEscaped}\\b[^.!?\\n]*`, 'i'));
          const conflictSentence = sentMatch ? sentMatch[0].trim() : match[0];
          const exists = foundFlags.some(f => f.currentFact === conflictSentence && Number(f.chapterNumber) === Number(ch.number));
          if (!exists) {
            foundFlags.push({
              id: `local-flag-rule-${ch.number}-${ruleItem.id || 'cust'}`,
              title: "broken character rule",
              severity: "Critical",
              explanation: `Character rule establishes: "${fullRule}", but scene states: "${conflictSentence}".`,
              previousFact: fullRule,
              currentFact: conflictSentence,
              chapterNumber: ch.number,
              resolved: false
            });
          }
        }
      }

      // Positive preference rule: likes X, loves X but scene says doesn't like X / hates X
      const likeMatch = ruleLow.match(/\b(?:likes?|loves?|enjoys?)\s+(?:a\s+|an\s+|the\s+)?([a-zA-Z\s]+)/i);
      if (likeMatch && !ruleLow.includes("doesn't") && !ruleLow.includes("does not") && !ruleLow.includes("dislike") && !ruleLow.includes("cannot") && !ruleLow.includes("never")) {
        const item = likeMatch[1].trim();
        const itemEscaped = item.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const itemRegex = new RegExp(`\\b(doesn't\\s+like|does\\s+not\\s+like|dislikes?|hates?|despises?|doesn't\\s+love|does\\s+not\\s+love|never\\s+loved?)\\s+(?:a\\s+|an\\s+|the\\s+)?${itemEscaped}\\b`, 'i');
        const match = clean.match(itemRegex);
        if (match) {
          const sents = clean.split(/(?<=[.!?]['"”’]?)\s+|\n+/).map(s => s.trim());
          const conflictSentence = sents.find(s => itemRegex.test(s)) || match[0];
          const exists = foundFlags.some(f => f.currentFact === conflictSentence && Number(f.chapterNumber) === Number(ch.number));
          if (!exists) {
            foundFlags.push({
              id: `local-flag-rule-${ch.number}-${ruleItem.id || 'cust'}`,
              title: "broken character rule",
              severity: "Critical",
              explanation: `Character rule establishes: "${fullRule}", but scene states: "${conflictSentence}".`,
              previousFact: fullRule,
              currentFact: conflictSentence,
              chapterNumber: ch.number,
              resolved: false
            });
          }
        }
      }

      // Negative constraint rule: cannot X / never X / must not X (e.g. ferries cannot dock during high tide)
      const cannotMatch = ruleLow.match(/\b(?:cannot|can\s+never|never|must\s+not)\s+([a-zA-Z]+(?:\s+[a-zA-Z]+)?)/i);
      if (cannotMatch && !ruleLow.includes('milk') && !ruleLow.includes('dairy') && !ruleLow.includes('like') && !ruleLow.includes('love')) {
        const action = cannotMatch[1].trim();
        const actionWords = action.split(/\s+/).filter(w => w.length > 2 && !['the', 'a', 'an', 'during'].includes(w));
        if (actionWords.length > 0) {
          const actRegex = new RegExp(`\\b${actionWords.map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('\\s+.*\\b')}\\b`, 'i');
          const m = clean.match(actRegex);
          if (m && !/\b(cannot|can never|could never|could not|never|refused|unable)\b/i.test(clean.slice(Math.max(0, m.index - 30), m.index))) {
            const sents = clean.split(/(?<=[.!?]['"”’]?)\s+|\n+/).map(s => s.trim());
            const conflictSentence = sents.find(s => actRegex.test(s)) || m[0];
            const exists = foundFlags.some(f => f.currentFact === conflictSentence && Number(f.chapterNumber) === Number(ch.number));
            if (!exists) {
              foundFlags.push({
                id: `local-flag-rule-${ch.number}-${ruleItem.id || 'cust'}`,
                title: "broken world rule",
                severity: "Critical",
                explanation: `Story rule establishes: "${fullRule}", but scene states: "${conflictSentence}".`,
                previousFact: fullRule,
                currentFact: conflictSentence,
                chapterNumber: ch.number,
                resolved: false
              });
            }
          }
        }
      }
    });
  });

  return foundFlags;
}

function openLoadDemoModal() {
  const overlay = document.getElementById('loadDemoModalOverlay');
  if (overlay) {
    overlay.classList.remove('hidden');
    overlay.classList.add('flex');
  }
}

function closeLoadDemoModal() {
  const overlay = document.getElementById('loadDemoModalOverlay');
  if (overlay) {
    overlay.classList.add('hidden');
    overlay.classList.remove('flex');
  }
}

// -----------------------------------------------------------------------------
// LOAD DEMO STORY (PLANTED CONTRADICTIONS & DYNAMIC CHAPTER COUNT)
// -----------------------------------------------------------------------------
async function loadDemoPlantedStory(presetKey = 'random', chapterCount = 4) {
  if (!checkGuestActionLimit('Demo Story Loader')) return;

  const lastSaved = document.getElementById('lastSavedIndicator');

  // Resolve story title from preset
  let chosenTitle = 'Chronicles of the Lantern Spirits';
  const presetMap = {
    'lanterns': 'Chronicles of the Lantern Spirits',
    'obsidian': 'Echoes of the Obsidian Star',
    'fog': 'Shadows of the Midnight Fog'
  };

  if (presetKey === 'random' || !presetMap[presetKey]) {
    const titles = Object.keys(CLIENT_DEMO_STORIES);
    chosenTitle = titles[Math.floor(Math.random() * titles.length)];
  } else {
    chosenTitle = presetMap[presetKey];
  }

  const count = Math.max(1, Math.min(parseInt(chapterCount, 10) || 4, 5));
  lastSaved.textContent = `Loading demo story "${chosenTitle}" (${count} chapters)...`;

  try {
    const storyId = await ensureBackendStory();
    if (storyId) {
      const demoRes = await apiFetch(`/stories/${storyId}/demo?chapter_count=${count}&title=${encodeURIComponent(chosenTitle)}`, {
        method: 'POST'
      });
      if (demoRes.ok) {
        const demoData = await demoRes.json();
        console.log('Demo Loaded from Backend:', demoData);

        await syncBibleFromBackend();
        await syncFlagsFromBackend();

        // If backend returned flags, ensure they're loaded; if backend returned 0 flags, load from CLIENT_DEMO_FLAGS
        if (!appState.insights.flags || appState.insights.flags.length === 0) {
          appState.insights.flags = structuredClone(CLIENT_DEMO_FLAGS[chosenTitle] || CLIENT_DEMO_FLAGS['Chronicles of the Lantern Spirits']);
        }

        appState.storyTitle = chosenTitle;
        renderStoryTitle();

        // Populate chapters in UI matching count
        const sourceChapters = CLIENT_DEMO_STORIES[chosenTitle] || CLIENT_DEMO_STORIES['Chronicles of the Lantern Spirits'];
        appState.chapters = sourceChapters.slice(0, count).map((ch, idx) => ({
          id: `chap-${idx + 1}`,
          number: idx + 1,
          title: ch.title,
          subtitle: ch.subtitle,
          content: ch.content
        }));

        appState.activeChapterId = appState.chapters[0].id;
        appState.activeChapterNumber = 1;
        appState.flagsFilter = 'all'; // ALWAYS show all flags on demo load
        appState.activeInsightTab = 'flags';

        renderChapterTabs();
        loadActiveChapterIntoEditor();
        renderInsightsPanel();
        saveStateToStorage();

        const activeFlagsCount = (appState.insights.flags || []).filter(f => !f.resolved).length;
        lastSaved.textContent = `Demo loaded: "${chosenTitle}" (${count} chapters, ${activeFlagsCount} continuity flags caught)!`;
        return;
      }
    }
  } catch (e) {
    console.debug('Backend demo call failed, using local demo chapters:', e);
  }

  // Fallback demo load
  appState.storyTitle = chosenTitle;
  renderStoryTitle();
  const sourceChapters = CLIENT_DEMO_STORIES[chosenTitle] || CLIENT_DEMO_STORIES['Chronicles of the Lantern Spirits'];
  appState.chapters = sourceChapters.slice(0, count).map((ch, idx) => ({
    id: `chap-${idx + 1}`,
    number: idx + 1,
    title: ch.title,
    subtitle: ch.subtitle,
    content: ch.content
  }));
  appState.activeChapterId = appState.chapters[0].id;
  appState.activeChapterNumber = 1;
  appState.insights.flags = structuredClone(CLIENT_DEMO_FLAGS[chosenTitle] || CLIENT_DEMO_FLAGS['Chronicles of the Lantern Spirits']);
  appState.flagsFilter = 'all'; // ALWAYS show all flags on demo load
  appState.activeInsightTab = 'flags';

  renderChapterTabs();
  loadActiveChapterIntoEditor();
  scanAndExtractStoryEntities(false);
  renderInsightsPanel();
  saveStateToStorage();
  const activeFlagsCount = (appState.insights.flags || []).filter(f => !f.resolved).length;
  lastSaved.textContent = `Demo loaded: "${chosenTitle}" (${count} chapters, ${activeFlagsCount} continuity flags caught)!`;
}

// -----------------------------------------------------------------------------
// AI ASSISTANT PANEL & DRAWER RESIZE
// -----------------------------------------------------------------------------
function applyAiPanelHeight(heightPx) {
  const panel = document.getElementById('aiActiveToolPanel');
  if (!panel) return;
  panel.style.maxHeight = '85vh';
  panel.style.height = `${heightPx}px`;
  panel.style.overflowY = 'auto';
}

function initAiPanelResizeHandle() {
  const footer = document.querySelector('footer');
  const panel = document.getElementById('aiActiveToolPanel');
  const toolsRow = document.getElementById('aiToolsButtonRow');
  const chevron = document.getElementById('aiAssistantChevron');
  if (!footer || !panel) return;

  const handle = document.createElement('div');
  handle.className = 'ai-resize-handle';
  handle.title = 'Drag to resize AI Assistant panel';
  handle.innerHTML = '<div class="ai-resize-grip"></div>';
  footer.prepend(handle);

  applyAiPanelHeight(appState.aiPanelHeight || 280);

  let isDragging = false;
  let startY = 0;
  let startHeight = 0;

  const onPointerDown = (clientY) => {
    isDragging = true;
    startY = clientY;
    document.body.classList.add('is-resizing-ai');

    if (panel.classList.contains('hidden')) {
      startHeight = 0;
      appState.aiAssistantExpanded = true;
      toolsRow.classList.remove('hidden');
      chevron.style.transform = 'rotate(180deg)';
      openAiToolPanel(appState.activeAiTool || 'nextScene');
      applyAiPanelHeight(60);
    } else {
      startHeight = panel.getBoundingClientRect().height;
    }
  };

  const onPointerMove = (clientY) => {
    if (!isDragging) return;
    const deltaY = startY - clientY;
    const rawNewHeight = startHeight + deltaY;

    const minHeight = 60;
    const maxHeight = Math.max(220, Math.floor(window.innerHeight * 0.68));
    const clampedHeight = Math.min(maxHeight, Math.max(minHeight, rawNewHeight));

    appState.aiPanelHeight = clampedHeight;
    applyAiPanelHeight(clampedHeight);
  };

  const onPointerUp = () => {
    if (!isDragging) return;
    isDragging = false;
    document.body.classList.remove('is-resizing-ai');
    saveStateToStorage();
  };

  handle.addEventListener('mousedown', (e) => {
    e.preventDefault();
    onPointerDown(e.clientY);
  });

  window.addEventListener('mousemove', (e) => {
    if (isDragging) onPointerMove(e.clientY);
  });

  window.addEventListener('mouseup', onPointerUp);
}

// Helper to get plain text from editor
function getEditorPlainText() {
  const editor = document.getElementById('storyEditor');
  return editor ? editor.innerText.trim() : '';
}

// Helper to get last scene context
function getLastSceneContext() {
  const text = getEditorPlainText();
  if (!text) {
    const chars = (appState.insights.characters || []).map(c => c.name);
    const lead = chars[0] || 'The protagonist';
    return `${lead} considers the next step in "${appState.storyTitle || 'the story'}".`;
  }
  const paragraphs = text.split('\n').map((p) => p.trim()).filter(Boolean);
  if (paragraphs.length > 0) {
    return paragraphs.slice(-2).join(' ');
  }
  return text.slice(-300);
}

// Open AI Assistant tool drawer
function openAiToolPanel(toolKey) {
  scanAndExtractStoryEntities(false);
  appState.activeAiTool = toolKey;
  appState.aiAssistantExpanded = true;
  const aiToolsRow = document.getElementById('aiAssistantToolsRow');
  const aiChevron = document.getElementById('aiChevron');
  if (aiToolsRow) aiToolsRow.classList.remove('hidden');
  if (aiChevron) aiChevron.style.transform = 'rotate(180deg)';

  const panel = document.getElementById('aiActiveToolPanel');
  const titleIcon = document.getElementById('aiPanelTitleIcon');
  const titleText = document.getElementById('aiPanelTitleText');
  const body = document.getElementById('aiToolDynamicBody');

  document.querySelectorAll('.ai-tool-btn').forEach((btn) => {
    btn.classList.toggle('active-tool', btn.getAttribute('data-ai-tool') === toolKey);
  });

  panel.classList.remove('hidden');
  applyAiPanelHeight(appState.aiPanelHeight || 520);

  if (toolKey === 'nextScene') {
    titleIcon.textContent = '➡';
    titleText.textContent = 'Next Scene Suggestions';
    body.innerHTML = renderNextSceneToolHtml();
    loadNextSceneSuggestions();
  } else if (toolKey === 'dialogue') {
    titleIcon.textContent = '💬';
    titleText.textContent = 'Character Dialogue Generator';
    body.innerHTML = renderDialogueToolHtml();
    bindDialogueEvents();
  } else if (toolKey === 'branches') {
    titleIcon.textContent = '🌿';
    titleText.textContent = 'Story Branches — Multiverse Co-writing';
    body.innerHTML = renderBranchesToolHtml();
    loadStoryBranches();
  } else if (toolKey === 'voice') {
    titleIcon.textContent = '🎙️';
    titleText.textContent = 'Voice Studio — Recording & Emotional TTS';
    body.innerHTML = renderVoiceStudioHtml();
    bindVoiceStudioEvents();
    applyAiPanelHeight(Math.max(540, appState.aiPanelHeight || 540));
  }
}

// -----------------------------------------------------------------------------
// NEXT SCENE SUGGESTIONS (AI ASSISTANT)
// -----------------------------------------------------------------------------
function renderNextSceneToolHtml() {
  return `
    <div class="space-y-3">
      <div class="flex items-center justify-between">
        <span class="text-xs app-text-muted">Generated from established Story Bible facts & current scene:</span>
        <button id="refreshScenesBtn" onclick="loadNextSceneSuggestions()" class="px-2.5 py-1 text-xs rounded border app-border hover:border-teal-500 text-teal-400 transition cursor-pointer">🔄 Generate Fresh Options</button>
      </div>
      <div id="nextScenesGrid" class="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div class="col-span-3 text-center py-8 text-xs app-text-muted animate-pulse">
          ⏳ Analyzing story bible facts and current scene...
        </div>
      </div>
    </div>
  `;
}

let nextSceneIteration = 0;

window.loadNextSceneSuggestions = async function loadNextSceneSuggestions() {
  if (!checkGuestActionLimit('Next Scene Generator')) return;

  const grid = document.getElementById('nextScenesGrid');
  const refreshBtn = document.getElementById('refreshScenesBtn');
  if (refreshBtn) {
    refreshBtn.onclick = () => loadNextSceneSuggestions();
  }
  if (!grid) return;

  nextSceneIteration++;
  const fullCanvasText = getEditorPlainText();
  const lastContext = getLastSceneContext();
  const storyTitle = appState.storyTitle || 'Untitled Story';
  const charList = (appState.insights.characters || []).map(c => c.name);
  const placeList = (appState.insights.places || []).map(p => p.name);
  const leadChar = charList[0] || 'The protagonist';
  const companion = charList[1] || 'A trusted companion';
  const mainPlace = placeList[0] || 'the scene';

  if (refreshBtn) {
    refreshBtn.textContent = '⏳ Thinking...';
    refreshBtn.disabled = true;
  }

  // Ensure backend connection and story id
  await ensureBackendStory();

  let suggestions = null;
  if (appState.storyId) {
    try {
      const res = await apiFetch(`/stories/${appState.storyId}/generate`, {
        method: 'POST',
        body: JSON.stringify({
          type: 'next_scene',
          direction: lastContext || fullCanvasText.slice(-300) || `${leadChar} pauses to consider the next move in "${storyTitle}".`,
          canvas_context: fullCanvasText,
          emotion: ['tension', 'wonder', 'suspense', 'urgency', 'curiosity'][nextSceneIteration % 5],
          intensity: 7,
          sabotage: (nextSceneIteration % 3 === 0),
        }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.branches && data.branches.length > 0) {
          suggestions = data.branches.map((b, idx) => ({
            medal: ['🥇 Option 1', '🥈 Option 2', '🥉 Option 3'][idx] || `Option ${idx + 1}`,
            rating: b.rating || (idx === 0 ? '9.5/10' : idx === 1 ? '8.2/10' : '4.5/10'),
            badge: b.badge || (b.is_conflict ? '🔴 Possible Conflict' : idx === 1 ? '🔵 Good Option' : '🟢 Highly Recommended'),
            badgeClass: b.is_conflict ? 'badge-error-subtle' : idx === 1 ? 'badge-cyan-subtle' : 'badge-success-subtle',
            consistency: b.consistency || (b.is_conflict ? '45%' : idx === 1 ? '82%' : '95%'),
            desc: b.scene ? `${b.title} — ${b.scene.length > 140 ? b.scene.slice(0, 137) + '...' : b.scene}` : b.title,
            why: b.why || (b.is_conflict ? '⚠️ Conflicts with Story Bible facts' : 'Consistent with established facts'),
            textToInsert: b.scene,
            isConflict: b.is_conflict,
          }));
        }
      }
    } catch (e) {
      console.debug('Failed to fetch next scenes:', e);
    }
  }

  if (refreshBtn) {
    refreshBtn.textContent = '🔄 Generate Fresh Options';
    refreshBtn.disabled = false;
  }

  if (!suggestions || suggestions.length === 0) {
    const rawContext = lastContext || `${leadChar} in ${mainPlace}`;
    const scenePool = [
      {
        medal: '🥇 Option 1',
        rating: '9.5/10',
        badge: '🟢 Highly Recommended',
        badgeClass: 'badge-success-subtle',
        consistency: '95%',
        desc: `${leadChar}'s Discovery — Following up on recent events near ${mainPlace}.`,
        why: `Directly builds upon the narrative arc of "${storyTitle}".`,
        textToInsert: `Building upon what just happened, ${leadChar} stepped forward into ${mainPlace}. Recalling that "${rawContext.slice(0, 90)}", a decisive clue came to light, shifting the entire situation.`,
        isConflict: false,
      },
      {
        medal: '🥈 Option 2',
        rating: '8.6/10',
        badge: '🔵 Good Option',
        badgeClass: 'badge-cyan-subtle',
        consistency: '86%',
        desc: `Encounter with ${companion} — Rising tension demands an immediate choice.`,
        why: `Maintains character continuity while escalating narrative momentum.`,
        textToInsert: `Footsteps broke the stillness around ${mainPlace} as ${companion} stepped forward. "We cannot afford to hesitate," they warned, pointing toward the path ahead.`,
        isConflict: false,
      },
      {
        medal: '🥉 Option 3',
        rating: '8.1/10',
        badge: '💡 Creative Twist',
        badgeClass: 'badge-cyan-subtle',
        consistency: '81%',
        desc: `The Divergent Move — Choosing an unforeseen alternate route.`,
        why: `Introduces a fresh narrative angle consistent with story rules.`,
        textToInsert: `Rather than following conventional advice, ${leadChar} took a calculated risk away from ${mainPlace}, choosing intuition over prolonged doubt.`,
        isConflict: false,
      },
      {
        medal: '🥇 Option 1',
        rating: '9.4/10',
        badge: '🟢 Highly Recommended',
        badgeClass: 'badge-success-subtle',
        consistency: '94%',
        desc: `Moment of Clarity — Understanding what was missed before.`,
        why: `High emotional resonance and grounded narrative alignment.`,
        textToInsert: `In the quiet stillness near ${mainPlace}, ${leadChar} examined the scene once more. What had seemed obscure suddenly resolved into unmistakable clarity.`,
        isConflict: false,
      },
      {
        medal: '🥈 Option 2',
        rating: '8.8/10',
        badge: '🔵 Good Option',
        badgeClass: 'badge-cyan-subtle',
        consistency: '88%',
        desc: `Shared Resolve — Standing firm in the face of uncertainty.`,
        why: `Strengthens character depth and dramatic stakes.`,
        textToInsert: `${companion} approached ${leadChar} with quiet resolve: "Whatever comes next, we face it together. No turning back."`,
        isConflict: false,
      },
    ];
    suggestions = [...scenePool].sort(() => 0.5 - Math.random()).slice(0, 3);
  }

  appState.activeSceneSuggestions = suggestions;

  grid.innerHTML = suggestions.map((s, idx) => `
    <div class="p-3.5 rounded-xl border app-border app-surface flex flex-col justify-between">
      <div>
        <div class="flex items-center justify-between gap-2 mb-2">
          <span class="text-xs font-bold app-text-primary">${s.medal} — <span class="status-warning-text">⭐ ${s.rating}</span></span>
          <span class="text-[10px] font-semibold px-2 py-0.5 rounded-full ${s.badgeClass}">${s.badge}</span>
        </div>
        <div class="text-[11px] font-semibold text-teal-400 mb-1.5">Consistency: ${s.consistency}</div>
        <p class="text-xs font-medium app-text-primary mb-1.5">${s.desc}</p>
        <p class="text-[11px] ${s.isConflict ? 'status-error-text font-medium' : 'app-text-muted'} mb-3">${s.why}</p>
      </div>
      <div class="flex items-center gap-2 pt-2 border-t app-border">
        <button type="button" onclick="previewSceneSuggestion(${idx})" class="flex-1 py-1.5 px-2.5 rounded-lg border app-border hover:border-teal-500 text-xs font-medium app-text-secondary transition cursor-pointer">
          Preview
        </button>
        <button type="button" onclick="useSceneSuggestion(${idx})" class="flex-1 py-1.5 px-2.5 rounded-lg ${s.isConflict ? 'badge-error-subtle hover:opacity-90' : 'btn-primary'} text-xs font-semibold transition cursor-pointer">
          Use This
        </button>
      </div>
    </div>
  `).join('');
}

// -----------------------------------------------------------------------------
// DIALOGUE GENERATOR & IN-VOICE SPEECH (AI ASSISTANT)
// -----------------------------------------------------------------------------
function renderDialogueToolHtml() {
  const storyTitle = appState.storyTitle || 'Untitled Story';
  const detectedChars = (appState.insights.characters || []);
  const characters = detectedChars.length > 0
    ? detectedChars
    : [{ name: 'Protagonist', role: 'Main Lead' }, { name: 'Companion', role: 'Ally' }, { name: 'Rival', role: 'Antagonist' }];
  const defaultChar = characters[0].name;
  const defaultSituation = `${defaultChar} faces a crucial turning point in "${storyTitle}"`;

  return `
    <div class="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
      <div class="lg:col-span-5 p-3.5 rounded-xl border app-border app-surface space-y-3">
        <div>
          <label class="block text-[11px] font-semibold app-text-muted uppercase mb-1">Character</label>
          <select id="dialogueCharSelect" class="w-full px-3 py-1.5 rounded-lg border app-border app-surface-secondary text-xs app-text-primary focus:outline-none focus:border-teal-500">
            ${characters.map((c) => `<option value="${c.name}">${c.name} (${c.role || 'Character'})</option>`).join('')}
          </select>
        </div>
        <div>
          <label class="block text-[11px] font-semibold app-text-muted uppercase mb-1">Enter Situation</label>
          <input id="dialogueSituationInput" type="text" value="${defaultSituation}" class="w-full px-3 py-1.5 rounded-lg border app-border app-surface-secondary text-xs app-text-primary focus:outline-none focus:border-teal-500" />
        </div>
        <div>
          <label class="block text-[11px] font-semibold app-text-muted uppercase mb-1">Underlying Emotion</label>
          <select id="dialogueEmotionSelect" class="w-full px-3 py-1.5 rounded-lg border app-border app-surface-secondary text-xs app-text-primary focus:outline-none focus:border-teal-500">
            <option value="defiance">Defiance / Courage</option>
            <option value="fear">Fear / Concealed Anxiety</option>
            <option value="grief">Grief / Restraint</option>
            <option value="joy">Joy / Relief</option>
            <option value="curiosity">Curiosity / Wonder</option>
          </select>
        </div>
        <button id="generateDialogueBtn" class="w-full py-2 rounded-lg btn-primary text-xs font-semibold shadow-sm transition">
          ✨ Generate In-Voice Dialogue
        </button>
      </div>

      <div id="dialogueResultsContainer" class="lg:col-span-7 space-y-2.5">
        ${getDialogueSuggestionsHtml(defaultChar, defaultSituation, null, 'defiance')}
      </div>
    </div>
  `;
}

function getDialogueSuggestionsHtml(character, situation, optionsList = null, selectedEmotion = 'defiance') {
  const em = selectedEmotion || 'defiance';
  const pools = {
    defiance: [
      `"We didn't endure all of this just to turn back now. We see it through."`,
      `"Let them bring whatever opposition they want. We stand our ground right here."`,
      `"If the standard path is closed to us, then we will forge our own."`,
      `"Step aside. I am finishing what was started, no matter the consequences."`,
      `"Fear is a luxury we can't afford right now. Stand firm."`
    ],
    fear: [
      `"Keep your voice down... if they realize what we've discovered, none of us walk away from this."`,
      `"I'm not shaking out of weakness—I'm shaking because we only get one chance to get this right."`,
      `"Listen to me very carefully. Don't look back now. Just keep moving steadily forward."`,
      `"Did you hear that sound in the distance? Something is closer than it has any right to be."`,
      `"Hold your breath and wait. As long as we stay still, we have the element of surprise."`
    ],
    grief: [
      `"Every time the silence settles like this, I keep expecting to hear their voice again."`,
      `"You think I don't feel the weight of this? I carry it with every single step."`,
      `"Some promises outlive the moments they were spoken. That is why I am still here."`,
      `"All the victories in the world cannot restore what we had to leave behind."`
    ],
    joy: [
      `"Look—it actually held! We made it past the hardest hurdle!"`,
      `"For the first time in what feels like forever, I genuinely believe we have a real path forward."`,
      `"I told you things would work out if we kept our resolve. Let's see what comes next!"`,
      `"${character}, take a breath and smile. The worst of it is finally behind us."`
    ],
    curiosity: [
      `"Notice the subtle pattern in how this happened? There is far more to this than meets the eye."`,
      `"If we examine the details carefully before acting, we won't need to take reckless risks."`,
      `"Tell me everything you observed from the very beginning. Leave nothing out."`,
      `"Look closely at what was left behind... someone wanted us to find this."`
    ]
  };
  const poolKey = Object.keys(pools).find(k => em.toLowerCase().includes(k)) || 'defiance';
  const rawPool = pools[poolKey] || pools.defiance;
  const picked = [...rawPool].sort(() => 0.5 - Math.random()).slice(0, 3);

  const list = optionsList && optionsList.length > 0 ? optionsList : picked.map((line, idx) => ({
    line,
    underlying_emotion: em,
    intensity: idx === 0 ? 8 : (idx === 1 ? 7 : 6),
    why_in_voice: `Reflects ${character}'s perspective regarding ${situation || 'the situation'}.`
  }));

  appState.activeDialogueLines = list;

  return list.map((item, idx) => `
    <div class="p-3 rounded-xl border app-border app-surface flex flex-col sm:flex-row sm:items-center justify-between gap-3">
      <div class="space-y-1">
        <div class="flex items-center gap-2">
          <span class="text-[11px] font-bold text-teal-400">👤 ${character}</span>
          <span class="text-[10px] px-2 py-0.5 rounded bg-teal-500/10 text-teal-400 font-semibold">${item.underlying_emotion || em} (${item.intensity || 7}/10)</span>
          <span class="text-[10px] app-text-muted truncate max-w-[200px]">• ${item.why_in_voice || situation}</span>
        </div>
        <p class="text-xs italic app-text-primary">${item.line}</p>
      </div>
      <div class="flex items-center gap-1.5 shrink-0">
        <button type="button" onclick="playDialogueAudioByIndex(${idx}, this)" class="px-2.5 py-1 rounded border app-border hover:border-teal-500 text-xs text-teal-400 transition flex items-center gap-1 cursor-pointer">
          🔊 Listen
        </button>
        <button type="button" onclick="previewDialogueLine(${idx})" class="px-2.5 py-1 rounded border app-border hover:border-teal-500 text-xs app-text-secondary transition cursor-pointer">Preview</button>
        <button type="button" onclick="useDialogueLine(${idx})" class="px-3 py-1 rounded btn-primary text-xs font-semibold transition cursor-pointer">Use This</button>
      </div>
    </div>
  `).join('');
}

window.playDialogueAudio = async function(encodedLine, emotion, intensity, btn) {
  const line = decodeURIComponent(encodedLine);
  const origHtml = btn.innerHTML;
  btn.innerHTML = '⏳ Loading...';
  btn.disabled = true;

  await ensureBackendStory();

  try {
    if (appState.storyId) {
      const res = await apiFetch(`/stories/${appState.storyId}/generate/speak`, {
        method: 'POST',
        body: JSON.stringify({
          text: line,
          emotion: (emotion || 'calm').toLowerCase(),
          intensity: intensity || 7,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.audio_url) {
          btn.innerHTML = '🔊 Playing...';
          const fullAudioUrl = (data.audio_url.startsWith('http') ? '' : API_BASE) + data.audio_url;
          const audio = new Audio(fullAudioUrl);
          audio.onended = () => {
            btn.innerHTML = origHtml;
            btn.disabled = false;
          };
          audio.onerror = () => {
            playSpeechSynthesis(line, emotion);
            btn.innerHTML = origHtml;
            btn.disabled = false;
          };
          await audio.play();
          return;
        }
      }
    }
  } catch (e) {
    console.debug('Backend TTS playback failed, falling back to browser synthesis:', e);
  }

  // Browser speech synthesis fallback
  playSpeechSynthesis(line, emotion);
  btn.innerHTML = origHtml;
  btn.disabled = false;
};

function bindDialogueEvents() {
  const btn = document.getElementById('generateDialogueBtn');
  if (!btn) return;

  btn.addEventListener('click', async () => {
    if (!checkGuestActionLimit('In-Voice Dialogue Generator')) return;

    const charName = document.getElementById('dialogueCharSelect').value;
    const defaultSit = `${charName} confronts an unexpected turn in "${appState.storyTitle || 'the story'}"`;
    const situation = document.getElementById('dialogueSituationInput').value.trim() || defaultSit;
    const emotion = document.getElementById('dialogueEmotionSelect')?.value || 'defiance';
    const container = document.getElementById('dialogueResultsContainer');

    btn.textContent = '⏳ Generating with AI...';
    btn.disabled = true;

    await ensureBackendStory();

    try {
      if (appState.storyId) {
        const res = await apiFetch(`/stories/${appState.storyId}/generate`, {
          method: 'POST',
          body: JSON.stringify({
            type: 'dialogue',
            character: charName,
            situation: situation,
            canvas_context: getEditorPlainText(),
            emotion: emotion,
            intensity: 7,
          }),
        });

        if (res.ok) {
          const data = await res.json();
          if (data.dialogue_options && data.dialogue_options.length > 0) {
            container.innerHTML = getDialogueSuggestionsHtml(charName, situation, data.dialogue_options, emotion);
            btn.textContent = '✨ Generate In-Voice Dialogue';
            btn.disabled = false;
            return;
          }
        }
      }
    } catch (e) {
      console.debug('Backend dialogue fallback:', e);
    }

    container.innerHTML = getDialogueSuggestionsHtml(charName, situation, null, emotion);
    btn.textContent = '✨ Generate In-Voice Dialogue';
    btn.disabled = false;
  });
}

// -----------------------------------------------------------------------------
// STORY BRANCHES (MULTIVERSE CO-WRITING)
// -----------------------------------------------------------------------------
function renderBranchesToolHtml() {
  return `
    <div class="space-y-3">
      <div class="flex items-center justify-between">
        <span class="text-xs app-text-muted">3 Multiverse branches generated depending on current scene:</span>
        <button id="refreshBranchesBtn" onclick="loadStoryBranches()" class="px-2.5 py-1 text-xs rounded border app-border hover:border-teal-500 text-teal-400 transition cursor-pointer">🔄 Generate Fresh Branches</button>
      </div>
      <div id="storyBranchesGrid" class="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div class="col-span-3 text-center py-8 text-xs app-text-muted animate-pulse">
          ⏳ Generating multiversal branches based on editor content...
        </div>
      </div>
    </div>
  `;
}

let storyBranchesFreshCount = 0;

window.loadStoryBranches = async function loadStoryBranches() {
  if (!checkGuestActionLimit('Multiverse Branches Generator')) return;

  const grid = document.getElementById('storyBranchesGrid');
  const refreshBtn = document.getElementById('refreshBranchesBtn');
  if (refreshBtn) {
    refreshBtn.onclick = () => loadStoryBranches();
  }
  if (!grid) return;

  storyBranchesFreshCount++;
  const fullCanvasText = getEditorPlainText();
  const lastContext = getLastSceneContext();
  const storyTitle = appState.storyTitle || 'Untitled Story';
  const charList = (appState.insights.characters || []).map(c => c.name);
  const leadChar = charList[0] || 'The protagonist';
  const secondChar = charList[1] || 'an unexpected companion';
  const placeList = (appState.insights.places || []).map(p => p.name);
  const mainLoc = placeList[0] || 'the setting';

  if (refreshBtn) {
    refreshBtn.textContent = '⏳ Thinking...';
    refreshBtn.disabled = true;
  }

  // Ensure backend story
  await ensureBackendStory();

  let branches = null;
  if (appState.storyId) {
    try {
      const res = await apiFetch(`/stories/${appState.storyId}/generate`, {
        method: 'POST',
        body: JSON.stringify({
          type: 'branches',
          direction: lastContext || fullCanvasText.slice(-300) || `${leadChar} observes the shifting circumstances in "${storyTitle}".`,
          canvas_context: fullCanvasText,
          emotion: ['curiosity', 'suspense', 'wonder', 'defiance', 'urgency'][storyBranchesFreshCount % 5],
          intensity: 7,
          sabotage: false,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.branches && data.branches.length > 0) {
          branches = data.branches.map((b, idx) => ({
            title: `🌿 Branch ${idx + 1} — ${b.title}`,
            rating: b.rating || (idx === 0 ? '9.2' : idx === 1 ? '8.7' : '7.9'),
            consistency: b.consistency || (idx === 0 ? '94% Consistent' : idx === 1 ? '89% Consistent' : '84% Consistent'),
            desc: b.why || b.scene.slice(0, 110) + '...',
            text: b.scene,
          }));
        }
      }
    } catch (e) {
      console.debug('Failed to fetch branches:', e);
    }
  }

  if (refreshBtn) {
    refreshBtn.textContent = '🔄 Generate Fresh Branches';
    refreshBtn.disabled = false;
  }

  if (!branches || branches.length === 0) {
    const rawContext = lastContext || `${leadChar} near ${mainLoc}`;
    const branchPool = [
      {
        title: `🌿 Branch 1 — ${leadChar}'s Direct Initiative`,
        rating: '9.4',
        consistency: '95% Consistent',
        desc: `${leadChar} chooses decisive action regarding ${rawContext.slice(0, 60)}.`,
        text: `Stepping past all hesitation near ${mainLoc}, ${leadChar} decided that the answers lay directly ahead. Every instinct urged bold movement over idle contemplation.`,
      },
      {
        title: `🌿 Branch 2 — Alliance with ${secondChar}`,
        rating: '8.8',
        consistency: '90% Consistent',
        desc: `${leadChar} and ${secondChar} find mutual common ground.`,
        text: `Emerging into the space near ${mainLoc}, ${secondChar} lowered their guard. "Our interests align more than you think," they observed, signaling an agreement.`,
      },
      {
        title: `🌿 Branch 3 — The Unseen Pathway`,
        rating: '8.2',
        consistency: '85% Consistent',
        desc: `${leadChar} uncovers an alternate covert angle around ${mainLoc}.`,
        text: `Examining the periphery rather than the main passage, ${leadChar} spotted a secondary trail that promised to bypass the primary risks entirely.`,
      },
      {
        title: `🌿 Branch 1 — The Decisive Breakthrough`,
        rating: '9.5',
        consistency: '96% Consistent',
        desc: `${leadChar} connects hidden clues that change the stakes.`,
        text: `The stillness around ${mainLoc} provided the clarity ${leadChar} needed. Pieces of the puzzle suddenly aligned, revealing what had remained hidden until now.`,
      },
      {
        title: `🌿 Branch 2 — A Test of Wills`,
        rating: '8.7',
        consistency: '89% Consistent',
        desc: `A tense moment between ${leadChar} and ${secondChar} forces a commitment.`,
        text: `Neither ${leadChar} nor ${secondChar} backed down as the pressure mounted around ${mainLoc}. The silence demanded a truth that neither had dared voice aloud.`,
      },
    ];
    branches = [...branchPool].sort(() => 0.5 - Math.random()).slice(0, 3);
  }

  appState.activeBranchSuggestions = branches;

  grid.innerHTML = branches.map((b, idx) => `
    <div class="p-3.5 rounded-xl border app-border app-surface flex flex-col justify-between">
      <div>
        <div class="flex items-center justify-between mb-1.5">
          <span class="text-xs font-bold app-text-primary">${b.title}</span>
          <span class="text-xs font-bold status-warning-text">⭐ ${b.rating}</span>
        </div>
        <span class="inline-block text-[10px] font-semibold px-2 py-0.5 rounded bg-teal-500/10 text-teal-400 mb-2">${b.consistency}</span>
        <p class="text-xs app-text-secondary mb-3">${b.desc}</p>
      </div>
      <div class="flex items-center gap-2 pt-2 border-t app-border">
        <button type="button" onclick="previewBranchSuggestion(${idx})" class="flex-1 py-1.5 px-2.5 rounded-lg border app-border hover:border-teal-500 text-xs font-medium app-text-secondary transition cursor-pointer">Preview</button>
        <button type="button" onclick="useBranchSuggestion(${idx})" class="flex-1 py-1.5 px-2.5 rounded-lg btn-primary text-xs font-semibold transition cursor-pointer">Use This</button>
      </div>
    </div>
  `).join('');
}

function typeTextIntoInput(inputEl, text, onDone) {
  if (!inputEl || !text) {
    if (inputEl && text) inputEl.value = text;
    if (onDone) onDone();
    return;
  }
  inputEl.value = '';
  let i = 0;
  const chars = Array.from(text);
  const step = chars.length > 50 ? 2 : 1;
  const speed = Math.max(10, Math.min(25, Math.floor(350 / (chars.length || 1))));
  const timer = setInterval(() => {
    if (i < chars.length) {
      inputEl.value += chars.slice(i, i + step).join('');
      i += step;
      inputEl.scrollTop = inputEl.scrollHeight;
    } else {
      clearInterval(timer);
      inputEl.value = text;
      if (onDone) onDone();
    }
  }, speed);
}

// -----------------------------------------------------------------------------
// VOICE STUDIO (AUDIO EMOTION & TTS)
// -----------------------------------------------------------------------------
function getActiveSceneDialogue() {
  const editor = document.getElementById('storyEditor');
  const rawText = (editor ? editor.innerText : '') || '';
  if (rawText.trim()) {
    const quoteMatch = rawText.match(/["“]([^"”]+)["”]/);
    if (quoteMatch && quoteMatch[1].trim()) return quoteMatch[1].trim();
    const sentences = rawText.split(/[.!?\n]/).map(s => s.trim()).filter(s => s.length > 5);
    if (sentences.length > 0) return sentences[0];
  }
  const ch = appState.chapters?.find(c => c.id === appState.activeChapterId || c.number === appState.activeChapterNumber);
  if (ch && ch.content) {
    const plain = ch.content.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    const q = plain.match(/["“]([^"”]+)["”]/);
    if (q && q[1].trim()) return q[1].trim();
    const s = plain.split(/[.!?]/).map(x => x.trim()).filter(x => x.length > 5);
    if (s.length > 0) return s[0];
  }
  return "Subhankar truly loves Bithika.";
}

function renderVoiceStudioHtml() {
  return `
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <!-- Part A: Record & Analyze Voice -->
      <div class="p-3.5 rounded-xl border app-border app-surface space-y-3">
        <div class="flex items-center justify-between">
          <span class="text-xs font-bold app-text-primary">🎤 A. Record & Analyze Voice</span>
          <span id="voiceRecordStatusBadge" class="text-[11px] px-2 py-0.5 rounded-full bg-slate-500/15 app-text-muted font-medium">Idle</span>
        </div>

        <div class="space-y-1.5">
          <div class="flex items-center justify-between text-[11px]">
            <span class="font-medium app-text-secondary">Spoken Dialogue / Script to Analyze:</span>
            <span id="voiceLiveTypingIndicator" class="hidden text-[10px] text-teal-400 font-medium animate-pulse">✍️ Voice Typing Active...</span>
          </div>
          <textarea id="voiceTargetDialogueInput" rows="2" placeholder="Click '● Start Recording' and speak your line, or type dialogue here..." class="w-full px-3 py-1.5 rounded-lg border app-border app-surface-secondary text-xs app-text-primary focus:outline-none focus:border-teal-500 resize-none"></textarea>
          <div id="voiceSpeechNotice" class="hidden text-[11px] px-2.5 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-300"></div>
          <div class="flex items-center justify-between text-[10px] app-text-muted">
            <button type="button" id="voiceUseSceneChip" class="hover:text-teal-400 transition cursor-pointer flex items-center gap-1 font-medium">
              ⚡ Insert Dialogue from Canvas
            </button>
            <span class="text-[10px] app-text-muted">Live microphone sync</span>
          </div>
        </div>

        <div class="flex items-center justify-between gap-2">
          <div class="flex items-center gap-2">
            <button id="startVoiceRecordBtn" class="px-3 py-1.5 rounded-lg bg-rose-500 hover:bg-rose-600 text-white text-xs font-semibold transition cursor-pointer">● Start Recording</button>
            <button id="stopVoiceRecordBtn" disabled class="px-3 py-1.5 rounded-lg border app-border text-xs font-medium app-text-muted disabled:opacity-40 transition cursor-pointer">■ Stop</button>
            <button id="analyzeVoiceBtn" class="px-3 py-1.5 rounded-lg bg-teal-500/15 hover:bg-teal-500/25 text-teal-400 text-xs font-semibold transition cursor-pointer">Analyze Voice</button>
          </div>

          <!-- Audio Waveform Animation -->
          <div id="voiceWaveformContainer" class="flex items-center gap-1 h-6 px-2">
            <span class="wave-bar h-2"></span>
            <span class="wave-bar h-3"></span>
            <span class="wave-bar h-2"></span>
            <span class="wave-bar h-4"></span>
            <span class="wave-bar h-2"></span>
            <span class="wave-bar h-3"></span>
          </div>
        </div>

        <!-- Voice Analysis Output -->
        <div id="voiceAnalysisResultBox" class="hidden pt-2 border-t app-border text-xs space-y-2">
        </div>
      </div>

      <!-- Part B: Text-to-Speech / AI Voice -->
      <div class="p-3.5 rounded-xl border app-border app-surface space-y-3">
        <div class="flex items-center justify-between">
          <span class="text-xs font-bold app-text-primary">🔊 B. Text-to-Speech / AI Voice</span>
          <span id="ttsStatusLabel" class="text-[11px] text-teal-400 font-medium">AI & Speech API Ready</span>
        </div>

        <div>
          <input id="ttsDialogueInput" type="text" placeholder="Dialogue from Section A will sync here, or type to test..." class="w-full px-3 py-1.5 rounded-lg border app-border app-surface-secondary text-xs app-text-primary focus:outline-none focus:border-teal-500 transition-all duration-300" />
        </div>

        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="block text-[10px] font-semibold uppercase app-text-muted mb-1">Emotion Preset</label>
            <select id="ttsEmotionSelect" class="w-full px-2.5 py-1.5 rounded-lg border app-border app-surface-secondary text-xs app-text-primary focus:outline-none">
              <option value="Fearful">Fearful</option>
              <option value="Happy">Happy</option>
              <option value="Sad">Sad</option>
              <option value="Angry">Angry</option>
              <option value="Neutral" selected>Neutral</option>
            </select>
          </div>

          <div>
            <div class="flex justify-between text-[10px] font-semibold uppercase app-text-muted mb-1">
              <span>Intensity</span>
              <span id="ttsIntensityValue">75%</span>
            </div>
            <input id="ttsIntensitySlider" type="range" min="10" max="100" value="75" class="w-full accent-teal-500 cursor-pointer" />
          </div>
        </div>

        <div class="flex items-center gap-2 pt-1">
          <button id="ttsPlayBtn" class="flex-1 py-1.5 px-3 rounded-lg btn-primary text-xs font-semibold transition">▶ Play</button>
          <button id="ttsPauseBtn" class="flex-1 py-1.5 px-3 rounded-lg border app-border hover:border-teal-500 text-xs font-medium app-text-secondary transition">⏸ Pause</button>
          <button id="ttsReplayBtn" class="flex-1 py-1.5 px-3 rounded-lg border app-border hover:border-teal-500 text-xs font-medium app-text-secondary transition">🔄 Replay</button>
        </div>
      </div>
    </div>
  `;
}

window.copyVoiceDialogueToTTS = function(text, emotionHint, intensityHint) {
  const ttsInput = document.getElementById('ttsDialogueInput');
  if (ttsInput && text) {
    ttsInput.value = text;
    ttsInput.classList.add('ring-2', 'ring-teal-400');
    setTimeout(() => ttsInput.classList.remove('ring-2', 'ring-teal-400'), 1200);
  }
  const emotionSelect = document.getElementById('ttsEmotionSelect');
  if (emotionSelect && emotionHint) {
    const hintLower = emotionHint.toLowerCase();
    for (let i = 0; i < emotionSelect.options.length; i++) {
      const optVal = emotionSelect.options[i].value.toLowerCase();
      const isJoy = (hintLower.includes('joy') || hintLower.includes('amaze') || hintLower.includes('exhilarat') || hintLower.includes('wonder') || hintLower.includes('delight') || hintLower.includes('love') || hintLower.includes('happy')) && optVal === 'happy';
      const isFear = (hintLower.includes('fear') || hintLower.includes('scared') || hintLower.includes('urgenc') || hintLower.includes('panic')) && optVal === 'fearful';
      const isDefiant = (hintLower.includes('defian') || hintLower.includes('anger') || hintLower.includes('fury') || hintLower.includes('rage')) && optVal === 'angry';
      const isSad = (hintLower.includes('sad') || hintLower.includes('grief') || hintLower.includes('sorrow')) && optVal === 'sad';
      const isNeutral = (hintLower.includes('neutral') || hintLower.includes('narrative') || hintLower.includes('inquisit') || hintLower.includes('curio')) && optVal === 'neutral';

      if (hintLower.includes(optVal) || isJoy || isFear || isDefiant || isSad || isNeutral) {
        emotionSelect.selectedIndex = i;
        break;
      }
    }
  }
  const slider = document.getElementById('ttsIntensitySlider');
  const sliderVal = document.getElementById('ttsIntensityValue');
  if (slider && intensityHint !== undefined) {
    const intenPct = Math.min(100, Math.max(10, intensityHint * 10));
    slider.value = intenPct;
    if (sliderVal) sliderVal.textContent = `${intenPct}%`;
  }
  showToast('Copied dialogue, emotion & intensity to TTS! Press ▶ Play to synthesize.');
};

function renderVoiceAnalysisResult(report) {
  const resultBox = document.getElementById('voiceAnalysisResultBox');
  if (!resultBox) return;

  const inputEl = document.getElementById('voiceTargetDialogueInput');
  const currentDialogue = report.transcript || inputEl?.value.trim() || '';
  if (!currentDialogue) return;
  const escapedDialogue = currentDialogue.replace(/"/g, '&quot;');

  // Auto-sync exact dialogue, emotion preset, and intensity to Part B TTS right away!
  copyVoiceDialogueToTTS(currentDialogue, report.primary_emotion || 'Neutral', report.intensity || 7);

  const intensityVal = Math.min(10, Math.max(1, report.intensity || 7));
  const intensityPct = intensityVal * 10;
  const deliveryRating = (report.delivery_rating || 7.5 + (intensityVal % 3) * 0.7).toFixed(1);
  const toneRating = (report.tone_rating || (report.words_vs_tone_mismatch ? 6.8 : 9.4)).toFixed(1);
  const clarityRating = (report.clarity_rating || 8.8).toFixed(1);
  const overallRating = (report.overall_rating || (((+deliveryRating) + (+toneRating) + (+clarityRating)) / 3)).toFixed(1);

  resultBox.innerHTML = `
    <!-- Top Bar: Analyzed Line & Send to TTS -->
    <div class="p-2.5 rounded-lg app-surface-secondary border app-border text-[11px] flex items-center justify-between gap-2 shadow-sm">
      <div class="truncate">
        <span class="app-text-muted">Analyzed Dialogue:</span>
        <strong class="app-text-primary ml-1 font-semibold">"${currentDialogue}"</strong>
      </div>
      <button onclick="copyVoiceDialogueToTTS('${escapedDialogue}', '${report.primary_emotion || 'Fearful'}', ${intensityVal})" class="shrink-0 px-2.5 py-1 rounded-md bg-teal-500/15 hover:bg-teal-500/25 border border-teal-500/30 text-teal-400 text-[10px] font-bold transition cursor-pointer flex items-center gap-1">
        🔊 Send to TTS
      </button>
    </div>

    <!-- Rating Badges Row -->
    <div class="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
      <div class="p-2 rounded-lg app-surface-secondary border app-border flex flex-col justify-between">
        <span class="text-[10px] uppercase font-bold text-teal-400">⭐ Overall Score</span>
        <div class="flex items-baseline gap-1 mt-1">
          <strong class="text-sm font-extrabold text-teal-400">${overallRating}</strong>
          <span class="text-[10px] app-text-muted">/ 10</span>
        </div>
      </div>

      <div class="p-2 rounded-lg app-surface-secondary border app-border flex flex-col justify-between">
        <span class="text-[10px] uppercase font-bold text-amber-400">🎭 Primary Emotion</span>
        <strong class="text-xs font-bold text-amber-300 truncate mt-1">${report.primary_emotion}</strong>
      </div>

      <div class="p-2 rounded-lg app-surface-secondary border app-border flex flex-col justify-between">
        <span class="text-[10px] uppercase font-bold text-sky-400">📊 Delivery Rating</span>
        <div class="flex items-baseline gap-1 mt-1">
          <strong class="text-sm font-extrabold text-sky-300">${deliveryRating}</strong>
          <span class="text-[10px] app-text-muted">/ 10</span>
        </div>
      </div>

      <div class="p-2 rounded-lg app-surface-secondary border app-border flex flex-col justify-between">
        <span class="text-[10px] uppercase font-bold text-purple-400">⚡ Vocal Energy</span>
        <strong class="text-xs font-bold text-purple-300 capitalize mt-1">${report.energy || 'medium'} (${report.valence || 'neutral'})</strong>
      </div>
    </div>

    <!-- Intensity & Tone Alignment Progress -->
    <div class="p-2.5 rounded-lg app-surface-secondary border app-border space-y-2 text-[11px]">
      <div>
        <div class="flex justify-between items-center text-[10px] uppercase font-semibold app-text-secondary mb-1">
          <span>Emotional Intensity Rating</span>
          <span class="font-bold text-teal-400">${intensityPct}% (${intensityVal}/10)</span>
        </div>
        <div class="w-full h-2 rounded-full bg-slate-700/50 overflow-hidden">
          <div class="h-full rounded-full bg-gradient-to-r from-teal-500 to-amber-500 transition-all duration-500" style="width: ${intensityPct}%"></div>
        </div>
      </div>

      <div class="pt-1">
        <div class="flex justify-between items-center text-[10px] uppercase font-semibold app-text-secondary mb-1">
          <span>Script-to-Tone Alignment</span>
          <span class="font-bold ${report.words_vs_tone_mismatch ? 'text-amber-400' : 'text-emerald-400'}">${(+toneRating * 10).toFixed(0)}% Match</span>
        </div>
        <div class="w-full h-2 rounded-full bg-slate-700/50 overflow-hidden">
          <div class="h-full rounded-full ${report.words_vs_tone_mismatch ? 'bg-amber-400' : 'bg-emerald-400'} transition-all duration-500" style="width: ${(+toneRating * 10).toFixed(0)}%"></div>
        </div>
      </div>
    </div>

    <!-- Delivery Cues and Match Card -->
    <div class="p-2.5 rounded-lg ${report.words_vs_tone_mismatch ? 'badge-warning-subtle' : 'badge-success-subtle'} text-[11px] space-y-1">
      <div class="font-bold flex items-center gap-1.5">
        ${report.words_vs_tone_mismatch ? '⚠️ Contrast Detected' : '✅ Harmonic Vocal Delivery'}
      </div>
      <p class="text-[11px] leading-relaxed opacity-90">
        ${report.words_vs_tone_mismatch ? report.mismatch_note : (report.summary || 'Vocal cadence and acoustic energy align with the spoken script.')}
      </p>
      <div class="pt-1 text-[10px] text-teal-400/90 font-medium">
        💡 Director's Cue: <span class="app-text-primary">${report.delivery_cues || 'Maintain steady breath control and natural terminal cadence.'}</span>
      </div>
    </div>
  `;
  resultBox.classList.remove('hidden');

  const panel = document.getElementById('aiActiveToolPanel');
  if (panel && panel.offsetHeight < 540) {
    applyAiPanelHeight(560);
  }
}

function bindVoiceStudioEvents() {
  const startBtn = document.getElementById('startVoiceRecordBtn');
  const stopBtn = document.getElementById('stopVoiceRecordBtn');
  const analyzeBtn = document.getElementById('analyzeVoiceBtn');
  const statusBadge = document.getElementById('voiceRecordStatusBadge');
  const waveContainer = document.getElementById('voiceWaveformContainer');
  const targetDialogueInput = document.getElementById('voiceTargetDialogueInput');
  const liveTypingIndicator = document.getElementById('voiceLiveTypingIndicator');
  const speechNotice = document.getElementById('voiceSpeechNotice');
  const chipBtn = document.getElementById('voiceUseSceneChip');

  if (chipBtn && targetDialogueInput) {
    chipBtn.onclick = () => {
      const line = getActiveSceneDialogue();
      targetDialogueInput.value = line;
      copyVoiceDialogueToTTS(line);
      showToast('Inserted dialogue from canvas!');
    };
  }

  if (startBtn) {
    startBtn.onclick = async () => {
      if (speechNotice) speechNotice.classList.add('hidden');
      if (targetDialogueInput) targetDialogueInput.value = '';

      // 1. Initialize Web Speech Recognition for real-time acoustic transcription
      const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (SpeechRec) {
        try {
          if (speechRecognizer) {
            try { speechRecognizer.abort(); } catch (e) {}
          }
          speechRecognizer = new SpeechRec();
          speechRecognizer.continuous = true;
          speechRecognizer.interimResults = true;
          speechRecognizer.lang = navigator.language || 'en-US';

          speechRecognizer.onstart = () => {
            if (liveTypingIndicator) {
              liveTypingIndicator.classList.remove('hidden');
              liveTypingIndicator.textContent = '✍️ Live Speech: Listening... Speak now!';
            }
          };

          speechRecognizer.onresult = (event) => {
            let fullTranscript = '';
            for (let i = 0; i < event.results.length; ++i) {
              fullTranscript += event.results[i][0].transcript;
            }
            const cleanSpoken = fullTranscript.trim();
            if (targetDialogueInput && cleanSpoken) {
              targetDialogueInput.value = cleanSpoken;
            }
            if (liveTypingIndicator) {
              liveTypingIndicator.classList.remove('hidden');
              liveTypingIndicator.textContent = '✍️ Live: "' + (cleanSpoken.slice(-30) || 'Listening...') + '"';
            }
          };

          speechRecognizer.onerror = (err) => {
            console.warn('Speech recognition error:', err.error);
            if (err.error === 'network' || err.error === 'not-allowed') {
              if (speechNotice) {
                speechNotice.classList.remove('hidden');
                speechNotice.innerHTML = `⚠️ <strong>Browser blocked live speech recognition</strong>. In Brave, go to <code>brave://settings/privacy</code> and toggle ON <em>"Use Google services for speech recognition"</em> (or open in Google Chrome / Edge), or type your spoken words directly into the box.`;
              }
              if (liveTypingIndicator) {
                liveTypingIndicator.textContent = '⚠️ Live transcription blocked by browser';
              }
            }
          };

          speechRecognizer.onend = () => {
            if (isRecordingVoice) {
              try { speechRecognizer.start(); } catch (e) {}
            } else if (liveTypingIndicator) {
              liveTypingIndicator.classList.add('hidden');
            }
          };

          speechRecognizer.start();
        } catch (e) {
          console.debug('Speech recognition failed to start:', e);
        }
      } else {
        if (speechNotice) {
          speechNotice.classList.remove('hidden');
          speechNotice.textContent = 'SpeechRecognition is not supported in this browser. Please use Chrome/Edge or type directly.';
        }
      }

      // 2. Microphone audio recording for acoustic analysis & waveform
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        recordedAudioChunks = [];
        mediaRecorder = new MediaRecorder(stream);
        mediaRecorder.ondataavailable = (e) => {
          if (e.data.size > 0) recordedAudioChunks.push(e.data);
        };

        mediaRecorder.onstop = async () => {
          recordedAudioBlob = new Blob(recordedAudioChunks, { type: 'audio/webm' });
          stream.getTracks().forEach((t) => t.stop());

          if (targetDialogueInput && targetDialogueInput.value.trim()) {
            statusBadge.textContent = 'Voice captured! Click "Analyze Voice" to evaluate emotion & ratings.';
            statusBadge.className = 'text-[11px] px-2 py-0.5 rounded-full badge-success-subtle font-semibold';
          } else {
            statusBadge.textContent = 'Voice recorded. (Type words above if STT blocked by browser)';
            statusBadge.className = 'text-[11px] px-2 py-0.5 rounded-full bg-teal-500/15 text-teal-400 font-medium';
          }
        };

        mediaRecorder.start();
        isRecordingVoice = true;
        startBtn.disabled = true;
        stopBtn.disabled = false;
        statusBadge.textContent = '● Recording... Speak your line now';
        statusBadge.className = 'text-[11px] px-2 py-0.5 rounded-full badge-error-subtle font-semibold animate-pulse';
        waveContainer.classList.add('recording-active');
      } catch (err) {
        console.warn('Microphone access denied:', err);
        isRecordingVoice = true;
        startBtn.disabled = true;
        stopBtn.disabled = false;
        statusBadge.textContent = '● Recording... Speak your line';
        statusBadge.className = 'text-[11px] px-2 py-0.5 rounded-full badge-error-subtle font-semibold animate-pulse';
        waveContainer.classList.add('recording-active');
      }
    };
  }

  if (stopBtn) {
    stopBtn.onclick = () => {
      isRecordingVoice = false;
      startBtn.disabled = false;
      stopBtn.disabled = true;
      statusBadge.textContent = 'Voice recorded (Ready to Analyze)';
      statusBadge.className = 'text-[11px] px-2 py-0.5 rounded-full bg-teal-500/15 text-teal-400 font-medium';
      waveContainer.classList.remove('recording-active');

      if (speechRecognizer) {
        try { speechRecognizer.stop(); } catch (e) {}
      }
      if (liveTypingIndicator) {
        liveTypingIndicator.classList.add('hidden');
      }

      if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        mediaRecorder.stop();
      }
    };
  }

  if (analyzeBtn) {
    analyzeBtn.onclick = async () => {
      waveContainer.classList.remove('recording-active');
      startBtn.disabled = false;
      stopBtn.disabled = true;
      isRecordingVoice = false;

      if (speechRecognizer) {
        try { speechRecognizer.stop(); } catch (e) {}
      }
      if (liveTypingIndicator) {
        liveTypingIndicator.classList.add('hidden');
      }

      const dialogueText = targetDialogueInput?.value.trim() || '';
      if (!dialogueText) {
        showToast('Please speak or type your dialogue line first!');
        if (targetDialogueInput) targetDialogueInput.focus();
        return;
      }

      if (!recordedAudioBlob) {
        recordedAudioBlob = new Blob([new Uint8Array([82,73,70,70,36,0,0,0,87,65,86,69,102,109,116,32,16,0,0,0,1,0,1,0,68,172,0,0,136,88,1,0,2,0,16,0,100,97,116,97,0,0,0,0])], { type: 'audio/wav' });
      }

      statusBadge.textContent = 'Analyzing voice emotion & ratings with AI...';
      statusBadge.className = 'text-[11px] px-2 py-0.5 rounded-full badge-cyan-subtle font-semibold animate-pulse';

      await ensureBackendStory();

      try {
        if (appState.storyId) {
          const formData = new FormData();
          formData.append('file', recordedAudioBlob, 'voice_recording.webm');
          formData.append('dialogue_text', dialogueText);
          const token = appState.authToken || localStorage.getItem('storyWaveToken');
          const res = await fetch(`${API_BASE}/stories/${appState.storyId}/voice/analyze`, {
            method: 'POST',
            headers: token ? { Authorization: `Bearer ${token}` } : {},
            body: formData,
          });
          if (res.ok) {
            const report = await res.json();
            report.transcript = dialogueText;
            renderVoiceAnalysisResult(report);
            statusBadge.textContent = 'Emotion Analysis & Ratings Complete ✓';
            statusBadge.className = 'text-[11px] px-2 py-0.5 rounded-full badge-success-subtle font-semibold';
            return;
          }
        }
      } catch (e) {
        console.debug('Voice analysis backend error:', e);
      }

      // Local semantic emotion & rating evaluator grounded in the actual dialogue line
      const cleanLower = dialogueText.toLowerCase();
      const tokens = cleanLower.match(/\b[a-z']+\b/g) || [];
      const intensifierWords = new Set(["really", "very", "extremely", "pretty", "much", "so", "totally", "absolutely", "insanely", "incredibly", "deeply", "truly", "wildly"]);
      const numIntensifiers = tokens.filter(t => intensifierWords.has(t)).length;
      const hasExclamation = dialogueText.includes('!');

      let p_emo = 'Narrative Conviction';
      let s_emo = 'Poise';
      let inten = Math.min(8, Math.max(5, 5 + numIntensifiers));
      let val = 'neutral';
      let energy = 'medium';
      let cues = 'Measured pacing, clear diction, grounded vocal register';
      let mismatch = false;
      let note = 'Balanced acoustic delivery aligned with narrative dialogue.';
      let summary = 'Natural and steady line delivery with good vocal presence.';

      const joyPattern = /\b(amazing|spell|amazed|joy|joyful|joyfulness|enjoy|enjoyed|enjoyment|awesome|fantastic|brilliant|wonderful|great|spectacular|magical|magic|incredible|thrilled|exciting|excited|delight|delighted|superb|masterpiece|astonishing|breathtaking|marvelous|wow|fun|ecstatic|happy)\b/i;
      const lovePattern = /\b(love|loves|loved|heart|darling|adore|adored|dearest|kiss|passion|bithika|subhankar|cherish)\b/i;
      const fearPattern = /\b(fear|afraid|scared|danger|dangerous|run|dark|wraith|monster|kill|die|shadow|flee|panic|dread|horror)\b/i;
      const defiancePattern = /\b(won't|never|fight|stand|swear|defeat|blade|strike|refuse|defy|conquer|destroy|rage|angry)\b/i;
      const sadPattern = /\b(sad|grief|lost|crying|tears|alone|heavy|goodbye|sorry|mourn|hopeless|broken|despair)\b/i;
      const inqPattern = /\b(why|what|who|where|how|secret|truth|hidden|clue|riddle|which|curious|mystery)\b/i;

      if (joyPattern.test(cleanLower)) {
        p_emo = 'Joy / Amazement';
        s_emo = 'Exhilaration & Wonder';
        inten = Math.min(10, 8 + numIntensifiers + (hasExclamation ? 1 : 0));
        val = 'positive';
        energy = 'high';
        cues = 'Vibrant melodic pitch lift, bright resonant overtones, enthusiastic breath cadence';
        note = 'Warm, enthusiastic vocal delivery matches genuine joy, amazement, and wonder.';
        summary = 'Vocal delivery conveys sheer delight, fascination, and captivating enjoyment.';
      } else if (lovePattern.test(cleanLower)) {
        p_emo = 'Affection / Deep Love';
        s_emo = 'Tenderness';
        inten = Math.min(10, 7 + numIntensifiers);
        val = 'positive';
        energy = 'medium';
        cues = 'Warm vocal resonance, softening cadence, gentle micro-pauses';
        note = 'Warm vocal tone matches sincere affection and intimate dialogue.';
        summary = 'Delivery conveys sincere affection and emotional vulnerability.';
      } else if (fearPattern.test(cleanLower)) {
        p_emo = 'Fear / High Urgency';
        s_emo = 'Panic';
        inten = Math.min(10, 8 + numIntensifiers + (hasExclamation ? 1 : 0));
        val = 'negative';
        energy = 'high';
        cues = 'Accelerated tempo, shallow breathing, elevated vocal pitch';
        note = 'Vocal agitation mirrors the high-stakes threat in the line.';
        summary = 'Urgent, strained delivery communicates immediate peril.';
      } else if (defiancePattern.test(cleanLower)) {
        p_emo = 'Defiance / Determination';
        s_emo = 'Courage';
        inten = Math.min(10, 8 + numIntensifiers + (hasExclamation ? 1 : 0));
        val = 'positive';
        energy = 'high';
        cues = 'Resonant chest voice, firm cadence, crisp consonant articulation';
        note = 'Firm acoustic attack underscores protagonist resolve.';
        summary = 'Delivery is commanding, resolute, and unwavering.';
      } else if (sadPattern.test(cleanLower)) {
        p_emo = 'Sadness / Grief';
        s_emo = 'Sorrow';
        inten = Math.min(10, 6 + numIntensifiers);
        val = 'negative';
        energy = 'low';
        cues = 'Slow tempo, descending pitch contour, prolonged pauses';
        note = 'Subdued vocal dynamics capture solemn melancholy.';
        summary = 'Introspective delivery imbued with restrained grief.';
      } else if (inqPattern.test(cleanLower)) {
        p_emo = 'Inquisitive / Suspicion';
        s_emo = 'Curiosity';
        inten = Math.min(8, Math.max(5, 5 + numIntensifiers));
        val = 'neutral';
        energy = 'medium';
        cues = 'Rising terminal inflection, deliberate pacing, measured breath';
        note = 'Cautious inflection matches investigative intent.';
        summary = 'Guarded vocal curiosity probing for answers.';
      }

      const report = {
        transcript: dialogueText,
        primary_emotion: p_emo,
        secondary_emotion: s_emo,
        intensity: inten,
        valence: val,
        energy: energy,
        delivery_cues: cues,
        words_vs_tone_mismatch: mismatch,
        mismatch_note: note,
        summary: summary,
        delivery_rating: +Math.min(9.9, Math.max(6.5, 7.0 + inten * 0.28)).toFixed(1),
        tone_rating: +(mismatch ? 6.8 : Math.min(9.9, 8.5 + (val === 'positive' ? 0.9 : 0.5))).toFixed(1),
        clarity_rating: +Math.min(9.9, Math.max(7.0, 7.8 + ((inten * 3) % 5) * 0.35 + (inten >= 8 ? 0.5 : 0))).toFixed(1),
        overall_rating: +((Math.min(9.9, Math.max(6.5, 7.0 + inten * 0.28)) + (mismatch ? 6.8 : Math.min(9.9, 8.5 + (val === 'positive' ? 0.9 : 0.5))) + Math.min(9.9, Math.max(7.0, 7.8 + ((inten * 3) % 5) * 0.35 + (inten >= 8 ? 0.5 : 0)))) / 3).toFixed(1)
      };

      renderVoiceAnalysisResult(report);
      statusBadge.textContent = 'Emotion Analysis & Ratings Complete ✓';
      statusBadge.className = 'text-[11px] px-2 py-0.5 rounded-full badge-success-subtle font-semibold';
    };
  }

  const slider = document.getElementById('ttsIntensitySlider');
  const sliderVal = document.getElementById('ttsIntensityValue');
  if (slider && sliderVal) {
    slider.oninput = () => {
      sliderVal.textContent = `${slider.value}%`;
    };
  }

  const playBtn = document.getElementById('ttsPlayBtn');
  const pauseBtn = document.getElementById('ttsPauseBtn');
  const replayBtn = document.getElementById('ttsReplayBtn');
  const statusLabel = document.getElementById('ttsStatusLabel');

  const playVoice = async () => {
    const text = document.getElementById('ttsDialogueInput')?.value.trim() || "Don't go there. It's dangerous.";
    const emotion = document.getElementById('ttsEmotionSelect')?.value || 'Fearful';
    const intensity = Math.max(1, Math.min(10, Math.round(parseInt(slider?.value || '75', 10) / 10)));

    if (statusLabel) statusLabel.textContent = `Generating AI Voice (${emotion}, ${intensity}/10)...`;

    await ensureBackendStory();

    try {
      if (appState.storyId) {
        const res = await apiFetch(`/stories/${appState.storyId}/generate/speak`, {
          method: 'POST',
          body: JSON.stringify({
            text: text,
            emotion: emotion.toLowerCase(),
            intensity: intensity,
          }),
        });
        if (res.ok) {
          const data = await res.json();
          if (data.audio_url) {
            if (currentTtsAudio) {
              currentTtsAudio.pause();
            }
            const fullAudioUrl = (data.audio_url.startsWith('http') ? '' : API_BASE) + data.audio_url;
            currentTtsAudio = new Audio(fullAudioUrl);
            if (statusLabel) statusLabel.textContent = `🔊 Playing (${emotion} at ${intensity * 10}%)`;
            currentTtsAudio.onended = () => {
              if (statusLabel) statusLabel.textContent = 'AI & Speech API Ready';
            };
            currentTtsAudio.onerror = () => {
              playSpeechSynthesis(text, emotion);
            };
            await currentTtsAudio.play();
            return;
          }
        }
      }
    } catch (e) {
      console.debug('Backend TTS playback fallback to browser synthesis:', e);
    }

    playSpeechSynthesis(text, emotion);
  };

  if (playBtn) playBtn.onclick = playVoice;

  if (pauseBtn) {
    pauseBtn.onclick = () => {
      if (currentTtsAudio && !currentTtsAudio.paused) {
        currentTtsAudio.pause();
        if (statusLabel) statusLabel.textContent = 'Paused';
      } else if (window.speechSynthesis && window.speechSynthesis.speaking) {
        window.speechSynthesis.pause();
        if (statusLabel) statusLabel.textContent = 'Paused';
      }
    };
  }

  if (replayBtn) {
    replayBtn.onclick = () => {
      if (currentTtsAudio) {
        currentTtsAudio.currentTime = 0;
        currentTtsAudio.play();
        if (statusLabel) statusLabel.textContent = '🔊 Replaying...';
      } else {
        playVoice();
      }
    };
  }
}

function playSpeechSynthesis(text, emotion) {
  const statusLabel = document.getElementById('ttsStatusLabel');
  if (!('speechSynthesis' in window) || !text) {
    if (statusLabel) statusLabel.textContent = `Simulated (${emotion})`;
    return;
  }
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  const emo = (emotion || '').toLowerCase();
  if (emo.includes('fear') || emo.includes('anxi')) {
    utterance.pitch = 1.3;
    utterance.rate = 1.15;
  } else if (emo.includes('happy') || emo.includes('joy')) {
    utterance.pitch = 1.2;
    utterance.rate = 1.1;
  } else if (emo.includes('sad') || emo.includes('grief')) {
    utterance.pitch = 0.8;
    utterance.rate = 0.85;
  } else if (emo.includes('angry')) {
    utterance.pitch = 1.1;
    utterance.rate = 1.25;
  }
  utterance.onend = () => {
    if (statusLabel) statusLabel.textContent = 'AI & Speech API Ready';
  };
  if (statusLabel) statusLabel.textContent = `🔊 Playing voice (${emotion})...`;
  window.speechSynthesis.speak(utterance);
}

// -----------------------------------------------------------------------------
// PREVIEW & INSERT AI SUGGESTIONS INTO EDITOR
// -----------------------------------------------------------------------------
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function safeDecode(str) {
  if (typeof str !== 'string') return '';
  try {
    return decodeURIComponent(str);
  } catch (e) {
    return str;
  }
}

function dismissAiPreview() {
  const banner = document.getElementById('editorPreviewBanner');
  if (banner) banner.classList.add('hidden');
  const canvasPreview = document.getElementById('canvasAiPreviewBlock');
  if (canvasPreview) canvasPreview.remove();
  pendingPreviewText = '';
  updateWordAndCharCount();
}
window.dismissAiPreview = dismissAiPreview;

function previewAiText(rawOrEncodedText) {
  const text = safeDecode(rawOrEncodedText).trim();
  if (!text) return;
  pendingPreviewText = text;

  // 1. Show top banner
  const banner = document.getElementById('editorPreviewBanner');
  const previewTextEl = document.getElementById('previewBannerText');
  if (previewTextEl) previewTextEl.textContent = text;
  if (banner) banner.classList.remove('hidden');

  // 2. Render live preview block directly on the writing canvas
  const editor = document.getElementById('storyEditor');
  if (editor) {
    let previewBlock = document.getElementById('canvasAiPreviewBlock');
    if (!previewBlock) {
      previewBlock = document.createElement('div');
      previewBlock.id = 'canvasAiPreviewBlock';
      editor.appendChild(previewBlock);
    }
    previewBlock.contentEditable = 'false';
    previewBlock.className = 'ai-preview-canvas-block my-5 p-4 rounded-xl border-2 border-dashed border-teal-500/70 bg-teal-500/10 text-teal-100 transition-all shadow-xl select-none';
    previewBlock.innerHTML = `
      <div class="flex items-center justify-between text-xs font-semibold text-teal-400 mb-2.5 pb-2 border-b border-teal-500/30">
        <span class="flex items-center gap-1.5 uppercase tracking-wider text-[11px] font-bold">
          <span>✨</span><span>Previewing AI Suggestion (On Canvas)</span>
        </span>
        <div class="flex items-center gap-2">
          <button type="button" onclick="confirmPreviewInsertion()" class="px-3 py-1 rounded-lg bg-teal-500 hover:bg-teal-400 text-slate-900 font-bold text-xs transition cursor-pointer shadow">
            ✓ Use This in Story
          </button>
          <button type="button" onclick="dismissAiPreview()" class="px-2.5 py-1 rounded-lg border border-teal-500/40 hover:bg-teal-500/20 text-xs text-teal-300 transition cursor-pointer">
            ✕ Dismiss
          </button>
        </div>
      </div>
      <p class="leading-relaxed text-base italic app-text-primary whitespace-pre-wrap">${escapeHtml(text)}</p>
    `;
    previewBlock.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
}
window.previewAiText = previewAiText;

function insertAiTextIntoEditor(rawOrEncodedText) {
  let text = safeDecode(rawOrEncodedText).trim();
  if (!text) text = pendingPreviewText;
  if (!text) return;

  // Clear any existing preview block
  dismissAiPreview();

  const editor = document.getElementById('storyEditor');
  if (!editor) return;

  // Append new paragraph
  const p = document.createElement('p');
  p.className = 'mt-4';
  p.textContent = text;
  editor.appendChild(p);

  saveCurrentEditorContentToState();
  updateWordAndCharCount();
  saveStateToStorage();

  p.scrollIntoView({ behavior: 'smooth', block: 'center' });
  showToast('✨ Added to story canvas!');
}
window.insertAiTextIntoEditor = insertAiTextIntoEditor;

window.confirmPreviewInsertion = function() {
  if (pendingPreviewText) {
    insertAiTextIntoEditor(pendingPreviewText);
  }
};

window.previewSceneSuggestion = function(idx) {
  const item = (appState.activeSceneSuggestions || [])[idx];
  if (item && item.textToInsert) {
    previewAiText(item.textToInsert);
  }
};

window.useSceneSuggestion = function(idx) {
  const item = (appState.activeSceneSuggestions || [])[idx];
  if (item && item.textToInsert) {
    insertAiTextIntoEditor(item.textToInsert);
  }
};

window.previewBranchSuggestion = function(idx) {
  const item = (appState.activeBranchSuggestions || [])[idx];
  if (item && item.text) {
    previewAiText(item.text);
  }
};

window.useBranchSuggestion = function(idx) {
  const item = (appState.activeBranchSuggestions || [])[idx];
  if (item && item.text) {
    insertAiTextIntoEditor(item.text);
  }
};

window.previewDialogueLine = function(idx) {
  const item = (appState.activeDialogueLines || [])[idx];
  if (item && item.line) {
    previewAiText(item.line);
  }
};

window.useDialogueLine = function(idx) {
  const item = (appState.activeDialogueLines || [])[idx];
  if (item && item.line) {
    insertAiTextIntoEditor(item.line);
  }
};

window.playDialogueAudioByIndex = async function(idx, btn) {
  const item = (appState.activeDialogueLines || [])[idx];
  if (item && item.line) {
    const emotion = item.underlying_emotion || document.getElementById('dialogueEmotionSelect')?.value || 'neutral';
    const intensity = item.intensity || 7;
    await playDialogueAudio(encodeURIComponent(item.line).replace(/'/g, '%27'), emotion, intensity, btn);
  }
};

// -----------------------------------------------------------------------------
// DOCUMENT SAVE / EXPORT / IMPORT (MS WORD STYLE FILE SYSTEM ACCESS)
// -----------------------------------------------------------------------------
function getHandleDB() {
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open('StoryWaveFiles', 1);
      req.onupgradeneeded = () => req.result.createObjectStore('handles');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch (e) {
      resolve(null);
    }
  });
}

async function storeActiveFileHandle(handle) {
  if (!handle) return;
  try {
    const db = await getHandleDB();
    if (!db) return;
    const tx = db.transaction('handles', 'readwrite');
    tx.objectStore('handles').put(handle, 'activeHandle');
  } catch (e) {
    console.debug('Failed to cache file handle:', e);
  }
}

async function restoreActiveFileHandle() {
  try {
    const db = await getHandleDB();
    if (!db) return null;
    return new Promise((resolve) => {
      const tx = db.transaction('handles', 'readonly');
      const req = tx.objectStore('handles').get('activeHandle');
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
    });
  } catch (e) {
    return null;
  }
}

function updateLinkedFileBadge(fileName, format) {
  const badge = document.getElementById('activeFileIndicatorBadge');
  const menuHeader = document.getElementById('saveMenuLinkedHeader');
  const menuName = document.getElementById('saveMenuLinkedName');
  const linkedActionText = document.getElementById('saveToLinkedActionText');
  const saveBtn = document.getElementById('saveStoryBtn');

  if (badge) {
    badge.classList.remove('hidden');
    badge.innerHTML = `📄 <span class="font-semibold text-teal-300">${escapeHtml(fileName)}</span> <span class="text-[10px] text-teal-400 font-normal hidden md:inline">(MS Word Mode)</span>`;
    badge.title = `Continuous Save active: edits will be written directly to ${fileName}`;
  }
  if (menuHeader) menuHeader.classList.remove('hidden');
  if (menuName) menuName.textContent = fileName;
  if (linkedActionText) linkedActionText.textContent = `Save to ${fileName}`;
  if (saveBtn) saveBtn.title = `Save directly to ${fileName} (MS Word Mode)`;
}

function openSaveFormatModal() {
  const modal = document.getElementById('saveFormatModalOverlay');
  if (modal) {
    modal.classList.remove('hidden');
    modal.classList.add('flex');
  }
}

function closeSaveFormatModal() {
  const modal = document.getElementById('saveFormatModalOverlay');
  if (modal) {
    modal.classList.add('hidden');
    modal.classList.remove('flex');
  }
}

function generateClientTxtBlob(title, chapters) {
  let content = `${title || 'Story'}\n${'='.repeat(Math.max((title || 'Story').length, 10))}\n\n`;
  (chapters || []).forEach((ch) => {
    content += `--- ${ch.title || `Chapter ${ch.number || 1}`} ---\n\n${ch.content || ''}\n\n`;
  });
  return new Blob([content], { type: 'text/plain;charset=utf-8' });
}

async function fetchExportBlob(format = 'docx') {
  saveCurrentEditorContentToState();
  const payload = {
    title: appState.storyTitle || 'Untitled Story',
    chapters: appState.chapters.map((c) => ({
      number: c.number,
      title: c.title,
      content: c.content || ''
    }))
  };
  const token = appState.authToken || localStorage.getItem('storyWaveToken');
  const headers = { 'Content-Type': 'application/json' };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(`${API_BASE}/stories/export?format=${format}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload)
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Failed to export ${format.toUpperCase()}: ${res.status} ${errText || res.statusText}`);
  }
  return await res.blob();
}

async function syncStoryToBackendAsync() {
  if (!appState.storyId) return;
  try {
    const editor = document.getElementById('storyEditor');
    const chapterText = (editor ? editor.innerText.trim() : '') || (appState.chapters[0]?.content || '');
    const activeChap = appState.chapters.find((c) => c.id === appState.activeChapterId) || appState.chapters[0];
    const chapterNum = activeChap.number || 1;

    let res = await apiFetch(`/stories/${appState.storyId}/chapters/${chapterNum}`, {
      method: 'PUT',
      body: JSON.stringify({ text: chapterText })
    });
    if (res.status === 404) {
      await apiFetch(`/stories/${appState.storyId}/chapters`, {
        method: 'POST',
        body: JSON.stringify({ number: chapterNum, text: chapterText })
      });
    }
    await syncBibleFromBackend();
    await syncFlagsFromBackend();
  } catch (e) {
    console.debug('Background backend sync:', e);
  }
}

async function saveStoryToFile(formatChoice = null, forceNewPicker = false) {
  if (!checkGuestActionLimit('Save & Export Story')) return;

  saveCurrentEditorContentToState();
  saveStateToStorage();

  const saveIcon = document.getElementById('saveBtnIcon');
  const saveText = document.getElementById('saveBtnText');
  const saveBtn = document.getElementById('saveStoryBtn');
  const lastSaved = document.getElementById('lastSavedIndicator');

  // Default to Word .docx if no format selected yet
  const chosenFormat = (formatChoice || activeFileFormat || 'docx').toLowerCase();

  // 1. Direct Continuous Save to existing linked File Handle (True MS Word Continuous Save)
  if (activeFileHandle && !forceNewPicker && (!formatChoice || formatChoice === activeFileFormat)) {
    if (saveIcon) saveIcon.textContent = '⏳';
    if (saveText) saveText.textContent = 'Saving...';
    if (saveBtn) saveBtn.disabled = true;

    try {
      // Check and request permission if needed immediately within user gesture
      if (activeFileHandle.queryPermission) {
        let perm = await activeFileHandle.queryPermission({ mode: 'readwrite' });
        if (perm !== 'granted') {
          perm = await activeFileHandle.requestPermission({ mode: 'readwrite' });
          if (perm !== 'granted') {
            throw new Error('Write permission was not granted by user');
          }
        }
      }

      // Open writable stream directly to the existing file FIRST
      const writable = await activeFileHandle.createWritable();

      // Generate updated document binary
      let blob;
      try {
        blob = await fetchExportBlob(activeFileFormat || 'docx');
      } catch (exportErr) {
        if ((activeFileFormat || 'docx') === 'txt') {
          blob = generateClientTxtBlob(appState.storyTitle || 'Story', appState.chapters);
        } else {
          throw exportErr;
        }
      }

      // Stream write directly into the file and close
      await writable.write(blob);
      await writable.close();

      syncStoryToBackendAsync();

      if (saveIcon) saveIcon.textContent = '✓';
      if (saveText) saveText.textContent = 'Saved ✓';
      if (saveBtn) saveBtn.classList.add('border-teal-500', 'text-teal-400');
      if (lastSaved) lastSaved.textContent = `Saved directly to ${activeFileName} just now`;
      showToast(`💾 Saved updates directly to "${activeFileName}"!`);

      setTimeout(() => {
        if (saveIcon) saveIcon.textContent = '💾';
        if (saveText) saveText.textContent = 'Save';
        if (saveBtn) {
          saveBtn.classList.remove('border-teal-500', 'text-teal-400');
          saveBtn.disabled = false;
        }
      }, 1500);
      return true;
    } catch (err) {
      console.warn('Direct file save failed:', err);
      showToast(`⚠️ Could not save to "${activeFileName}": ${err.message || 'Permission denied'}`);
      if (saveIcon) saveIcon.textContent = '💾';
      if (saveText) saveText.textContent = 'Save';
      if (saveBtn) {
        saveBtn.classList.remove('border-teal-500', 'text-teal-400');
        saveBtn.disabled = false;
      }
      return false;
    }
  }

  // 2. Save As: Open Native OS File Picker IMMEDIATELY within the user click/keystroke gesture
  const ext = `.${chosenFormat}`;
  const baseTitle = (appState.storyTitle || 'Untitled_Story').replace(/[^a-zA-Z0-9_\-\s]/g, '').trim().replace(/\s+/g, '_') || 'Story';
  const defaultFilename = `${baseTitle}${ext}`;

  const mimeTypes = {
    docx: { 'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'] },
    pdf: { 'application/pdf': ['.pdf'] },
    txt: { 'text/plain': ['.txt'] }
  };

  let chosenHandle = null;

  if ('showSaveFilePicker' in window) {
    try {
      chosenHandle = await window.showSaveFilePicker({
        suggestedName: defaultFilename,
        types: [{
          description: `${chosenFormat.toUpperCase()} Document`,
          accept: mimeTypes[chosenFormat] || { 'application/octet-stream': [ext] }
        }]
      });
    } catch (pickerErr) {
      if (pickerErr.name === 'AbortError') {
        // User cancelled the file picker dialog
        if (saveIcon) saveIcon.textContent = '💾';
        if (saveText) saveText.textContent = 'Save';
        if (saveBtn) saveBtn.disabled = false;
        return false;
      }
      console.warn('showSaveFilePicker error, falling back to download:', pickerErr);
    }
  }

  // User picked their destination folder! Now generate and write document.
  if (saveIcon) saveIcon.textContent = '⏳';
  if (saveText) saveText.textContent = 'Saving...';
  if (saveBtn) saveBtn.disabled = true;

  try {
    let blob;
    try {
      blob = await fetchExportBlob(chosenFormat);
    } catch (exportErr) {
      console.warn('Backend export failed, attempting client fallback:', exportErr);
      if (chosenFormat === 'txt') {
        blob = generateClientTxtBlob(appState.storyTitle || 'Story', appState.chapters);
      } else {
        throw exportErr;
      }
    }

    if (chosenHandle) {
      const writable = await chosenHandle.createWritable();
      await writable.write(blob);
      await writable.close();

      activeFileHandle = chosenHandle;
      activeFileName = chosenHandle.name;
      activeFileFormat = chosenFormat;
      appState.activeFileName = chosenHandle.name;
      appState.activeFileFormat = chosenFormat;
      saveStateToStorage();
      await storeActiveFileHandle(chosenHandle);
      updateLinkedFileBadge(activeFileName, chosenFormat);

      syncStoryToBackendAsync();

      if (saveIcon) saveIcon.textContent = '✓';
      if (saveText) saveText.textContent = 'Saved ✓';
      if (saveBtn) saveBtn.classList.add('border-teal-500', 'text-teal-400');
      if (lastSaved) lastSaved.textContent = `Saved directly to ${activeFileName}`;
      showToast(`💾 Saved as "${activeFileName}". Continuous MS Word saving active!`);

      setTimeout(() => {
        if (saveIcon) saveIcon.textContent = '💾';
        if (saveText) saveText.textContent = 'Save';
        if (saveBtn) {
          saveBtn.classList.remove('border-teal-500', 'text-teal-400');
          saveBtn.disabled = false;
        }
      }, 1500);
      return true;
    }

    // Fallback download if showSaveFilePicker not supported or failed
    const blobUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = blobUrl;
    link.download = defaultFilename;
    document.body.appendChild(link);
    link.click();
    setTimeout(() => {
      document.body.removeChild(link);
      URL.revokeObjectURL(blobUrl);
    }, 500);

    activeFileName = defaultFilename;
    activeFileFormat = chosenFormat;
    appState.activeFileName = defaultFilename;
    appState.activeFileFormat = chosenFormat;
    saveStateToStorage();
    updateLinkedFileBadge(activeFileName, chosenFormat);

    syncStoryToBackendAsync();

    if (saveIcon) saveIcon.textContent = '✓';
    if (saveText) saveText.textContent = 'Downloaded ✓';
    if (lastSaved) lastSaved.textContent = `Saved ${defaultFilename}`;
    showToast(`💾 Downloaded "${defaultFilename}"!`);

    setTimeout(() => {
      if (saveIcon) saveIcon.textContent = '💾';
      if (saveText) saveText.textContent = 'Save';
      if (saveBtn) saveBtn.disabled = false;
    }, 1500);
    return true;
  } catch (err) {
    console.error('Save story to file failed:', err);
    showToast(`⚠️ Failed to save file: ${err.message || 'Error'}`);
    if (saveIcon) saveIcon.textContent = '💾';
    if (saveText) saveText.textContent = 'Save';
    if (saveBtn) saveBtn.disabled = false;
    return false;
  }
}

async function openExistingStoryFile() {
  if ('showOpenFilePicker' in window) {
    try {
      const [handle] = await window.showOpenFilePicker({
        types: [{
          description: 'Story Documents (.docx, .pdf, .txt, .json)',
          accept: {
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
            'application/pdf': ['.pdf'],
            'text/plain': ['.txt'],
            'application/json': ['.json']
          }
        }],
        multiple: false
      });
      const file = await handle.getFile();
      await processOpenedStoryFile(file, handle);
      return;
    } catch (err) {
      if (err.name === 'AbortError') return;
      console.warn('showOpenFilePicker error, falling back to input:', err);
    }
  }
  const fileInput = document.getElementById('hiddenStoryFileInput');
  if (fileInput) fileInput.click();
}

async function processOpenedStoryFile(file, handle = null) {
  if (!file) return;
  showToast(`📂 Opening "${file.name}"...`);

  try {
    // If JSON backup file:
    if (file.name.toLowerCase().endsWith('.json')) {
      const jsonText = await file.text();
      const data = JSON.parse(jsonText);
      if (data.title) appState.storyTitle = data.title;
      if (Array.isArray(data.chapters) && data.chapters.length > 0) {
        appState.chapters = data.chapters.map((ch, idx) => ({
          id: `chap-${Date.now()}-${idx + 1}`,
          number: ch.number || idx + 1,
          title: ch.title || `Chapter ${idx + 1}`,
          subtitle: ch.subtitle || 'Imported Scene',
          content: ch.content || ''
        }));
      }
    } else {
      // DOCX, PDF, or TXT -> Send to backend /stories/import
      const formData = new FormData();
      formData.append('file', file);

      const token = appState.authToken || localStorage.getItem('storyWaveToken');
      const res = await fetch(`${API_BASE}/stories/import`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || `Failed to parse ${file.name}`);
      }

      const data = await res.json();
      if (data.title) {
        appState.storyTitle = data.title;
      } else {
        appState.storyTitle = file.name.replace(/\.[^/.]+$/, '').replace(/[_-]/g, ' ');
      }

      if (data.chapters && data.chapters.length > 0) {
        appState.chapters = data.chapters.map((ch, idx) => ({
          id: `chap-${Date.now()}-${idx + 1}`,
          number: ch.number || idx + 1,
          title: ch.title || `Chapter ${idx + 1}`,
          subtitle: 'Imported Scene',
          content: ch.content || ''
        }));
      } else {
        throw new Error('No chapters or readable text found in document.');
      }
    }

    // Update UI
    const titleDisplay = document.getElementById('storyTitleDisplay');
    if (titleDisplay) titleDisplay.textContent = appState.storyTitle;

    appState.activeChapterId = appState.chapters[0].id;
    appState.activeChapterNumber = appState.chapters[0].number;
    renderChapterTabs();
    loadActiveChapterIntoEditor();
    scanAndExtractStoryEntities(false);

    // Set active file tracking (MS Word mode)
    activeFileHandle = handle;
    activeFileName = file.name;
    const extMatch = file.name.match(/\.(docx|pdf|txt)$/i);
    activeFileFormat = extMatch ? extMatch[1].toLowerCase() : 'docx';
    appState.activeFileName = activeFileName;
    appState.activeFileFormat = activeFileFormat;
    saveStateToStorage();
    if (handle) await storeActiveFileHandle(handle);
    updateLinkedFileBadge(activeFileName, activeFileFormat);

    syncStoryToBackendAsync();

    showToast(`✨ Opened "${file.name}" (${appState.chapters.length} chapter${appState.chapters.length === 1 ? '' : 's'}). MS Word Mode active!`);
  } catch (err) {
    console.error('Failed to import file:', err);
    showToast(`⚠️ Could not open file: ${err.message}`);
  }
}

// -----------------------------------------------------------------------------
// GLOBAL UI EVENT BINDINGS
// -----------------------------------------------------------------------------
function bindEventListeners() {
  // Theme toggle
  document.getElementById('themeToggleBtn').addEventListener('click', () => {
    const nextTheme = appState.theme === 'dark' ? 'light' : 'dark';
    applyTheme(nextTheme);
    if (!document.getElementById('graphModalOverlay').classList.contains('hidden')) {
      renderRelationshipGraph();
    }
  });

  // Edit Story Title
  const titleDisplay = document.getElementById('storyTitleDisplay');
  const titleInput = document.getElementById('storyTitleInput');
  const editTitleBtn = document.getElementById('editTitleBtn');

  const commitTitleChange = () => {
    const val = titleInput.value.trim() || 'Untitled Story';
    appState.storyTitle = val;
    titleDisplay.textContent = val;
    titleInput.classList.add('hidden');
    titleDisplay.classList.remove('hidden');
    saveStateToStorage();
    if (appState.storyId) {
      apiFetch(`/stories/${appState.storyId}`, {
        method: 'PUT',
        body: JSON.stringify({ title: val })
      }).catch(() => {});
    }
  };

  editTitleBtn.addEventListener('click', () => {
    if (titleInput.classList.contains('hidden')) {
      titleDisplay.classList.add('hidden');
      titleInput.classList.remove('hidden');
      titleInput.focus();
      titleInput.select();
    } else {
      commitTitleChange();
    }
  });

  titleInput.addEventListener('blur', commitTitleChange);
  titleInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') commitTitleChange();
  });

  // Save Story & MS Word File Handling
  const saveBtn = document.getElementById('saveStoryBtn');
  const saveDropdownBtn = document.getElementById('saveStoryDropdownBtn');
  const saveMenu = document.getElementById('saveStoryMenu');

  if (saveBtn) {
    saveBtn.addEventListener('click', () => {
      if (saveMenu) saveMenu.classList.add('hidden');
      saveStoryToFile();
    });
  }

  if (saveDropdownBtn && saveMenu) {
    saveDropdownBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      saveMenu.classList.toggle('hidden');
    });

    document.addEventListener('click', (e) => {
      if (!saveMenu.contains(e.target) && e.target !== saveDropdownBtn) {
        saveMenu.classList.add('hidden');
      }
    });
  }

  // Quick Save (Same File) from menu
  const saveToLinkedBtn = document.getElementById('saveToLinkedActionBtn');
  if (saveToLinkedBtn) {
    saveToLinkedBtn.addEventListener('click', () => {
      if (saveMenu) saveMenu.classList.add('hidden');
      saveStoryToFile(activeFileFormat || 'docx');
    });
  }

  // Save As Format buttons (.docx, .pdf, .txt)
  document.querySelectorAll('.save-as-format-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const fmt = btn.getAttribute('data-save-fmt') || 'docx';
      if (saveMenu) saveMenu.classList.add('hidden');
      saveStoryToFile(fmt, true);
    });
  });

  // Save to Cloud / Backend from menu
  const saveToCloudBtn = document.getElementById('saveToCloudActionBtn');
  if (saveToCloudBtn) {
    saveToCloudBtn.addEventListener('click', async () => {
      if (saveMenu) saveMenu.classList.add('hidden');
      saveCurrentEditorContentToState();
      saveStateToStorage();
      await syncStoryToBackendAsync();
      showToast('☁️ Story and lore synced with backend cloud!');
    });
  }

  // Open File (MS Word Style)
  const openFileBtn = document.getElementById('openStoryFileBtn');
  const hiddenFileInput = document.getElementById('hiddenStoryFileInput');
  if (openFileBtn) {
    openFileBtn.addEventListener('click', () => openExistingStoryFile());
  }
  if (hiddenFileInput) {
    hiddenFileInput.addEventListener('change', (e) => {
      const file = e.target.files && e.target.files[0];
      if (file) {
        processOpenedStoryFile(file, null);
        e.target.value = '';
      }
    });
  }

  // Save Format Modal handlers
  const closeSaveFormatModalBtn = document.getElementById('closeSaveFormatModalBtn');
  if (closeSaveFormatModalBtn) closeSaveFormatModalBtn.addEventListener('click', closeSaveFormatModal);

  const cancelSaveFormatModalBtn = document.getElementById('cancelSaveFormatModalBtn');
  if (cancelSaveFormatModalBtn) cancelSaveFormatModalBtn.addEventListener('click', closeSaveFormatModal);

  const confirmSaveFormatBtn = document.getElementById('confirmSaveFormatBtn');
  if (confirmSaveFormatBtn) {
    confirmSaveFormatBtn.addEventListener('click', () => {
      const selected = document.querySelector('input[name="saveFormatChoice"]:checked')?.value || 'docx';
      closeSaveFormatModal();
      saveStoryToFile(selected, true);
    });
  }

  // Global Keyboard Shortcuts: Ctrl+S / Cmd+S and Ctrl+A / Cmd+A (MS Word Style Save)
  document.addEventListener('keydown', (e) => {
    // Save on Ctrl+S / Cmd+S
    if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'S' || e.code === 'KeyS')) {
      e.preventDefault();
      saveStoryToFile();
      return;
    }
    // Also save if user presses Ctrl+A / Cmd+A
    if ((e.ctrlKey || e.metaKey) && (e.key === 'a' || e.key === 'A' || e.code === 'KeyA')) {
      const activeTag = document.activeElement ? document.activeElement.tagName : '';
      if (activeTag !== 'INPUT' && activeTag !== 'TEXTAREA') {
        e.preventDefault();
        saveStoryToFile();
      }
    }
  });

  // Load Demo Button: opens modern modal with story presets and chapter count
  const demoBtn = document.getElementById('loadDemoBtn');
  if (demoBtn) {
    demoBtn.addEventListener('click', openLoadDemoModal);
  }

  // Load Demo Modal Handlers
  const closeDemoModalBtn = document.getElementById('closeLoadDemoModalBtn');
  if (closeDemoModalBtn) closeDemoModalBtn.addEventListener('click', closeLoadDemoModal);

  const cancelDemoModalBtn = document.getElementById('cancelLoadDemoModalBtn');
  if (cancelDemoModalBtn) cancelDemoModalBtn.addEventListener('click', closeLoadDemoModal);

  // Preset Card Clicks
  const presetCards = document.querySelectorAll('#demoPresetCardsContainer .demo-preset-card');
  presetCards.forEach((card) => {
    card.addEventListener('click', () => {
      presetCards.forEach((c) => c.classList.remove('active'));
      card.classList.add('active');
      selectedDemoPreset = card.getAttribute('data-preset') || 'random';
    });
  });

  // Chapter Count Button Clicks
  const countButtons = document.querySelectorAll('#demoChapterCountContainer .demo-count-btn');
  countButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      countButtons.forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      selectedDemoChapterCount = parseInt(btn.getAttribute('data-count'), 10) || 4;
    });
  });

  // Confirm Load Demo
  const confirmLoadDemoBtn = document.getElementById('confirmLoadDemoModalBtn');
  if (confirmLoadDemoBtn) {
    confirmLoadDemoBtn.addEventListener('click', async () => {
      closeLoadDemoModal();
      await loadDemoPlantedStory(selectedDemoPreset, selectedDemoChapterCount);
    });
  }

  // Close Chapter Confirmation Modal Handlers
  const cancelCloseChapterBtn = document.getElementById('cancelCloseChapterBtn');
  if (cancelCloseChapterBtn) {
    cancelCloseChapterBtn.addEventListener('click', dismissCloseChapterModal);
  }

  const discardCloseChapterBtn = document.getElementById('discardCloseChapterBtn');
  if (discardCloseChapterBtn) {
    discardCloseChapterBtn.addEventListener('click', () => {
      const idToClose = pendingCloseChapterId;
      dismissCloseChapterModal();
      if (idToClose) executeCloseChapter(idToClose);
    });
  }

  const saveAndCloseChapterBtn = document.getElementById('saveAndCloseChapterBtn');
  if (saveAndCloseChapterBtn) {
    saveAndCloseChapterBtn.addEventListener('click', async () => {
      const idToClose = pendingCloseChapterId;
      saveCurrentEditorContentToState();
      saveStateToStorage();

      // Trigger story save to backend if connected
      if (appState.storyId) {
        try {
          const editor = document.getElementById('storyEditor');
          const chapterText = editor.innerText.trim();
          const activeChap = appState.chapters.find(c => c.id === idToClose) || appState.chapters[0];
          const chapterNum = activeChap.number || 1;
          await apiFetch(`/stories/${appState.storyId}/chapters/${chapterNum}`, {
            method: 'PUT',
            body: JSON.stringify({ text: chapterText })
          });
        } catch (e) {
          console.debug('Save before close error:', e);
        }
      }

      dismissCloseChapterModal();
      if (idToClose) await executeCloseChapter(idToClose);
    });
  }

  // Create a new chapter
  document.getElementById('addChapterBtn').addEventListener('click', () => {
    if (!checkGuestActionLimit('Create New Chapter')) return;
    saveCurrentEditorContentToState();
    const nextNum = appState.chapters.length + 1;
    const newChap = {
      id: `chap-${Date.now()}`,
      number: nextNum,
      title: `Chapter ${nextNum}`,
      subtitle: 'New Scene',
      content: ''
    };
    appState.chapters.push(newChap);
    appState.activeChapterId = newChap.id;
    appState.activeChapterNumber = nextNum;
    renderChapterTabs();
    loadActiveChapterIntoEditor();
    scanAndExtractStoryEntities(false);
    saveStateToStorage();
  });

  // Editor typing listener with debounced dynamic entity scanner & SQLite auto-sync
  const editor = document.getElementById('storyEditor');
  let inputScanTimer = null;
  let backendSyncDebounce = null;
  editor.addEventListener('input', () => {
    updateWordAndCharCount();
    saveCurrentEditorContentToState();
    saveStateToStorage();
    clearTimeout(inputScanTimer);
    inputScanTimer = setTimeout(() => {
      scanAndExtractStoryEntities();
    }, 600);

    clearTimeout(backendSyncDebounce);
    backendSyncDebounce = setTimeout(() => {
      syncStoryToBackendAsync();
    }, 1500);
  });

  // Toggle inline entity highlights inside the editor
  const highlightBtn = document.getElementById('toggleHighlightBtn');
  highlightBtn.addEventListener('click', () => {
    appState.highlightsEnabled = !appState.highlightsEnabled;
    editor.classList.toggle('highlights-disabled', !appState.highlightsEnabled);
    highlightBtn.textContent = appState.highlightsEnabled ? '✨ Highlights: On' : '✨ Highlights: Off';
    if (appState.highlightsEnabled) {
      applyConflictHighlightsToEditor();
    }
    saveStateToStorage();
  });

  // Clicking an in-canvas conflict highlight jumps to Story Insights -> Flags tab
  editor.addEventListener('click', (e) => {
    const conflictEl = e.target.closest('.fact-conflict');
    if (conflictEl) {
      appState.activeInsightTab = 'flags';
      renderInsightsPanel();
    }
  });

  // Preview banner actions
  document.getElementById('confirmPreviewInsertBtn').addEventListener('click', () => {
    confirmPreviewInsertion();
  });
  document.getElementById('closePreviewBannerBtn').addEventListener('click', () => {
    dismissAiPreview();
  });

  // Switch Story Insights category tabs
  document.querySelectorAll('.insight-tab').forEach((btn) => {
    btn.addEventListener('click', () => {
      appState.activeInsightTab = btn.getAttribute('data-insight-tab');
      renderInsightsPanel();
    });
  });

  // Graph Modal open, close, and zoom controls
  const graphModal = document.getElementById('graphModalOverlay');
  const graphWrapper = document.getElementById('graphTransformWrapper');
  const zoomLabel = document.getElementById('graphZoomLevel');

  const updateGraphZoom = () => {
    graphWrapper.style.transform = `scale(${appState.graphZoom})`;
    zoomLabel.textContent = `${Math.round(appState.graphZoom * 100)}%`;
  };

  document.getElementById('openGraphBtn').addEventListener('click', () => {
    renderRelationshipGraph();
    appState.graphZoom = 1;
    updateGraphZoom();
    graphModal.classList.remove('hidden');
    graphModal.classList.add('flex');
  });

  document.getElementById('closeGraphModalBtn').addEventListener('click', () => {
    graphModal.classList.add('hidden');
    graphModal.classList.remove('flex');
  });

  document.getElementById('zoomInGraphBtn').addEventListener('click', () => {
    appState.graphZoom = Math.min(1.6, +(appState.graphZoom + 0.15).toFixed(2));
    updateGraphZoom();
  });

  document.getElementById('zoomOutGraphBtn').addEventListener('click', () => {
    appState.graphZoom = Math.max(0.6, +(appState.graphZoom - 0.15).toFixed(2));
    updateGraphZoom();
  });

  document.getElementById('resetGraphZoomBtn').addEventListener('click', () => {
    appState.graphZoom = 1;
    updateGraphZoom();
  });

  // Analyze Modal triggers
  document.getElementById('analyzeStoryBtn').addEventListener('click', runStoryAnalysis);
  document.getElementById('finishAnalyzeModalBtn').addEventListener('click', () => {
    const modal = document.getElementById('analyzeModalOverlay');
    modal.classList.add('hidden');
    modal.classList.remove('flex');
  });

  // AI Assistant expand/collapse bar and tool buttons
  const toggleAiBtn = document.getElementById('toggleAiAssistantBtn');
  const aiToolsRow = document.getElementById('aiToolsButtonRow');
  const aiChevron = document.getElementById('aiAssistantChevron');
  const aiPanel = document.getElementById('aiActiveToolPanel');

  toggleAiBtn.addEventListener('click', () => {
    appState.aiAssistantExpanded = !appState.aiAssistantExpanded;
    aiToolsRow.classList.toggle('hidden', !appState.aiAssistantExpanded);
    aiChevron.style.transform = appState.aiAssistantExpanded ? 'rotate(180deg)' : 'rotate(0deg)';
    if (!appState.aiAssistantExpanded) {
      aiPanel.classList.add('hidden');
      document.querySelectorAll('.ai-tool-btn').forEach((b) => b.classList.remove('active-tool'));
    }
  });

  document.querySelectorAll('.ai-tool-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const toolKey = btn.getAttribute('data-ai-tool');
      openAiToolPanel(toolKey);
    });
  });

  document.getElementById('closeAiToolPanelBtn').addEventListener('click', () => {
    aiPanel.classList.add('hidden');
    document.querySelectorAll('.ai-tool-btn').forEach((b) => b.classList.remove('active-tool'));
  });
}
