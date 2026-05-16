import { renderWithTerms } from '../TermHighlight.jsx';

export default function ReadView({ data }) {
  return (
    <div class="view view--read">
      <div class="read__stats">
        <span class="read__stat">
          <span class="read__stat-label">Scale</span>
          <span class="read__stat-value">{data.stats.scale}</span>
        </span>
        <span class="read__stat">
          <span class="read__stat-label">Trimmed</span>
          <span class="read__stat-value">{data.stats.trimmed}</span>
        </span>
        <span class="read__stat">
          <span class="read__stat-label">Terms</span>
          <span class="read__stat-value">{data.stats.terms}</span>
        </span>
      </div>

      {data.sections.map((s, i) => (
        <section class="read__section" key={i}>
          <h3 class="read__heading">{s.heading}</h3>
          {s.paragraphs.map((p, j) => (
            <p class="read__paragraph" key={j}>
              {renderWithTerms(p, data.terms)}
            </p>
          ))}
        </section>
      ))}
    </div>
  );
}
