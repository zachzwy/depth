import LoadingSkeleton from '../LoadingSkeleton.jsx';
import ErrorState from '../ErrorState.jsx';

const LETTERS = ['A', 'B', 'C', 'D'];

function segmentClass(i, index, total, answers, questions) {
  if (i === index && answers[i] === undefined) return 'is-current';
  const ans = answers[i];
  if (ans === undefined) return 'is-idle';
  return ans === questions[i].correctIndex ? 'is-correct' : 'is-wrong';
}

export default function QuizView({
  data,
  status,
  error,
  index,
  answers,
  onSelect,
  onNext,
  onRestart,
  ui,
}) {
  if (status === 'error') return <ErrorState error={error} onRetry={onRestart} ui={ui} />;
  if (status !== 'ready' || !data?.questions?.length) {
    return <LoadingSkeleton message={ui.buildQuiz} />;
  }

  const total = data.questions.length;

  if (index >= total) {
    const score = data.questions.reduce(
      (acc, q, i) => acc + (answers[i] === q.correctIndex ? 1 : 0),
      0,
    );
    const pct = Math.round((score / total) * 100);
    const tier = pct >= 75 ? 'high' : pct >= 50 ? 'mid' : 'low';
    const headline =
      tier === 'high' ? ui.quizScoreStrong
        : tier === 'mid' ? ui.quizScoreGettingThere
          : ui.quizScoreReread;
    const ringFill =
      tier === 'high' ? 'var(--confidence-high)'
        : tier === 'mid' ? 'var(--accent)'
          : 'var(--confidence-low)';
    return (
      <div class="view view--quiz quiz--summary">
        <div class="quiz__progress" aria-hidden="true">
          {data.questions.map((_, i) => (
            <div
              key={i}
              class={`quiz__progress-seg ${segmentClass(i, index, total, answers, data.questions)}`}
            />
          ))}
        </div>
        <div
          class="quiz__ring"
          style={{ '--p': pct, '--ring-fill': ringFill }}
          role="img"
          aria-label={`${score} of ${total}`}
        >
          <span class="quiz__ring-num">{pct}%</span>
        </div>
        <h3 class="quiz__score-headline">{headline}</h3>
        <p class="quiz__score-body">
          {tier === 'low' ? (
            <>{ui.quizScoreLowPrefix} <strong>{ui.levelNames[3]}</strong>{ui.quizScoreLowSuffix}</>
          ) : (
            ui.quizScoreHighBody
          )}
        </p>
        <button type="button" class="quiz__score-restart" onClick={onRestart}>
          {ui.restartQuiz}
        </button>
      </div>
    );
  }

  const q = data.questions[index];
  const userAnswer = answers[index];
  const reviewing = userAnswer !== undefined;
  const isCorrect = userAnswer === q.correctIndex;

  return (
    <div class="view view--quiz">
      <div class="quiz__progress" aria-hidden="true">
        {data.questions.map((_, i) => (
          <div
            key={i}
            class={`quiz__progress-seg ${segmentClass(i, index, total, answers, data.questions)}`}
          />
        ))}
      </div>

      <p class="quiz__prompt">
        <span class="quiz__qnum">Q{index + 1}</span>
        {q.prompt}
      </p>

      <ol class="quiz__choices">
        {q.choices.map((c, i) => {
          let klass = '';
          if (reviewing) {
            if (i === q.correctIndex) klass = 'is-correct';
            else if (i === userAnswer) klass = 'is-wrong';
            else klass = 'is-dim';
          }
          return (
            <li key={i}>
              <button
                type="button"
                class={`quiz__choice ${klass}`}
                onClick={() => !reviewing && onSelect(i)}
                disabled={reviewing}
              >
                <span class="quiz__letter">{LETTERS[i]}</span>
                <span class="quiz__text">{c}</span>
              </button>
            </li>
          );
        })}
      </ol>

      {reviewing && (
        <>
          <div class="quiz__explain">
            <p class="quiz__explain-body">
              <span class="quiz__explain-headline">
                {isCorrect ? ui.right : ui.notQuite(LETTERS[q.correctIndex])}
              </span>{' '}
              {q.explanation}
            </p>
          </div>
          <button type="button" class="quiz__next" onClick={onNext}>
            <span>{index < total - 1 ? ui.nextQuestion : ui.seeScore}</span>
            <svg
              class="quiz__next-icon"
              width="13"
              height="13"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2.5"
              aria-hidden="true"
            >
              <line x1="5" y1="12" x2="19" y2="12" />
              <polyline points="12 5 19 12 12 19" />
            </svg>
          </button>
        </>
      )}
    </div>
  );
}
