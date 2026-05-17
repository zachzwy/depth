import { useState } from 'preact/hooks';
import { LEVELS } from '../../../lib/levels.js';
import DepthSlider from './DepthSlider.jsx';
import LevelTabPill from './LevelTabPill.jsx';
import GlanceView from './views/GlanceView.jsx';
import SummaryView from './views/SummaryView.jsx';
import ReadView from './views/ReadView.jsx';
import QuizView from './views/QuizView.jsx';
import DiveView from './views/DiveView.jsx';
import { glanceData, summaryData, readData } from '../level-data.js';

function hostnameOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

function formatSavedAt(ts) {
  if (!ts) return '';
  try {
    return new Date(ts).toLocaleString();
  } catch {
    return '';
  }
}

function localizeLevels(ui) {
  return LEVELS.map((l) => ({
    ...l,
    name: ui.levelNames?.[l.id] ?? l.name,
    displayName: ui.levelNames?.[l.id] ?? l.displayName,
    pillLabel: ui.levelPillLabels?.[l.id] ?? l.pillLabel,
    pillMeta: ui.levelMeta?.[l.id] ?? l.pillMeta,
  }));
}

export default function DeckCardDetail({ card, onBack, onRemove, ui }) {
  const [level, setLevel] = useState(1);
  const [quizIndex, setQuizIndex] = useState(0);
  const [quizAnswers, setQuizAnswers] = useState({});

  const snapshot = card?.snapshot;
  const data = snapshot?.data;
  const quizData = snapshot?.quizData;
  const diveTurns = snapshot?.diveTurns ?? [];

  const url = card?.source?.url ?? '';
  const host = hostnameOf(url);
  const savedAt = formatSavedAt(card?.source?.savedAt ?? card?.savedAt);

  const localizedLevels = localizeLevels(ui);
  const current = localizedLevels.find((l) => l.id === level) ?? localizedLevels[0];

  // Per-level readiness in the snapshot (drives the slider's "ready" dots).
  const readyLevels = new Set();
  if (data?.glance) readyLevels.add(1);
  if (data?.summary?.bullets?.length) readyLevels.add(2);
  if (data?.read?.sections?.length) readyLevels.add(3);
  if (quizData?.questions?.length) readyLevels.add(4);
  if (diveTurns.length) readyLevels.add(5);

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
    <div class="deck-detail">
      <header class="deck-view__header">
        <button
          type="button"
          class="icon-btn deck-view__back"
          onClick={onBack}
          aria-label={ui.back ?? 'Back'}
          title={ui.back ?? 'Back'}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
        <h2 class="deck-view__title">{card?.source?.title ?? (ui.deckTitle ?? 'Card')}</h2>
        {onRemove && (
          <button
            type="button"
            class="icon-btn deck-detail__remove"
            onClick={onRemove}
            aria-label={ui.removeCard ?? 'Remove from deck'}
            title={ui.removeCard ?? 'Remove from deck'}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
              <path d="M10 11v6M14 11v6" />
              <path d="M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2" />
            </svg>
          </button>
        )}
      </header>

      {(host || url) && (
        <div class="deck-detail__source">
          {host && <span class="deck-card__source-host">{host}</span>}
          {url && (
            <a class="deck-detail__open" href={url} target="_blank" rel="noopener noreferrer">
              {ui.openArticle ?? 'Open article'} ↗
            </a>
          )}
          {savedAt && <span class="deck-detail__savedAt">· {savedAt}</span>}
        </div>
      )}

      <div class="deck-detail__slider">
        <DepthSlider
          levels={localizedLevels}
          level={level}
          onChange={setLevel}
          readyLevels={readyLevels}
          ui={ui}
        />
      </div>

      <LevelTabPill level={current} metaOverride={pillMeta} />

      <DetailViewSwitch
        level={level}
        data={data}
        quizData={quizData}
        diveTurns={diveTurns}
        quizIndex={quizIndex}
        quizAnswers={quizAnswers}
        onQuizSelect={(i) => setQuizAnswers({ ...quizAnswers, [quizIndex]: i })}
        onQuizNext={() => setQuizIndex(quizIndex + 1)}
        onQuizRestart={() => {
          setQuizIndex(0);
          setQuizAnswers({});
        }}
        ui={ui}
      />
    </div>
  );
}

function DetailViewSwitch({
  level,
  data,
  quizData,
  diveTurns,
  quizIndex,
  quizAnswers,
  onQuizSelect,
  onQuizNext,
  onQuizRestart,
  ui,
}) {
  if (level === 1) {
    if (!data?.glance) return <NotCaptured ui={ui} />;
    return <GlanceView data={glanceData(data)} ui={ui} />;
  }
  if (level === 2) {
    if (!data?.summary?.bullets?.length) return <NotCaptured ui={ui} />;
    return <SummaryView data={summaryData(data)} />;
  }
  if (level === 3) {
    if (!data?.read?.sections?.length) return <NotCaptured ui={ui} />;
    return <ReadView data={readData(data)} ui={ui} />;
  }
  if (level === 4) {
    if (!quizData?.questions?.length) return <NotCaptured ui={ui} />;
    return (
      <QuizView
        data={quizData}
        status="ready"
        error={null}
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
        status="ready"
        error={null}
        readOnly
        ui={ui}
      />
    );
  }
  return null;
}

function NotCaptured({ ui }) {
  return (
    <p class="deck-view__placeholder">
      {ui.levelNotCaptured ?? 'Not captured — open the article to generate this depth.'}
    </p>
  );
}
