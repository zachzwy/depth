import { renderWithTerms } from '../TermHighlight.jsx';

export default function GlanceView({ data }) {
  return (
    <div class="view view--glance">
      <blockquote class="glance__quote">
        {renderWithTerms(data.glance, data.terms)}
      </blockquote>

      <div class="glance__meta">
        <span class="glance__termcount">
          {data.termCount > 0
            ? `${data.highlightedIndex} / ${data.termCount} TERMS`
            : 'NO KEY TERMS'}
        </span>
        <span class={`glance__confidence is-${data.confidence}`}>
          <span class="glance__confidence-dot" />
          {data.confidence === 'high' && 'HIGH CONFIDENCE'}
          {data.confidence === 'medium' && 'MEDIUM CONFIDENCE'}
          {data.confidence === 'low' && 'LOW CONFIDENCE'}
        </span>
      </div>
    </div>
  );
}
