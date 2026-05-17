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
4. Select a supported model provider and set your API key and model in the extension's options page

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
