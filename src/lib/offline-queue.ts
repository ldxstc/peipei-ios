import AsyncStorage from '@react-native-async-storage/async-storage';

const OFFLINE_CHAT_QUEUE_KEY = 'peipei.offline_chat_queue';

export type OfflineQueuedAttachment = {
  id: string;
  kind: 'audio' | 'image';
  label: string;
  mimeType: string;
  name: string;
  uri: string;
};

export type OfflineQueuedMessage = {
  attachments: OfflineQueuedAttachment[];
  composerText: string;
  createdAt: string;
  id: string;
  optimisticContent: string;
};

function isQueuedAttachment(value: unknown): value is OfflineQueuedAttachment {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }

  const record = value as Record<string, unknown>;

  return (
    typeof record.id === 'string' &&
    (record.kind === 'audio' || record.kind === 'image') &&
    typeof record.label === 'string' &&
    typeof record.mimeType === 'string' &&
    typeof record.name === 'string' &&
    typeof record.uri === 'string'
  );
}

function isQueuedMessage(value: unknown): value is OfflineQueuedMessage {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }

  const record = value as Record<string, unknown>;

  return (
    Array.isArray(record.attachments) &&
    (record.attachments as unknown[]).every(isQueuedAttachment) &&
    typeof record.composerText === 'string' &&
    typeof record.createdAt === 'string' &&
    typeof record.id === 'string' &&
    typeof record.optimisticContent === 'string'
  );
}

async function readOfflineQueue() {
  const rawQueue = await AsyncStorage.getItem(OFFLINE_CHAT_QUEUE_KEY);

  if (!rawQueue) {
    return [] as OfflineQueuedMessage[];
  }

  try {
    const parsed = JSON.parse(rawQueue) as unknown;

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter(isQueuedMessage);
  } catch {
    return [];
  }
}

async function writeOfflineQueue(queue: OfflineQueuedMessage[]) {
  if (!queue.length) {
    await AsyncStorage.removeItem(OFFLINE_CHAT_QUEUE_KEY);
    return;
  }

  await AsyncStorage.setItem(OFFLINE_CHAT_QUEUE_KEY, JSON.stringify(queue));
}

export async function getQueuedChatMessages() {
  return readOfflineQueue();
}

export async function getQueuedChatMessageCount() {
  const queue = await readOfflineQueue();
  return queue.length;
}

export async function enqueueChatMessage(message: OfflineQueuedMessage) {
  const queue = await readOfflineQueue();
  queue.push(message);
  await writeOfflineQueue(queue);
}

export async function removeQueuedChatMessage(messageId: string) {
  const queue = await readOfflineQueue();
  const nextQueue = queue.filter((message) => message.id !== messageId);
  await writeOfflineQueue(nextQueue);
}

export async function clearQueuedChatMessages() {
  await AsyncStorage.removeItem(OFFLINE_CHAT_QUEUE_KEY);
}
