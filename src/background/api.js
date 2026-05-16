import { parse as parsePartial } from 'partial-json';
import { normalizeBaseUrl } from '../lib/settings.js';

async function fetchWithRetry(url, opts, { maxAttempts = 3, baseBackoffMs = 1000 } = {}) {
  let lastErr;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const res = await fetch(url, opts);
      // Retry on 429 (rate limit) or 5xx (server error)
      if ((res.status === 429 || res.status >= 500) && attempt < maxAttempts) {
        await sleep(baseBackoffMs * 2 ** (attempt - 1));
        continue;
      }
      return res;
    } catch (err) {
      lastErr = err;
      if (opts.signal?.aborted) throw err;
      if (attempt < maxAttempts) {
        await sleep(baseBackoffMs * 2 ** (attempt - 1));
        continue;
      }
    }
  }
  throw lastErr ?? new Error('fetchWithRetry: exhausted attempts');
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

export async function streamMessage({
  settings,
  system,
  messages,
  maxTokens = 4096,
  onPartial,
  signal,
}) {
  if (settings.apiFormat !== 'openai-compatible') {
    throw new Error(`Unsupported API format: ${settings.apiFormat}`);
  }

  const apiBaseUrl = normalizeBaseUrl(settings.apiBaseUrl);
  if (!apiBaseUrl) throw new Error('Missing API base URL');
  if (!settings.model) throw new Error('Missing model');
  if (!settings.apiKey) throw new Error('Missing API key');

  const userMessages = Array.isArray(messages)
    ? messages
    : [{ role: 'user', content: messages }];
  const chatMessages = [
    { role: 'system', content: system },
    ...userMessages,
  ];

  console.log('[Depth] POST chat/completions', {
    apiBaseUrl,
    model: settings.model,
    msgCount: chatMessages.length,
    firstUserMsgChars: userMessages[0]?.content?.length,
  });

  const res = await fetchWithRetry(`${apiBaseUrl}/chat/completions`, {
    method: 'POST',
    signal,
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${settings.apiKey}`,
    },
    body: JSON.stringify({
      model: settings.model,
      max_tokens: maxTokens,
      stream: true,
      messages: chatMessages,
    }),
  });

  console.log('[Depth] response', res.status, res.statusText);

  if (!res.ok) {
    const errText = await res.text();
    console.error('[Depth] API error body:', errText);
    throw new Error(`Model API ${res.status}: ${errText.slice(0, 400)}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let textAcc = '';
  let firstChunkLogged = false;
  let partialFires = 0;
  let partialAttempts = 0;

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    if (!firstChunkLogged) {
      console.log('[Depth] first chunk received, len:', value.byteLength);
      firstChunkLogged = true;
    }

    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const dataStr = line.slice(6).trim();
      if (!dataStr || dataStr === '[DONE]') continue;
      let event;
      try {
        event = JSON.parse(dataStr);
      } catch {
        continue;
      }
      const deltaText = event.choices?.[0]?.delta?.content;
      if (typeof deltaText === 'string') {
        textAcc += deltaText;
        if (onPartial) {
          partialAttempts++;
          try {
            // Tolerate the model wrapping output in ```json fences.
            const trimmed = textAcc.replace(/^\s*```(?:json)?\s*/i, '');
            const parsed = parsePartial(trimmed);
            partialFires++;
            onPartial(parsed);
          } catch (parseErr) {
            // not yet parseable; wait for more
          }
        }
      }
      if (event.type === 'error') {
        console.error('[Depth] stream error event:', event);
        throw new Error(event.error?.message ?? 'stream error');
      }
    }
  }

  console.log('[Depth] stream complete', {
    totalChars: textAcc.length,
    partialAttempts,
    partialFires,
    firstChars: textAcc.slice(0, 200),
    lastChars: textAcc.slice(-200),
  });
  return textAcc;
}
