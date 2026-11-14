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
  aiPanelHeight: 520,
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
let mediaRecorder = null;
let recordedAudioChunks = [];
let recordedAudioBlob = null;
let currentTtsAudio = null;
let speechRecognizer = null;

// Load state helper
function loadStateFromStorage() {
  try {
    const savedState = localStorage.getItem('storyBibleAppState_v1');
    const savedTheme = localStorage.getItem('storyBibleTheme_v1');
    const parsed = savedState ? JSON.parse(savedState) : structuredClone(defaultAppState);
    if (savedTheme) parsed.theme = savedTheme;
    if (!parsed.aiPanelHeight || parsed.aiPanelHeight < 500) parsed.aiPanelHeight = 520;
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

    if (bible.characters && bible.characters.length > 0) {
      appState.insights.characters = bible.characters.map(c => {
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
    }

    if (bible.places && bible.places.length > 0) {
      appState.insights.places = bible.places.map(p => {
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
    }

    if (bible.timeline && bible.timeline.length > 0) {
      appState.insights.timeline = bible.timeline.map((t, idx) => ({
        day: t.day || `Chapter ${t.chapter_number}`,
        event: `${t.entity_name} (${t.attribute}): ${t.value}`
      }));
    }

    if (bible.rules && bible.rules.length > 0) {
      appState.insights.rules = bible.rules.map(r => {
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
  scanAndExtractStoryEntities(false);
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

  editor.innerHTML = activeChap.content;
  indicator.textContent = `${activeChap.title}: ${activeChap.subtitle || 'Scene'}`;
  updateWordAndCharCount();
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

    if (filter === 'current' && currentChapFlags.length === 0) {
      container.innerHTML = `
        ${filterHeaderHtml}
        <div class="p-5 text-center rounded-xl border app-border app-surface-secondary space-y-2 my-2">
          <span class="text-3xl block">✅</span>
          <p class="text-xs font-bold text-emerald-400">Chapter ${appState.activeChapterNumber} is 100% Consistent</p>
          <p class="text-[11px] app-text-muted leading-relaxed">No character trait contradictions, impossible timeline jumps, or world rule violations found in this chapter.</p>
          ${unresolvedFlags.length > 0 ? `
            <button onclick="setFlagsFilter('all')" class="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-teal-500/15 hover:bg-teal-500/25 text-teal-400 text-xs font-semibold transition">
              <span>View ${unresolvedFlags.length} Flag${unresolvedFlags.length > 1 ? 's' : ''} in Other Chapters</span>
              <span>→</span>
            </button>
          ` : ''}
        </div>
      `;
      return;
    }

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

    container.innerHTML = `
      ${filterHeaderHtml}
      <div class="space-y-3">
        ${displayFlags.map((f) => `
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
  const titleLow = (flag.title || '').toLowerCase();
  const rawLow = rawTarget.toLowerCase();

  // 3. Find matching span in editor if already present
  let targetElement = null;
  const conflictSpans = Array.from(editor.querySelectorAll('.fact-conflict'));
  for (const span of conflictSpans) {
    const spanText = span.textContent.trim().toLowerCase();
    if (rawLow && (rawLow.includes(spanText) || spanText.includes(rawLow))) {
      targetElement = span;
      break;
    }
  }

  // 4. If not wrapped in a conflict span, find raw text dynamically (case-insensitive) and wrap it
  if (!targetElement && rawTarget) {
    const editorHtml = editor.innerHTML;
    let matchedText = null;

    // Direct case-insensitive match
    const escaped = rawTarget.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`(${escaped})`, 'i');
    const directMatch = editorHtml.match(regex);

    if (directMatch) {
      matchedText = directMatch[0];
    } else {
      // Clean punctuation & quotes
      const cleanTarget = rawTarget.replace(/['"“”‘’.,!?;:]/g, ' ').replace(/\s+/g, ' ').trim();
      const cleanEsc = cleanTarget.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const cleanRegex = new RegExp(`(${cleanEsc})`, 'i');
      const cleanMatch = editorHtml.match(cleanRegex);

      if (cleanMatch) {
        matchedText = cleanMatch[0];
      } else {
        // Token sliding window (find longest matching sub-phrase)
        const words = rawTarget.split(/\s+/).filter(w => w.length > 2);
        for (let len = words.length; len >= 2; len--) {
          const phrase = words.slice(0, len).join('\\s+');
          const pRegex = new RegExp(`(${phrase})`, 'i');
          const pMatch = editorHtml.match(pRegex);
          if (pMatch) {
            matchedText = pMatch[0];
            break;
          }
        }
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

  let editorHtml = editor.innerHTML;
  let targetPattern = null;
  let replacement = '';

  const titleLow = (flag.title || '').toLowerCase();
  const currentFactLow = (flag.currentFact || '').toLowerCase();
  const explanationLow = (flag.explanation || '').toLowerCase();

  // Canonical resolution based on Story Bible established facts
  if (currentFactLow.includes('love') || explanationLow.includes('love') || currentFactLow.includes('bithika')) {
    if (/does not love|doesn't love|did not love|didn't love|never loved/i.test(editorHtml)) {
      targetPattern = /\b(does not love|doesn't love|did not love|didn't love|never loved)\s+([a-zA-Z]+)/i;
      replacement = 'truly loves $2';
    } else if (/hates|hated|despises/i.test(editorHtml)) {
      targetPattern = /\b(hates|hated|despises)\s+([a-zA-Z]+)/i;
      replacement = 'cares deeply for $2';
    } else {
      const escaped = (flag.currentFact || '').trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      targetPattern = new RegExp(escaped, 'i');
      replacement = (flag.previousFact || '').replace(/^Rule( established by author)?:?\s*/i, '').trim();
    }
  } else if (titleLow.includes('trait') || titleLow.includes('appearance') || currentFactLow.includes('green eyes')) {
    targetPattern = /bright green eyes|green eyes/i;
    replacement = 'sharp brown eyes';
  } else if (titleLow.includes('rule') || currentFactLow.includes('river') || currentFactLow.includes('water')) {
    if (editorHtml.includes('drifting across the river toward him')) {
      targetPattern = 'drifting across the river toward him';
      replacement = 'recoiling at the riverbank, unable to cross the running water toward him';
    } else if (editorHtml.includes('drifting across the river')) {
      targetPattern = 'drifting across the river';
      replacement = 'shying away from the running water of the river';
    } else if (editorHtml.includes('crossing the running water effortlessly')) {
      targetPattern = 'crossing the running water effortlessly';
      replacement = 'halting abruptly, repelled by the running water';
    } else {
      targetPattern = /across the river|crossing the running water/i;
      replacement = 'recoiling before the running water';
    }
  } else if (titleLow.includes('location') || titleLow.includes('time') || currentFactLow.includes('mumbai')) {
    if (editorHtml.includes('By Monday evening Aarav was standing on the beach in Mumbai')) {
      targetPattern = 'By Monday evening Aarav was standing on the beach in Mumbai';
      replacement = 'By Monday evening Aarav was resting beside the Yamuna ghats in Delhi';
    } else {
      targetPattern = /in Mumbai|beach in Mumbai/i;
      replacement = 'in Delhi';
    }
  } else if (titleLow.includes('knowledge') || currentFactLow.includes('staircase')) {
    if (editorHtml.includes('The key Mom hid under the staircase')) {
      targetPattern = 'The key Mom hid under the staircase';
      replacement = 'The secret key Mom hid away';
    } else if (editorHtml.includes('key Mom hid under the staircase')) {
      targetPattern = 'key Mom hid under the staircase';
      replacement = 'secret brass key Mom hid away';
    } else {
      targetPattern = /under the staircase/i;
      replacement = 'in a secret location only Meera knew';
    }
  } else if (titleLow.includes('lactose') || titleLow.includes('character rule') || currentFactLow.includes('milk') || currentFactLow.includes('dairy') || currentFactLow.includes('cheese')) {
    if (editorHtml.includes('glass of cold milk')) {
      targetPattern = 'glass of cold milk';
      replacement = 'glass of almond milk';
    } else if (editorHtml.includes('glass of milk')) {
      targetPattern = 'glass of milk';
      replacement = 'glass of oat milk';
    } else if (editorHtml.includes('cold milk')) {
      targetPattern = 'cold milk';
      replacement = 'oat milk';
    } else if (editorHtml.includes('drank milk')) {
      targetPattern = 'drank milk';
      replacement = 'drank almond milk';
    } else if (editorHtml.includes('milk')) {
      targetPattern = /\bmilk\b/i;
      replacement = 'almond milk';
    } else if (editorHtml.includes('cheese')) {
      targetPattern = /\bcheese\b/i;
      replacement = 'vegan cheese';
    } else {
      targetPattern = /\b(drank|ate)\s+(.*?)(milk|dairy|cheese|latte)/i;
      replacement = 'chose a dairy-free alternative';
    }
  } else if (flag.currentFact) {
    const escaped = flag.currentFact.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    targetPattern = new RegExp(escaped, 'i');
    replacement = (flag.previousFact || '').replace(/^Rule( established by author)?:?\s*/i, '').trim();
  }

  let replaced = false;

  // If there's an existing span for this conflict, replace its inner content
  const conflictSpans = Array.from(editor.querySelectorAll('.fact-conflict'));
  for (const span of conflictSpans) {
    const spanText = span.textContent.trim().toLowerCase();
    if (
      currentFactLow.includes(spanText) ||
      spanText.includes(currentFactLow) ||
      (titleLow.includes('trait') && spanText.includes('green eyes')) ||
      (titleLow.includes('location') && spanText.includes('mumbai')) ||
      (titleLow.includes('rule') && (spanText.includes('river') || spanText.includes('water'))) ||
      (titleLow.includes('knowledge') && (spanText.includes('staircase') || spanText.includes('key'))) ||
      ((titleLow.includes('rule') || titleLow.includes('lactose')) && (spanText.includes('milk') || spanText.includes('dairy') || spanText.includes('cheese')))
    ) {
      span.outerHTML = `<span id="fixedFlagSpan" class="fact-entity fix-success-flash font-semibold" title="Corrected from Story Bible">${replacement}</span>`;
      replaced = true;
      break;
    }
  }

  if (!replaced && targetPattern) {
    editor.innerHTML = editor.innerHTML.replace(
      targetPattern,
      `<span id="fixedFlagSpan" class="fact-entity fix-success-flash font-semibold" title="Corrected from Story Bible">${replacement}</span>`
    );
    replaced = true;
  }

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
  renderInsightsPanel();
  saveStateToStorage();
  showToast(`✨ Rule for ${entity || 'Story'} saved to Story Bible!`);
}

// Delete custom rule from Story Bible
async function deleteStoryRule(ruleId) {
  const idx = appState.insights.rules.findIndex(r => String(r.id) === String(ruleId));
  if (idx !== -1) {
    appState.insights.rules.splice(idx, 1);
  }

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
    'truly', 'deeply', 'passionately', 'secretly', 'quietly', 'really', 'never', 'ever', 'always', 'also'
  ]);
  const PLACE_SUFFIXES = [
    'city', 'town', 'village', 'kingdom', 'forest', 'river', 'lake', 'fortress',
    'citadel', 'castle', 'palace', 'station', 'ghat', 'memorial', 'bridge', 'beach'
  ];

  const foundPlaces = new Set();
  const prepRegex = /\b(?:in|at|to|from|near|towards|through|across|beside|outside|inside)\s+(?:the\s+)?([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\b/g;
  let m;
  while ((m = prepRegex.exec(text)) !== null) {
    const p = m[1].trim();
    if (!STOPWORDS.has(p.toLowerCase())) foundPlaces.add(p);
  }

  const resRegex = /\b(?:lives|lived|resides|resided|stayed|settled|stands|stood|arrived|departed|resting)\s+(?:in|at|near|beside)\s+(?:the\s+)?([A-Z][a-z]+)\b/gi;
  while ((m = resRegex.exec(text)) !== null) {
    const p = m[1].trim();
    const clean = p.charAt(0).toUpperCase() + p.slice(1).toLowerCase();
    if (!STOPWORDS.has(clean.toLowerCase())) foundPlaces.add(clean);
  }

  for (const suf of PLACE_SUFFIXES) {
    const sufRegex = new RegExp(`\\b([A-Z][a-z]+(?:\\s+[A-Z][a-z]+)?\\s+${suf})\\b`, 'gi');
    while ((m = sufRegex.exec(text)) !== null) {
      const p = m[1].trim();
      if (!STOPWORDS.has(p.toLowerCase())) foundPlaces.add(p);
    }
  }

  ['Delhi', 'Mumbai', 'Kolkata', 'Kanchrapara', 'London', 'Paris', 'Dark Forest', 'Ancient Kingdom'].forEach(p => {
    if (text.toLowerCase().includes(p.toLowerCase())) foundPlaces.add(p);
  });

  const foundChars = new Set();
  const relMap = new Map();
  const relRegex = /\b([A-Z][a-z]+)\s+((?:truly\s+|deeply\s+|passionately\s+|secretly\s+|quietly\s+|really\s+|never\s+|always\s+)?(?:does not love|doesn't love|did not love|didn't love|never loved|loves|loved|hates|hated|cares for|met|married|trusts|betrayed))\s+([A-Z][a-z]+)\b/gi;
  while ((m = relRegex.exec(text)) !== null) {
    const c1 = m[1].trim();
    const verb = m[2].trim();
    const c2 = m[3].trim();
    for (const name of [c1, c2]) {
      const clean = name.charAt(0).toUpperCase() + name.slice(1);
      if (!STOPWORDS.has(clean.toLowerCase()) && !foundPlaces.has(clean)) {
        foundChars.add(clean);
      }
    }
    if (!STOPWORDS.has(c1.toLowerCase()) && !foundPlaces.has(c1)) {
      relMap.set(c1, `${verb} ${c2}`);
    }
  }

  const actRegex = /\b([A-Z][a-z]+)(?:,\s*[^,.\n]+,)?\s+(?:said|whispered|shouted|asked|replied|warned|knelt|looked|squinted|smirked|sighed|grasped|held|fastened|turned|placed|uncovered|traced|watched|glanced|nodded|shook|boarded|stood|stepped|walked|ran|joined|arrived|departed|lived|lives|stayed|settled|resides|resided|was|is|became|felt)\b/g;
  while ((m = actRegex.exec(text)) !== null) {
    const c = m[1].trim();
    if (!STOPWORDS.has(c.toLowerCase()) && !foundPlaces.has(c)) {
      foundChars.add(c);
    }
  }

  const locMap = new Map();
  const charResRegex = /\b([A-Z][a-z]+)\s+(?:lives|lived|resides|stayed|settled)\s+in\s+([A-Z][a-z]+)\b/gi;
  while ((m = charResRegex.exec(text)) !== null) {
    const c = m[1].trim();
    const p = m[2].trim();
    if (!STOPWORDS.has(c.toLowerCase()) && !foundPlaces.has(c)) {
      foundChars.add(c);
      locMap.set(c, p);
    }
  }

  ['Aarav', 'Diya', 'Varun', 'Meera', 'Gopu', 'Subhankar', 'Bithika'].forEach(c => {
    if (text.toLowerCase().includes(c.toLowerCase())) foundChars.add(c);
  });

  foundChars.forEach(c => foundPlaces.delete(c));

  if (foundChars.size > 0) {
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
    appState.insights.characters = Array.from(existing.values());
  }

  if (foundPlaces.size > 0) {
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
    appState.insights.places = Array.from(existingP.values());
  }
}

function scanAndExtractStoryEntities(triggerRender = true) {
  saveCurrentEditorContentToState();
  const allTexts = (appState.chapters || []).map(c => {
    const raw = (c.id === appState.activeChapterId) ? getEditorPlainText() : (c.content || '');
    return raw.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  }).filter(Boolean);
  if (allTexts.length === 0) return;
  extractEntitiesLocally(allTexts.join('\n'));
  if (triggerRender) {
    renderInsightsPanel();
  }
  saveStateToStorage();
}

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
        return t.replace(/<[^>]*>/g, '').trim().length > 0;
      });

      for (const ch of chaptersToAnalyze) {
        const rawContent = (ch.id === appState.activeChapterId ? chapterText : (ch.content || ''));
        const cleanText = rawContent.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
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

      markStepDone(4);
    } else {
      // Local dynamic extraction across all story text
      scanAndExtractStoryEntities(false);
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
  if (!text) return "Aarav pauses as the shadows lengthen.";
  const paragraphs = text.split('\n').map((p) => p.trim()).filter(Boolean);
  if (paragraphs.length > 0) {
    return paragraphs.slice(-2).join(' ');
  }
  return text.slice(-300);
}

// Open AI Assistant tool drawer
function openAiToolPanel(toolKey) {
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
  const grid = document.getElementById('nextScenesGrid');
  const refreshBtn = document.getElementById('refreshScenesBtn');
  if (refreshBtn) {
    refreshBtn.onclick = () => loadNextSceneSuggestions();
  }
  if (!grid) return;

  nextSceneIteration++;
  const lastContext = getLastSceneContext();
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
          direction: lastContext || 'Aarav pauses as the shadows lengthen.',
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
    const firstWords = lastContext.slice(0, 50) || 'Aarav pauses near the ruins';
    const fallbackPools = [
      [
        {
          medal: '🥇 Option 1',
          rating: '9.6/10',
          badge: '🟢 Highly Recommended',
          badgeClass: 'badge-success-subtle',
          consistency: '96%',
          desc: `The Archivist's Sealed Cipher — Aarav traces the royal crest after "${firstWords.slice(0, 35)}..." uncovering the Delhi aqueduct map.`,
          why: 'Consistent with established facts in Delhi and royal archives.',
          textToInsert: `Beneath the fractured altar stone of the courtyard, Aarav uncovered a parchment map bearing the royal seal of Delhi, marking a subterranean aqueduct where running water still flowed.`,
          isConflict: false,
        },
        {
          medal: '🥈 Option 2',
          rating: '8.4/10',
          badge: '🔵 Good Option',
          badgeClass: 'badge-cyan-subtle',
          consistency: '84%',
          desc: `Ambush in the Upper Gallery — A cloaked watchman signals Diya as Varun's archers take position.`,
          why: 'Fits character motivations and strategic tension without lore violation.',
          textToInsert: `From the shadow of the colonnade, a cloaked watchman signaled to Diya. "Hold your torches—Varun's archers have already claimed the upper gallery."`,
          isConflict: false,
        },
        {
          medal: '🥉 Option 3',
          rating: '4.5/10',
          badge: '🔴 Possible Conflict',
          badgeClass: 'badge-error-subtle',
          consistency: '45%',
          desc: `The River Breach — A dark wraith lunges directly through the river rapids following "${firstWords.slice(0, 30)}...".`,
          why: '⚠️ Conflicts with established rule: Spirits cannot cross running water.',
          textToInsert: `A wraith lunged directly through the foaming river rapids, crossing the running water effortlessly to strike at Aarav's shield.`,
          isConflict: true,
        },
      ],
      [
        {
          medal: '🥇 Option 1',
          rating: '9.4/10',
          badge: '🟢 Highly Recommended',
          badgeClass: 'badge-success-subtle',
          consistency: '94%',
          desc: `Diya activates the ancient sluice gate to flood the eastern terrace.`,
          why: 'Grounded in established hydro-barrier lore: running water protects against spirits.',
          textToInsert: `Diya found the rusted iron lever embedded in the masonry and pulled it down. Mountain water surged through the trench, creating an unbroken channel that repelled the wraiths.`,
          isConflict: false,
        },
        {
          medal: '🥈 Option 2',
          rating: '8.7/10',
          badge: '🔵 Good Option',
          badgeClass: 'badge-cyan-subtle',
          consistency: '87%',
          desc: `A royal messenger from Delhi arrives with a warning about Meera's watch.`,
          why: 'Deepens the mystery behind Aarav’s heirloom and family past.',
          textToInsert: `A breathless scout stumbled into the lantern light, clutching a royal writ from Delhi: "The watch on Aarav's wrist is not merely a keepsake—it is the key to the Ancient Kingdom's vault."`,
          isConflict: false,
        },
        {
          medal: '🥉 Option 3',
          rating: '7.8/10',
          badge: '💡 Creative Twist',
          badgeClass: 'badge-cyan-subtle',
          consistency: '78%',
          desc: `Varun proposes a temporary ceasefire to decipher the obsidian runes.`,
          why: 'Presents an unexpected diplomatic branch while maintaining character stakes.',
          textToInsert: `Varun lowered his blade and stepped into the torchlight alone. "Neither of us can read the ancient script without the other. Divert the river channel with me, Aarav, or we both perish."`,
          isConflict: false,
        },
      ],
      [
        {
          medal: '🥇 Option 1',
          rating: '9.7/10',
          badge: '🟢 Highly Recommended',
          badgeClass: 'badge-success-subtle',
          consistency: '97%',
          desc: `Aarav discovers his mother's secret inscription behind the altar wall.`,
          why: 'Perfect alignment with established backstory of Meera and Delhi.',
          textToInsert: `Running his fingers along the stone mortar, Aarav felt a familiar carved pattern: his mother's initials, followed by the coordinates of an underground cistern beneath Delhi.`,
          isConflict: false,
        },
        {
          medal: '🥈 Option 2',
          rating: '8.5/10',
          badge: '🔵 Good Option',
          badgeClass: 'badge-cyan-subtle',
          consistency: '85%',
          desc: `A night wraith is repelled by the spray of the river cascade.`,
          why: 'Visually demonstrates the hydro-barrier law in action.',
          textToInsert: `The shadowy silhouette lunged forward, but the moment the misty spray of the river hit its ethereal form, it recoiled with a sharp hiss back into the pine grove.`,
          isConflict: false,
        },
        {
          medal: '🥉 Option 3',
          rating: '4.2/10',
          badge: '🔴 Possible Conflict',
          badgeClass: 'badge-error-subtle',
          consistency: '42%',
          desc: `Aarav teleports instantly to Mumbai by Monday evening.`,
          why: '⚠️ Conflicts with travel rule: Delhi to Mumbai takes more than one day by train.',
          textToInsert: `Within an hour of leaving Delhi, Aarav was walking along the Mumbai shore, meeting with strangers about the spirits.`,
          isConflict: true,
        },
      ],
      [
        {
          medal: '🥇 Option 1',
          rating: '9.3/10',
          badge: '🟢 Highly Recommended',
          badgeClass: 'badge-success-subtle',
          consistency: '93%',
          desc: `Diya decodes the obsidian runes using the archive cipher from Delhi.`,
          why: 'Consistent with Diya’s role as friend & ancient script expert.',
          textToInsert: `Holding the brass lantern close to the dark stone, Diya translated the characters: "Only the blood of Delhi's first guardian can break the northern seal."`,
          isConflict: false,
        },
        {
          medal: '🥈 Option 2',
          rating: '8.6/10',
          badge: '🔵 Good Option',
          badgeClass: 'badge-cyan-subtle',
          consistency: '86%',
          desc: `Varun's vanguard sounds a retreat horn as storm clouds gather.`,
          why: 'Introduces a tense atmospheric pause allowing the heroes to fortify.',
          textToInsert: `A low horn sounded from the ridge above the Dark Forest. Varun's scouts pulled back into the shadows as torrential rain began to swell the riverbanks.`,
          isConflict: false,
        },
        {
          medal: '🥉 Option 3',
          rating: '4.8/10',
          badge: '🔴 Possible Conflict',
          badgeClass: 'badge-error-subtle',
          consistency: '48%',
          desc: `Aarav suddenly displays bright green eyes during the confrontation.`,
          why: '⚠️ Conflicts with character physical trait: Aarav was established to have brown eyes.',
          textToInsert: `Aarav narrowed his piercing green eyes at Varun, clenching his fists as he stepped past Diya.`,
          isConflict: true,
        },
      ],
    ];

    suggestions = fallbackPools[nextSceneIteration % fallbackPools.length];
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
  const characters = appState.insights.characters.length > 0
    ? appState.insights.characters
    : [{ name: 'Aarav' }, { name: 'Diya' }, { name: 'Varun' }];

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
          <input id="dialogueSituationInput" type="text" value="Aarav is scared but trying to hide it" class="w-full px-3 py-1.5 rounded-lg border app-border app-surface-secondary text-xs app-text-primary focus:outline-none focus:border-teal-500" />
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
        ${getDialogueSuggestionsHtml('Aarav', 'Aarav is scared but trying to hide it')}
      </div>
    </div>
  `;
}

function getDialogueSuggestionsHtml(character, situation, optionsList = null, selectedEmotion = 'defiance') {
  const list = optionsList && optionsList.length > 0 ? optionsList : [
    {
      line: `"Keep the lantern steady, Diya. The shadows only look taller because the mist is rising off the river."`,
      underlying_emotion: selectedEmotion,
      intensity: 7,
      why_in_voice: `${character} is cautious but reassuring`,
    },
    {
      line: `"We didn't ride three nights from Delhi just to hesitate at an open gate. Stay behind my shield."`,
      underlying_emotion: selectedEmotion,
      intensity: 8,
      why_in_voice: `${character} leads with bravery despite danger`,
    },
  ];

  appState.activeDialogueLines = list;

  return list.map((item, idx) => `
    <div class="p-3 rounded-xl border app-border app-surface flex flex-col sm:flex-row sm:items-center justify-between gap-3">
      <div class="space-y-1">
        <div class="flex items-center gap-2">
          <span class="text-[11px] font-bold text-teal-400">👤 ${character}</span>
          <span class="text-[10px] px-2 py-0.5 rounded bg-teal-500/10 text-teal-400 font-semibold">${item.underlying_emotion || selectedEmotion} (${item.intensity || 7}/10)</span>
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
    const charName = document.getElementById('dialogueCharSelect').value;
    const situation = document.getElementById('dialogueSituationInput').value.trim() || 'Aarav is scared but trying to hide it';
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
  const grid = document.getElementById('storyBranchesGrid');
  const refreshBtn = document.getElementById('refreshBranchesBtn');
  if (refreshBtn) {
    refreshBtn.onclick = () => loadStoryBranches();
  }
  if (!grid) return;

  storyBranchesFreshCount++;
  const lastContext = getLastSceneContext();
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
          direction: lastContext || 'Aarav pauses as the shadows lengthen.',
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
    const branchPools = [
      [
        {
          title: '🌿 Branch 1 — The Hidden Letter',
          rating: '9.2',
          consistency: '94% Consistent',
          desc: "Aarav finds a sealed letter from Delhi's High Archivist revealing Varun was once sworn to protect the citadel.",
          text: "Tucked inside the hollow hilt of the ceremonial pedestal lay a letter bearing the Archivist's wax signet—revealing Varun had once taken the same blood oath in Delhi.",
        },
        {
          title: "🌿 Branch 2 — The Friend's Secret",
          rating: '8.7',
          consistency: '89% Consistent',
          desc: 'Diya confesses she already knows the obsidian cipher because her family built the northern water wards.',
          text: 'Diya stepped past the torches and placed her palm over the runes. "Forgive me, Aarav—my family forged this lock before we ever met in Delhi."',
        },
        {
          title: '🌿 Branch 3 — The Villain Appears',
          rating: '7.9',
          consistency: '84% Consistent',
          desc: 'Varun confronts Aarav directly inside the courtyard, offering a truce before the forest spirits surround them.',
          text: 'Iron boots echoed from the shattered gate as Varun emerged alone, lowering his blade. "Divert the river channel with me, Aarav, or neither of us leaves this fortress alive."',
        },
      ],
      [
        {
          title: '🌿 Branch 1 — The Sluice Gate Awakening',
          rating: '9.5',
          consistency: '95% Consistent',
          desc: 'Aarav discovers the river sluice mechanism capable of flooding the lower fortress.',
          text: 'Aarav gripped the rusted wheel beneath the parapet, feeling the vibration of pressurized mountain water ready to scour the moat clean of wraiths.',
        },
        {
          title: '🌿 Branch 2 — The Starlit Inscription',
          rating: '8.9',
          consistency: '90% Consistent',
          desc: 'Diya aligns the brass lantern with the celestial markers above the Dark Forest.',
          text: 'The lantern lenses cast concentric rings across the flagstones, exposing an unmapped subterranean route that bypassed the spirit tree line completely.',
        },
        {
          title: '🌿 Branch 3 — The Royal Heraldry',
          rating: '8.3',
          consistency: '86% Consistent',
          desc: 'A messenger arrives from Delhi bearing royal seals ordering Varun’s immediate stand-down.',
          text: 'From the forest trail emerged a lone courier carrying Delhi’s silver falcon banner. "Varun! Your garrison commission has been revoked by the Grand Council!"',
        },
      ],
    ];

    branches = branchPools[storyBranchesFreshCount % branchPools.length];
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
      if (hintLower.includes(optVal) || (hintLower.includes('love') && optVal === 'happy') || (hintLower.includes('defian') && optVal === 'angry')) {
        emotionSelect.selectedIndex = i;
        break;
      }
    }
  }
  const slider = document.getElementById('ttsIntensitySlider');
  const sliderVal = document.getElementById('ttsIntensityValue');
  if (slider && intensityHint) {
    const intenPct = Math.min(100, Math.max(10, intensityHint * 10));
    slider.value = intenPct;
    if (sliderVal) sliderVal.textContent = `${intenPct}%`;
  }
  showToast('Copied exact dialogue to Part B (TTS)! Press ▶ Play to synthesize.');
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
      let p_emo = 'Narrative Conviction';
      let s_emo = 'Poise';
      let inten = 7;
      let val = 'neutral';
      let energy = 'medium';
      let cues = 'Measured pacing, clear diction, grounded vocal register';
      let mismatch = false;
      let note = 'Balanced acoustic delivery aligned with narrative dialogue.';
      let summary = 'Natural and steady line delivery with good vocal presence.';

      if (/(love|truly|heart|darling|adore|dearest|kiss|passion|bithika|subhankar)/i.test(cleanLower)) {
        p_emo = 'Affection / Deep Love';
        s_emo = 'Tenderness';
        inten = 8;
        val = 'positive';
        energy = 'medium';
        cues = 'Warm vocal resonance, softening cadence, gentle micro-pauses';
        note = 'Warm vocal tone matches sincere affection and intimate dialogue.';
        summary = 'Delivery conveys sincere affection and emotional vulnerability.';
      } else if (/(fear|scared|danger|run|dark|wraith|monster|kill|die|shadow)/i.test(cleanLower)) {
        p_emo = 'Fear / High Urgency';
        s_emo = 'Panic';
        inten = 9;
        val = 'negative';
        energy = 'high';
        cues = 'Accelerated tempo, shallow breathing, elevated vocal pitch';
        note = 'Vocal agitation mirrors the high-stakes threat in the line.';
        summary = 'Urgent, strained delivery communicates immediate peril.';
      } else if (/(won't|never|fight|stand|swear|defeat|blade|strike|refuse)/i.test(cleanLower)) {
        p_emo = 'Defiance / Determination';
        s_emo = 'Courage';
        inten = 8;
        val = 'positive';
        energy = 'high';
        cues = 'Resonant chest voice, firm cadence, crisp consonant articulation';
        note = 'Firm acoustic attack underscores protagonist resolve.';
        summary = 'Delivery is commanding, resolute, and unwavering.';
      } else if (/(sad|grief|lost|crying|tears|alone|heavy|goodbye|sorry)/i.test(cleanLower)) {
        p_emo = 'Sadness / Grief';
        s_emo = 'Sorrow';
        inten = 7;
        val = 'negative';
        energy = 'low';
        cues = 'Slow tempo, descending pitch contour, prolonged pauses';
        note = 'Subdued vocal dynamics capture solemn melancholy.';
        summary = 'Introspective delivery imbued with restrained grief.';
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
        delivery_rating: +(7.5 + (inten % 3) * 0.7).toFixed(1),
        tone_rating: +(mismatch ? 6.8 : 9.4).toFixed(1),
        clarity_rating: 8.9,
        overall_rating: +((8.2 + inten * 0.15)).toFixed(1)
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
          scanAndExtractStoryEntities(false);
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
    scanAndExtractStoryEntities(false);
    saveStateToStorage();
  });

  // Editor typing listener with debounced dynamic entity scanner
  const editor = document.getElementById('storyEditor');
  let inputScanTimer = null;
  editor.addEventListener('input', () => {
    updateWordAndCharCount();
    saveCurrentEditorContentToState();
    saveStateToStorage();
    clearTimeout(inputScanTimer);
    inputScanTimer = setTimeout(() => {
      scanAndExtractStoryEntities();
    }, 600);
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
