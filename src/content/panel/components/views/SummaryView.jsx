import { renderWithTerms } from '../TermHighlight.jsx';

export default function SummaryView({ data }) {
  return (
    <div class="view view--summary">
      <ul class="summary__list">
        {data.bullets.map((b, i) => (
          <li class="summary__bullet" data-slot={i % 8} key={i}>
            <span class="summary__bar" />
            <span class="summary__text">{renderWithTerms(b, data.terms)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
