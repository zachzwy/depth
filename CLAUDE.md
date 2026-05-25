# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

`README.md` covers the user-facing install/dev/build commands. Additional ones for engineering work:

```bash
npm test                                          # vitest run (single pass)
npm run test:watch                                # vitest watch
npx vitest run test/lib/levels.test.js            # run a single test file
npx vitest run -t "regex over test names"         # run by test name
node scripts/make-icons.mjs                       # regenerate src/icons/icon-*.png
```

After source edits, run `npm run build` — it's the only automated correctness check beyond `npm test` in this repo. Type checking is off (`jsconfig.json` has `checkJs: false`).

## Architecture

Depth is a Manifest V3 Chrome extension that injects a Preact panel into any web page. It has three runtime contexts that communicate via `chrome.runtime` ports/messages, and they must not be conflated:

- **Content script** (`src/content/content-script.js`) — injected per-tab. Mounts the panel into a closed Shadow DOM under a `#depth-host` element pinned to `documentElement` with `all: initial` to prevent host-page CSS leakage. Polls `location.href` on a 1s interval so SPA navigations re-render the panel. Page text comes from `src/content/extractor.js` (`@mozilla/readability` + `readability-stats.js`); when the URL is a non-HTML document (PDF, EPUB, DOCX, arXiv, Google Doc, YouTube transcript, markdown/LaTeX/RST/notebook — see the `@productivities/document-sources` workspace package at `packages/document-sources/`), extraction is delegated to the `@productivities/document-extractor` workspace package at `packages/document-extractor/` (the service worker calls its `extractFromUrl({ url, title })` entry point).
- **Service worker** (`src/background/service-worker.js`) — owns all model API traffic, caching, and routing. Listens on three named `chrome.runtime.onConnect` ports: `depth-generate` (levels 1–3, combined call), `depth-quiz` (level 4), `depth-dive` (level 5, multi-turn, not cached).
- **Options page** (`src/options/`) — standalone HTML page for provider/API key/model/language config and per-provider host-permission grants.

The toolbar action and `Alt+D` command both invoke `toggleActiveTab` in the service worker, which sends `depth:toggle` to the content script — or, if no script is registered (e.g. after an extension reload), `chrome.scripting.executeScript`s a fresh one and retries up to 20× at 100ms.

### The five levels

`src/lib/levels.js` is the source of truth for the level list. Generation is split across three system prompts in `src/lib/prompts.js`:

- **Levels 1–3 (`SYSTEM_1_3`)** produce one JSON blob with `keyTerms`, `glance`, `summary.bullets`, and `read.sections`. A single API call powers Glance, Summary, and Read; key terms are referenced across all three views using `[[term:N|label]]` tokens (N is the 0-based keyTerms index).
- **Level 4 (`SYSTEM_QUIZ`)** generates 5 multiple-choice questions, seeded with the levels-1–3 `keyTerms` so wording stays consistent. Started lazily on first visit to tab 4; also probed passively via `depth:probe-quiz` so the slider pip can light up without forcing the user there.
- **Level 5 (`SYSTEM_DIVE`)** is a multi-turn Socratic chat grounded by `glance` + `summary` from levels 1–3. Not cached. The user-visible `suggestedReplies` are shuffled server-side per turn.

When changing prompt wording or output schema, bump `PROMPT_VERSION` in `prompts.js` so cached entries from the old prompts get invalidated (the version is folded into the cache hash).

### Caching, sessions, and the content hash

- `src/lib/content-hash.js` — SHA-1 over `title | text | providerFingerprint | PROMPT_VERSION`. The provider fingerprint (`src/lib/settings.js:providerFingerprint`) includes provider id, base URL, model, and preferred language, so changing any of those is automatically a cache miss.
- `src/background/cache.js` — per-kind cache (`1-3`, `quiz`) under `chrome.storage.local` keys `depth:cache:<kind>:<hash>` with a 7-day TTL.
- `src/lib/session.js` — per-URL UI state (current level, quiz index/answers, dive turns, dive input draft) under `depth:session:<url>` with a 24-hour TTL. Saved debounced (300ms) from `Panel.jsx`. `_streaming` flags are stripped before save so a resumed session doesn't display a phantom in-progress turn.
- `src/lib/deck.js` — flat list at `depth:deck`; `addToDeck` appends a `{ id, savedAt, type, front, back, source }` record. Save-from-current-view logic lives in `Panel.onSave`.

