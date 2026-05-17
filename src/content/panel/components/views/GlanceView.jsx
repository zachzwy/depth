import { renderWithTerms } from '../TermHighlight.jsx';

export default function GlanceView({ data, ui }) {
  const sections = data.sectionsUsed ?? 0;
  return (
    <div class="view view--glance glance">
      <div class="glance__quote-mark" aria-hidden="true">&ldquo;</div>
      <p class="glance__one-sentence">
        {renderWithTerms(data.glance, data.terms)}
      </p>
      <div class="glance__source-note">
        <span class="glance__source-left">
          {sections > 0 ? ui.synthesizedFromSections(sections) : ui.synthesizedFromArticle}
        </span>
        <span class={`glance__conf is-${data.confidence}`}>
          <span class="glance__conf-dot" />
          {ui.confidence[data.confidence]}
        </span>
      </div>
    </div>
  );
}
