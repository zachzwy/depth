import { useState, useEffect, useRef, useCallback } from 'preact/hooks';
import { LEVELS } from '../../lib/levels.js';
import {
  getSettings,
  setSettings,
  onSettingsChange,
  isGenerationConfigured,
  hasConsentedToProvider,
  providerFingerprint,
  getProvider,
} from '../../lib/settings.js';
import { getSession, saveSession, clearSession } from '../../lib/session.js';
import { addToDeck, getDeck, removeFromDeckByUrl, removeFromDeckById, updateInDeck } from '../../lib/deck.js';
import { glanceData, summaryData, readData } from './level-data.js';
import { getUi } from '../../lib/i18n/index.js';
import { extractPage } from '../extractor.js';
import { computeStats } from '../readability-stats.js';
import PanelHeader from './components/PanelHeader.jsx';
import PanelFooter from './components/PanelFooter.jsx';
import DepthSlider from './components/DepthSlider.jsx';
import LevelTabPill from './components/LevelTabPill.jsx';
import GlanceView from './components/views/GlanceView.jsx';
import SummaryView from './components/views/SummaryView.jsx';
import ReadView from './components/views/ReadView.jsx';
import QuizView from './components/views/QuizView.jsx';
import DiveView from './components/views/DiveView.jsx';
import SetupView from './components/SetupView.jsx';
import ConsentModal from './components/ConsentModal.jsx';
import LoadingSkeleton from './components/LoadingSkeleton.jsx';
import ErrorState from './components/ErrorState.jsx';
import PaywallCard from './components/PaywallCard.jsx';
import HostedPermissionCard from './components/HostedPermissionCard.jsx';
import CaptchaCard from './components/CaptchaCard.jsx';
import StaleBanner from './components/StaleBanner.jsx';
import UnsupportedCard from './components/UnsupportedCard.jsx';
import ShareDialog from './components/ShareDialog.jsx';
import CommunityVersionsCard from './components/CommunityVersionsCard.jsx';
import ExtractionStats from './components/ExtractionStats.jsx';
import DeckView from './components/DeckView.jsx';
import TrialOfferModal from './components/TrialOfferModal.jsx';

// Per-subject one-shot guard for the trial-offer modal. Key is namespaced
// to the subjectId so different signed-in users see the offer once each;
// presence (any truthy value) is enough — we don't snooze or replay.
const TRIAL_OFFER_SHOWN_KEY_PREFIX = 'depth:trial-offer-shown:';

const DEFAULT_PANEL_WIDTH = 420;
const MIN_PANEL_WIDTH = 420;
const MAX_PANEL_WIDTH = 720;
const PANEL_WIDTH_KEY = 'depth:panelWidth';

const DEFAULT_PANEL_HEIGHT = 640;
const MIN_PANEL_HEIGHT = 420;
const MAX_PANEL_HEIGHT = 1200;
const PANEL_HEIGHT_KEY = 'depth:panelHeight';
const DEFAULT_TOP_OFFSET = 96; // matches CSS `.depth-panel { top: 96px }`

const PANEL_MINIMIZED_KEY = 'depth:panelMinimized';
const HEADER_CLICK_THRESHOLD = 4; // px of movement before drag wins over click

function clampPanelWidth(w) {
  const viewportCap = Math.max(MIN_PANEL_WIDTH, window.innerWidth - 8);
  const cap = Math.min(MAX_PANEL_WIDTH, viewportCap);
  return Math.max(MIN_PANEL_WIDTH, Math.min(cap, w));
}

function clampPanelHeight(h, topPx) {
  const top = typeof topPx === 'number' ? topPx : DEFAULT_TOP_OFFSET;
  const viewportCap = Math.max(MIN_PANEL_HEIGHT, window.innerHeight - top - 8);
  const cap = Math.min(MAX_PANEL_HEIGHT, viewportCap);
  return Math.max(MIN_PANEL_HEIGHT, Math.min(cap, h));
}

function needsBackgroundDocumentExtraction(ext) {
  const kind = ext?.classification?.kind;
  return kind === 'pdf' || kind === 'document';
}

function sourceKindForExtraction(ext) {
  const sourceKind = ext?.classification?.sourceKind;
  const sourceType = ext?.classification?.sourceType ?? '';
  return sourceKind === 'transcript' || sourceType.includes('transcript')
    ? 'transcript'
    : 'article';
}

