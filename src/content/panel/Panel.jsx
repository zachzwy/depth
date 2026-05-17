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
import { addToDeck } from '../../lib/deck.js';
import { getUi } from '../../lib/i18n.js';
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
import StaleBanner from './components/StaleBanner.jsx';

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

  // Drag-to-reposition
  const panelRef = useRef(null);
  const dragRef = useRef(null);
  const [position, setPosition] = useState(null);

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
        setError({ code: msg.code, message: msg.message });
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
      force,
    });
  }, [pageMeta.url]);

  const init = useCallback(async () => {
    const settings = await getSettings();
    setSettingsState(settings);

    // Extract first so the consent modal (and any future view) has content
    // to render even if the user has just saved settings for the first time.
    const ext = extractPage();
    if (!ext) {
      setError({ code: 'NO_CONTENT' });
      setStatus('error');
      return;
    }
    setExtracted(ext);
    setStats(computeStats(ext.text));

    if (!isGenerationConfigured(settings)) {
      setStatus('needs-key');
      return;
    }

    // Restore prior session for this URL (if within TTL).
    const session = await getSession(pageMeta.url);
    if (session) {
      if (typeof session.level === 'number') setLevel(session.level);
      if (typeof session.quizIndex === 'number') setQuizIndex(session.quizIndex);
      if (session.quizAnswers) setQuizAnswers(session.quizAnswers);
      if (Array.isArray(session.diveTurns)) setDiveTurns(session.diveTurns);
      if (typeof session.diveInput === 'string') setDiveInput(session.diveInput);
    }
    setSessionLoaded(true);

    if (!hasConsentedToProvider(settings)) {
      setStatus('needs-consent');
      return;
    }
    generatedForUrl.current = pageMeta.url;
    setStaleUrl(null);
    startGeneration(ext);
  }, [startGeneration, pageMeta.url]);

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
        !changes.preferredLanguage
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
      });
    }, 300);
    return () => clearTimeout(t);
  }, [sessionLoaded, pageMeta.url, level, quizIndex, quizAnswers, diveTurns, diveInput]);

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
    setStatus('init');
    init();
  }

  async function onRegenerate() {
    disconnectGenerationPorts();
    clearGeneratedState();
    setStaleUrl(null);
    await clearSession(pageMeta.url);
    const ext = extractPage();
    if (!ext) {
      setError({ code: 'NO_CONTENT' });
      setStatus('error');
      return;
    }
    setExtracted(ext);
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
    };
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {}
  }, []);

  const handleHeaderPointerMove = useCallback((e) => {
    const drag = dragRef.current;
    if (!drag) return;
    const margin = 4;
    const maxLeft = Math.max(margin, window.innerWidth - drag.width - margin);
    const maxTop = Math.max(margin, window.innerHeight - 48);
    const newLeft = Math.max(margin, Math.min(maxLeft, drag.startLeft + (e.clientX - drag.startX)));
    const newTop = Math.max(margin, Math.min(maxTop, drag.startTop + (e.clientY - drag.startY)));
    setPosition({ left: newLeft, top: newTop });
  }, []);

  const handleHeaderPointerUp = useCallback((e) => {
    dragRef.current = null;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {}
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

  async function onSave() {
    if (!data) return;
    const source = { title: pageMeta.title, url: pageMeta.url, savedAt: Date.now() };
    if (level === 1 && data.glance?.sentence) {
      await addToDeck({ type: 'quote', front: data.glance.sentence, back: pageMeta.title, source });
    } else if (level === 2 && data.summary?.bullets?.length) {
      await addToDeck({ type: 'bullet', front: data.summary.bullets.join('\n• '), back: pageMeta.title, source });
    } else if (level === 3 && data.keyTerms?.length) {
      const front = data.keyTerms.map((t) => t.label).join(', ');
      const back = data.keyTerms.map((t) => `${t.label}: ${t.definition}`).join('\n');
      await addToDeck({ type: 'term', front, back, source });
    } else if (level === 4 && quizData?.questions?.[quizIndex]) {
      const q = quizData.questions[quizIndex];
      const front = q.prompt;
      const back = `${['A', 'B', 'C', 'D'][q.correctIndex]}. ${q.choices[q.correctIndex]}\n\n${q.explanation}`;
      await addToDeck({ type: 'qa', front, back, source });
    } else if (level === 5 && diveTurns.length >= 2) {
      const lastUser = [...diveTurns].reverse().find((t) => t.role === 'user');
      const lastAssist = [...diveTurns].reverse().find((t) => t.role === 'assistant' && t.content);
      if (lastUser && lastAssist) {
        await addToDeck({ type: 'dialog', front: lastAssist.content, back: lastUser.content, source });
      } else {
        return;
      }
    } else {
      return;
    }
    setSaveFlash(true);
    setTimeout(() => setSaveFlash(false), 1200);
  }

  function canSave() {
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
      if (quizIndex >= total) return ui.done;
      return ui.quizProgress(shown, total);
    }
    return current.pillMeta;
  })();

  return (
    <div
      class="depth-panel"
      ref={panelRef}
      role="dialog"
      aria-label={ui.panelLabel}
      style={
        position
          ? { left: `${position.left}px`, top: `${position.top}px`, right: 'auto' }
          : undefined
      }
    >
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

      <div class="depth-panel__content">
        {staleUrl && (
          <StaleBanner onReload={onReloadStale} onDismiss={() => setStaleUrl(null)} ui={ui} />
        )}

        {status === 'needs-key' && <SetupView ui={ui} />}
        {status === 'needs-consent' && extracted && (
          <ConsentModal
            extracted={extracted}
            pageMeta={pageMeta}
            provider={settings ? getProvider(settings) : null}
            model={settings?.model}
            onAccept={onConsent}
            onClose={onClose}
            ui={ui}
          />
        )}
        {status === 'error' && <ErrorState error={error} onRetry={init} ui={ui} />}

        {(status === 'generating' || status === 'ready' || status === 'init') && (
          <>
            <LevelTabPill level={current} metaOverride={pillMeta} />
            <ContentSwitch
              level={level}
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
          </>
        )}
      </div>

      <PanelFooter
        onClose={onClose}
        onSave={onSave}
        canSave={canSave()}
        flash={saveFlash}
        ui={ui}
      />
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
        ? <ReadView data={readData(data, stats, extracted)} ui={ui} />
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

function glanceData(d) {
  return {
    glance: d.glance?.sentence ?? '',
    confidence: d.glance?.confidence ?? 'medium',
    termCount: d.keyTerms?.length ?? 0,
    highlightedIndex: countTermRefs(d.glance?.sentence),
    terms: d.keyTerms ?? [],
  };
}

function summaryData(d) {
  return {
    bullets: d.summary?.bullets ?? [],
    terms: d.keyTerms ?? [],
  };
}

function readData(d, stats, extracted) {
  const base = stats ?? { scale: '—' };
  const originalLen = extracted?.text?.length ?? 0;
  const readLen = (d.read?.sections ?? []).reduce(
    (sum, s) => sum + (s.paragraphs ?? []).reduce((ss, p) => ss + (p?.length ?? 0), 0),
    0,
  );
  const trimmed =
    originalLen > 0 && readLen > 0
      ? `~${Math.max(0, Math.round((1 - readLen / originalLen) * 100))}%`
      : '—';
  return {
    stats: { scale: base.scale, trimmed, terms: d.keyTerms?.length ?? 0 },
    sections: d.read?.sections ?? [],
    terms: d.keyTerms ?? [],
  };
}

function countTermRefs(text) {
  if (!text) return 0;
  return (text.match(/\[\[term:/g) ?? []).length;
}