### Streaming and partial JSON

`src/background/api.js:streamMessage` POSTs to `${provider.apiBaseUrl}/chat/completions` with `stream: true`, accumulates SSE `data: …` lines, and on every delta calls `onPartial(parsePartial(textAcc))` using `partial-json`. The handlers forward each partial to the panel so views can paint incrementally before the JSON is complete. A trailing-fences fallback (`stripJsonWrapper` in the service worker) parses the final text one more time if `onPartial` never produced a valid object.

### Provider registry

`PROVIDERS` in `src/lib/settings.js` is a flat object keyed by provider id (OpenRouter, OpenAI, Anthropic, Gemini, DeepSeek, Qwen, Groq, Mistral, xAI, Ollama). Each entry declares `apiBaseUrl`, `hostPermission` (matched against `optional_host_permissions` in `manifest.json`), `defaultModel`, optional `extraHeaders`, an optional `requiresApiKey: false`, and a provider-specific `fetchModels({ apiKey, signal })`. To add a new provider:

1. Add the entry to `PROVIDERS`.
2. Add its host pattern to `optional_host_permissions` in `manifest.json` (the service worker calls `chrome.permissions.contains` before each request and surfaces "Permission for &lt;host&gt; not granted" if missing).
3. Wire the options page to request the permission when the user picks it.

All BYOK providers must speak OpenAI-compatible chat completions (`apiFormat: 'openai-compatible'`); `streamMessage` throws otherwise. The managed backend (see "Depth Hosted" below) uses a separate wire format and bypasses this registry.

### Depth Hosted (managed backend)

Alongside BYOK providers, the extension can talk to a managed backend (separate repo `depth-api`). These modules are intentionally kept out of `api.js` so the OpenAI-compatible path stays BYOK-only:

- `src/background/hosted-client.js` — SSE generate/quiz/dive against `depth-api`, using named event frames (`started`/`partial`/`done`/`error`), not OpenAI-compatible chat completions.
- `src/background/hosted-auth.js` — Supabase Auth sessions; `ensureHostedSession` lazily mints an anonymous session and refreshes tokens; `signInWithGoogle` via `chrome.identity.launchWebAuthFlow`.
- `src/background/hosted-community.js` / `hosted-share.js` — read/publish community summaries (public read, authed write).
- `src/background/billing.js` — opens Stripe Checkout / billing-portal URLs returned by `depth-api` Edge Functions.

UI for this path: `PaywallCard`, `TrialOfferModal`, `CaptchaCard`, `CommunityVersionsCard`, `ShareDialog`, `HostedPermissionCard`.

### Consent gate

Before any generation, the panel checks `hasConsentedToProvider(settings)`, which compares `settings.consentedProviderFingerprint` to the current fingerprint. Changing provider, model, or language re-triggers the consent modal (the user is being told *which third party* will see the page text).

## Build system specifics

- **`@crxjs/vite-plugin`** reads `manifest.json` at build time and bundles each entry point. The service worker imports the content script as a build-time URL: `import contentScriptPath from '../content/content-script.js?script'` — that `?script` virtual is a crxjs-ism.
- **`vitest.config.js`** stubs `?script` imports so the service worker module is importable under tests (`test/integration/service-worker-generate.test.js`). Preserve that stub if you touch vitest config.
- **Preact aliased as React** via `jsconfig.json` `paths` (so `@testing-library/preact`'s React-shaped tooling works) and `@preact/preset-vite`.

## Tests

- Environment: `happy-dom` with a hand-rolled `chrome.*` shim in `test/setup/chrome.js` (storage, permissions, runtime, tabs, scripting). `resetChromeShim` runs in `beforeEach`/`afterEach`.
- Component snapshots live in `test/components/__snapshots__/`. Update intentionally with `npx vitest run -u`.
- Integration tests in `test/integration/` mock the SSE response and drive the service worker handlers end-to-end via the chrome shim's port machinery.
