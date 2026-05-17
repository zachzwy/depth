import { useEffect, useRef } from 'preact/hooks';
import LoadingSkeleton from '../LoadingSkeleton.jsx';
import ErrorState from '../ErrorState.jsx';

export default function DiveView({
  turns,
  status,
  error,
  input,
  onInputChange,
  onSend,
  onRestart,
  ui,
}) {
  const streamRef = useRef(null);

  useEffect(() => {
    const el = streamRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [turns]);

  if (status === 'error') return <ErrorState error={error} onRetry={onRestart} ui={ui} />;
  if (turns.length === 0 && status !== 'streaming') {
    return <LoadingSkeleton message={ui.openingDive} />;
  }

  const last = turns[turns.length - 1];
  const isStreaming = status === 'streaming';
  const canShowChips =
    last?.role === 'assistant' && !isStreaming && last.suggestedReplies?.length;

  function submit(e) {
    e?.preventDefault();
    const txt = input?.trim();
    if (!txt || isStreaming) return;
    onSend(txt);
  }

  return (
    <div class="view view--dive">
      <div class="dive__stream" ref={streamRef}>
        {turns.map((t, i) => (
          <div class={`dive__turn dive__turn--${t.role}`} key={i}>
            <div class="dive__avatar" aria-hidden="true">
              {t.role === 'assistant' ? 'D' : ui.you}
            </div>
            <div class={`dive__bubble ${i === turns.length - 1 && isStreaming ? 'is-streaming' : ''}`}>
              {t.content || (i === turns.length - 1 && isStreaming ? '…' : '')}
            </div>
          </div>
        ))}

        {canShowChips && (
          <div class="dive__chips">
            {last.suggestedReplies.map((r, i) => (
              <button
                type="button"
                class="dive__chip"
                key={i}
                onClick={() => onSend(r)}
                disabled={isStreaming}
              >
                {r}
              </button>
            ))}
          </div>
        )}
      </div>

      <form class="dive__inputbar" onSubmit={submit}>
        <input
          type="text"
          class="dive__input"
          placeholder={isStreaming ? ui.thinking : ui.divePlaceholder}
          value={input ?? ''}
          onInput={(e) => onInputChange(e.currentTarget.value)}
          disabled={isStreaming}
        />
        <button
          type="submit"
          class="dive__send"
          aria-label={ui.send}
          disabled={isStreaming || !input?.trim()}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="22" y1="2" x2="11" y2="13" />
            <polygon points="22 2 15 22 11 13 2 9 22 2" />
          </svg>
        </button>
      </form>
    </div>
  );
}
