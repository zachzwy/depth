# Depth

Read any page at the depth you choose.

A Chrome extension that injects a floating panel into any webpage and lets you slide between five reading depths:

1. **Glance** — one key sentence
2. **Summary** — five bullets
3. **Read** — structured content with key terms highlighted
4. **Quiz** — five comprehension questions
5. **Dive** — Socratic dialogue

MVP ships levels 1–5.

## Product focus

Depth's MVP is article-first: it is designed for individual articles, essays, long-form documentation pages, and transcript-backed audio/video pages. Feed pages, comment threads, dashboards, and app shells should not auto-generate by default, even if they contain text. The panel may offer "Try anyway" as an explicit user override, but automatic extraction should stay tuned for article-shaped or transcript-shaped reading surfaces.

## Supported reading surfaces

Depth currently supports these article-heavy formats:

- **HTML articles and essays**: Readability plus fallback extraction for long-form pages, docs pages, and older static essays.
- **Text PDFs**: direct PDF URLs and arXiv PDFs, with arXiv HTML attempted before PDF text extraction.
- **Scanned/image-only PDFs**: detected and reported clearly; OCR is not implemented yet.
- **Google Docs**: `docs.google.com/document/...` plain-text export, including Google export redirects.
- **Word documents**: direct/downloadable `.docx` files and Office viewer URLs that contain a `.docx` source URL.
- **EPUB**: direct EPUB URLs, Gutenberg-style EPUB filenames, and known ebook pages that link to EPUB files.
- **Markdown and plain text**: direct `.md`, `.markdown`, `.txt`, and `.text` files, plus GitHub blob pages for those file types.
- **Jupyter notebooks**: direct `.ipynb` files and GitHub blob pages, extracting Markdown and raw cells as reading text.
- **LaTeX source**: direct `.tex` files and GitHub blob pages, with common paper/article markup flattened into prose.
- **reStructuredText**: direct `.rst` files and GitHub blob pages, with common Sphinx/docutils markup flattened into prose.
- **Transcript-backed audio/video pages**: visible podcast/page transcripts and visible YouTube transcript panels are summarized as transcript sources, with transcript-aware prompting that ignores timestamps, filler, speaker scaffolding, intros/outros, and sponsorship boilerplate.
- **Direct audio/video URLs**: direct `.mp3`, `.m4a`, `.wav`, `.aac`, `.ogg`, `.opus`, `.flac`, `.mp4`, `.m4v`, `.webm`, and `.mov` URLs are detected and reported clearly, but require an available transcript before Depth can summarize them.

Known gaps and good future candidates:

- **OCR PDFs**: scanned/image-only PDFs are detected today, but need a local WASM OCR runtime or a hosted OCR path before Depth can read their contents.
- **Google Slides / PowerPoint**: should use deck-aware extraction and prompting rather than article extraction.
- **Speech-to-text for audio/video**: direct media files are detected today, but arbitrary audio/video still needs hosted or local transcription before Depth can read the spoken content.
- **Private Microsoft Word Online / SharePoint viewer pages**: direct `.docx` links work; full viewer/export auth needs a deeper integration.

## Development

```bash
npm install
npm run dev          # build with watch
npm run build        # production build to ./dist
```

### Load the unpacked extension

1. `npm run build`
2. Chrome → `chrome://extensions` → enable Developer mode
3. "Load unpacked" → select `./dist`
4. Select a supported model provider and set your API key and model in the extension's options page

### Stable extension ID

`manifest.json` ships a `key` field so the extension ID stays constant across reinstalls (`hmgcbgpopbejbinnkfgnbbjecalglebn` for the current key). This matters because Depth Hosted's OAuth flow uses `https://<extension-id>.chromiumapp.org/` as its redirect URL — a drifting ID would mean re-allowlisting on every install.

The matching private key lives at `.keys/depth-extension-dev.pem` (gitignored). Keep it backed up but out of the repo. Production builds uploaded to the Chrome Web Store get re-signed by the store and use a store-assigned ID; the `key` field is for development only.

To rotate (e.g. if the dev key leaks):
```bash
openssl genrsa -out .keys/depth-extension-dev.pem 2048
openssl rsa -in .keys/depth-extension-dev.pem -pubout -outform DER | base64 -w0
# paste the output into manifest.json:"key"
```

### Toggle the panel

- Keyboard: <kbd>Alt</kbd>+<kbd>D</kbd>
- Or click the toolbar icon

## Model Provider

Packaged Depth currently supports OpenRouter. In Settings, provide:

- Provider: OpenRouter
- OpenRouter API key
- Model name, for example `openai/gpt-4.1-mini`
- Preferred language for supported interface labels and generated summaries

The code keeps providers in a small registry so open-source users can add their own endpoints and matching manifest permissions. A hosted Depth API can be added later as the default provider for limited free trials and paid higher limits.

## Stack

- Vite + `@crxjs/vite-plugin` for MV3 bundling
- Preact for the panel UI (~4kb runtime)
- Shadow DOM with `all: initial` reset to isolate from host-page styles
- Mozilla Readability for content extraction
- OpenAI-compatible chat completions API for model generation
