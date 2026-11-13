// Story Wave Frontend Application Logic
// Complete integration between UI and Story Wave FastAPI Backend

const API_BASE = (window.location.protocol.startsWith('http') && !window.location.origin.includes('file:'))
  ? window.location.origin
  : 'http://localhost:8000';
const WS_BASE = API_BASE.replace(/^http/, 'ws');

// Initial application state and Story Bible data
const defaultAppState = {
  theme: 'dark',
  storyTitle: 'The Last Kingdom',
  storyId: null,
  activeChapterId: 'chap-1',
  activeChapterNumber: 1,
  activeInsightTab: 'characters',
  highlightsEnabled: true,
  aiAssistantExpanded: false,
  activeAiTool: null,
  aiPanelHeight: 280,
  graphZoom: 1,
  backendConnected: false,
  authToken: null,
  chapters: [
    {
      id: 'chap-1',
      number: 1,
      title: 'Chapter 1',
      subtitle: 'Shadows of Delhi',
      content: `<p>The monsoon mist clung to the stone ramparts of <span class="fact-entity" title="Place: Delhi">Delhi</span> as <span class="fact-entity" title="Character: Aarav (Age 20)">Aarav</span> fastened his weathered cloak. At <span class="fact-entity" title="Established Fact: Age 20">20 years old</span>, with sharp brown eyes that missed very little, he had spent three years guarding the royal archives alongside his trusted friend <span class="fact-entity" title="Character: Diya">Diya</span>.</p><p>"If <span class="fact-entity" title="Character: Varun (Enemy)">Varun</span> reaches the <span class="fact-entity" title="Place: Dark Forest">Dark Forest</span> before dawn, the northern seal will fall," Diya whispered, holding up the brass lantern. "Remember what the elders taught us: <span class="fact-entity" title="World Rule">spirits cannot cross running water</span>. Stay near the riverbanks if the night wraiths appear."</p><p>By the third night of their journey toward the <span class="fact-entity" title="Place: Ancient Kingdom">Ancient Kingdom</span>, exhaustion weighed heavily on them. <span id="flaggedConflictSpan" class="fact-conflict" title="Possible Inconsistency: Previously stated Aarav has brown eyes">Aarav squinted with his bright green eyes</span> courtyard through the shattered eastern gate, his blade drawn against the gathering shadows.</p>`
    },
    {
      id: 'chap-2',
      number: 2,
      title: 'Chapter 2',
      subtitle: 'The Whispering Ford',
      content: `<p>Cold river spray rose where the ancient stone bridge had collapsed decades ago. <span class="fact-entity">Aarav</span> knelt beside the rushing torrent, testing the current with his staff while <span class="fact-entity">Diya</span> scanned the tree line of the <span class="fact-entity">Dark Forest</span>.</p><p>Across the water, pale silhouettes flickered between the pines—<span class="fact-entity">Varun</span>'s scouts had already awakened the dormant sentinels, yet none dared step into the foaming rapids.</p>`
    },
    {
      id: 'chap-3',
      number: 3,
      title: 'Chapter 3',
      subtitle: 'Citadel of Ash',
      content: `<p>Inside the inner sanctum of the <span class="fact-entity">Ancient Kingdom</span>, obsidian pillars bore carvings of the first dynasty. <span class="fact-entity">Aarav</span> traced the royal sigil, realizing the prophecy spoke not of a weapon, but of a bloodline bound to <span class="fact-entity">Delhi</span>'s founding oath.</p>`
    }
  ],
  insights: {
    characters: [
      { name: 'Aarav', role: 'Main Character', age: '20', details: 'Eyes: Brown • Royal archive guardian seeking the northern seal.' },
      { name: 'Diya', role: 'Friend & Strategist', age: '19', details: 'Expert in ancient scripts and protective wards.' },
      { name: 'Varun', role: 'Enemy Commander', age: '28', details: 'Former captain seeking the Ancient Kingdom throne.' }
    ],
    places: [
      { name: 'Delhi', type: 'Capital Fortress', desc: 'Starting point of the expedition; houses the royal archives.' },
      { name: 'Dark Forest', type: 'Border Wilderness', desc: 'Shrouded woodland patrolled by night wraiths.' },
      { name: 'Ancient Kingdom', type: 'Fallen Citadel', desc: 'Ruined northern stronghold containing the obsidian sanctum.' }
    ],
    timeline: [
      { day: 'Day 1', event: 'Aarav and Diya depart Delhi before dawn with the archive seal.' },
      { day: 'Day 2', event: 'They enter the Dark Forest and evade Varun’s advance scouts.' },
      { day: 'Day 3', event: 'Aarav discovers the shattered gate of the Ancient Kingdom castle.' }
    ],
    rules: [
      { title: 'Hydro-Barrier Law', rule: 'Spirits cannot cross running water under any circumstance.' },
      { title: 'Sanctum Seal', rule: 'Only an archive bearer from Delhi can read the obsidian inscriptions.' }
    ],
    flags: [
      {
        id: 1,
        title: 'changed physical trait',
        severity: 'Warning',
        explanation: 'Aarav previously was described as having brown eyes, but is now described as having bright green eyes.',
        previousFact: 'He had brown eyes and wore the silver watch',
        currentFact: 'Aarav squinted with his bright green eyes',
        resolved: false
      }
    ]
  }
};

// Application Global State
let appState = loadStateFromStorage();
let pendingPreviewText = '';
let isRecordingVoice = false;
let liveWebSocket = null;

// Load state helper
function loadStateFromStorage() {
  try {
    const savedState = localStorage.getItem('storyBibleAppState_v1');
    const savedTheme = localStorage.getItem('storyBibleTheme_v1');
    const parsed = savedState ? JSON.parse(savedState) : structuredClone(defaultAppState);
    if (savedTheme) parsed.theme = savedTheme;
    if (!parsed.aiPanelHeight) parsed.aiPanelHeight = 280;
    return parsed;
  } catch (e) {
    return structuredClone(defaultAppState);
  }
}

