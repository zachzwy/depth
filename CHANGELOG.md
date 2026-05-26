# Changelog

## 1.1.0 — 2026-05-26

### Changed
- Marketing site, privacy policy, terms, and community share pages have moved from `depth.microfalls.com` to `depth.productivities.fyi`. The extension's in-app links and consent copy now point at the new domain. No user action is required; existing accounts and saved decks are unaffected.
- Document extraction (PDF, DOCX, EPUB) is now provided by the published `@productivities/document-extractor` package instead of in-tree parsers. Behavior is unchanged; the in-tree files were removed to shrink the install size.

### Fixed
- Republished the Privacy Policy with a comprehensive, itemized disclosure of every piece of data the extension handles, where it is stored, why, and which parties (model providers, Supabase, Stripe, Google identity) ever see it. No data flows changed — only the document.

## 1.0.1 — 2026-05-19

### Fixed
- Re-generate from scratch no longer leaves the "viewing community version" banner mounted above the freshly generated content. The community state (status, version list, selected slug) is now reset along with the generated data, so the panel cleanly reflects that you're back on your own output.
- "Generate fresh" inside the community-versions card now actually bypasses the local cache. Previously, if you had generated the same article before and then opened a community version on top, clicking "Generate fresh" would return your cached generation rather than producing a new one.

## 1.0.0 — 2026-05-19

First public release on the Chrome Web Store.

### Reading
- Five depths on any article surface: Glance (one sentence), Summary (five bullets), Read (structured restatement with key terms), Quiz (five comprehension questions), and Dive (Socratic dialogue grounded in the article).
- Single in-page slider switches between depths on the same article. Keyboard shortcut `Alt + D` to open or close the panel.

### Supported reading surfaces
- HTML articles, essays, blog posts, long-form journalism.
- Documentation pages (technical and otherwise).
- Text PDFs, including arXiv preprints (HTML form tried first).
- Google Docs.
- Word documents (.docx).
- EPUB ebooks.
- Plain text and Markdown.
- Jupyter notebooks (.ipynb).
- LaTeX (.tex) and reStructuredText (.rst).
- Audio/video pages with a visible transcript (YouTube transcript panels, podcast transcript pages).

### Model providers
Bring your own API key for any of the following — requests go directly to the provider, never through Depth's servers:
- OpenRouter
- OpenAI
- Anthropic
- Google Gemini
- DeepSeek
- Groq
- Mistral
- xAI
- Qwen
- Ollama (local, no API key)

### Hosted plan
- Optional Depth Hosted plan with a free tier (daily summary cap) and Pro tier (raised cap).
- 30-day free Pro trial for new sign-ups.
- Stripe-managed billing with a Customer Portal for managing card and subscription.
- Sign in with Google via `chrome.identity.launchWebAuthFlow`.

### Other
- Saved deck for keeping cards (key terms, summaries, etc.) across sessions.
- Optional Community publishing of a single article's Glance / Summary / Read views to `depth.productivities.fyi/community`, always opt-in and per-article.
- Interface and generated output in English, Simplified Chinese, Traditional Chinese, Spanish, French, and Japanese.
- All settings, API keys, and per-article cache stored locally in `chrome.storage`.
