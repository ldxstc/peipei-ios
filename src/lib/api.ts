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

export type UnitsPreference = 'metric' | 'imperial';

export type CoachLanguagePreference = 'en' | 'zh-Hans';

export type SettingsSaveInput = {
  displayName: string;
  units: UnitsPreference;
  coachLanguage: CoachLanguagePreference;
  customInstructions: string;
};

export type SettingsPanelData = SettingsSaveInput & {
  accountEmail: string;
  billing: {
    isPro: boolean;
    tierLabel: string;
  };
  garmin: {
    connected: boolean;
    email: string;
  };
  raw: unknown;
};

export type CoachSidebarData = {
  goalProgress: {
    countdown: string;
    detail: string;
    title: string;
  };
  recentRuns: Array<{
    detail: string;
    id: string;
    subtitle: string;
    title: string;
  }>;
  raw: unknown;
  thisWeek: {
    avgPace: string;
    km: string;
    runs: string;
  };
  todayPlan: {
    distance: string;
    title: string;
  };
};

export type PushRegistrationResult = {
  registered: boolean;
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

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function getValueAtPath(source: unknown, path: string) {
  let current: unknown = source;

  for (const segment of path.split('.')) {
    const record = asRecord(current);

    if (!record || !(segment in record)) {
      return undefined;
    }

    current = record[segment];
  }

  return current;
}

function firstPresentValue(source: unknown, paths: string[]) {
  for (const path of paths) {
    const value = getValueAtPath(source, path);

    if (value !== undefined && value !== null && value !== '') {
      return value;
    }
  }

  return undefined;
}

function normalizeRole(role: string | undefined) {
  return role === 'user' ? 'user' : 'assistant';
}

function stringifyValue(value: unknown) {
  if (typeof value === 'string') {
    return value;
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  return '';
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

function coerceBoolean(value: unknown) {
  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'number') {
    return value > 0;
  }

  if (typeof value === 'string') {
    const normalized = value.toLowerCase();
    return (
      normalized === 'true' ||
      normalized === 'connected' ||
      normalized === 'active' ||
      normalized === 'yes'
    );
  }

  return false;
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

function normalizeUnitsPreference(value: unknown): UnitsPreference {
  const normalized = stringifyValue(value).toLowerCase();

  if (normalized.includes('imp') || normalized.includes('mile')) {
    return 'imperial';
  }

  return 'metric';
}

function normalizeCoachLanguagePreference(
  value: unknown,
): CoachLanguagePreference {
  const normalized = stringifyValue(value).toLowerCase();

  if (
    normalized.includes('zh') ||
    normalized.includes('chinese') ||
    normalized.includes('简')
  ) {
    return 'zh-Hans';
  }

  return 'en';
}

function normalizeTierLabel(value: unknown) {
  const normalized = stringifyValue(value).trim();

  if (!normalized) {
    return 'Free';
  }

  if (normalized.toLowerCase().includes('pro')) {
    return 'Pro';
  }

  return normalized;
}

function normalizeRecentRun(value: unknown) {
  const run = asRecord(value);
  const distance = stringifyValue(
    firstPresentValue(run, ['distance', 'distanceLabel', 'km', 'miles']),
  );
  const pace = stringifyValue(
    firstPresentValue(run, ['pace', 'paceLabel', 'avgPace', 'averagePace']),
  );
  const subtitle = stringifyValue(
    firstPresentValue(run, ['subtitle', 'summary']),
  );
  const detail = stringifyValue(
    firstPresentValue(run, ['detail', 'time', 'type', 'duration']),
  );

  return {
    detail:
      detail ||
      [distance, pace]
        .filter(Boolean)
        .join(' · '),
    id:
      stringifyValue(firstPresentValue(run, ['id', 'runId'])) ||
      createLocalId('run'),
    subtitle:
      subtitle ||
      [distance, pace]
        .filter(Boolean)
        .join(' · '),
    title:
      stringifyValue(firstPresentValue(run, ['title', 'date', 'name', 'day'])) ||
      'Recent run',
  };
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

export async function getSettingsPanel(sessionCookie: string) {
  const payload = await requestJson<unknown>(
    '/api/settings/panel',
    { method: 'GET' },
    sessionCookie,
  );

  const displayName = stringifyValue(
    firstPresentValue(payload, [
      'profile.displayName',
      'profile.name',
      'displayName',
      'name',
      'user.name',
    ]),
  );
  const units = normalizeUnitsPreference(
    firstPresentValue(payload, [
      'profile.units',
      'preferences.units',
      'units',
      'user.units',
    ]),
  );
  const coachLanguage = normalizeCoachLanguagePreference(
    firstPresentValue(payload, [
      'profile.coachLanguage',
      'profile.language',
      'coachLanguage',
      'coach.language',
      'language',
    ]),
  );
  const customInstructions = stringifyValue(
    firstPresentValue(payload, [
      'coachInstructions.text',
      'coachInstructions',
      'coach.instructions',
      'customInstructions',
      'instructions',
    ]),
  );
  const garminConnected = coerceBoolean(
    firstPresentValue(payload, [
      'garmin.connected',
      'garmin.isConnected',
      'garmin.status',
      'integrations.garmin.connected',
    ]),
  );
  const garminEmail = stringifyValue(
    firstPresentValue(payload, [
      'garmin.email',
      'garmin.accountEmail',
      'integrations.garmin.email',
      'garmin.userEmail',
    ]),
  );
  const tierLabel = normalizeTierLabel(
    firstPresentValue(payload, [
      'billing.tierLabel',
      'billing.tier',
      'subscription.tierLabel',
      'subscription.tier',
      'tier',
      'plan.tier',
    ]),
  );
  const accountEmail = stringifyValue(
    firstPresentValue(payload, [
      'account.email',
      'user.email',
      'email',
    ]),
  );

  return {
    accountEmail,
    billing: {
      isPro: tierLabel.toLowerCase() === 'pro',
      tierLabel,
    },
    coachLanguage,
    customInstructions,
    displayName,
    garmin: {
      connected: garminConnected,
      email: garminEmail,
    },
    raw: payload,
    units,
  } satisfies SettingsPanelData;
}

export async function patchUserSettings(
  sessionCookie: string,
  input: SettingsSaveInput,
) {
  return requestJson<unknown>(
    '/api/user/settings',
    {
      body: JSON.stringify({
        customInstructions: input.customInstructions,
        profile: {
          coachLanguage: input.coachLanguage,
          displayName: input.displayName,
          units: input.units,
        },
      }),
      method: 'PATCH',
    },
    sessionCookie,
  );
}

export async function syncGarmin(sessionCookie: string) {
  return requestJson<unknown>(
    '/api/garmin/sync',
    { method: 'POST' },
    sessionCookie,
  );
}

export async function disconnectGarmin(sessionCookie: string) {
  return requestJson<unknown>(
    '/api/garmin/disconnect',
    { method: 'POST' },
    sessionCookie,
  );
}

export async function getCoachSidebar(sessionCookie: string) {
  const payload = await requestJson<unknown>(
    '/api/coach/sidebar',
    { method: 'GET' },
    sessionCookie,
  );

  const recentRunsSource =
    firstPresentValue(payload, [
      'recentRuns',
      'runs.recent',
      'runs',
      'recent',
    ]) ?? [];
  const recentRuns = Array.isArray(recentRunsSource)
    ? recentRunsSource.slice(0, 5).map(normalizeRecentRun)
    : [];

  return {
    goalProgress: {
      countdown:
        stringifyValue(
          firstPresentValue(payload, [
            'goalProgress.countdown',
            'goal.countdown',
            'race.countdown',
            'race.daysToRace',
          ]),
        ) || 'No race set',
      detail:
        stringifyValue(
          firstPresentValue(payload, [
            'goalProgress.detail',
            'goal.detail',
            'race.detail',
            'race.date',
          ]),
        ) || 'Set a race goal in the web app',
      title:
        stringifyValue(
          firstPresentValue(payload, [
            'goalProgress.title',
            'goal.title',
            'race.name',
            'race.title',
          ]),
        ) || 'Goal Progress',
    },
    raw: payload,
    recentRuns,
    thisWeek: {
      avgPace:
        stringifyValue(
          firstPresentValue(payload, [
            'thisWeek.avgPace',
            'week.avgPace',
            'stats.avgPace',
          ]),
        ) || '--',
      km:
        stringifyValue(
          firstPresentValue(payload, [
            'thisWeek.km',
            'week.km',
            'stats.km',
            'thisWeek.distance',
          ]),
        ) || '0',
      runs:
        stringifyValue(
          firstPresentValue(payload, [
            'thisWeek.runs',
            'week.runs',
            'stats.runs',
          ]),
        ) || '0',
    },
    todayPlan: {
      distance:
        stringifyValue(
          firstPresentValue(payload, [
            'todayPlan.distance',
            'todayWorkout.distance',
            'workoutToday.distance',
            'plan.today.distance',
          ]),
        ) || '--',
      title:
        stringifyValue(
          firstPresentValue(payload, [
            'todayPlan.title',
            'todayPlan.type',
            'todayWorkout.title',
            'todayWorkout.type',
            'workoutToday.title',
          ]),
        ) || 'Check today\'s plan',
    },
  } satisfies CoachSidebarData;
}

export async function registerPushToken(
  sessionCookie: string,
  token: string,
  platform: 'ios' | 'android',
) {
  const response = await fetch(`${API_BASE_URL}/api/user/push-token`, {
    body: JSON.stringify({
      platform,
      token,
    }),
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Cookie: sessionCookie,
    },
    method: 'POST',
  });

  if (!response.ok) {
    const payload = await readResponsePayload(response);
    console.log('[push-token placeholder]', {
      message: payload.text,
      platform,
      status: response.status,
      token,
    });

    return {
      registered: false,
    } satisfies PushRegistrationResult;
  }

  return {
    registered: true,
  } satisfies PushRegistrationResult;
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
