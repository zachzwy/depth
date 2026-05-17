import { renderWithTerms } from '../TermHighlight.jsx';

export default function GlanceView({ data, ui }) {
  return (
    <div class="view view--glance">
      <blockquote class="glance__quote">
        {renderWithTerms(data.glance, data.terms)}
      </blockquote>

      <div class="glance__meta">
        <span class="glance__termcount">
          {data.termCount > 0
            ? ui.termCount(data.highlightedIndex, data.termCount)
            : ui.noKeyTerms}
        </span>
        <span class={`glance__confidence is-${data.confidence}`}>
          <span class="glance__confidence-dot" />
          {ui.confidence[data.confidence]}
        </span>
      </div>
    </div>
  );
}
