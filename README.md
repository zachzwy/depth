# Depth

Read any page at the depth you choose.

A Chrome extension that injects a floating panel into any webpage and lets you slide between five reading depths:

1. **Glance** — one key sentence
2. **Summary** — five bullets
3. **Read** — structured content with key terms highlighted
4. **Quiz** — five comprehension questions (v2)
5. **Dive** — Socratic dialogue (v2)

MVP ships levels 1–3 only.

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
4. Set your Anthropic API key in the extension's options page

### Toggle the panel

- Keyboard: <kbd>Alt</kbd>+<kbd>D</kbd>
- Or click the toolbar icon

## Stack

- Vite + `@crxjs/vite-plugin` for MV3 bundling
- Preact for the panel UI (~4kb runtime)
- Shadow DOM with `all: initial` reset to isolate from host-page styles
- Mozilla Readability for content extraction
- `claude-sonnet-4-6` as the default model (configurable in options)

## TODO before first manual test

- [ ] Add icon PNGs at `src/icons/icon-{16,32,48,128}.png` and re-add the `icons` block to `manifest.json`
- [ ] `npm install` (no lockfile committed yet)
