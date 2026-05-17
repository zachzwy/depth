// Depth Hosted client. Talks to the managed backend (separate repo: depth-api)
// via Server-Sent Events with named event frames. Kept separate from api.js so
// the OpenAI-compatible streaming path stays focused on BYOK providers.
//
// Wire format (also documented in depth-api/docs/CONTRACT.md):
//   event: started   data: {"requestId":"...","cacheKey":"..."}
//   event: partial   data: {<incremental document>}
//   event: done      data: {<final document>}
//   event: error     data: {"code":"LIMIT_REACHED|...","message":"...","upgradeUrl":"..."}

const ENDPOINT_PATH = {
  generate: '/generate',
  quiz: '/quiz',
  dive: '/dive',
};

export class HostedError extends Error {
  constructor({ code, message, upgradeUrl }) {
    super(message ?? code ?? 'Hosted request failed');
    this.name = 'HostedError';
    this.code = code ?? 'UPSTREAM_FAILED';
    this.upgradeUrl = upgradeUrl;
  }
}

/**
 * Stream a hosted generation request and parse the event-frame SSE response.
 *
 * @returns Promise<{ data, requestId, cacheKey }>
 * @throws HostedError on terminal `error` frames or on non-2xx responses.
 */
export async function streamHosted({
  kind,
  settings,
  body,
  signal,
  onPartial,
  onStarted,
}) {
  const path = ENDPOINT_PATH[kind];
  if (!path) throw new Error(`Unknown hosted kind: ${kind}`);

  const baseUrl = (settings.hostedBaseUrl ?? '').replace(/\/+$/, '');
  if (!baseUrl) throw new HostedError({ code: 'BAD_REQUEST', message: 'No hosted base URL set' });

  // Mirror BYOK behavior: surface a clean error if the user hasn't granted
  // host permission for the hosted origin yet. Origin pattern matches what
  // `optional_host_permissions` declares in manifest.json.
  let originPattern;
  try {
    originPattern = new URL(baseUrl).origin + '/*';
  } catch {
    throw new HostedError({ code: 'BAD_REQUEST', message: 'Invalid hosted base URL' });
  }
  const granted = await chrome.permissions.contains({ origins: [originPattern] });
  if (!granted) {
    throw new HostedError({
      code: 'BAD_REQUEST',
      message: `Permission for ${new URL(baseUrl).host} not granted. Re-open Settings to re-grant access.`,
    });
  }

  const headers = {
    'content-type': 'application/json',
    accept: 'text/event-stream',
  };
  if (settings.hostedAccessToken) {
    headers.authorization = `Bearer ${settings.hostedAccessToken}`;
  }

  const res = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    signal,
    headers,
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    // Non-streaming error path — try to parse a JSON body for a code.
    let code = 'UPSTREAM_FAILED';
    let message = `Hosted request failed (${res.status})`;
    try {
      const json = await res.json();
      if (json?.code) code = json.code;
      if (json?.message) message = json.message;
    } catch {
      // body isn't JSON; keep defaults
    }
    throw new HostedError({ code, message });
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let lastData = null;
  let requestId = null;
  let cacheKey = null;

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    // SSE frames are separated by blank lines. Pop completed frames off the
    // buffer; keep the trailing partial fragment for the next chunk.
    let idx;
    while ((idx = buffer.indexOf('\n\n')) !== -1) {
      const rawFrame = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      const frame = parseFrame(rawFrame);
      if (!frame) continue;

      if (frame.event === 'started') {
        requestId = frame.data?.requestId ?? null;
        cacheKey = frame.data?.cacheKey ?? null;
        onStarted?.({ requestId, cacheKey });
      } else if (frame.event === 'partial') {
        lastData = frame.data;
        onPartial?.(frame.data);
      } else if (frame.event === 'done') {
        lastData = frame.data;
        return { data: frame.data, requestId, cacheKey };
      } else if (frame.event === 'error') {
        throw new HostedError(frame.data ?? {});
      }
    }
  }

  // Stream ended without a terminal `done` or `error` frame. Treat the last
  // partial as the final result if we have one, else fail.
  if (lastData) return { data: lastData, requestId, cacheKey };
  throw new HostedError({ code: 'UPSTREAM_FAILED', message: 'Stream ended without done frame' });
}

function parseFrame(raw) {
  // Each SSE frame is a set of `field: value` lines. We only consume `event:`
  // and `data:` — anything else (id, retry, comments) is ignored.
  let event = 'message';
  const dataLines = [];
  for (const line of raw.split('\n')) {
    if (line.startsWith(':')) continue;
    const colon = line.indexOf(':');
    if (colon === -1) continue;
    const field = line.slice(0, colon);
    const value = line.slice(colon + 1).replace(/^ /, '');
    if (field === 'event') event = value;
    else if (field === 'data') dataLines.push(value);
  }
  if (dataLines.length === 0) return null;
  const dataStr = dataLines.join('\n');
  let data;
  try {
    data = JSON.parse(dataStr);
  } catch {
    return null;
  }
  return { event, data };
}
