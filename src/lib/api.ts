const API_BASE_URL = 'https://peipei-run.com';

type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

type JsonRecord = Record<string, JsonValue>;

export type AuthUser = {
  id: string;
  name: string | null;
  email: string;
};

export type SessionResponse = {
  user: AuthUser | null;
};

export type CoachMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
};

export type CoachChatResponse = {
  messages: CoachMessage[];
  hasMore: boolean;
};

export type ChatRequestMessage = Pick<
  CoachMessage,
  'id' | 'role' | 'content' | 'createdAt'
>;

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

export function createLocalId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeRole(role: string | undefined) {
  return role === 'user' ? 'user' : 'assistant';
}

function coerceText(value: unknown) {
  if (typeof value === 'string') {
    return value;
  }

  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (typeof item === 'string') {
          return item;
        }

        if (
          item &&
          typeof item === 'object' &&
          'text' in item &&
          typeof item.text === 'string'
        ) {
          return item.text;
        }

        return '';
      })
      .join('');
  }

  return '';
}

function normalizeMessage(value: unknown): CoachMessage {
  const message = (value ?? {}) as Partial<CoachMessage>;

  return {
    id:
      typeof message.id === 'string'
        ? message.id
        : createLocalId(normalizeRole(message.role)),
    role: normalizeRole(message.role),
    content: coerceText(message.content),
    createdAt:
      typeof message.createdAt === 'string'
        ? message.createdAt
        : new Date().toISOString(),
  };
}

function safeJsonParse<T>(value: string) {
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

async function readResponsePayload(response: Response) {
  const text = await response.text();
  const json = text ? safeJsonParse<JsonValue>(text) : null;

  return { text, json };
}

function readSetCookie(headers: Headers) {
  const typedHeaders = headers as Headers & {
    getSetCookie?: () => string[];
    map?: Record<string, string[]>;
  };

  const getSetCookie = typedHeaders.getSetCookie?.();
  if (getSetCookie?.length) {
    return getSetCookie.join(', ');
  }

  const headerMap = typedHeaders.map?.['set-cookie'];
  if (headerMap?.length) {
    return headerMap.join(', ');
  }

  return headers.get('set-cookie') ?? headers.get('Set-Cookie');
}

function normalizeSessionCookie(rawCookie: string | null) {
  if (!rawCookie) {
    return null;
  }

  const tokenMatch = rawCookie.match(/peipei\.session_token=[^;,\s]+/);
  if (tokenMatch?.[0]) {
    return tokenMatch[0];
  }

  return rawCookie.split(';')[0]?.trim() || null;
}

function buildMessageFromPayload(payload: JsonValue | null, fallbackText: string) {
  if (
    payload &&
    typeof payload === 'object' &&
    !Array.isArray(payload) &&
    typeof payload.message === 'string'
  ) {
    return payload.message;
  }

  if (
    payload &&
    typeof payload === 'object' &&
    !Array.isArray(payload) &&
    typeof payload.error === 'string'
  ) {
    return payload.error;
  }

  return fallbackText;
}

async function requestJson<T>(
  path: string,
  init: RequestInit = {},
  sessionCookie?: string | null,
) {
  const headers = new Headers(init.headers);

  if (!headers.has('Accept')) {
    headers.set('Accept', 'application/json');
  }

  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  if (sessionCookie) {
    headers.set('Cookie', sessionCookie);
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers,
  });

  const payload = await readResponsePayload(response);

  if (!response.ok) {
    throw new ApiError(
      buildMessageFromPayload(payload.json, payload.text || 'Request failed.'),
      response.status,
    );
  }

  return (payload.json as T) ?? ({} as T);
}

async function requestAuthCookie(path: string, body: JsonRecord) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  const payload = await readResponsePayload(response);

  if (!response.ok) {
    throw new ApiError(
      buildMessageFromPayload(payload.json, payload.text || 'Unable to continue.'),
      response.status,
    );
  }

  const sessionCookie = normalizeSessionCookie(readSetCookie(response.headers));

  if (!sessionCookie) {
    throw new ApiError('The session cookie was not returned by the server.', 500);
  }

  return sessionCookie;
}

export async function signInWithEmail(email: string, password: string) {
  return requestAuthCookie('/api/auth/sign-in/email', { email, password });
}

export async function signUpWithEmail(
  name: string,
  email: string,
  password: string,
) {
  return requestAuthCookie('/api/auth/sign-up/email', { name, email, password });
}

export async function getSession(sessionCookie: string) {
  return requestJson<SessionResponse>(
    '/api/auth/get-session',
    { method: 'GET' },
    sessionCookie,
  );
}

export async function getCoachChat(sessionCookie: string) {
  const payload = await requestJson<{
    messages?: unknown[];
    hasMore?: boolean;
  }>('/api/coach/chat', { method: 'GET' }, sessionCookie);

  return {
    messages: Array.isArray(payload.messages)
      ? payload.messages.map(normalizeMessage)
      : [],
    hasMore: Boolean(payload.hasMore),
  } satisfies CoachChatResponse;
}

export async function openCoachChatStream(
  sessionCookie: string,
  body: { messages: ChatRequestMessage[]; contextType: 'general' },
) {
  const response = await fetch(`${API_BASE_URL}/api/coach/chat`, {
    method: 'POST',
    headers: {
      Accept: 'text/event-stream',
      'Content-Type': 'application/json',
      Cookie: sessionCookie,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const payload = await readResponsePayload(response);
    throw new ApiError(
      buildMessageFromPayload(payload.json, payload.text || 'Unable to stream chat.'),
      response.status,
    );
  }

  if (!response.body) {
    throw new ApiError('Streaming is not available in this runtime.', 500);
  }

  return response;
}

export function extractTextChunk(payload: unknown): string {
  if (typeof payload === 'string') {
    return payload;
  }

  if (!payload || typeof payload !== 'object') {
    return '';
  }

  const candidate = payload as Record<string, unknown>;

  for (const key of ['text', 'delta', 'content', 'textDelta', 'chunk']) {
    if (typeof candidate[key] === 'string') {
      return candidate[key];
    }
  }

  for (const key of ['message', 'data', 'part']) {
    const nestedChunk = extractTextChunk(candidate[key]);
    if (nestedChunk) {
      return nestedChunk;
    }
  }

  for (const key of ['content', 'parts', 'chunks']) {
    if (Array.isArray(candidate[key])) {
      return candidate[key].map((item) => extractTextChunk(item)).join('');
    }
  }

  return '';
}

export async function consumeTextStream(
  response: Response,
  onTextChunk: (chunk: string) => void | Promise<void>,
) {
  const reader = response.body?.getReader();

  if (!reader) {
    throw new ApiError('Streaming is not available in this runtime.', 500);
  }

  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done });

    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? '';

    for (const rawLine of lines) {
      const line = rawLine.trim();

      if (!line.startsWith('data:')) {
        continue;
      }

      const data = line.slice(5).trim();

      if (!data || data === '[DONE]') {
        continue;
      }

      const parsed = safeJsonParse<unknown>(data);
      const chunk = extractTextChunk(parsed ?? data);

      if (chunk) {
        await onTextChunk(chunk);
      }
    }

    if (done) {
      break;
    }
  }

  const finalLine = buffer.trim();
  if (finalLine.startsWith('data:')) {
    const data = finalLine.slice(5).trim();
    const parsed = safeJsonParse<unknown>(data);
    const chunk = extractTextChunk(parsed ?? data);

    if (chunk) {
      await onTextChunk(chunk);
    }
  }
}