export default function Panel({ pageMeta, onClose }) {
  // Levels 1-3 state
  const [level, setLevel] = useState(1);
  const [status, setStatus] = useState('init');
  const [extracted, setExtracted] = useState(null);
  const [settings, setSettingsState] = useState(null);
  const [stats, setStats] = useState(null);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const portRef = useRef(null);

  // UI ephemera
  const [saveFlash, setSaveFlash] = useState(false);
  const [staleUrl, setStaleUrl] = useState(null);
  const [sessionLoaded, setSessionLoaded] = useState(false);
  const generatedForUrl = useRef(null);
  // User opt-in to bypass the unsupported-page refusal. Reset on regenerate
  // and on URL change so the gate fires again on each new page.
  const [bypassClassification, setBypassClassification] = useState(false);

  // Drag-to-reposition
  const panelRef = useRef(null);
  const dragRef = useRef(null);
  const [position, setPosition] = useState(null);

  // Drag-to-resize (left-edge handle)
  const resizeRef = useRef(null);
  const [panelWidth, setPanelWidth] = useState(DEFAULT_PANEL_WIDTH);
  const [resizing, setResizing] = useState(false);

  // Drag-to-resize (bottom-edge handle)
  const resizeYRef = useRef(null);
  const [panelHeight, setPanelHeight] = useState(DEFAULT_PANEL_HEIGHT);
  const [resizingY, setResizingY] = useState(false);

  // Click-header-to-minimize
  const [minimized, setMinimized] = useState(false);

  // Top-level view: 'main' (depth slider + content) or 'deck' (saved cards)
  const [view, setView] = useState('main');

  // Saved-deck cache (full list; refreshed on mount and after save)
  const [deck, setDeck] = useState([]);
  const urlIsSaved = deck.some((c) => c?.source?.url === pageMeta.url);

  // Share-to-community state. 'idle' hides the overlay; everything else
  // renders ShareDialog over the panel body. `shareConsentRequired` is
  // sampled once when the user clicks Share so toggling `Always` mid-
  // flow doesn't change the dialog shape.
  const [shareStatus, setShareStatus] = useState('idle');
  const [shareConsentRequired, setShareConsentRequired] = useState(false);
  const [shareResult, setShareResult] = useState(null);
  const [shareError, setShareError] = useState(null);

  // Community consume-side state. 'idle' = no banner; 'available' =
  // ≥1 community version found, banner offers Use latest / Generate
  // fresh; 'hydrating' = fetching the picked slug; 'using' = panel
  // shows the community payload (small notice + "Generate fresh"
  // escape hatch). Reset on URL change via the init useEffect.
  const [communityStatus, setCommunityStatus] = useState('idle');
  const [communityVersions, setCommunityVersions] = useState([]);
  // The slug the user picked (or auto-picked via "Use latest"). Persists
  // to session so closing and re-opening the panel on the same URL
  // resumes on the same version. Reset when the user generates fresh.
  const [selectedCommunitySlug, setSelectedCommunitySlug] = useState(null);

  // Where the current view came from: 'fresh' = locally generated (or
  // hydrated from the per-device cache, which is functionally the same —
  // the user can publish it); 'community:<slug>' = hydrated from a
  // community version, in which case Share is disabled until the user
  // Re-generates. Drives the dedup UX so the user understands *why*
  // Share is off, and matches the server-side (url_hash, payload_hash)
  // unique index that rejects duplicate publishes.
  const [hydratedSource, setHydratedSource] = useState('fresh');

  // `true` when this URL was hydrated from the local content-hash cache
  // (no generation round trip, no quota burn). Drives the small "no
  // quota used" badge. Reset on every URL change + on regenerate so
  // navigating between cached and fresh URLs reflects the right state.
  const [loadedFromLocalCache, setLoadedFromLocalCache] = useState(false);

  // Quiz state
  const [quizData, setQuizData] = useState(null);
  const [quizStatus, setQuizStatus] = useState('idle');
  const [quizError, setQuizError] = useState(null);
  const [quizIndex, setQuizIndex] = useState(0);
  const [quizAnswers, setQuizAnswers] = useState({});
  const quizPortRef = useRef(null);

  // Dive state
  const [diveTurns, setDiveTurns] = useState([]);
  const [diveStatus, setDiveStatus] = useState('idle');
  const [diveError, setDiveError] = useState(null);
  const [diveInput, setDiveInput] = useState('');
  const divePortRef = useRef(null);

  // Trial-offer modal. Driven by an effect on (settings, subjectId);
  // suppressed once the per-subject seen flag is written.
  const [showTrialOffer, setShowTrialOffer] = useState(false);

  const ui = getUi(settings?.preferredLanguage);
  const localizedLevels = localizeLevels(ui);
  const current = localizedLevels.find((l) => l.id === level) ?? localizedLevels[0];

  // ----- Levels 1-3 generation -----
  const startGeneration = useCallback((ext, force = false) => {
    setStatus('generating');
    setError(null);
    const port = chrome.runtime.connect({ name: 'depth-generate' });
    portRef.current = port;
    port.onMessage.addListener((msg) => {
      console.log('[Depth panel] port msg:', msg.type, msg.code ?? '', msg.data ? 'data=' + Object.keys(msg.data).join(',') : '');
      if (msg.type === 'partial') setData(msg.data);
      else if (msg.type === 'done') {
        setData(msg.data);
        setStatus('ready');
      } else if (msg.type === 'error') {
        setError({ code: msg.code, message: msg.message, upgradeUrl: msg.upgradeUrl });
        setStatus(msg.code === 'NO_API_KEY' ? 'needs-key' : 'error');
      }
    });
    port.onDisconnect.addListener(() => {
      console.log('[Depth panel] port disconnected');
    });
    port.postMessage({
      type: 'start',
      title: ext.title,
      url: pageMeta.url,
      text: ext.text,
      sourceKind: sourceKindForExtraction(ext),
      force,
    });
  }, [pageMeta.url]);

  const resolveDocumentExtraction = useCallback(async (ext) => {
    if (!needsBackgroundDocumentExtraction(ext)) return ext;
    setStatus('extracting');
    try {
      const res = await chrome.runtime.sendMessage({
        type: 'depth:extract-document',
        url: ext.sourceUrl || pageMeta.url,
        title: ext.title || pageMeta.title,
      });
      if (!res?.ok || !res.extracted?.text) {
        setError({
          code: res?.code ?? 'DOCUMENT_EXTRACT_FAILED',
          message: res?.message ?? 'Could not read this document.',
        });
        setStatus('error');
        return null;
      }
      return res.extracted;
    } catch (err) {
      setError({
        code: 'DOCUMENT_EXTRACT_FAILED',
        message: err?.message ?? 'Could not read this document.',
      });
      setStatus('error');
      return null;
    }
  }, [pageMeta.title, pageMeta.url]);

  const init = useCallback(async () => {
    const settings = await getSettings();
    setSettingsState(settings);

    // Opportunistic whoami refresh for signed-in users. Picks up server
    // state (tier, subscription status, trial eligibility) that may have
    // changed since the last sign-in. Fire-and-forget — failures are
    // ignored because every signed-in flow has its own retry/error path.
    if (!settings.hostedIsAnonymous && settings.hostedAccessToken) {
      chrome.runtime
        .sendMessage({ type: 'depth:refresh-whoami' })
        .catch(() => {});
    }
    // Reset community-banner + local-cache state on every (re-)init
    // so a previous URL's banner doesn't bleed across navigation, and
    // the cache notice only shows after a fresh-this-URL probe hit.
    setCommunityStatus('idle');
    setCommunityVersions([]);
    setLoadedFromLocalCache(false);

    // Extract first so the consent modal (and any future view) has content
    // to render even if the user has just saved settings for the first time.
    const rawExt = extractPage();
    setExtracted(rawExt);
    const ext = await resolveDocumentExtraction(rawExt);
    if (!ext) return;
    setExtracted(ext);

    // Refuse non-article pages before any network setup. No port opened,
    // no consent fired — nothing leaves the browser on unsupported surfaces.
    if (ext.classification.kind !== 'article' && !bypassClassification) {
      setStatus('unsupported');
      return;
    }

    if (!ext.text) {
      setError({ code: 'NO_CONTENT' });
      setStatus('error');
      return;
    }
    setStats(computeStats(ext.text));

    if (!isGenerationConfigured(settings)) {
      setStatus('needs-key');
      return;
    }

    // Restore prior session for this URL (if within TTL).
    const session = await getSession(pageMeta.url);
    let resumeCommunitySlug = null;
    if (session) {
      if (typeof session.level === 'number') setLevel(session.level);
      if (typeof session.quizIndex === 'number') setQuizIndex(session.quizIndex);
      if (session.quizAnswers) setQuizAnswers(session.quizAnswers);
      if (Array.isArray(session.diveTurns)) setDiveTurns(session.diveTurns);
      if (typeof session.diveInput === 'string') setDiveInput(session.diveInput);
      if (typeof session.selectedCommunitySlug === 'string') {
        resumeCommunitySlug = session.selectedCommunitySlug;
        setSelectedCommunitySlug(resumeCommunitySlug);
      }
    }
    setSessionLoaded(true);

    if (!hasConsentedToProvider(settings)) {
      setStatus('needs-consent');
      return;
    }
    generatedForUrl.current = pageMeta.url;
    setStaleUrl(null);

    // Local cache shortcut: if the user already generated this URL on
    // this device and the local cache row hasn't expired, hydrate
    // directly and skip both the community probe AND a generation
    // round trip. Saves quota AND avoids a "community version
    // available" banner the user doesn't need — they already have
    // their own copy.
    try {
      const cacheProbe = await chrome.runtime.sendMessage({
        type: 'depth:probe-cache-13',
        title: ext.title,
        text: ext.text,
        sourceKind: sourceKindForExtraction(ext),
      });
      if (cacheProbe?.cached && cacheProbe.data) {
        setData(cacheProbe.data);
        setStatus('ready');
        setLoadedFromLocalCache(true);
        return;
      }
    } catch (err) {
      console.warn('[Depth panel] local cache probe failed:', err?.message);
    }

    // Community probe: before burning quota, check whether someone has
    // already published a summary of this URL. Only the panel-side
    // setting `communityUseCache` controls participation here; the SW
    // handler also gates on the same setting as a defense-in-depth.
    // A probe failure / empty result silently falls through to the
    // normal generation path so the worst case is unchanged latency.
    if (settings.communityUseCache && settings.providerMode === 'hosted') {
      setCommunityStatus('probing');
      try {
        const probe = await chrome.runtime.sendMessage({
          type: 'depth:probe-community',
          url: pageMeta.url,
        });
        const versions = Array.isArray(probe?.versions) ? probe.versions : [];
        if (versions.length > 0) {
          setCommunityVersions(versions);
          // Session-restored selection: auto-hydrate the previously picked
          // version (if it's still in the returned list — slugs can vanish
          // on owner-delete or auto-hide).
          const resumeMatch = resumeCommunitySlug
            ? versions.find((v) => v.slug === resumeCommunitySlug)
            : null;
          if (resumeMatch) {
            setCommunityStatus('hydrating');
            hydrateCommunityVersion(resumeMatch.slug).catch((err) => {
              console.warn('[Depth panel] resume hydrate failed:', err?.message);
              setCommunityStatus('available');
            });
            setError(null);
            setStatus('init');
            return;
          }
          setCommunityStatus('available');
          // Holding generation — clear any leftover error/status from
          // a previous URL or settings change so we don't render the
          // banner alongside a stale "Something went wrong" card.
          setError(null);
          setStatus('init');
          return;
        }
      } catch (err) {
        console.warn('[Depth panel] community probe failed:', err?.message);
      }
      setCommunityStatus('idle');
    }

    startGeneration(ext);
  }, [startGeneration, pageMeta.url, bypassClassification, resolveDocumentExtraction]);

  useEffect(() => {
    init();
    return () => {
      portRef.current?.disconnect();
      quizPortRef.current?.disconnect();
      divePortRef.current?.disconnect();
    };
  }, [init]);

  useEffect(() => {
    return onSettingsChange((changes) => {
      if (
        !changes.apiKey &&
        !changes.providerId &&
        !changes.model &&
        !changes.preferredLanguage &&
        !changes.providerMode &&
        !changes.hostedBaseUrl &&
        // Trial eligibility writes happen from the SW (fetchWhoami) and
        // gate the post-sign-in modal effect below. Without this key the
        // panel's settings state wouldn't refresh after the SW writes
        // it, and the modal would never surface.
        !changes.hostedTrialEligible
      ) {
        return;
      }

      (async () => {
        const nextSettings = await getSettings();
        setSettingsState(nextSettings);

        if (!isGenerationConfigured(nextSettings)) {
          disconnectGenerationPorts();
          setStatus('needs-key');
          return;
        }

        if (!hasConsentedToProvider(nextSettings)) {
          disconnectGenerationPorts();
          clearGeneratedState();
          setStatus('needs-consent');
          return;
        }

        if (status === 'needs-key' || status === 'needs-consent') {
          init();
        }
      })();
    });
  }, [status, init]);

  // SPA navigation detection
  useEffect(() => {
    if (
      generatedForUrl.current &&
      pageMeta.url !== generatedForUrl.current &&
      (status === 'ready' || status === 'generating')
    ) {
      setStaleUrl(pageMeta.url);
    }
  }, [pageMeta.url, status]);

  // Persist session (debounced). Strip transient _streaming flags so resumes don't lie.
  useEffect(() => {
    if (!sessionLoaded) return;
    const t = setTimeout(() => {
      saveSession(pageMeta.url, {
        level,
        quizIndex,
        quizAnswers,
        diveTurns: diveTurns.map(({ _streaming, ...rest }) => rest),
        diveInput,
        selectedCommunitySlug,
      });
    }, 300);
    return () => clearTimeout(t);
  }, [
    sessionLoaded,
    pageMeta.url,
    level,
    quizIndex,
    quizAnswers,
    diveTurns,
    diveInput,
    selectedCommunitySlug,
  ]);

  // Keyboard nav — arrows skip when focus is in an editable element so typing works.
  useEffect(() => {
    const isEditableTarget = (e) => {
      const path = e.composedPath?.() ?? [];
      return path.some((el) => {
        const tag = el?.tagName;
        return tag === 'INPUT' || tag === 'TEXTAREA' || el?.isContentEditable;
      });
    };
    const onKey = (e) => {
      if (e.key === 'Escape') {
        onClose?.();
        return;
      }
      if (isEditableTarget(e)) return;
      if (e.key === 'ArrowRight' && level < 5) setLevel(level + 1);
      if (e.key === 'ArrowLeft' && level > 1) setLevel(level - 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [level, onClose]);

  // ----- Quiz generation (kicked off when user first lands on level 4) -----
  const startQuiz = useCallback(() => {
    if (!extracted || !data) return;
    quizPortRef.current?.disconnect();
    setQuizData(null);
    setQuizIndex(0);
    setQuizAnswers({});
    setQuizError(null);
    setQuizStatus('generating');
    const port = chrome.runtime.connect({ name: 'depth-quiz' });
    quizPortRef.current = port;
    port.onMessage.addListener((msg) => {
      if (msg.type === 'partial') setQuizData(msg.data);
      else if (msg.type === 'done') {
        setQuizData(msg.data);
        setQuizStatus('ready');
      } else if (msg.type === 'error') {
        setQuizError({ code: msg.code, message: msg.message });
        setQuizStatus('error');
      }
    });
    port.postMessage({
      type: 'start',
      title: extracted.title,
      url: pageMeta.url,
      text: extracted.text,
      sourceKind: sourceKindForExtraction(extracted),
      keyTerms: data.keyTerms ?? [],
    });
  }, [extracted, data, pageMeta.url]);

  useEffect(() => {
    if (level === 4 && quizStatus === 'idle' && data && extracted) {
      startQuiz();
    }
  }, [level, quizStatus, data, extracted, startQuiz]);

  // Passively probe the quiz cache as soon as level 1-3 is ready, so the
  // 04 pip can reflect quiz readiness without forcing the user to visit it.
  useEffect(() => {
    if (status !== 'ready' || quizStatus !== 'idle' || !extracted) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await chrome.runtime.sendMessage({
          type: 'depth:probe-quiz',
          title: extracted.title,
          text: extracted.text,
          sourceKind: sourceKindForExtraction(extracted),
        });
        if (cancelled) return;
        if (res?.cached && res.data?.questions?.length) {
          setQuizData(res.data);
          setQuizStatus('ready');
        }
      } catch {
        // probe is best-effort; ignore failures
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [status, quizStatus, extracted]);

  // ----- Dive generation (kicked off when user first lands on level 5) -----
  const startDive = useCallback(() => {
    if (!extracted || !data) return;
    divePortRef.current?.disconnect();
    const hasExistingTurns = diveTurns.length > 0 && diveTurns.some((t) => t.content);
    if (!hasExistingTurns) {
      setDiveTurns([{ role: 'assistant', content: '', suggestedReplies: [], _streaming: true }]);
      setDiveStatus('streaming');
    } else {
      // Resuming from saved session — context will be set without a fresh opening turn.
      setDiveStatus('ready');
    }
    setDiveError(null);
    const port = chrome.runtime.connect({ name: 'depth-dive' });
    divePortRef.current = port;
    port.onMessage.addListener((msg) => {
      if (msg.type === 'partial-turn') {
        setDiveTurns((prev) => {
          const next = [...prev];
          const i = next.length - 1;
          if (i >= 0 && next[i].role === 'assistant') {
            next[i] = {
              ...next[i],
              content: msg.data?.message ?? '',
              suggestedReplies: msg.data?.suggestedReplies ?? [],
            };
          }
          return next;
        });
      } else if (msg.type === 'turn-done') {
        setDiveTurns((prev) => {
          const next = [...prev];
          const i = next.length - 1;
          if (i >= 0) {
            next[i] = {
              role: 'assistant',
              content: msg.data?.message ?? next[i].content,
              suggestedReplies: msg.data?.suggestedReplies ?? next[i].suggestedReplies ?? [],
            };
          }
          return next;
        });
        setDiveStatus('ready');
      } else if (msg.type === 'turn-started') {
        // server confirmed; do nothing
      } else if (msg.type === 'error') {
        setDiveError({ code: msg.code, message: msg.message });
        setDiveStatus('error');
      }
    });
    port.postMessage({
      type: 'start',
      title: extracted.title,
      url: pageMeta.url,
      summary: data,
      sourceKind: sourceKindForExtraction(extracted),
      skipOpeningTurn: hasExistingTurns,
    });
  }, [extracted, data, pageMeta.url, diveTurns]);

  useEffect(() => {
    if (level === 5 && diveStatus === 'idle' && data && extracted) {
      startDive();
    }
  }, [level, diveStatus, data, extracted, startDive]);

  function sendDiveMessage(text) {
    if (diveStatus === 'streaming') return;
    setDiveTurns((prev) => [
      ...prev,
      { role: 'user', content: text },
      { role: 'assistant', content: '', suggestedReplies: [], _streaming: true },
    ]);
    setDiveStatus('streaming');
    setDiveInput('');
    const history = [
      ...diveTurns.filter((t) => t.content?.trim().length > 0),
      { role: 'user', content: text },
    ];
    divePortRef.current?.postMessage({ type: 'turn', history });
  }

  // ----- Other handlers -----
  function disconnectGenerationPorts() {
    portRef.current?.disconnect();
    quizPortRef.current?.disconnect();
    divePortRef.current?.disconnect();
  }

  function clearGeneratedState() {
    setData(null);
    setQuizData(null);
    setQuizStatus('idle');
    setQuizIndex(0);
    setQuizAnswers({});
    setDiveTurns([]);
    setDiveStatus('idle');
    setDiveInput('');
    setError(null);
    setLoadedFromLocalCache(false);
    // Re-generating produces a new LLM output, so the source resets to
    // 'fresh' and Share re-enables for this view.
    setHydratedSource('fresh');
  }

  async function onConsent() {
    if (!settings) return;
    const nextSettings = {
      ...settings,
      consented: true,
      consentedProviderFingerprint: providerFingerprint(settings),
    };
    await setSettings({
      consented: true,
      consentedProviderFingerprint: nextSettings.consentedProviderFingerprint,
    });
    setSettingsState(nextSettings);
    if (extracted) startGeneration(extracted);
  }

  function onReloadStale() {
    disconnectGenerationPorts();
    clearGeneratedState();
    setExtracted(null);
    setStats(null);
    setStaleUrl(null);
    // URL changed — re-evaluate classification from scratch.
    setBypassClassification(false);
    setStatus('init');
    init();
  }

  function onTryAnyway() {
    setBypassClassification(true);
    setStatus('init');
    init();
  }

  async function onRegenerate() {
    disconnectGenerationPorts();
    clearGeneratedState();
    setStaleUrl(null);
    await clearSession(pageMeta.url);
    const rawExt = extractPage();
    setExtracted(rawExt);
    const ext = await resolveDocumentExtraction(rawExt);
    if (!ext) return;
    setExtracted(ext);
    if (ext.classification.kind !== 'article' && !bypassClassification) {
      setStatus('unsupported');
      return;
    }
    if (!ext.text) {
      setError({ code: 'NO_CONTENT' });
      setStatus('error');
      return;
    }
    setStats(computeStats(ext.text));
    const currentSettings = await getSettings();
    setSettingsState(currentSettings);
    if (!isGenerationConfigured(currentSettings)) {
      setStatus('needs-key');
      return;
    }
    if (!hasConsentedToProvider(currentSettings)) {
      setStatus('needs-consent');
      return;
    }
    generatedForUrl.current = pageMeta.url;
    startGeneration(ext, true);
  }

  const handleHeaderPointerDown = useCallback((e) => {
    if (e.button !== 0) return;
    if (e.target.closest('button, input, textarea, a')) return;
    const panel = panelRef.current;
    if (!panel) return;
    e.preventDefault();
    const rect = panel.getBoundingClientRect();
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      startLeft: rect.left,
      startTop: rect.top,
      width: rect.width,
      moved: false,
    };
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {}
  }, []);

  const handleHeaderPointerMove = useCallback((e) => {
    const drag = dragRef.current;
    if (!drag) return;
    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;
    if (!drag.moved && Math.abs(dx) < HEADER_CLICK_THRESHOLD && Math.abs(dy) < HEADER_CLICK_THRESHOLD) {
      return;
    }
    drag.moved = true;
    const margin = 4;
    const maxLeft = Math.max(margin, window.innerWidth - drag.width - margin);
    const maxTop = Math.max(margin, window.innerHeight - 48);
    const newLeft = Math.max(margin, Math.min(maxLeft, drag.startLeft + dx));
    const newTop = Math.max(margin, Math.min(maxTop, drag.startTop + dy));
    setPosition({ left: newLeft, top: newTop });
  }, []);

  const handleHeaderPointerUp = useCallback((e) => {
    const drag = dragRef.current;
    dragRef.current = null;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {}
    if (drag && !drag.moved && e.type === 'pointerup') {
      setMinimized((prev) => {
        const next = !prev;
        chrome.storage.local.set({ [PANEL_MINIMIZED_KEY]: next });
        return next;
      });
    }
  }, []);

  // Load the saved-deck on mount.
  useEffect(() => {
    let cancelled = false;
    getDeck().then((d) => {
      if (!cancelled) setDeck(Array.isArray(d) ? d : []);
    });
    return () => { cancelled = true; };
  }, []);

  // Silent snapshot upgrade: when this URL is saved and richer data has
  // arrived (quizData ready, dive turn finished, …), merge it into the
  // stored entry without prompting. Skips legacy cards (no `snapshot` key).
  const lastUpgradeRef = useRef(null);
  useEffect(() => {
    if (!urlIsSaved) return;
    const entry = deck.find((c) => c?.source?.url === pageMeta.url);
    if (!entry?.snapshot) return;

    const snapshot = {
      data: data ?? null,
      quizData: quizStatus === 'ready' ? (quizData ?? null) : null,
      diveTurns:
        diveStatus === 'ready' && diveTurns.length
          ? diveTurns.map(({ _streaming, ...rest }) => rest)
          : null,
    };

    const serialized = JSON.stringify(snapshot);
    if (lastUpgradeRef.current === serialized) return;
    if (JSON.stringify(entry.snapshot) === serialized) {
      lastUpgradeRef.current = serialized;
      return;
    }
    lastUpgradeRef.current = serialized;
    updateInDeck(entry.id, (c) => ({ ...c, snapshot })).then(setDeck);
  }, [urlIsSaved, data, quizData, quizStatus, diveTurns, diveStatus, deck, pageMeta.url]);

  // Restore persisted width + height + minimized on first mount.
  useEffect(() => {
    let cancelled = false;
    chrome.storage.local
      .get([PANEL_WIDTH_KEY, PANEL_HEIGHT_KEY, PANEL_MINIMIZED_KEY])
      .then((r) => {
        if (cancelled) return;
        const w = r?.[PANEL_WIDTH_KEY];
        if (typeof w === 'number' && Number.isFinite(w)) setPanelWidth(clampPanelWidth(w));
        const h = r?.[PANEL_HEIGHT_KEY];
        if (typeof h === 'number' && Number.isFinite(h)) setPanelHeight(clampPanelHeight(h));
        if (r?.[PANEL_MINIMIZED_KEY] === true) setMinimized(true);
      });
    return () => { cancelled = true; };
  }, []);

  const handleResizePointerDown = useCallback((e) => {
    if (e.button !== 0) return;
    const panel = panelRef.current;
    if (!panel) return;
    e.preventDefault();
    e.stopPropagation();
    const rect = panel.getBoundingClientRect();
    resizeRef.current = {
      startX: e.clientX,
      startWidth: rect.width,
      startLeft: rect.left,
      rightEdge: rect.right,
      isPositioned: position !== null,
    };
    setResizing(true);
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {}
  }, [position]);

  const handleResizePointerMove = useCallback((e) => {
    const r = resizeRef.current;
    if (!r) return;
    const delta = e.clientX - r.startX;
    const newWidth = clampPanelWidth(r.startWidth - delta);
    setPanelWidth(newWidth);
    if (r.isPositioned) {
      setPosition((prev) => prev ? { ...prev, left: r.rightEdge - newWidth } : prev);
    }
  }, []);

  const handleResizePointerUp = useCallback((e) => {
    const wasResizing = resizeRef.current !== null;
    resizeRef.current = null;
    setResizing(false);
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {}
    if (wasResizing) {
      // Read the current width from the DOM so we persist exactly what's rendered.
      const rect = panelRef.current?.getBoundingClientRect();
      if (rect) chrome.storage.local.set({ [PANEL_WIDTH_KEY]: rect.width });
    }
  }, []);

  const handleResizeDoubleClick = useCallback(() => {
    const panel = panelRef.current;
    const rightEdge = panel?.getBoundingClientRect().right;
    setPanelWidth(DEFAULT_PANEL_WIDTH);
    chrome.storage.local.set({ [PANEL_WIDTH_KEY]: DEFAULT_PANEL_WIDTH });
    if (position !== null && typeof rightEdge === 'number') {
      setPosition({ ...position, left: rightEdge - DEFAULT_PANEL_WIDTH });
    }
  }, [position]);

  const handleResizeYPointerDown = useCallback((e) => {
    if (e.button !== 0) return;
    const panel = panelRef.current;
    if (!panel) return;
    e.preventDefault();
    e.stopPropagation();
    const rect = panel.getBoundingClientRect();
    resizeYRef.current = {
      startY: e.clientY,
      startHeight: rect.height,
      top: rect.top,
    };
    setResizingY(true);
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {}
  }, []);

  const handleResizeYPointerMove = useCallback((e) => {
    const r = resizeYRef.current;
    if (!r) return;
    const newHeight = clampPanelHeight(r.startHeight + (e.clientY - r.startY), r.top);
    setPanelHeight(newHeight);
  }, []);

  const handleResizeYPointerUp = useCallback((e) => {
    const wasResizing = resizeYRef.current !== null;
    resizeYRef.current = null;
    setResizingY(false);
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {}
    if (wasResizing) {
      const rect = panelRef.current?.getBoundingClientRect();
      if (rect) chrome.storage.local.set({ [PANEL_HEIGHT_KEY]: rect.height });
    }
  }, []);

  const handleResizeYDoubleClick = useCallback(() => {
    const rect = panelRef.current?.getBoundingClientRect();
    const next = clampPanelHeight(DEFAULT_PANEL_HEIGHT, rect?.top);
    setPanelHeight(next);
    chrome.storage.local.set({ [PANEL_HEIGHT_KEY]: next });
  }, []);

  function openSettings() {
    console.log('[Depth panel] open-options requested');
    try {
      const p = chrome.runtime.sendMessage({ type: 'depth:open-options' });
      if (p && typeof p.catch === 'function') {
        p.catch((e) => console.warn('[Depth panel] sendMessage failed:', e?.message));
      }
    } catch (e) {
      console.warn('[Depth panel] sendMessage threw:', e?.message);
    }
  }

  // Paywall escape valve: flip to BYOK and open settings. onSettingsChange
  // (above) will pick up the providerMode flip and re-route the panel into
  // needs-key/needs-consent as appropriate so the user lands on the right
  // next step.
  async function onUseOwnKey() {
    disconnectGenerationPorts();
    await setSettings({ providerMode: 'custom' });
    openSettings();
  }

  // Paywall upgrade CTA. PaywallCard's anchor click handler decides
  // synchronously whether to preventDefault using `canUpgrade` — must be
  // sync, otherwise Chrome opens the static upgrade URL in a new tab
  // before our async sendMessage completes, and the user gets two tabs.
  // When canUpgrade is true the handler invokes onUpgrade as fire-and-forget
  // and we surface failures via console.
  // First-run path: hosted mode is the default, but Chrome's optional
  // host permission isn't granted yet. We compute the origin pattern
  // here (synchronously from settings) and send it in the message — the
  // SW must call chrome.permissions.request with no preceding `await`,
  // otherwise the user-activation token from this click is consumed
  // before the API sees it and Chrome silently refuses.
  async function onAllowHostedPermission() {
    let originPattern;
    try {
      const baseUrl = (settings?.hostedBaseUrl ?? '').replace(/\/+$/, '');
      if (!baseUrl) return false;
      originPattern = new URL(baseUrl).origin + '/*';
    } catch {
      return false;
    }
    try {
      const res = await chrome.runtime.sendMessage({
        type: 'depth:request-hosted-permission',
        originPattern,
      });
      if (res?.granted) {
        setError(null);
        await init();
        return true;
      }
      return false;
    } catch (e) {
      console.warn('[Depth panel] request-hosted-permission failed:', e?.message);
      return false;
    }
  }

  // Second-stage first-run gate. After permission is granted, the first
  // hosted call may bounce with CAPTCHA_REQUIRED if the hosted backend
  // has captcha enabled. The SW handler owns the launchWebAuthFlow +
  // retry signup; we just route the click through so the user-gesture
  // survives. Returns null on success, or an error string the
  // CaptchaCard renders in its footnote so the user sees what went wrong.
  async function onCompleteCaptcha() {
    // chrome.identity isn't available in content scripts; the SW
    // does chrome.identity.getRedirectURL() itself. Panel passes
    // hostedBaseUrl so the SW doesn't need an async storage read
    // (which would consume the user-activation token).
    const hostedBaseUrl = settings?.hostedBaseUrl ?? '';
    try {
      const res = await chrome.runtime.sendMessage({
        type: 'depth:complete-captcha',
        hostedBaseUrl,
      });
      if (res?.ok) {
        setError(null);
        await init();
        return null;
      }
      const reason = res?.message ? `${res.code ?? 'CAPTCHA_FAILED'}: ${res.message}` : null;
      console.warn('[Depth panel] complete-captcha failed:', reason);
      return reason;
    } catch (e) {
      console.warn('[Depth panel] complete-captcha sendMessage threw:', e?.message);
      return e?.message || null;
    }
  }

  const canUpgrade = settings?.hostedIsAnonymous === false;
  // Server adds trial_period_days=30 automatically when the subject has
  // no Stripe customer yet, so this is the same depth:open-checkout
  // message we use for the paid path — no branching here.
  async function onUpgrade() {
    try {
      const res = await chrome.runtime.sendMessage({ type: 'depth:open-checkout' });
      if (res && !res.ok) {
        console.warn('[Depth panel] checkout failed:', res.code, res.message);
        return res;
      }
      return { ok: true };
    } catch (e) {
      console.warn('[Depth panel] open-checkout sendMessage threw:', e?.message);
      return { ok: false, message: e?.message };
    }
  }

  // Surface the post-sign-in trial modal when (a) the user is signed-in
  // and eligible per the server, and (b) we haven't shown it for this
  // subject before. The seen flag is written on EITHER outcome so the
  // CTA path doesn't double-prompt on the next panel open.
  useEffect(() => {
    if (!settings) return;
    if (!settings.hostedTrialEligible) return;
    if (settings.hostedIsAnonymous) return;
    const subjectId = settings.hostedSubjectId;
    if (!subjectId) return;
    const key = `${TRIAL_OFFER_SHOWN_KEY_PREFIX}${subjectId}`;
    let cancelled = false;
    chrome.storage.local.get(key).then((stored) => {
      if (cancelled) return;
      if (stored?.[key]) return;
      setShowTrialOffer(true);
    });
    return () => { cancelled = true; };
  }, [
    settings?.hostedTrialEligible,
    settings?.hostedIsAnonymous,
    settings?.hostedSubjectId,
  ]);

  async function markTrialOfferShown() {
    const subjectId = settings?.hostedSubjectId;
    if (!subjectId) return;
    const key = `${TRIAL_OFFER_SHOWN_KEY_PREFIX}${subjectId}`;
    await chrome.storage.local.set({ [key]: Date.now() });
  }

  async function onTrialOfferStart() {
    const result = await onUpgrade();
    if (result?.ok) {
      await markTrialOfferShown();
      setShowTrialOffer(false);
    }
    return result;
  }

  async function onTrialOfferDismiss() {
    await markTrialOfferShown();
    setShowTrialOffer(false);
  }

  // Anonymous-user variant of the paywall CTA. Routes the click through the
  // SW because chrome.identity (which signInWithGoogle uses) isn't available
  // in content-script contexts. On success we clear the LIMIT_REACHED error
  // and re-init so the paywall card goes away and the user can retry.
  async function onSignIn() {
    try {
      const res = await chrome.runtime.sendMessage({ type: 'depth:sign-in' });
      if (res?.ok) {
        setError(null);
        await init();
      } else if (res) {
        console.warn('[Depth panel] sign-in failed:', res.code, res.message);
      }
    } catch (e) {
      console.warn('[Depth panel] sign-in sendMessage threw:', e?.message);
    }
  }

  function buildSnapshot() {
    return {
      data: data ?? null,
      quizData: quizStatus === 'ready' ? (quizData ?? null) : null,
      diveTurns:
        diveStatus === 'ready' && diveTurns.length
          ? diveTurns.map(({ _streaming, ...rest }) => rest)
          : null,
    };
  }

  async function onSave() {
    if (urlIsSaved) return;
    if (!data?.glance && !data?.summary && !data?.read) return;
    const source = { title: pageMeta.title, url: pageMeta.url, savedAt: Date.now() };
    await addToDeck({ source, snapshot: buildSnapshot() });
    setDeck(await getDeck());
  }

  // ----- Share to community -----

  function canShare() {
    if (level > 3) return false; // Glance/Summary/Read only.
    if (!data?.glance || !data?.summary || !data?.read) return false;
    if (settings?.providerMode !== 'hosted') return false;
    // Hydrated from a community version → the payload was already
    // published by someone (possibly this user); the server's
    // (url_hash, payload_hash) unique index would reject a re-publish.
    // Disable Share so the disabled tooltip explains "click Re-generate".
    if (hydratedSource.startsWith('community:')) return false;
    return true;
  }

  function shareDisabledReason() {
    if (level > 3) return ui.shareDisabledLevel;
    if (!data?.glance || !data?.summary || !data?.read) return ui.shareDisabledNoData;
    if (hydratedSource.startsWith('community:')) return ui.shareDisabledFromCommunity;
    return ui.share;
  }

  async function publishShare({ always } = {}) {
    setShareStatus('publishing');
    setShareError(null);
    try {
      const payload = {
        keyTerms: data?.keyTerms ?? [],
        glance: data?.glance ?? {},
        summary: data?.summary ?? {},
        read: data?.read ?? {},
      };
      // We pass title + text to the SW and let it compute articleHash via
      // crypto.subtle there — content-script context is missing crypto.subtle
      // when the host page is http:// (only secure contexts get the API).
      const res = await chrome.runtime.sendMessage({
        type: 'depth:share-summary',
        url: pageMeta.url,
        title: extracted?.title ?? pageMeta.title ?? '',
        text: extracted?.text ?? '',
        payload,
      });
      if (!res?.ok) {
        // DUPLICATE is its own dialog branch — the server says "this exact
        // payload is already published"; we offer "Read existing / Cancel"
        // rather than the generic Try-again surface.
        if (res?.code === 'DUPLICATE') {
          setShareError({
            code: 'DUPLICATE',
            message: res?.message ?? ui.shareDuplicateBody,
            existingSlug: res?.existingSlug,
          });
          setShareStatus('duplicate');
          return;
        }
        setShareError({
          code: res?.code ?? 'UPSTREAM_FAILED',
          message: res?.message ?? ui.shareFailed,
        });
        setShareStatus('error');
        return;
      }
      if (always) {
        await setSettings({ communityAutoPublish: true });
      }
      setShareResult({ slug: res.slug, shareUrl: res.shareUrl });
      try {
        await navigator.clipboard.writeText(res.shareUrl);
      } catch {
        // Clipboard refused; the dialog still shows the URL with a Copy button.
      }
      setShareStatus('success');
    } catch (err) {
      setShareError({ code: 'UPSTREAM_FAILED', message: err?.message ?? ui.shareFailed });
      setShareStatus('error');
    }
  }

  function onShare() {
    if (!canShare()) return;
    // The dialog always shows unless the user has explicitly opted into
    // auto-publish (either by the dialog's "Always publish" button or
    // by the Settings checkbox). One-time acknowledgment of the consent
    // text is NOT enough to skip the dialog — publishing a public
    // artifact is a per-article decision, not a per-account one.
    const skipDialog = Boolean(settings?.communityAutoPublish);
    setShareConsentRequired(!skipDialog);
    setShareResult(null);
    setShareError(null);
    if (skipDialog) {
      setShareStatus('publishing');
      publishShare({ always: false });
    } else {
      setShareStatus('consent');
    }
  }

  function onShareConfirm() {
    if (shareStatus === 'error') {
      // "Try again" branch: re-attempt with the same always-flag we had.
      publishShare({ always: false });
      return;
    }
    publishShare({ always: false });
  }

  function onShareAlways() {
    publishShare({ always: true });
  }

  async function onShareCopy() {
    if (!shareResult?.shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareResult.shareUrl);
    } catch {
      // Clipboard refused; nothing else to do here.
    }
  }

  function onShareClose() {
    setShareStatus('idle');
  }

  // DUPLICATE → user clicks "Read existing": fetch the existing slug's
  // payload, paint it, and mark hydratedSource so Share stays disabled.
  async function onShareReadExisting() {
    const slug = shareError?.existingSlug;
    if (!slug) {
      // No slug came back — fall back to closing the dialog rather than
      // leaving the user stuck. Server should always include it for
      // DUPLICATE, but guard for older edge-function deployments.
      setShareStatus('idle');
      return;
    }
    setShareStatus('idle');
    setCommunityStatus('hydrating');
    try {
      const res = await chrome.runtime.sendMessage({
        type: 'depth:fetch-community-summary',
        slug,
      });
      if (!res?.ok || !res?.payload) {
        setCommunityStatus('idle');
        return;
      }
      setData(res.payload);
      setStatus('ready');
      setHydratedSource(`community:${slug}`);
      setCommunityStatus('using');
    } catch (err) {
      console.warn('[Depth panel] read-existing hydrate threw:', err?.message);
      setCommunityStatus('idle');
    }
  }

  // ----- Community consume (Use latest / Generate fresh) -----

  // Shared hydrate: fetch a slug's payload and paint it. Updates
  // hydratedSource + selectedCommunitySlug so Share is disabled and the
  // selection persists in session. Caller controls communityStatus.
  async function hydrateCommunityVersion(slug) {
    if (!slug) return false;
    try {
      const res = await chrome.runtime.sendMessage({
        type: 'depth:fetch-community-summary',
        slug,
      });
      if (!res?.ok || !res?.payload) {
        console.warn('[Depth panel] community hydrate failed:', res?.code, res?.message);
        return false;
      }
      setData(res.payload);
      setStatus('ready');
      setHydratedSource(`community:${slug}`);
      setSelectedCommunitySlug(slug);
      setCommunityStatus('using');
      return true;
    } catch (err) {
      console.warn('[Depth panel] community hydrate threw:', err?.message);
      return false;
    }
  }

  async function onUseLatestCommunity() {
    const newest = communityVersions[0];
    if (!newest?.slug) return;
    setCommunityStatus('hydrating');
    const ok = await hydrateCommunityVersion(newest.slug);
    if (!ok) setCommunityStatus('available');
  }

  // Multi-version picker chose a specific slug (or compact strip's
  // prev/next stepped to one). Same hydrate, status transitions through
  // 'hydrating' so the picker disables in-flight.
  async function onSelectCommunityVersion(slug) {
    if (!slug) return;
    setCommunityStatus('hydrating');
    const ok = await hydrateCommunityVersion(slug);
    if (!ok) setCommunityStatus('available');
  }

  function onGenerateFreshFromCommunity() {
    setCommunityStatus('idle');
    setCommunityVersions([]);
    setSelectedCommunitySlug(null);
    if (extracted) startGeneration(extracted);
  }

  async function onUnsave() {
    if (!urlIsSaved) return;
    setDeck(await removeFromDeckByUrl(pageMeta.url));
  }

  async function onRemoveCard(id) {
    if (!id) return;
    setDeck(await removeFromDeckById(id));
  }

  function canSave() {
    if (urlIsSaved) return false;
    if (level <= 3) return status === 'ready';
    if (level === 4) return quizStatus === 'ready' && quizData?.questions?.[quizIndex];
    if (level === 5) return diveStatus === 'ready' && diveTurns.length >= 2;
    return false;
  }

  // ----- Per-level readiness -----
  const readyLevels = new Set();
  if (status === 'ready') {
    readyLevels.add(1);
    readyLevels.add(2);
    readyLevels.add(3);
  }
  if (quizStatus === 'ready') readyLevels.add(4);
  if (diveStatus === 'ready') readyLevels.add(5);
  const readyCount = readyLevels.size;

  // ----- Dynamic pill meta -----
  const pillMeta = (() => {
    if (level === 4 && quizData?.questions?.length) {
      const total = quizData.questions.length;
      const shown = Math.min(quizIndex + 1, total);
      if (quizIndex >= total) {
        const score = quizData.questions.reduce(
          (acc, q, i) => acc + (quizAnswers[i] === q.correctIndex ? 1 : 0),
          0,
        );
        return ui.quizComplete(score, total);
      }
      return ui.quizProgress(shown, total);
    }
    return current.pillMeta;
  })();

  return (
    <div
      class={`depth-panel${minimized ? ' is-minimized' : ''}`}
      ref={panelRef}
      role="dialog"
      aria-label={ui.panelLabel}
      style={{
        width: `${panelWidth}px`,
        ...(minimized ? null : { height: `${panelHeight}px` }),
        ...(position
          ? { left: `${position.left}px`, top: `${position.top}px`, right: 'auto' }
          : null),
      }}
    >
      <div
        class={`depth-panel__resize-handle${resizing ? ' is-dragging' : ''}`}
        role="separator"
        aria-orientation="vertical"
        aria-label={ui.resizePanel ?? 'Resize panel width'}
        title={ui.resizePanel ?? 'Drag to resize • Double-click to reset'}
        onPointerDown={handleResizePointerDown}
        onPointerMove={handleResizePointerMove}
        onPointerUp={handleResizePointerUp}
        onPointerCancel={handleResizePointerUp}
        onDblClick={handleResizeDoubleClick}
      />
      <div
        class={`depth-panel__resize-handle-y${resizingY ? ' is-dragging' : ''}`}
        role="separator"
        aria-orientation="horizontal"
        aria-label={ui.resizePanelHeight ?? 'Resize panel height'}
        title="Drag to resize • Double-click to reset"
        onPointerDown={handleResizeYPointerDown}
        onPointerMove={handleResizeYPointerMove}
        onPointerUp={handleResizeYPointerUp}
        onPointerCancel={handleResizeYPointerUp}
        onDblClick={handleResizeYDoubleClick}
      />
      <PanelHeader
        title={pageMeta.title}
        onClose={onClose}
        onOpenSettings={openSettings}
        onRegenerate={onRegenerate}
        canRegenerate={status === 'ready' || status === 'error'}
        dragHandlers={{
          onPointerDown: handleHeaderPointerDown,
          onPointerMove: handleHeaderPointerMove,
          onPointerUp: handleHeaderPointerUp,
          onPointerCancel: handleHeaderPointerUp,
        }}
        ui={ui}
      />

      {view === 'main' && (
      <div class="depth-panel__slider">
        <div class="depth-panel__slider-row">
          <div class="depth-panel__slider-leftgroup">
            <span class="depth-panel__slider-label">{ui.readingDepth}</span>
            <span
              class={`status-badge ${readyCount === LEVELS.length ? 'is-complete' : ''}`}
              aria-live="polite"
            >
              <span class="status-badge__dot" />
              {readyCount} / {LEVELS.length} {ui.ready}
            </span>
          </div>
          <span class="depth-panel__slider-current">»» {current.displayName}</span>
        </div>
        <DepthSlider
          levels={localizedLevels}
          level={level}
          onChange={setLevel}
          readyLevels={readyLevels}
          ui={ui}
        />
      </div>
      )}

      <div class="depth-panel__content">
        {view === 'main' &&
          (communityStatus === 'available' ||
            communityStatus === 'hydrating' ||
            communityStatus === 'using') && (
            <CommunityVersionsCard
              status={communityStatus}
              count={communityVersions.length}
              versions={communityVersions}
              selectedSlug={selectedCommunitySlug}
              onUseLatest={onUseLatestCommunity}
              onSelectVersion={onSelectCommunityVersion}
              onGenerateFresh={onGenerateFreshFromCommunity}
              ui={ui}
            />
          )}
        {view === 'main' && loadedFromLocalCache && (
          <div class="cache-notice" role="status">
            <span class="cache-notice__pip" aria-hidden="true" />
            <span>{ui.localCacheLoaded}</span>
          </div>
        )}
        {view === 'main' && shareStatus !== 'idle' && (
          <ShareDialog
            status={shareStatus}
            consentRequired={shareConsentRequired}
            shareUrl={shareResult?.shareUrl ?? ''}
            errorMessage={shareError?.message ?? ''}
            onConfirm={onShareConfirm}
            onAlways={onShareAlways}
            onCopy={onShareCopy}
            onClose={onShareClose}
            onReadExisting={onShareReadExisting}
            ui={ui}
          />
        )}
        {view === 'deck' ? (
          <DeckView
            deck={deck}
            onBack={() => setView('main')}
            onRemove={onRemoveCard}
            ui={ui}
          />
        ) : showTrialOffer ? (
          <TrialOfferModal
            onStart={onTrialOfferStart}
            onDismiss={onTrialOfferDismiss}
            ui={ui}
          />
        ) : (
          <>
            {staleUrl && (
              <StaleBanner onReload={onReloadStale} onDismiss={() => setStaleUrl(null)} ui={ui} />
            )}

            {status === 'needs-key' && <SetupView ui={ui} />}
            {status === 'needs-consent' && extracted && (
              <ConsentModal
                extracted={extracted}
                pageMeta={pageMeta}
                provider={
                  settings?.providerMode === 'hosted'
                    ? { label: 'Depth Hosted' }
                    : settings ? getProvider(settings) : null
                }
                model={settings?.providerMode === 'hosted' ? '' : settings?.model}
                onAccept={onConsent}
                onClose={onClose}
                ui={ui}
              />
            )}
            {status === 'unsupported' && (
              <UnsupportedCard extracted={extracted} onTryAnyway={onTryAnyway} ui={ui} />
            )}
            {status === 'extracting' && (
              <>
                {extracted && <ExtractionStats extracted={extracted} ui={ui} />}
                <LoadingSkeleton message={ui.readingDocument ?? 'Reading document...'} />
              </>
            )}
            {status === 'error' && error?.code === 'LIMIT_REACHED' && (
              <PaywallCard
                error={error}
                onUseOwnKey={onUseOwnKey}
                onUpgrade={onUpgrade}
                onSignIn={onSignIn}
                canUpgrade={canUpgrade}
                trialEligible={!!settings?.hostedTrialEligible}
                ui={ui}
              />
            )}
            {status === 'error' && error?.code === 'HOSTED_PERMISSION_REQUIRED' && (
              <HostedPermissionCard
                onAllow={onAllowHostedPermission}
                onOpenSettings={openSettings}
                ui={ui}
              />
            )}
            {status === 'error' && error?.code === 'CAPTCHA_REQUIRED' && (
              <CaptchaCard
                onVerify={onCompleteCaptcha}
                onOpenSettings={openSettings}
                ui={ui}
              />
            )}
            {status === 'error'
              && error?.code !== 'LIMIT_REACHED'
              && error?.code !== 'HOSTED_PERMISSION_REQUIRED'
              && error?.code !== 'CAPTCHA_REQUIRED'
              // Community card owns the panel body while we're waiting
              // on the user's pick — don't double-render error cards.
              && communityStatus !== 'available'
              && communityStatus !== 'hydrating' && (
              <ErrorState error={error} onRetry={init} ui={ui} />
            )}

            {(status === 'generating' || status === 'ready' || status === 'init')
              && communityStatus !== 'available'
              && communityStatus !== 'hydrating' && (
              <>
                {extracted && <ExtractionStats extracted={extracted} ui={ui} />}
                <LevelTabPill level={current} metaOverride={pillMeta} />
                <DepthStage
                  level={level}
                  renderLevel={(lv) => (
                    <ContentSwitch
                      level={lv}
                      data={data}
                      stats={stats}
                      extracted={extracted}
                      status={status}
                      quizData={quizData}
                      quizStatus={quizStatus}
                      quizError={quizError}
                      quizIndex={quizIndex}
                      quizAnswers={quizAnswers}
                      onQuizSelect={(i) => setQuizAnswers({ ...quizAnswers, [quizIndex]: i })}
                      onQuizNext={() => setQuizIndex(quizIndex + 1)}
                      onQuizRestart={() => {
                        setQuizIndex(0);
                        setQuizAnswers({});
                        if (quizStatus !== 'ready') startQuiz();
                      }}
                      diveTurns={diveTurns}
                      diveStatus={diveStatus}
                      diveError={diveError}
                      diveInput={diveInput}
                      onDiveInput={setDiveInput}
                      onDiveSend={sendDiveMessage}
                      onDiveRestart={() => {
                        setDiveTurns([]);
                        setDiveStatus('idle');
                        setDiveError(null);
                        setDiveInput('');
                      }}
                      ui={ui}
                    />
                  )}
                />
              </>
            )}
          </>
        )}
      </div>

      {view === 'main' && (
        <PanelFooter
          onSave={onSave}
          onUnsave={onUnsave}
          onOpenDeck={() => setView('deck')}
          onShare={onShare}
          canSave={canSave()}
          isSaved={urlIsSaved}
          canShare={canShare()}
          shareTitle={shareDisabledReason()}
          ui={ui}
        />
      )}
    </div>
  );
}

const DEPTH_EXIT_DURATION_MS = 400; // enter delay (80ms) + animation (320ms)

function DepthStage({ level, renderLevel }) {
  const [stable, setStable] = useState(level);
  const [outgoing, setOutgoing] = useState(null);

  useEffect(() => {
    if (level === stable) return undefined;
    setOutgoing(stable);
    setStable(level);
    const t = setTimeout(() => setOutgoing(null), DEPTH_EXIT_DURATION_MS);
    return () => clearTimeout(t);
  }, [level, stable]);

  return (
    <div class="depth-stage">
      {outgoing !== null && (
        <div class="depth-stage__pane is-exiting" key={`out-${outgoing}`} aria-hidden="true">
          {renderLevel(outgoing)}
        </div>
      )}
      <div class="depth-stage__pane is-entering" key={`in-${stable}`}>
        {renderLevel(stable)}
      </div>
    </div>
  );
}

function ContentSwitch({
  level,
  data,
  stats,
  extracted,
  status,
  quizData,
  quizStatus,
  quizError,
  quizIndex,
  quizAnswers,
  onQuizSelect,
  onQuizNext,
  onQuizRestart,
  diveTurns,
  diveStatus,
  diveError,
  diveInput,
  onDiveInput,
  onDiveSend,
  onDiveRestart,
  ui,
}) {
  if (level <= 3) {
    if (status === 'generating' && !data) {
      return <LoadingSkeleton message={ui.readingPage} />;
    }
    if (level === 1) {
      return data?.glance
        ? <GlanceView data={glanceData(data)} ui={ui} />
        : <LoadingSkeleton message={ui.generating} />;
    }
    if (level === 2) {
      return data?.summary?.bullets?.length
        ? <SummaryView data={summaryData(data)} />
        : <LoadingSkeleton message={ui.summarizing} />;
    }
    if (level === 3) {
      return data?.read?.sections?.length
        ? <ReadView data={readData(data, stats, extracted?.text)} ui={ui} />
        : <LoadingSkeleton message={ui.structuring} />;
    }
  }

  if (level === 4) {
    return (
      <QuizView
        data={quizData}
        status={quizStatus}
        error={quizError}
        index={quizIndex}
        answers={quizAnswers}
        onSelect={onQuizSelect}
        onNext={onQuizNext}
        onRestart={onQuizRestart}
        ui={ui}
      />
    );
  }

  if (level === 5) {
    return (
      <DiveView
        turns={diveTurns}
        status={diveStatus}
        error={diveError}
        input={diveInput}
        onInputChange={onDiveInput}
        onSend={onDiveSend}
        onRestart={onDiveRestart}
        ui={ui}
      />
    );
  }

  return null;
}

function localizeLevels(ui) {
  return LEVELS.map((l) => ({
    ...l,
    name: ui.levelNames[l.id] ?? l.name,
    displayName: ui.levelNames[l.id] ?? l.displayName,
    pillLabel: ui.levelPillLabels[l.id] ?? l.pillLabel,
    pillMeta: ui.levelMeta[l.id] ?? l.pillMeta,
  }));
}