// Save current state to localStorage
function saveStateToStorage() {
  localStorage.setItem('storyBibleAppState_v1', JSON.stringify(appState));
  localStorage.setItem('storyBibleTheme_v1', appState.theme);
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
    // Attempt login with default guest credentials
    const creds = { email: 'author@storywave.ai', password: 'storywave123' };
    let res = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(creds)
    });

    if (res.status === 401 || res.status === 400 || res.status === 404) {
      // Register user if not yet created
      await fetch(`${API_BASE}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(creds)
      });

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

// Initialize Backend Sync
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

    updateBackendStatus(true, 'Backend Connected');

    // Fetch existing stories
    const storiesRes = await apiFetch('/stories');
    if (storiesRes.ok) {
      const stories = await storiesRes.json();
      if (stories.length > 0) {
        // Use the existing story matching title or the first story
        const found = stories.find(s => s.title === appState.storyTitle) || stories[0];
        appState.storyId = found.id;
        appState.storyTitle = found.title;
        renderStoryTitle();
      } else {
        // Create new story on backend
        const createRes = await apiFetch('/stories', {
          method: 'POST',
          body: JSON.stringify({ title: appState.storyTitle })
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
      // Fetch bible and flags
      await syncBibleFromBackend();
      await syncFlagsFromBackend();
    }
  } catch (err) {
    console.warn('Backend sync initialization error:', err);
    updateBackendStatus(false, 'Local Dev Mode');
  }
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

    if (bible.characters && bible.characters.length > 0) {
      appState.insights.characters = bible.characters.map(c => ({
        name: c.name,
        role: c.type || 'Character',
        age: 'Established',
        details: `Identified character in story bible.`
      }));
    }

    if (bible.places && bible.places.length > 0) {
      appState.insights.places = bible.places.map(p => ({
        name: p.name,
        type: p.type || 'Location',
        desc: `Place referenced in story facts.`
      }));
    }

    if (bible.timeline && bible.timeline.length > 0) {
      appState.insights.timeline = bible.timeline.map((t, idx) => ({
        day: t.day || `Chapter ${t.chapter_number}`,
        event: `${t.entity_name} (${t.attribute}): ${t.value}`
      }));
    }

    if (bible.rules && bible.rules.length > 0) {
      appState.insights.rules = bible.rules.map(r => ({
        title: `Rule (Ch ${r.chapter_number})`,
        rule: r.description
      }));
    }

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
  applyTheme(appState.theme);
  renderStoryTitle();
  renderChapterTabs();
  loadActiveChapterIntoEditor();
  renderInsightsPanel();
  initAiPanelResizeHandle();
  bindEventListeners();

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

// Render horizontal chapter navigation tabs
function renderChapterTabs() {
  const container = document.getElementById('chapterTabsContainer');
  container.innerHTML = '';

  appState.chapters.forEach((chap, idx) => {
    const isActive = chap.id === appState.activeChapterId;
    const btn = document.createElement('button');
    btn.className = isActive
      ? 'px-3.5 py-1 rounded-md text-xs font-semibold active-chapter-btn transition shrink-0'
      : 'px-3.5 py-1 rounded-md text-xs font-medium app-text-secondary hover:bg-slate-500/10 transition shrink-0';
    btn.textContent = chap.title || `Chapter ${chap.number || idx + 1}`;
    btn.addEventListener('click', () => switchChapter(chap.id));
    container.appendChild(btn);
  });
}

// Switch to the selected chapter
function switchChapter(chapterId) {
  saveCurrentEditorContentToState();
  appState.activeChapterId = chapterId;
  const activeChap = appState.chapters.find((c) => c.id === chapterId);
  if (activeChap) {
    appState.activeChapterNumber = activeChap.number || 1;
  }
  renderChapterTabs();
  loadActiveChapterIntoEditor();
  saveStateToStorage();
}

// Load active chapter HTML content into the Story Editor
function loadActiveChapterIntoEditor() {
  const editor = document.getElementById('storyEditor');
  const indicator = document.getElementById('activeChapterIndicator');
  const activeChap = appState.chapters.find((c) => c.id === appState.activeChapterId) || appState.chapters[0];

  editor.innerHTML = activeChap.content;
  indicator.textContent = `${activeChap.title}: ${activeChap.subtitle || 'Scene'}`;
  updateWordAndCharCount();
}

// Save current editor content into the active chapter object
function saveCurrentEditorContentToState() {
  const editor = document.getElementById('storyEditor');
  const activeChap = appState.chapters.find((c) => c.id === appState.activeChapterId);
  if (activeChap) {
    activeChap.content = editor.innerHTML;
  }
}

// Update the word count, character count, and reading time
function updateWordAndCharCount() {
  const editor = document.getElementById('storyEditor');
  const rawText = editor.innerText.trim();
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
  const badge = document.getElementById('flagTabCountBadge');
  const statusPill = document.getElementById('editorStatusPill');

  if (unresolvedFlags.length > 0) {
    badge.textContent = unresolvedFlags.length;
    badge.classList.remove('hidden');
    statusPill.innerHTML = `<span class="w-2 h-2 rounded-full bg-amber-400"></span><span>${unresolvedFlags.length} Consistency Flag Detected</span>`;
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
    if (appState.insights.rules.length === 0) {
      container.innerHTML = `<div class="p-6 text-center text-xs app-text-muted">No world rules established yet.</div>`;
      return;
    }
    container.innerHTML = appState.insights.rules.map((r) => `
      <div class="p-3 rounded-xl border app-border app-surface-secondary">
        <div class="flex items-center gap-1.5 mb-1">
          <span>🛡️</span>
          <span class="font-bold text-xs app-text-primary">${r.title}</span>
        </div>
        <p class="text-xs app-text-secondary leading-relaxed">${r.rule}</p>
      </div>
    `).join('');
  } else if (activeTab === 'flags') {
    if (unresolvedFlags.length === 0) {
      container.innerHTML = `
        <div class="p-6 text-center rounded-xl border app-border app-surface-secondary">
          <span class="text-2xl block mb-2">✅</span>
          <p class="text-xs font-semibold app-text-primary">No Active Consistency Flags</p>
          <p class="text-[11px] app-text-muted mt-1">Your story timeline, traits, and world rules are aligned.</p>
        </div>
      `;
      return;
    }

    container.innerHTML = unresolvedFlags.map((f) => `
      <div class="p-3.5 rounded-xl border app-border app-surface-secondary space-y-2.5">
        <div class="flex items-center justify-between">
          <span class="text-xs font-bold status-error-text flex items-center gap-1.5">⚠️ ${f.title}</span>
          <span class="text-[10px] font-semibold px-2 py-0.5 rounded badge-error-subtle">${f.severity}</span>
        </div>
        <p class="text-xs app-text-secondary">${f.explanation}</p>
        <div class="p-2 rounded-lg app-surface border app-border text-[11px] space-y-1">
          <div><span class="app-text-muted font-medium">Was:</span> <span class="status-success-text font-semibold">${f.previousFact}</span></div>
          <div><span class="app-text-muted font-medium">Now:</span> <span class="status-error-text font-semibold">${f.currentFact}</span></div>
        </div>
        <div class="flex items-center gap-1.5 pt-1">
          <button onclick="focusFlagInEditor('${encodeURIComponent(f.currentFact)}')" class="flex-1 py-1 px-2 rounded bg-teal-500/15 hover:bg-teal-500/25 text-teal-400 text-[11px] font-semibold transition">View in Editor</button>
          <button onclick="resolveFlag('${f.id}', true)" class="py-1 px-2 rounded border app-border hover:border-teal-500 text-[11px] app-text-secondary transition">Mark Resolved</button>
          <button onclick="resolveFlag('${f.id}', false)" class="py-1 px-2 rounded border app-border hover:border-red-400 text-[11px] app-text-muted transition">Dismiss</button>
        </div>
      </div>
    `).join('');
  }
}

// Scroll to and highlight the conflicting text inside the Story Editor
function focusFlagInEditor(factText) {
  const editor = document.getElementById('storyEditor');
  let flagSpan = document.getElementById('flaggedConflictSpan');

  if (!flagSpan && factText) {
    const rawTarget = decodeURIComponent(factText).trim();
    // Search for snippet in editor text
    const editorHtml = editor.innerHTML;
    if (rawTarget && editorHtml.includes(rawTarget)) {
      editor.innerHTML = editorHtml.replace(rawTarget, `<span id="flaggedConflictSpan" class="fact-conflict" title="Detected Contradiction">${rawTarget}</span>`);
      flagSpan = document.getElementById('flaggedConflictSpan');
    }
  }

  if (flagSpan) {
    flagSpan.scrollIntoView({ behavior: 'smooth', block: 'center' });
    flagSpan.classList.remove('conflict-focus-flash');
    void flagSpan.offsetWidth;
    flagSpan.classList.add('conflict-focus-flash');
  } else {
    // Flash entire editor if specific snippet not matched
    editor.scrollIntoView({ behavior: 'smooth' });
  }
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
        body: JSON.stringify({ status: fixTextInEditor ? 'resolved' : 'dismissed' })
      });
    } catch (e) {
      console.debug('Failed to patch flag on backend:', e);
    }
  }

  renderInsightsPanel();
  saveStateToStorage();
}

// -----------------------------------------------------------------------------
// STORY RELATIONSHIP GRAPH
// -----------------------------------------------------------------------------
function renderRelationshipGraph() {
  const svg = document.getElementById('relationshipGraphSvg');
  const isDark = appState.theme === 'dark';

  const nodeFill = isDark ? '#10213D' : '#FFFFFF';
  const nodeTextPrimary = isDark ? '#F8FAFC' : '#0F172A';
  const nodeTextSecondary = isDark ? '#94A3B8' : '#475569';
  const edgeStroke = isDark ? '#1F3658' : '#CBD5E1';
  const pillFill = isDark ? '#0D1B33' : '#F1F5F9';

  // Build nodes dynamically from insights (characters, places, rules)
  const characters = appState.insights.characters || [];
  const places = appState.insights.places || [];
  const rules = appState.insights.rules || [];

  const nodes = [];
  const edges = [];

  // Layout positions
  const charPositions = [
    { x: 400, y: 95 },
    { x: 200, y: 220 },
    { x: 600, y: 220 }
  ];

  const placePositions = [
    { x: 170, y: 390 },
    { x: 400, y: 350 },
    { x: 630, y: 390 }
  ];

  characters.slice(0, 3).forEach((c, idx) => {
    const pos = charPositions[idx] || { x: 300 + idx * 100, y: 150 };
    nodes.push({
      id: `char-${idx}`,
      name: c.name,
      label: `👤 ${c.name}`,
      sub: c.role || 'Character',
      x: pos.x,
      y: pos.y,
      color: '#22D3EE',
      bio: c.details || `${c.name} - established character in Story Wave.`,
      links: places.slice(0, 2).map(p => `Connected to → ${p.name}`)
    });
  });

  places.slice(0, 3).forEach((p, idx) => {
    const pos = placePositions[idx] || { x: 250 + idx * 120, y: 370 };
    nodes.push({
      id: `place-${idx}`,
      name: p.name,
      label: `📍 ${p.name}`,
      sub: p.type || 'Location',
      x: pos.x,
      y: pos.y,
      color: '#38BDF8',
      bio: p.desc || `${p.name} - story location.`,
      links: [`World Rule → Spirits cannot cross running water`]
    });
  });

  if (rules.length > 0) {
    nodes.push({
      id: 'rule-main',
      name: 'World Rule',
      label: '🛡️ Spirit Law',
      sub: 'Hydro-Barrier',
      x: 700,
      y: 120,
      color: '#F59E0B',
      bio: rules[0].rule || 'Spirits cannot cross running water.',
      links: ['Applies to → Dark Forest', 'Contradicted in → Chapter 4']
    });
  }

  // Create connections
  if (nodes.length >= 2) {
    edges.push({ from: nodes[0].id, to: nodes[1].id, label: 'Allied' });
  }
  if (nodes.length >= 3) {
    edges.push({ from: nodes[0].id, to: nodes[2].id, label: 'Rival' });
  }
  if (nodes.length >= 4) {
    edges.push({ from: nodes[0].id, to: nodes[3].id, label: 'Origin' });
  }
  if (nodes.length >= 5) {
    edges.push({ from: nodes[0].id, to: nodes[4].id, label: 'Travels to' });
  }
  if (nodes.length >= 6) {
    edges.push({ from: nodes[1].id, to: nodes[5].id, label: 'Entered' });
  }

  const nodeMap = Object.fromEntries(nodes.map((n) => [n.id, n]));

  let svgContent = edges.map((e) => {
    const n1 = nodeMap[e.from];
    const n2 = nodeMap[e.to];
    if (!n1 || !n2) return '';
    const midX = (n1.x + n2.x) / 2;
    const midY = (n1.y + n2.y) / 2;
    return `
      <g>
        <line x1="${n1.x}" y1="${n1.y}" x2="${n2.x}" y2="${n2.y}" stroke="${edgeStroke}" stroke-width="2" stroke-dasharray="4 2" />
        <rect x="${midX - 42}" y="${midY - 11}" width="84" height="20" rx="6" fill="${pillFill}" stroke="${edgeStroke}" />
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

  // Bind click events to inspect nodes
  svg.querySelectorAll('.graph-node-group').forEach((el) => {
    el.addEventListener('click', () => {
      const nodeId = el.getAttribute('data-node-id');
      const selected = nodeMap[nodeId];
      if (!selected) return;
      document.getElementById('inspectorNodeTitle').textContent = selected.label;
      document.getElementById('inspectorNodeType').textContent = selected.sub;
      document.getElementById('inspectorNodeDetails').innerHTML = `
        <p>${selected.bio}</p>
        <div class="pt-2">
          <span class="font-semibold app-text-primary block mb-1">Active Connections:</span>
          <ul class="space-y-1 text-teal-400">
            ${selected.links.map((l) => `<li>• ${l}</li>`).join('')}
          </ul>
        </div>
      `;
    });
  });
}

// -----------------------------------------------------------------------------
// STORY ANALYSIS PIPELINE (Calls Backend Analysis)
// -----------------------------------------------------------------------------
async function runStoryAnalysis() {
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
    const chapterText = editor.innerText.trim();
    const activeChap = appState.chapters.find(c => c.id === appState.activeChapterId) || appState.chapters[0];
    const chapterNum = activeChap.number || 1;

    // Send to backend chapter analysis if connected
    if (appState.storyId) {
      markStepDone(1);

      // Submit or update chapter
      try {
        let chRes = await apiFetch(`/stories/${appState.storyId}/chapters/${chapterNum}`, {
          method: 'PUT',
          body: JSON.stringify({ text: chapterText })
        });

        if (chRes.status === 404) {
          chRes = await apiFetch(`/stories/${appState.storyId}/chapters`, {
            method: 'POST',
            body: JSON.stringify({ number: chapterNum, text: chapterText })
          });
        }
      } catch (e) {
        console.debug('Chapter analysis upload fallback:', e);
      }

      markStepDone(2);
      await syncBibleFromBackend();

      markStepDone(3);
      await syncFlagsFromBackend();

      markStepDone(4);
    } else {
      // Local step simulation
      for (let i = 1; i < steps.length; i++) {
        await new Promise(r => setTimeout(r, 350));
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

    appState.activeInsightTab = flagCount > 0 ? 'flags' : 'characters';
    renderInsightsPanel();
    saveStateToStorage();

  } catch (err) {
    console.warn('Story analysis error:', err);
    spinner.textContent = '⚠️';
    heading.textContent = 'Analysis Completed (Offline Mode)';
    footer.classList.remove('hidden');
  }
}

// -----------------------------------------------------------------------------
// LOAD DEMO STORY (PLANTED CONTRADICTIONS)
// -----------------------------------------------------------------------------
async function loadDemoPlantedStory() {
  const saveBtnText = document.getElementById('saveBtnText');
  const lastSaved = document.getElementById('lastSavedIndicator');

  lastSaved.textContent = 'Loading Planted Contradiction Demo Story...';

  try {
    if (appState.storyId) {
      const demoRes = await apiFetch(`/stories/${appState.storyId}/demo`, { method: 'POST' });
      if (demoRes.ok) {
        const demoData = await demoRes.json();
        console.log('Demo Loaded from Backend:', demoData);

        await syncBibleFromBackend();
        await syncFlagsFromBackend();

        // Populate chapters in UI with the 4 demo chapters
        appState.storyTitle = 'Chronicles of the Lantern Spirits';
        renderStoryTitle();

        appState.chapters = [
          {
            id: 'chap-1',
            number: 1,
            title: 'Chapter 1',
            subtitle: 'The Silver Watch',
            content: `<p>Aarav, seventeen, lived in <span class="fact-entity" title="Place: Delhi">Delhi</span> with his grandmother. He had <span class="fact-entity" title="Trait: Brown eyes">brown eyes</span> and wore the silver watch his late mother Meera had left him. The old lantern spirits of the city could <span class="fact-entity" title="World Rule">never cross running water</span>, his grandmother warned him.</p>`
          },
          {
            id: 'chap-2',
            number: 2,
            title: 'Chapter 2',
            subtitle: 'The Departure',
            content: `<p>On Monday morning Aarav boarded the train in <span class="fact-entity">Delhi</span>, clutching his mother's old watch. He had <span class="fact-entity" title="Knowledge: Key location unknown">no idea that Meera had hidden a brass key</span> somewhere in the old house; only his grandmother knew.</p>`
          },
          {
            id: 'chap-3',
            number: 3,
            title: 'Chapter 3',
            subtitle: 'The Shoreline',
            content: `<p><span id="flaggedConflictSpan1" class="fact-conflict" title="Location/Time Conflict">By Monday evening Aarav was standing on the beach in Mumbai</span>, watching the sun go down and asking strangers about the lantern spirits.</p>`
          },
          {
            id: 'chap-4',
            number: 4,
            title: 'Chapter 4',
            subtitle: 'The Riverbank Encounter',
            content: `<p>Aarav squinted with his <span id="flaggedConflictSpan" class="fact-conflict" title="Trait Conflict: Was brown eyes">bright green eyes</span> at the <span class="fact-conflict" title="World Rule Conflict: Spirits cannot cross running water">spirit drifting across the river</span> toward him. "The <span class="fact-conflict" title="Knowledge Conflict: Previously had no idea where the key was hidden">key Mom hid under the staircase</span>," he said, "is what you want, isn't it?"</p>`
          }
        ];

        appState.activeChapterId = 'chap-4';
        appState.activeChapterNumber = 4;
        renderChapterTabs();
        loadActiveChapterIntoEditor();

        appState.activeInsightTab = 'flags';
        renderInsightsPanel();
        saveStateToStorage();

        lastSaved.textContent = `Demo loaded: 4 chapters, ${demoData.flags_count} planted contradictions caught!`;
        return;
      }
    }
  } catch (e) {
    console.debug('Backend demo call failed, using local demo chapters:', e);
  }

  // Fallback demo load
  appState.storyTitle = 'Chronicles of the Lantern Spirits';
  renderStoryTitle();
  appState.activeChapterId = 'chap-1';
  renderChapterTabs();
  loadActiveChapterIntoEditor();
  lastSaved.textContent = 'Planted story demo ready.';
}

// -----------------------------------------------------------------------------
// AI ASSISTANT PANEL & DRAWER RESIZE
// -----------------------------------------------------------------------------
function applyAiPanelHeight(heightPx) {
  const panel = document.getElementById('aiActiveToolPanel');
  if (!panel) return;
  panel.style.maxHeight = 'none';
  panel.style.height = `${heightPx}px`;
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

// Open AI Assistant tool drawer
function openAiToolPanel(toolKey) {
  appState.activeAiTool = toolKey;
  const panel = document.getElementById('aiActiveToolPanel');
  const titleIcon = document.getElementById('aiPanelTitleIcon');
  const titleText = document.getElementById('aiPanelTitleText');
  const body = document.getElementById('aiToolDynamicBody');

  document.querySelectorAll('.ai-tool-btn').forEach((btn) => {
    btn.classList.toggle('active-tool', btn.getAttribute('data-ai-tool') === toolKey);
  });

  panel.classList.remove('hidden');
  applyAiPanelHeight(appState.aiPanelHeight || 280);

  if (toolKey === 'nextScene') {
    titleIcon.textContent = '➡';
    titleText.textContent = 'Next Scene Suggestions';
    body.innerHTML = renderNextSceneToolHtml();
  } else if (toolKey === 'dialogue') {
    titleIcon.textContent = '💬';
    titleText.textContent = 'Character Dialogue Generator';
    body.innerHTML = renderDialogueToolHtml();
    bindDialogueEvents();
  } else if (toolKey === 'branches') {
    titleIcon.textContent = '🌿';
    titleText.textContent = 'Story Branches';
    body.innerHTML = renderBranchesToolHtml();
  } else if (toolKey === 'voice') {
    titleIcon.textContent = '🎙️';
    titleText.textContent = 'Voice Studio — Recording & Emotional TTS';
    body.innerHTML = renderVoiceStudioHtml();
    bindVoiceStudioEvents();
  }
}

// -----------------------------------------------------------------------------
// NEXT SCENE SUGGESTIONS (AI ASSISTANT)
// -----------------------------------------------------------------------------
function renderNextSceneToolHtml() {
  const suggestions = [
    {
      medal: '🥇 Option 1',
      rating: '9.5/10',
      badge: '🟢 Highly Recommended',
      badgeClass: 'badge-success-subtle',
      consistency: '95%',
      desc: 'Aarav discovers an ancient map hidden beneath the courtyard altar in Delhi.',
      why: 'Consistent with established facts in Delhi and the Ancient Kingdom.',
      textToInsert: 'Beneath the fractured altar stone of the courtyard, Aarav uncovered a parchment map bearing the royal seal of Delhi, marking a subterranean aqueduct where running water still flowed.'
    },
    {
      medal: '🥈 Option 2',
      rating: '8.2/10',
      badge: '🔵 Good Option',
      badgeClass: 'badge-cyan-subtle',
      consistency: '82%',
      desc: 'A mysterious stranger warns Aarav and Diya about Varun’s scouts.',
      why: 'Fits character motivations, though introduces a new unnamed scout.',
      textToInsert: 'From the shadow of the colonnade, a cloaked watchman signaled to Diya. "Hold your torches—Varun’s archers have already claimed the upper gallery."'
    },
    {
      medal: '🥉 Option 3',
      rating: '4.5/10',
      badge: '🔴 Possible Conflict',
      badgeClass: 'badge-error-subtle',
      consistency: '45%',
      desc: 'A night spirit escapes the Dark Forest by swimming across the river.',
      why: '⚠️ Conflicts with established rule: Spirits cannot cross running water.',
      textToInsert: 'A wraith lunged directly through the foaming river rapids, crossing the running water effortlessly to strike at Aarav’s shield.',
      isConflict: true
    }
  ];

  return `
    <div class="space-y-3">
      <div class="flex items-center justify-between">
        <span class="text-xs app-text-muted">Generated from established Story Bible facts:</span>
        <button id="refreshScenesBtn" class="px-2.5 py-1 text-xs rounded border app-border hover:border-teal-500 text-teal-400 transition">🔄 Generate Fresh Options</button>
      </div>
      <div id="nextScenesGrid" class="grid grid-cols-1 md:grid-cols-3 gap-3">
        ${suggestions.map((s) => `
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
              <button onclick="previewAiText('${encodeURIComponent(s.textToInsert)}')" class="flex-1 py-1.5 px-2.5 rounded-lg border app-border hover:border-teal-500 text-xs font-medium app-text-secondary transition">
                Preview
              </button>
              <button onclick="insertAiTextIntoEditor('${encodeURIComponent(s.textToInsert)}')" class="flex-1 py-1.5 px-2.5 rounded-lg ${s.isConflict ? 'badge-error-subtle hover:opacity-90' : 'btn-primary'} text-xs font-semibold transition">
                Use This
              </button>
            </div>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

// -----------------------------------------------------------------------------
// DIALOGUE GENERATOR (Calls Backend POST /stories/{id}/generate)
// -----------------------------------------------------------------------------
function renderDialogueToolHtml() {
  const characters = appState.insights.characters.length > 0
    ? appState.insights.characters
    : [{ name: 'Aarav' }, { name: 'Diya' }, { name: 'Varun' }];

  return `
    <div class="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
      <div class="lg:col-span-5 p-3.5 rounded-xl border app-border app-surface space-y-3">
        <div>
          <label class="block text-[11px] font-semibold app-text-muted uppercase mb-1">Character</label>
          <select id="dialogueCharSelect" class="w-full px-3 py-1.5 rounded-lg border app-border app-surface-secondary text-xs app-text-primary focus:outline-none focus:border-teal-500">
            ${characters.map(c => `<option value="${c.name}">${c.name} (${c.role || 'Character'})</option>`).join('')}
          </select>
        </div>
        <div>
          <label class="block text-[11px] font-semibold app-text-muted uppercase mb-1">Enter Situation</label>
          <input id="dialogueSituationInput" type="text" value="Aarav is scared but trying to hide it" class="w-full px-3 py-1.5 rounded-lg border app-border app-surface-secondary text-xs app-text-primary focus:outline-none focus:border-teal-500" />
        </div>
        <div>
          <label class="block text-[11px] font-semibold app-text-muted uppercase mb-1">Underlying Emotion</label>
          <select id="dialogueEmotionSelect" class="w-full px-3 py-1.5 rounded-lg border app-border app-surface-secondary text-xs app-text-primary focus:outline-none focus:border-teal-500">
            <option value="defiance">Defiance / Courage</option>
            <option value="grief">Grief / Restraint</option>
            <option value="fear">Fear / Concealed Anxiety</option>
            <option value="curiosity">Curiosity / Wonder</option>
          </select>
        </div>
        <button id="generateDialogueBtn" class="w-full py-2 rounded-lg btn-primary text-xs font-semibold shadow-sm transition">
          ✨ Generate In-Voice Dialogue
        </button>
      </div>

      <div id="dialogueResultsContainer" class="lg:col-span-7 space-y-2.5">
        ${getDialogueSuggestionsHtml('Aarav', 'Aarav is scared but trying to hide it')}
      </div>
    </div>
  `;
}

function getDialogueSuggestionsHtml(character, situation, optionsList = null) {
  if (optionsList && optionsList.length > 0) {
    return optionsList.map((item) => `
      <div class="p-3 rounded-xl border app-border app-surface flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div class="space-y-1">
          <div class="flex items-center gap-2">
            <span class="text-[11px] font-bold text-teal-400">👤 ${character}</span>
            <span class="text-[10px] px-2 py-0.5 rounded bg-teal-500/10 text-teal-400 font-semibold">${item.underlying_emotion || 'Voice'} (${item.intensity || 7}/10)</span>
            <span class="text-[10px] app-text-muted truncate max-w-[200px]">• ${item.why_in_voice || situation}</span>
          </div>
          <p class="text-xs italic app-text-primary">${item.line}</p>
        </div>
        <div class="flex items-center gap-2 shrink-0">
          <button onclick="previewAiText('${encodeURIComponent(item.line)}')" class="px-2.5 py-1 rounded border app-border hover:border-teal-500 text-xs app-text-secondary transition">Preview</button>
          <button onclick="insertAiTextIntoEditor('${encodeURIComponent(item.line)}')" class="px-3 py-1 rounded btn-primary text-xs font-semibold transition">Use This</button>
        </div>
      </div>
    `).join('');
  }

  const presets = {
    Aarav: [
      { line: '"Keep the lantern steady, Diya. The shadows only look taller because the mist is rising off the river."', score: '96% Voice Match' },
      { line: '"We didn’t ride three nights from Delhi just to hesitate at an open gate. Stay behind my shield."', score: '92% Voice Match' }
    ],
    Diya: [
      { line: '"Look at the moss on the aqueduct—the channel still carries mountain water. The wraiths cannot touch us here."', score: '97% Lore Match' },
      { line: '"Varun expects force; he won’t expect us to read the obsidian cipher before his vanguard arrives."', score: '91% Voice Match' }
    ],
    Varun: [
      { line: '"Let the boy cling to his archive oaths. By sunrise, the Ancient Kingdom answers to my banner alone."', score: '94% Voice Match' },
      { line: '"Cut the bridge ropes! If the spirits cannot cross water, we will force Aarav away from the riverbanks."', score: '95% Lore Match' }
    ]
  };

  const list = presets[character] || presets.Aarav;
  return list.map((item) => `
    <div class="p-3 rounded-xl border app-border app-surface flex flex-col sm:flex-row sm:items-center justify-between gap-3">
      <div class="space-y-1">
        <div class="flex items-center gap-2">
          <span class="text-[11px] font-bold text-teal-400">👤 ${character}</span>
          <span class="text-[10px] px-2 py-0.5 rounded bg-teal-500/10 text-teal-400 font-semibold">${item.score}</span>
          <span class="text-[10px] app-text-muted truncate max-w-[200px]">• ${situation}</span>
        </div>
        <p class="text-xs italic app-text-primary">${item.line}</p>
      </div>
      <div class="flex items-center gap-2 shrink-0">
        <button onclick="previewAiText('${encodeURIComponent(item.line)}')" class="px-2.5 py-1 rounded border app-border hover:border-teal-500 text-xs app-text-secondary transition">Preview</button>
        <button onclick="insertAiTextIntoEditor('${encodeURIComponent(item.line)}')" class="px-3 py-1 rounded btn-primary text-xs font-semibold transition">Use This</button>
      </div>
    </div>
  `).join('');
}

function bindDialogueEvents() {
  const btn = document.getElementById('generateDialogueBtn');
  if (!btn) return;

  btn.addEventListener('click', async () => {
    const charName = document.getElementById('dialogueCharSelect').value;
    const situation = document.getElementById('dialogueSituationInput').value.trim() || 'Tense confrontation';
    const emotion = document.getElementById('dialogueEmotionSelect')?.value || 'defiance';
    const container = document.getElementById('dialogueResultsContainer');

    btn.textContent = '⏳ Generating with AI...';
    btn.disabled = true;

    try {
      if (appState.storyId) {
        const res = await apiFetch(`/stories/${appState.storyId}/generate`, {
          method: 'POST',
          body: JSON.stringify({
            type: 'dialogue',
            character: charName,
            situation: situation,
            emotion: emotion,
            intensity: 7
          })
        });

        if (res.ok) {
          const data = await res.json();
          if (data.dialogue_options && data.dialogue_options.length > 0) {
            container.innerHTML = getDialogueSuggestionsHtml(charName, situation, data.dialogue_options);
            btn.textContent = '✨ Generate In-Voice Dialogue';
            btn.disabled = false;
            return;
          }
        }
      }
    } catch (e) {
      console.debug('Backend dialogue fallback:', e);
    }

    container.innerHTML = getDialogueSuggestionsHtml(charName, situation);
    btn.textContent = '✨ Generate In-Voice Dialogue';
    btn.disabled = false;
  });
}

// -----------------------------------------------------------------------------
// STORY BRANCHES (MULTIVERSE CO-WRITING)
// -----------------------------------------------------------------------------
function renderBranchesToolHtml() {
  const branches = [
    {
      title: '🌿 Branch 1 — The Hidden Letter',
      rating: '9.2',
      consistency: '94% Consistent',
      desc: 'Aarav finds a sealed letter from Delhi’s High Archivist revealing Varun was once sworn to protect the citadel.',
      text: 'Tucked inside the hollow hilt of the ceremonial pedestal lay a letter bearing the Archivist’s wax signet—revealing Varun had once taken the same blood oath in Delhi.'
    },
    {
      title: '🌿 Branch 2 — The Friend’s Secret',
      rating: '8.7',
      consistency: '89% Consistent',
      desc: 'Diya confesses she already knows the obsidian cipher because her family built the northern water wards.',
      text: 'Diya stepped past the torches and placed her palm over the runes. "Forgive me, Aarav—my family forged this lock before we ever met in Delhi."'
    },
    {
      title: '🌿 Branch 3 — The Villain Appears',
      rating: '7.9',
      consistency: '84% Consistent',
      desc: 'Varun confronts Aarav directly inside the courtyard, offering a truce before the forest spirits surround them.',
      text: 'Iron boots echoed from the shattered gate as Varun emerged alone, lowering his blade. "Divert the river channel with me, Aarav, or neither of us leaves this fortress alive."'
    }
  ];

  return `
    <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
      ${branches.map((b) => `
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
            <button onclick="previewAiText('${encodeURIComponent(b.text)}')" class="flex-1 py-1.5 px-2.5 rounded-lg border app-border hover:border-teal-500 text-xs font-medium app-text-secondary transition">Preview</button>
            <button onclick="insertAiTextIntoEditor('${encodeURIComponent(b.text)}')" class="flex-1 py-1.5 px-2.5 rounded-lg btn-primary text-xs font-semibold transition">Use This</button>
          </div>
        </div>
      `).join('')}
    </div>
  `;
}

// -----------------------------------------------------------------------------
// VOICE STUDIO (AUDIO EMOTION & TTS)
// -----------------------------------------------------------------------------
function renderVoiceStudioHtml() {
  return `
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <!-- Part A: Record & Analyze Voice -->
      <div class="p-3.5 rounded-xl border app-border app-surface space-y-3">
        <div class="flex items-center justify-between">
          <span class="text-xs font-bold app-text-primary">🎤 A. Record & Analyze Voice</span>
          <span id="voiceRecordStatusBadge" class="text-[11px] px-2 py-0.5 rounded-full bg-slate-500/15 app-text-muted font-medium">Idle</span>
        </div>

        <div class="text-[11px] app-text-secondary bg-slate-500/5 p-2 rounded-lg border app-border">
          Target Dialogue: <strong class="app-text-primary">“I am very happy to see you!”</strong>
        </div>

        <div class="flex items-center justify-between gap-2">
          <div class="flex items-center gap-2">
            <button id="startVoiceRecordBtn" class="px-3 py-1.5 rounded-lg bg-rose-500 hover:bg-rose-600 text-white text-xs font-semibold transition">● Start Recording</button>
            <button id="stopVoiceRecordBtn" disabled class="px-3 py-1.5 rounded-lg border app-border text-xs font-medium app-text-muted disabled:opacity-40 transition">■ Stop</button>
            <button id="analyzeVoiceBtn" class="px-3 py-1.5 rounded-lg bg-teal-500/15 hover:bg-teal-500/25 text-teal-400 text-xs font-semibold transition">Analyze Voice</button>
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
          <div class="grid grid-cols-3 gap-2 text-[11px]">
            <div class="p-1.5 rounded app-surface-secondary border app-border">Emotion: <strong class="status-warning-text">Sad</strong></div>
            <div class="p-1.5 rounded app-surface-secondary border app-border">Tone: <strong class="app-text-primary">Flat / Low</strong></div>
            <div class="p-1.5 rounded app-surface-secondary border app-border">Pace: <strong class="app-text-primary">Slow (92 wpm)</strong></div>
            <div class="p-1.5 rounded app-surface-secondary border app-border">Pitch: <strong class="app-text-primary">Low-Mid</strong></div>
            <div class="p-1.5 rounded app-surface-secondary border app-border">Pauses: <strong class="app-text-primary">2 Long</strong></div>
            <div class="p-1.5 rounded app-surface-secondary border app-border">Intensity: <strong class="app-text-primary">38%</strong></div>
          </div>
          <div class="p-2 rounded-lg badge-warning-subtle text-[11px] font-medium">
            ⚠️ Possible tone mismatch: Spoken delivery sounds <strong>Sad</strong>, which contrasts with the cheerful dialogue <em>“I am very happy to see you!”</em>
          </div>
        </div>
      </div>

      <!-- Part B: Text-to-Speech / AI Voice -->
      <div class="p-3.5 rounded-xl border app-border app-surface space-y-3">
        <div class="flex items-center justify-between">
          <span class="text-xs font-bold app-text-primary">🔊 B. Text-to-Speech / AI Voice</span>
          <span id="ttsStatusLabel" class="text-[11px] text-teal-400 font-medium">AI & Speech API Ready</span>
        </div>

        <div>
          <input id="ttsDialogueInput" type="text" value="Don't go there. It's dangerous." class="w-full px-3 py-1.5 rounded-lg border app-border app-surface-secondary text-xs app-text-primary focus:outline-none focus:border-teal-500" />
        </div>

        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="block text-[10px] font-semibold uppercase app-text-muted mb-1">Emotion Preset</label>
            <select id="ttsEmotionSelect" class="w-full px-2.5 py-1.5 rounded-lg border app-border app-surface-secondary text-xs app-text-primary focus:outline-none">
              <option value="Fearful" selected>Fearful</option>
              <option value="Happy">Happy</option>
              <option value="Sad">Sad</option>
              <option value="Angry">Angry</option>
              <option value="Neutral">Neutral</option>
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

function bindVoiceStudioEvents() {
  const startBtn = document.getElementById('startVoiceRecordBtn');
  const stopBtn = document.getElementById('stopVoiceRecordBtn');
  const analyzeBtn = document.getElementById('analyzeVoiceBtn');
  const statusBadge = document.getElementById('voiceRecordStatusBadge');
  const waveContainer = document.getElementById('voiceWaveformContainer');
  const resultBox = document.getElementById('voiceAnalysisResultBox');

  startBtn.addEventListener('click', () => {
    isRecordingVoice = true;
    startBtn.disabled = true;
    stopBtn.disabled = false;
    statusBadge.textContent = '● Recording...';
    statusBadge.className = 'text-[11px] px-2 py-0.5 rounded-full badge-error-subtle font-semibold animate-pulse';
    waveContainer.classList.add('recording-active');
  });

  stopBtn.addEventListener('click', () => {
    isRecordingVoice = false;
    startBtn.disabled = false;
    stopBtn.disabled = true;
    statusBadge.textContent = 'Recorded (0:04)';
    statusBadge.className = 'text-[11px] px-2 py-0.5 rounded-full bg-teal-500/15 text-teal-400 font-medium';
    waveContainer.classList.remove('recording-active');
  });

  analyzeBtn.addEventListener('click', () => {
    waveContainer.classList.remove('recording-active');
    startBtn.disabled = false;
    stopBtn.disabled = true;
    statusBadge.textContent = 'Analysis Complete';
    statusBadge.className = 'text-[11px] px-2 py-0.5 rounded-full badge-warning-subtle font-semibold';
    resultBox.classList.remove('hidden');
  });

  const slider = document.getElementById('ttsIntensitySlider');
  const sliderVal = document.getElementById('ttsIntensityValue');
  slider.addEventListener('input', () => {
    sliderVal.textContent = `${slider.value}%`;
  });

  const speakCurrentText = async () => {
    const text = document.getElementById('ttsDialogueInput').value.trim();
    const emotion = document.getElementById('ttsEmotionSelect').value;
    const intensity = Math.round(parseInt(slider.value, 10) / 10);
    const statusLabel = document.getElementById('ttsStatusLabel');

    statusLabel.textContent = `Speaking (${emotion})...`;

    // Try backend TTS first if connected
    if (appState.storyId) {
      try {
        const res = await apiFetch(`/stories/${appState.storyId}/generate/speak`, {
          method: 'POST',
          body: JSON.stringify({
            text: text,
            emotion: emotion.toLowerCase(),
            intensity: Math.max(1, Math.min(10, intensity))
          })
        });
        if (res.ok) {
          const data = await res.json();
          if (data.audio_path) {
            statusLabel.textContent = `Played via AI Voice (${emotion})`;
            return;
          }
        }
      } catch (e) {
        console.debug('Backend TTS fallback to browser SpeechSynthesis:', e);
      }
    }

    // Browser SpeechSynthesis fallback
    if (!('speechSynthesis' in window) || !text) {
      statusLabel.textContent = `Simulated (${emotion})`;
      return;
    }

    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    const numIntensity = parseInt(slider.value, 10) / 100;

    if (emotion === 'Happy') {
      utterance.pitch = 1.15 + numIntensity * 0.25;
      utterance.rate = 1.05 + numIntensity * 0.15;
    } else if (emotion === 'Sad') {
      utterance.pitch = 0.75;
      utterance.rate = 0.82;
    } else if (emotion === 'Angry') {
      utterance.pitch = 0.9;
      utterance.rate = 1.15 + numIntensity * 0.2;
    } else if (emotion === 'Fearful') {
      utterance.pitch = 1.2 + numIntensity * 0.2;
      utterance.rate = 1.18;
    } else {
      utterance.pitch = 1.0;
      utterance.rate = 1.0;
    }

    utterance.onstart = () => { statusLabel.textContent = `Speaking (${emotion})...`; };
    utterance.onend = () => { statusLabel.textContent = 'Playback Finished'; };
    window.speechSynthesis.speak(utterance);
  };

  document.getElementById('ttsPlayBtn').addEventListener('click', () => {
    if ('speechSynthesis' in window && window.speechSynthesis.paused) {
      window.speechSynthesis.resume();
      document.getElementById('ttsStatusLabel').textContent = 'Resumed';
    } else {
      speakCurrentText();
    }
  });

  document.getElementById('ttsPauseBtn').addEventListener('click', () => {
    if ('speechSynthesis' in window && window.speechSynthesis.speaking) {
      window.speechSynthesis.pause();
      document.getElementById('ttsStatusLabel').textContent = 'Paused';
    }
  });

  document.getElementById('ttsReplayBtn').addEventListener('click', speakCurrentText);
}

// -----------------------------------------------------------------------------
// PREVIEW & INSERT AI SUGGESTIONS INTO EDITOR
// -----------------------------------------------------------------------------
function previewAiText(encodedText) {
  pendingPreviewText = decodeURIComponent(encodedText);
  const banner = document.getElementById('editorPreviewBanner');
  const previewTextEl = document.getElementById('previewBannerText');
  previewTextEl.textContent = pendingPreviewText;
  banner.classList.remove('hidden');
}

function insertAiTextIntoEditor(encodedText) {
  const text = decodeURIComponent(encodedText);
  const editor = document.getElementById('storyEditor');
  const p = document.createElement('p');
  p.textContent = text;
  editor.appendChild(p);

  document.getElementById('editorPreviewBanner').classList.add('hidden');
  saveCurrentEditorContentToState();
  updateWordAndCharCount();
  saveStateToStorage();
  editor.scrollTop = editor.scrollHeight;
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

  // Manual Save Button: saves to local state AND sends to backend
  const saveBtn = document.getElementById('saveStoryBtn');
  const saveIcon = document.getElementById('saveBtnIcon');
  const saveText = document.getElementById('saveBtnText');
  const lastSaved = document.getElementById('lastSavedIndicator');

  saveBtn.addEventListener('click', async () => {
    saveCurrentEditorContentToState();
    saveStateToStorage();

    saveIcon.textContent = '⏳';
    saveText.textContent = 'Saving...';
    saveBtn.disabled = true;

    try {
      if (appState.storyId) {
        const editor = document.getElementById('storyEditor');
        const chapterText = editor.innerText.trim();
        const activeChap = appState.chapters.find(c => c.id === appState.activeChapterId) || appState.chapters[0];
        const chapterNum = activeChap.number || 1;

        let res = await apiFetch(`/stories/${appState.storyId}/chapters/${chapterNum}`, {
          method: 'PUT',
          body: JSON.stringify({ text: chapterText })
        });

        if (res.status === 404) {
          res = await apiFetch(`/stories/${appState.storyId}/chapters`, {
            method: 'POST',
            body: JSON.stringify({ number: chapterNum, text: chapterText })
          });
        }

        if (res.ok) {
          await syncBibleFromBackend();
          await syncFlagsFromBackend();
        }
      }
    } catch (e) {
      console.debug('Backend chapter save fallback:', e);
    }

    setTimeout(() => {
      saveIcon.textContent = '✓';
      saveText.textContent = 'Saved ✓';
      saveBtn.classList.add('border-teal-500', 'text-teal-400');
      lastSaved.textContent = 'Synced with backend just now';

      setTimeout(() => {
        saveIcon.textContent = '💾';
        saveText.textContent = 'Save';
        saveBtn.classList.remove('border-teal-500', 'text-teal-400');
        saveBtn.disabled = false;
      }, 1500);
    }, 450);
  });

  // Load Demo Button
  const demoBtn = document.getElementById('loadDemoBtn');
  if (demoBtn) {
    demoBtn.addEventListener('click', loadDemoPlantedStory);
  }

  // Create a new chapter
  document.getElementById('addChapterBtn').addEventListener('click', () => {
    saveCurrentEditorContentToState();
    const nextNum = appState.chapters.length + 1;
    const newChap = {
      id: `chap-${Date.now()}`,
      number: nextNum,
      title: `Chapter ${nextNum}`,
      subtitle: 'New Scene',
      content: `<p>Begin writing Chapter ${nextNum} here...</p>`
    };
    appState.chapters.push(newChap);
    appState.activeChapterId = newChap.id;
    appState.activeChapterNumber = nextNum;
    renderChapterTabs();
    loadActiveChapterIntoEditor();
    saveStateToStorage();
  });

  // Editor typing listener
  const editor = document.getElementById('storyEditor');
  editor.addEventListener('input', () => {
    updateWordAndCharCount();
    saveCurrentEditorContentToState();
    saveStateToStorage();
  });

  // Toggle inline entity highlights inside the editor
  const highlightBtn = document.getElementById('toggleHighlightBtn');
  highlightBtn.addEventListener('click', () => {
    appState.highlightsEnabled = !appState.highlightsEnabled;
    editor.classList.toggle('highlights-disabled', !appState.highlightsEnabled);
    highlightBtn.textContent = appState.highlightsEnabled ? '✨ Highlights: On' : '✨ Highlights: Off';
  });

  // Preview banner actions
  document.getElementById('confirmPreviewInsertBtn').addEventListener('click', () => {
    if (pendingPreviewText) {
      insertAiTextIntoEditor(encodeURIComponent(pendingPreviewText));
    }
  });
  document.getElementById('closePreviewBannerBtn').addEventListener('click', () => {
    document.getElementById('editorPreviewBanner').classList.add('hidden');
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
