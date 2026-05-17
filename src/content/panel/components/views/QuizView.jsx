import LoadingSkeleton from '../LoadingSkeleton.jsx';
import ErrorState from '../ErrorState.jsx';

const LETTERS = ['A', 'B', 'C', 'D'];

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
    return (
      <div class="view view--quiz quiz--summary">
        <div class="quiz__score">
          <div class="quiz__score-number">
            {score}<span class="quiz__score-total"> / {total}</span>
          </div>
          <div class="quiz__score-label">
            {score === total
              ? ui.perfect
              : score >= total - 1
                ? ui.strong
                : score >= total / 2
                  ? ui.decent
                  : ui.rereadQuestion}
          </div>
        </div>
        <button type="button" class="state__cta" onClick={onRestart}>
          {ui.tryAgain}
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
      <p class="quiz__prompt">{q.prompt}</p>
      <ol class="quiz__choices">
        {q.choices.map((c, i) => {
          let klass = '';
          if (reviewing) {
            if (i === q.correctIndex) klass = 'is-correct';
            else if (i === userAnswer) klass = 'is-wrong';
          } else if (userAnswer === i) {
            klass = 'is-selected';
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
        <div class={`quiz__feedback ${isCorrect ? 'is-correct' : 'is-wrong'}`}>
          <p class="quiz__feedback-headline">
            {isCorrect ? `✓ ${ui.right}` : `✗ ${ui.notQuite(LETTERS[q.correctIndex])}`}
          </p>
          <p class="quiz__feedback-body">{q.explanation}</p>
          {!isCorrect && userAnswer !== q.commonWrongIndex && q.commonWrongWhy && (
            <p class="quiz__feedback-aside">
              <em>{ui.commonTrap}</em> {LETTERS[q.commonWrongIndex]} - {q.commonWrongWhy}
            </p>
          )}
          <button type="button" class="quiz__next" onClick={onNext}>
            {index < total - 1 ? ui.nextQuestion : ui.seeScore}
          </button>
        </div>
      )}
    </div>
  );
}
