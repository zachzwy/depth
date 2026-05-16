# Depth

Read any page at the depth you choose.

A Chrome extension that injects a floating panel into any webpage and lets you slide between five reading depths:

1. **Glance** — one key sentence
2. **Summary** — five bullets
3. **Read** — structured content with key terms highlighted
4. **Quiz** — five comprehension questions
5. **Dive** — Socratic dialogue

MVP ships levels 1–5.

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
4. Set an OpenAI-compatible API endpoint, model, and key in the extension's options page

### Toggle the panel

- Keyboard: <kbd>Alt</kbd>+<kbd>D</kbd>
- Or click the toolbar icon

## Model Provider

Depth currently supports custom OpenAI-compatible chat-completions endpoints. In Settings, provide:

- API base URL, for example `https://openrouter.ai/api/v1`
- API key
- Model name

This keeps the extension open to hosted gateways, local model servers, and self-hosted proxies. A hosted Depth API can be added later as the default provider for limited free trials and paid higher limits.

## Stack

- Vite + `@crxjs/vite-plugin` for MV3 bundling
- Preact for the panel UI (~4kb runtime)
- Shadow DOM with `all: initial` reset to isolate from host-page styles
- Mozilla Readability for content extraction
- OpenAI-compatible chat completions API for model generation
