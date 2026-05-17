import { useEffect, useState } from 'preact/hooks';
import DeckCardDetail from './DeckCardDetail.jsx';
import { stripTermTokens } from '../level-data.js';

function hostnameOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

function previewFront(card) {
  if (card?.snapshot?.data?.glance?.sentence) {
    return stripTermTokens(card.snapshot.data.glance.sentence);
  }
  return card?.front ?? '';
}

function previewBack(card) {
  if (card?.snapshot) {
    const bullets = card.snapshot.data?.summary?.bullets;
    if (bullets?.length) return stripTermTokens(bullets[0]);
    return '';
  }
  return card?.back ?? '';
}

export default function DeckView({ deck, onBack, onRemove, ui }) {
  const [selectedId, setSelectedId] = useState(null);
  const selected = selectedId
    ? (Array.isArray(deck) ? deck.find((c) => c?.id === selectedId) : null)
    : null;

  // Clear the selection if the selected card is no longer in the deck.
  useEffect(() => {
    if (selectedId && !selected) setSelectedId(null);
  }, [selectedId, selected]);

  if (selected) {
    return (
      <DeckCardDetail
        card={selected}
        onBack={() => setSelectedId(null)}
        onRemove={onRemove ? () => onRemove(selected.id) : undefined}
        ui={ui}
      />
    );
  }

  const cards = Array.isArray(deck) ? [...deck].reverse() : [];

  return (
    <div class="deck-view">
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
        <h2 class="deck-view__title">{ui.deckTitle ?? 'Your deck'}</h2>
        <span class="deck-view__count">
          {`${cards.length} ${cards.length === 1 ? (ui.cardSingular ?? 'card') : (ui.cardPlural ?? 'cards')}`}
        </span>
      </header>

      {cards.length === 0 ? (
        <p class="deck-view__placeholder">
          {ui.deckEmpty ?? 'No cards yet — save from any depth level.'}
        </p>
      ) : (
        <ol class="deck-view__list">
          {cards.map((card) => {
            const front = previewFront(card);
            const back = previewBack(card);
            return (
              <li key={card.id}>
                <button
                  type="button"
                  class="deck-card"
                  onClick={() => setSelectedId(card.id)}
                >
                  {card.source?.title && (
                    <div class="deck-card__source" title={card.source.url}>
                      {hostnameOf(card.source.url) && (
                        <>
                          <span class="deck-card__source-host">{hostnameOf(card.source.url)}</span>
                          <span class="deck-card__source-sep"> · </span>
                        </>
                      )}
                      <span class="deck-card__source-title">{card.source.title}</span>
                    </div>
                  )}
                  {front && <p class="deck-card__front">{front}</p>}
                  {back && <p class="deck-card__back">{back}</p>}
                </button>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
