import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import { Stack, useRouter } from 'expo-router';
import {
  Component,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ErrorInfo,
  type ReactNode,
} from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  AppState,
  FlatList,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type TextInputContentSizeChangeEventData,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PeiPeiLogoMark } from '../../src/components/branding/peipei-logo';
import { colors, fonts, radii, spacing } from '../../src/design/tokens';
import {
  type ChatAttachmentInput,
  type ChatRequestMessage,
  type CoachMessage,
  ApiError,
  createLocalId,
  getCoachChat,
  streamCoachChat,
} from '../../src/lib/api';
import {
  enqueueChatMessage,
  getQueuedChatMessageCount,
  getQueuedChatMessages,
  removeQueuedChatMessage,
  type OfflineQueuedAttachment,
} from '../../src/lib/offline-queue';
import {
  saveRemoteImageToLibrary,
  shareRemoteImage,
} from '../../src/lib/social-sharing';
import { useAuth } from '../../src/providers/auth-provider';

const INPUT_MIN_HEIGHT = 44;
const INPUT_MAX_HEIGHT = 108;
const CLOSING_PHRASE_RE =
  /关手机|明天见|去睡觉|晚安|good night|sleep well|rest up/i;
const INLINE_TOKEN_PATTERN =
  /(`[^`\n]+`|\*\*[^*]+\*\*|\*[^*\n]+\*|\d{1,2}:\d{2}\s*\/\s*(?:km|mi)|\d{2,3}\s*(?:bpm|次\/分)|\d+(?:\.\d+)?\s*(?:km|公里|K)(?![a-zA-Z]))/g;

type ComposerAttachment = {
  id: string;
  kind: 'audio' | 'image';
  label: string;
  mimeType: string;
  name: string;
  uri: string;
};

type ChatItem =
  | { id: string; type: 'typing' }
  | { id: string; type: 'day'; label: string }
  | { id: string; isPending: boolean; message: CoachMessage; type: 'message' };

function isNetworkFailure(error: unknown) {
  return (
    error instanceof Error &&
    /network|internet|timed out|offline/i.test(error.message)
  );
}

function getCoachErrorPresentation(error: unknown) {
  if (error instanceof ApiError && error.status === 401) {
    return {
      description: 'Your session ended. Sign in again to continue.',
      primaryActionLabel: 'Sign In Again',
      requiresSignOut: true,
      title: 'Session expired',
    };
  }

  if (error instanceof ApiError && error.status >= 503) {
    return {
      description: 'PeiPei is temporarily unavailable. Try again in a minute.',
      primaryActionLabel: 'Try Again',
      title: 'Coach unavailable',
    };
  }

  if (isNetworkFailure(error)) {
    return {
      description: 'You are offline. Messages can be queued and sent later.',
      primaryActionLabel: 'OK',
      title: 'Network error',
    };
  }

  return {
    description:
      error instanceof Error ? error.message : 'Unable to load coach chat.',
    primaryActionLabel: 'Try Again',
    title: 'Unable to load coach chat',
  };
}

function stripDisplayMarkup(value: string) {
  return value
    .replace(/<tool_calls>[\s\S]*?<\/tool_calls>/gi, '')
    .replace(/<tool_call>[\s\S]*?<\/tool_call>/gi, '')
    .replace(/<\/?tool_calls\s*\/?>/gi, '')
    .replace(/<\/?tool_call\s*\/?>/gi, '')
    .replace(/\[\[data:[^\]]+\]\]/g, '')  // strip data inline refs
    .replace(/[▬▮▐█▌▍▎▏▇▆▅▄▃▂▁]+/g, '') // strip block chars (sparklines)
    .trim();
}

function getGreeting(hour: number) {
  if (hour >= 6 && hour < 12) {
    return 'Good morning';
  }
  if (hour >= 12 && hour < 17) {
    return 'Good afternoon';
  }
  if (hour >= 17 && hour < 22) {
    return 'Good evening';
  }
  return 'Good night';
}

function formatFullDateLabel(date: Date) {
  return date.toLocaleDateString('en-US', {
    day: 'numeric',
    month: 'long',
    weekday: 'long',
  });
}

function isSameCalendarDay(left: string | Date, right: string | Date) {
  const leftDate = left instanceof Date ? left : new Date(left);
  const rightDate = right instanceof Date ? right : new Date(right);

  return (
    leftDate.getFullYear() === rightDate.getFullYear() &&
    leftDate.getMonth() === rightDate.getMonth() &&
    leftDate.getDate() === rightDate.getDate()
  );
}


function containsCjk(text: string) {
  return /[\u3400-\u9FFF\uF900-\uFAFF]/.test(text);
}

function getMetricColor(_value: string) {
  return undefined;
}


function extractMetrics(text: string): Array<{ label: string; value: string }> {
  const metrics: Array<{ label: string; value: string }> = [];
  const seen = new Set<string>();

  // Pace
  const paceMatches = text.matchAll(/(\d{1,2}:\d{2})\s*\/\s*(km|mi)/gi);
  for (const m of paceMatches) {
    const val = `${m[1]}/${m[2]}`;
    if (!seen.has(val)) { metrics.push({ label: 'PACE', value: val }); seen.add(val); }
    if (metrics.filter(x => x.label === 'PACE').length >= 2) break;
  }

  // Distance
  const distMatches = text.matchAll(/(\d+(?:\.\d+)?)\s*(km|公里|K)(?![a-zA-Z])/gi);
  for (const m of distMatches) {
    const val = `${m[1]}${m[2]}`;
    if (!seen.has(val)) { metrics.push({ label: 'DIST', value: val }); seen.add(val); }
    if (metrics.filter(x => x.label === 'DIST').length >= 2) break;
  }

  // HR
  const hrMatches = text.matchAll(/(\d{2,3})\s*(bpm|次\/分)/gi);
  for (const m of hrMatches) {
    const val = `${m[1]} ${m[2]}`;
    if (!seen.has(val)) { metrics.push({ label: 'HR', value: val }); seen.add(val); }
    if (metrics.filter(x => x.label === 'HR').length >= 2) break;
  }

  // Return at most 3 most important
  return metrics.slice(0, 3);
}

function splitCoachMessage(text: string) {
  const cleaned = stripDisplayMarkup(text);
  const lines = cleaned.split('\n');
  const firstLine = lines[0]?.trim() ?? '';
  const rest = lines.slice(1).join('\n').trim();

  return { firstLine, rest };
}

function createInlineRuns(
  text: string,
  keyPrefix: string,
  tone: 'coach' | 'runner',
) {
  const color = tone === 'coach' ? colors.text : colors.textSecondary;
  const segments = text.split(INLINE_TOKEN_PATTERN).filter(Boolean);

  return segments.map((segment, index) => {
    const isCode = /^`[^`\n]+`$/.test(segment);
    const isBold = /^\*\*[^*]+\*\*$/.test(segment);
    const isItalic = !isBold && /^\*[^*\n]+\*$/.test(segment);
    const isDataRef =
      !isCode &&
      !isBold &&
      !isItalic &&
      /(\d{1,2}:\d{2}\s*\/\s*(?:km|mi)|\d{2,3}\s*(?:bpm|次\/分)|\d+(?:\.\d+)?\s*(?:km|公里|K)(?![a-zA-Z]))/i.test(
        segment,
      );
    const value = isCode
      ? segment.slice(1, -1)
      : isBold
        ? segment.slice(2, -2)
        : isItalic
          ? segment.slice(1, -1)
          : segment;

    return (
      <Text
        key={`${keyPrefix}-${index}`}
        style={[
          tone === 'coach' ? styles.coachBodyText : styles.runnerMessageText,
          tone === 'coach' && containsCjk(value) ? styles.coachBodyTextCjk : null,
          { color: isDataRef ? getMetricColor(segment) || color : color },
          isBold ? styles.inlineStrong : null,
          isItalic ? styles.inlineItalic : null,
          isCode ? styles.inlineMono : null,
        ]}
      >
        {value}
      </Text>
    );
  });
}

function buildChatItems(
  messages: CoachMessage[],
  pendingIds: Set<string>,
  showTypingIndicator: boolean,
) {
  const items: ChatItem[] = [];

  if (showTypingIndicator) {
    items.push({ id: 'typing-indicator', type: 'typing' });
  }

  messages.forEach((message, index) => {
    const olderMessage = messages[index + 1];
    items.push({
      id: message.id,
      isPending: pendingIds.has(message.id),
      message,
      type: 'message',
    });

    if (!olderMessage || !isSameCalendarDay(message.createdAt, olderMessage.createdAt)) {
      items.push({
        id: `day-${message.id}`,
        label: formatFullDateLabel(new Date(message.createdAt)),
        type: 'day',
      });
    }
  });

  return items;
}

function mapAttachmentsForApi(
  attachments: ComposerAttachment[],
): ChatAttachmentInput[] {
  return attachments.map((attachment) => ({
    name: attachment.name,
    type: attachment.mimeType,
    uri: attachment.uri,
  }));
}

function buildOptimisticContent(text: string, attachments: ComposerAttachment[]) {
  if (text.trim()) {
    return text.trim();
  }

  if (attachments.length === 1) {
    return attachments[0]?.kind === 'image' ? 'Photo attachment' : 'Voice message';
  }

  if (attachments.length > 1) {
    return `${attachments.length} attachments`;
  }

  return '';
}

function createAttachmentFromPicker(
  asset: ImagePicker.ImagePickerAsset,
): ComposerAttachment {
  const mimeType = asset.mimeType || 'image/jpeg';
  const extension = mimeType.includes('png') ? 'png' : 'jpg';

  return {
    id: createLocalId('attachment'),
    kind: 'image',
    label: asset.fileName || 'Photo',
    mimeType,
    name: asset.fileName || `photo-${Date.now().toString(36)}.${extension}`,
    uri: asset.uri,
  };
}

function mapQueuedAttachments(attachments: OfflineQueuedAttachment[]) {
  return attachments.map((attachment) => ({
    id: attachment.id,
    kind: attachment.kind,
    label: attachment.label,
    mimeType: attachment.mimeType,
    name: attachment.name,
    uri: attachment.uri,
  }));
}

type CoachScreenErrorBoundaryProps = {
  children: ReactNode;
  onReload: () => void;
};

type CoachScreenErrorBoundaryState = {
  error: Error | null;
};

class CoachScreenErrorBoundary extends Component<
  CoachScreenErrorBoundaryProps,
  CoachScreenErrorBoundaryState
> {
  state: CoachScreenErrorBoundaryState = {
    error: null,
  };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[CoachScreen] Render crash:', error, errorInfo.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <View style={styles.screen}>
          <View style={styles.errorState}>
            <Text style={styles.errorTitle}>Coach screen crashed</Text>
            <Text style={styles.errorBody}>Reload the conversation and try again.</Text>
            <Pressable onPress={this.props.onReload} style={styles.retryButton}>
              <Text style={styles.retryButtonText}>Reload</Text>
            </Pressable>
          </View>
        </View>
      );
    }

    return this.props.children;
  }
}

export default function CoachScreen() {
  const [reloadKey, setReloadKey] = useState(0);

  return (
    <CoachScreenErrorBoundary
      key={reloadKey}
      onReload={() => {
        setReloadKey((current) => current + 1);
      }}
    >
      <CoachScreenContent />
    </CoachScreenErrorBoundary>
  );
}

function CoachScreenContent() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const inputRef = useRef<TextInput>(null);
  const listRef = useRef<FlatList<ChatItem>>(null);
  const queueFlushInFlightRef = useRef(false);
  const { sessionCookie, signOut, user } = useAuth();

  const [attachments, setAttachments] = useState<ComposerAttachment[]>([]);
  const [composerError, setComposerError] = useState<string | null>(null);
  const [composerValue, setComposerValue] = useState('');
  const [draftMessages, setDraftMessages] = useState<CoachMessage[]>([]);
  const [inputHeight, setInputHeight] = useState(INPUT_MIN_HEIGHT);
  const [isCompactHeader, setIsCompactHeader] = useState(false);
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);
  const [isQueueSending, setIsQueueSending] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [pendingIds, setPendingIds] = useState<Set<string>>(() => new Set());
  const [queuedMessageCount, setQueuedMessageCount] = useState(0);
  const [replyingTo, setReplyingTo] = useState<CoachMessage | null>(null);
  const [waitingForFirstToken, setWaitingForFirstToken] = useState(false);

  const chatQuery = useQuery({
    queryKey: ['coach-chat'],
    queryFn: () => getCoachChat(sessionCookie ?? ''),
    enabled: Boolean(sessionCookie),
    retry: false,
  });

  useEffect(() => {
    const showSubscription = Keyboard.addListener('keyboardWillShow', () => {
      setIsKeyboardVisible(true);
    });
    const hideSubscription = Keyboard.addListener('keyboardWillHide', () => {
      setIsKeyboardVisible(false);
    });
    const showDidSubscription = Keyboard.addListener('keyboardDidShow', () => {
      setIsKeyboardVisible(true);
    });
    const hideDidSubscription = Keyboard.addListener('keyboardDidHide', () => {
      setIsKeyboardVisible(false);
    });

    return () => {
      showSubscription.remove();
      hideSubscription.remove();
      showDidSubscription.remove();
      hideDidSubscription.remove();
    };
  }, []);

  useEffect(() => {
    if (!sessionCookie) {
      setQueuedMessageCount(0);
      setIsQueueSending(false);
      return;
    }

    void refreshQueuedMessageCount();
    void flushQueuedMessages();
  }, [sessionCookie]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        void refreshQueuedMessageCount();
        void flushQueuedMessages();
      }
    });

    return () => {
      subscription.remove();
    };
  }, [composerValue, attachments.length, isStreaming, sessionCookie]);

  const mergedMessagesDesc = useMemo(() => {
    const persistedMessages = Array.isArray(chatQuery.data?.messages)
      ? chatQuery.data.messages
      : [];

    return [...persistedMessages, ...draftMessages].sort(
      (left, right) =>
        new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime(),
    );
  }, [chatQuery.data?.messages, draftMessages]);

  const chatItems = useMemo(
    () => buildChatItems(mergedMessagesDesc, pendingIds, waitingForFirstToken),
    [mergedMessagesDesc, pendingIds, waitingForFirstToken],
  );

  const latestCoachMessage = mergedMessagesDesc.find(
    (message) => message.role === 'assistant' && stripDisplayMarkup(message.content),
  );
  const shouldShowClosingNote = latestCoachMessage
    ? CLOSING_PHRASE_RE.test(stripDisplayMarkup(latestCoachMessage.content))
    : false;
  const greeting = getGreeting(new Date().getHours());
  const displayName = user?.name?.trim() || 'Runner';
  const showEmptyState =
    !chatQuery.isLoading &&
    !chatQuery.error &&
    mergedMessagesDesc.length === 0 &&
    !waitingForFirstToken;

  async function refreshQueuedMessageCount() {
    if (!sessionCookie) {
      setQueuedMessageCount(0);
      return;
    }

    const count = await getQueuedChatMessageCount();
    setQueuedMessageCount(count);
  }

  async function flushQueuedMessages() {
    if (
      !sessionCookie ||
      queueFlushInFlightRef.current ||
      isStreaming ||
      composerValue.trim() ||
      attachments.length
    ) {
      return;
    }

    queueFlushInFlightRef.current = true;
    setIsQueueSending(true);

    try {
      const queuedMessages = await getQueuedChatMessages();
      setQueuedMessageCount(queuedMessages.length);

      for (const queuedMessage of queuedMessages) {
        await submitMessage({
          attachments: mapQueuedAttachments(queuedMessage.attachments),
          composerText: queuedMessage.composerText,
          optimisticContent: queuedMessage.optimisticContent,
          queueOnNetworkError: false,
        });
        await removeQueuedChatMessage(queuedMessage.id);
      }
    } catch {
      // Keep the queue intact for the next foreground attempt.
    } finally {
      queueFlushInFlightRef.current = false;
      setIsQueueSending(false);
      await refreshQueuedMessageCount();
    }
  }

  async function handleRefresh() {
    if (!sessionCookie) {
      return;
    }

    setIsRefreshing(true);

    try {
      await Promise.all([chatQuery.refetch(), flushQueuedMessages()]);
    } finally {
      setIsRefreshing(false);
    }
  }

  async function pickImage(mode: 'camera' | 'library') {
    const permission =
      mode === 'camera'
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (!permission.granted) {
      Alert.alert(
        'Permission needed',
        mode === 'camera'
          ? 'Camera access is required to take a photo.'
          : 'Photo library access is required to choose an image.',
      );
      return;
    }

    const result =
      mode === 'camera'
        ? await ImagePicker.launchCameraAsync({
            allowsEditing: false,
            mediaTypes: ['images'],
            quality: 0.82,
          })
        : await ImagePicker.launchImageLibraryAsync({
            allowsEditing: false,
            mediaTypes: ['images'],
            quality: 0.82,
          });

    if (result.canceled || !result.assets?.length) {
      return;
    }

    setAttachments((current) => [
      ...current,
      ...result.assets.map(createAttachmentFromPicker),
    ]);
    setComposerError(null);
  }

  function showAttachmentMenu() {
    Alert.alert('Add Photo', undefined, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Take Photo', onPress: () => void pickImage('camera') },
      { text: 'Choose from Library', onPress: () => void pickImage('library') },
    ]);
  }

  function handleInputLongPress() {
    showAttachmentMenu();
  }

  async function handleMicPress() {
    Alert.alert(
      'Voice notes',
      'Voice capture is preserved for Phase 1, but this redesign uses a simplified composer. Send text or attach a photo for now.',
    );
  }

  async function handleCopyCaption(message: CoachMessage) {
    await Clipboard.setStringAsync(stripDisplayMarkup(message.content));
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }

  async function handleSaveSocialImage(message: CoachMessage) {
    if (!message.socialPost?.imageUrl) {
      return;
    }

    await saveRemoteImageToLibrary(message.socialPost.imageUrl);
    Alert.alert('Saved', 'The image was saved to Photos.');
  }

  async function handleShareSocialImage(message: CoachMessage) {
    if (!message.socialPost?.imageUrl) {
      return;
    }

    await shareRemoteImage(message.socialPost.imageUrl);
  }

  async function handleMessageAction(action: () => Promise<void>) {
    try {
      await action();
    } catch (error) {
      const message =
        error instanceof ApiError
          ? error.message
          : error instanceof Error
            ? error.message
            : 'Unable to continue.';
      Alert.alert('Unable to continue', message);
    }
  }

  async function submitMessage(options?: {
    attachments?: ComposerAttachment[];
    composerText?: string;
    optimisticContent?: string;
    queueOnNetworkError?: boolean;
  }) {
    const composerText = options?.composerText ?? composerValue;
    const outgoingAttachments = options?.attachments ?? attachments;
    const trimmedText = composerText.trim();

    if (!sessionCookie || isStreaming || (!trimmedText && !outgoingAttachments.length)) {
      return;
    }

    const existingMessages = Array.isArray(chatQuery.data?.messages)
      ? chatQuery.data.messages
      : [];
    const queuedText = options?.composerText ?? composerValue;
    const queuedAttachments = options?.attachments ?? attachments;
    const optimisticContent =
      options?.optimisticContent ??
      buildOptimisticContent(trimmedText, outgoingAttachments);
    const queueOnNetworkError = options?.queueOnNetworkError ?? true;
    const userMessage: CoachMessage = {
      content: optimisticContent,
      createdAt: new Date().toISOString(),
      id: createLocalId('runner'),
      role: 'user',
    };
    const assistantDraftId = createLocalId('coach');
    const outboundMessages: ChatRequestMessage[] = [
      ...existingMessages,
      {
        content: trimmedText,
        createdAt: userMessage.createdAt,
        id: userMessage.id,
        role: 'user',
      },
    ];

    setComposerError(null);
    setComposerValue('');
    setAttachments([]);
    setReplyingTo(null);
    setInputHeight(INPUT_MIN_HEIGHT);
    setDraftMessages([userMessage]);
    setPendingIds((current) => {
      const next = new Set(current);
      next.add(userMessage.id);
      return next;
    });
    setIsStreaming(true);
    setWaitingForFirstToken(true);
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      let assistantBuffer = '';
      let receivedFirstToken = false;

      await streamCoachChat(
        sessionCookie,
        {
          attachments:
            outgoingAttachments.length > 0
              ? mapAttachmentsForApi(outgoingAttachments)
              : undefined,
          contextType: 'general',
          messages: outboundMessages,
        },
        async (chunk) => {
          assistantBuffer += chunk;

          if (!receivedFirstToken) {
            receivedFirstToken = true;
            setWaitingForFirstToken(false);
            await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          }

          setDraftMessages([
            userMessage,
            {
              content: assistantBuffer,
              createdAt: new Date().toISOString(),
              id: assistantDraftId,
              role: 'assistant',
            },
          ]);
        },
      );

      setPendingIds((current) => {
        const next = new Set(current);
        next.delete(userMessage.id);
        return next;
      });
      setWaitingForFirstToken(false);
      setDraftMessages([]);
      await chatQuery.refetch();
    } catch (error) {
      setPendingIds((current) => {
        const next = new Set(current);
        next.delete(userMessage.id);
        return next;
      });
      setWaitingForFirstToken(false);
      setDraftMessages([]);
      setComposerValue(queuedText);
      setAttachments(queuedAttachments);

      const shouldQueueMessage = queueOnNetworkError && isNetworkFailure(error);
      const presentation = getCoachErrorPresentation(error);

      if (shouldQueueMessage) {
        await enqueueChatMessage({
          attachments: queuedAttachments.map((attachment) => ({
            id: attachment.id,
            kind: attachment.kind,
            label: attachment.label,
            mimeType: attachment.mimeType,
            name: attachment.name,
            uri: attachment.uri,
          })),
          composerText: queuedText,
          createdAt: userMessage.createdAt,
          id: createLocalId('queued'),
          optimisticContent,
        });
        await refreshQueuedMessageCount();
        setComposerError('Message saved offline. It will send when you reconnect.');
      } else if (presentation.requiresSignOut) {
        Alert.alert(presentation.title, presentation.description);
        await signOut();
        router.replace('/login');
      } else {
        setComposerError(presentation.description);
      }
    } finally {
      setIsStreaming(false);
    }
  }

  function renderItem({ item }: { item: ChatItem }) {
    if (item.type === 'day') {
      return (
        <View style={styles.daySeparator}>
          <View style={styles.dayLine} />
          <Text style={styles.dayLabel}>{item.label}</Text>
          <View style={styles.dayLine} />
        </View>
      );
    }

    if (item.type === 'typing') {
      return <TypingIndicator />;
    }

    return (
      <MessageRow
        isPending={item.isPending}
        message={item.message}
        onCopyCaption={() => handleMessageAction(() => handleCopyCaption(item.message))}
        onReply={() => setReplyingTo(item.message)}
        onSaveImage={() =>
          handleMessageAction(() => handleSaveSocialImage(item.message))
        }
        onShareImage={() =>
          handleMessageAction(() => handleShareSocialImage(item.message))
        }
      />
    );
  }

  const chatError =
    chatQuery.error && !chatQuery.data?.messages?.length
      ? getCoachErrorPresentation(chatQuery.error)
      : null;

  return (
    <View style={styles.screen}>
      <Stack.Screen options={{ headerShown: false }} />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={insets.bottom > 0 ? 0 : 12}
        style={styles.screen}
      >
        <View
          style={[
            styles.header,
            {
              paddingTop: insets.top + 12,
            },
          ]}
        >
          <View style={styles.headerTopRow}>
            {isCompactHeader ? (
              <Text style={styles.compactHeaderTitle}>PeiPei</Text>
            ) : (
              <View />
            )}

            <Pressable
              accessibilityLabel="Open settings"
              onPress={() => router.push('/(app)/settings')}
              style={({ pressed }) => [styles.gearButton, pressed && styles.pressed]}
            >
              <Ionicons color={colors.text} name="settings-outline" size={22} />
            </Pressable>
          </View>

          {!isCompactHeader ? (
            <>
              <Text style={styles.greeting}>{`${greeting}, ${displayName}.`}</Text>
              <Text style={styles.subheading}>Your coach is listening.</Text>
            </>
          ) : null}
        </View>

        {chatError ? (
          <View style={styles.errorState}>
            <Text style={styles.errorTitle}>{chatError.title}</Text>
            <Text style={styles.errorBody}>{chatError.description}</Text>
            <Pressable
              onPress={async () => {
                if (chatError.requiresSignOut) {
                  await signOut();
                  router.replace('/login');
                  return;
                }

                await chatQuery.refetch();
              }}
              style={styles.retryButton}
            >
              <Text style={styles.retryButtonText}>{chatError.primaryActionLabel}</Text>
            </Pressable>
          </View>
        ) : showEmptyState ? (
          <View style={styles.emptyState}>
            <PeiPeiLogoMark size={48} />
            <Text style={styles.emptyStateText}>Your coach is ready.</Text>
          </View>
        ) : (
          <FlatList
            ref={listRef}
            contentContainerStyle={[
              styles.listContent,
              {
                paddingBottom: 120,
                paddingTop: 12,
              },
            ]}
            data={chatItems}
            inverted
            keyExtractor={(item) => item.id}
            keyboardDismissMode="interactive"
            keyboardShouldPersistTaps="handled"
            onScroll={(event: NativeSyntheticEvent<NativeScrollEvent>) => {
              const nextCompact = event.nativeEvent.contentOffset.y > 44;
              if (nextCompact !== isCompactHeader) {
                setIsCompactHeader(nextCompact);
              }
            }}
            refreshControl={
              <RefreshControl
                onRefresh={() => {
                  void handleRefresh();
                }}
                refreshing={isRefreshing}
                tintColor={colors.text}
              />
            }
            renderItem={renderItem}
            showsVerticalScrollIndicator={false}
            ListHeaderComponent={
              <View>
                {shouldShowClosingNote ? (
                  <View style={styles.closingNote}>
                    <Text style={styles.closingNoteText}>Rest well. Your coach will be here tomorrow.</Text>
                  </View>
                ) : null}
                <View style={{ height: 20 }} />
              </View>
            }
            ListFooterComponent={<View style={{ height: 12 }} />}
          />
        )}

        <View
          style={[
            styles.composerShell,
            {
              paddingBottom: 8,
            },
          ]}
        >
          {queuedMessageCount > 0 || isQueueSending ? (
            <Text style={styles.queueNotice}>
              {isQueueSending
                ? 'Sending queued messages...'
                : `${queuedMessageCount} queued ${queuedMessageCount === 1 ? 'message' : 'messages'}`}
            </Text>
          ) : null}

          {replyingTo ? (
            <View style={styles.replyBanner}>
              <Text numberOfLines={1} style={styles.replyBannerText}>
                Replying to: {stripDisplayMarkup(replyingTo.content)}
              </Text>
              <Pressable onPress={() => setReplyingTo(null)}>
                <Ionicons color={colors.textSecondary} name="close" size={18} />
              </Pressable>
            </View>
          ) : null}

          {attachments.length ? (
            <View style={styles.attachmentRow}>
              {attachments.map((attachment) => (
                <View key={attachment.id} style={styles.attachmentChip}>
                  <Text numberOfLines={1} style={styles.attachmentChipText}>
                    {attachment.label}
                  </Text>
                  <Pressable
                    onPress={() =>
                      setAttachments((current) =>
                        current.filter((item) => item.id !== attachment.id),
                      )
                    }
                  >
                    <Ionicons color={colors.textSecondary} name="close" size={16} />
                  </Pressable>
                </View>
              ))}
            </View>
          ) : null}

          {composerError ? <Text style={styles.composerError}>{composerError}</Text> : null}

          <View style={styles.composerRow}>
            {isKeyboardVisible ? (
              <Pressable
                accessibilityLabel="Add photo"
                onPress={showAttachmentMenu}
                style={({ pressed }) => [styles.sideAction, pressed && styles.pressed]}
              >
                <Ionicons color={colors.textSecondary} name="camera-outline" size={22} />
              </Pressable>
            ) : null}

            <Pressable onLongPress={handleInputLongPress} style={styles.inputWrap}>
              <TextInput
                ref={inputRef}
                multiline
                onChangeText={setComposerValue}
                onContentSizeChange={(
                  event: NativeSyntheticEvent<TextInputContentSizeChangeEventData>,
                ) => {
                  const nextHeight = Math.min(
                    INPUT_MAX_HEIGHT,
                    Math.max(
                      INPUT_MIN_HEIGHT,
                      event.nativeEvent.contentSize.height + 14,
                    ),
                  );
                  setInputHeight(nextHeight);
                }}
                placeholder="Write to your coach"
                placeholderTextColor={colors.textTertiary}
                returnKeyType="default"
                style={[styles.input, { height: inputHeight, paddingRight: 50 }]}
                textAlignVertical="top"
                value={composerValue}
              />

              {composerValue.trim() ? (
                <Pressable
                  accessibilityLabel="Send message"
                  disabled={isStreaming}
                  onPress={() => {
                    void submitMessage();
                  }}
                  style={({ pressed }) => [
                    styles.trailingAction,
                    pressed && styles.pressed,
                    isStreaming && styles.disabled,
                  ]}
                >
                  <Ionicons color={colors.accent} name="arrow-up-circle" size={28} />
                </Pressable>
              ) : !isKeyboardVisible ? (
                <Pressable
                  accessibilityLabel="Voice note"
                  onPress={() => {
                    void handleMicPress();
                  }}
                  style={({ pressed }) => [styles.trailingAction, pressed && styles.pressed]}
                >
                  <Ionicons color={colors.textSecondary} name="mic-outline" size={22} />
                </Pressable>
              ) : null}
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

type MessageRowProps = {
  isPending: boolean;
  message: CoachMessage;
  onCopyCaption: () => void;
  onReply: () => void;
  onSaveImage: () => void;
  onShareImage: () => void;
};

function MessageRow({
  isPending,
  message,
  onCopyCaption,
  onReply,
  onSaveImage,
  onShareImage,
}: MessageRowProps) {
  const cleanedContent = stripDisplayMarkup(message.content);

  if (message.role === 'user') {
    return (
      <Pressable onLongPress={onReply} style={styles.runnerRow}>
        <View style={[styles.runnerBubble, isPending && styles.pendingMessage]}>
          <Text style={styles.runnerMessageText}>
            {cleanedContent}
          </Text>
        </View>
      </Pressable>
    );
  }

  const { firstLine, rest } = splitCoachMessage(cleanedContent);
  const coachUsesSystemFont = containsCjk(cleanedContent);
  const metrics = extractMetrics(cleanedContent);

  return (
    <Pressable onLongPress={onReply} style={styles.coachRow}>
      {metrics.length > 0 ? (
        <View style={styles.metricBlock}>
          <View style={styles.metricRow}>
            {metrics.map((m, i) => (
              <View key={i} style={styles.metricChip}>
                <Text style={styles.metricLabel}>{m.label}</Text>
                <Text style={styles.metricValue}>{m.value}</Text>
              </View>
            ))}
          </View>
        </View>
      ) : null}

      {message.messageType === 'social_post' && message.socialPost?.imageUrl ? (
        <View style={styles.socialPostCard}>
          <Image source={{ uri: message.socialPost.imageUrl }} style={styles.socialImage} />
          <View style={styles.socialActions}>
            <Pressable onPress={onSaveImage} style={styles.socialAction}>
              <Text style={styles.socialActionText}>Save</Text>
            </Pressable>
            <Pressable onPress={onShareImage} style={styles.socialAction}>
              <Text style={styles.socialActionText}>Share</Text>
            </Pressable>
            <Pressable onPress={onCopyCaption} style={styles.socialAction}>
              <Text style={styles.socialActionText}>Copy</Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      {firstLine ? (
        <Text style={[styles.coachHeadlineText, coachUsesSystemFont && styles.coachHeadlineTextCjk]}>
          {createInlineRuns(firstLine, `${message.id}-headline`, 'coach')}
        </Text>
      ) : null}

      {rest ? (
        <Text style={[styles.coachBodyText, coachUsesSystemFont && styles.coachBodyTextCjk]}>
          {createInlineRuns(rest, `${message.id}-body`, 'coach')}
        </Text>
      ) : null}
    </Pressable>
  );
}

function TypingIndicator() {
  const dotOne = useRef(new Animated.Value(0.45)).current;
  const dotTwo = useRef(new Animated.Value(0.45)).current;
  const dotThree = useRef(new Animated.Value(0.45)).current;

  useEffect(() => {
    const createLoop = (value: Animated.Value, delay: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(value, {
            duration: 520,
            toValue: 1,
            useNativeDriver: true,
          }),
          Animated.timing(value, {
            duration: 520,
            toValue: 0.45,
            useNativeDriver: true,
          }),
        ]),
      );

    const first = createLoop(dotOne, 0);
    const second = createLoop(dotTwo, 140);
    const third = createLoop(dotThree, 280);

    first.start();
    second.start();
    third.start();

    return () => {
      first.stop();
      second.stop();
      third.stop();
    };
  }, [dotOne, dotThree, dotTwo]);

  return (
    <View style={styles.typingRow}>
      <View style={styles.typingDots}>
        <Animated.View
          style={[
            styles.typingDot,
            { opacity: dotOne, transform: [{ scale: dotOne }] },
          ]}
        />
        <Animated.View
          style={[
            styles.typingDot,
            { opacity: dotTwo, transform: [{ scale: dotTwo }] },
          ]}
        />
        <Animated.View
          style={[
            styles.typingDot,
            { opacity: dotThree, transform: [{ scale: dotThree }] },
          ]}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  attachmentChip: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.separator,
    borderRadius: radii.pill,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 8,
    maxWidth: 220,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  attachmentChipText: {
    color: colors.text,
    flexShrink: 1,
    fontSize: 13,
  },
  attachmentRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 10,
  },
  closingNote: {
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 8,
  },
  closingNoteText: {
    color: colors.textTertiary,
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'center',
  },
  coachBodyParagraph: {
    marginTop: 12,
  },
  metricBlock: {
    marginBottom: 14,
  },
  metricBlockTitle: {
    color: colors.textTertiary,
    fontFamily: fonts.ui,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.5,
    marginBottom: 8,
  },
  metricRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 14,
  },
  metricChip: {
    alignItems: 'baseline',
    backgroundColor: 'rgba(216,176,122,0.10)',
    borderColor: 'rgba(216,176,122,0.22)',
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  metricChipGap: {},
  metricLabel: {
    color: colors.textTertiary,
    fontFamily: fonts.ui,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.1,
  },
  metricValue: {
    color: '#E6C28D',
    fontFamily: fonts.mono,
    fontSize: 14,
    fontWeight: '700',
  },
  coachBodyText: {
    color: colors.text,
    fontFamily: fonts.coach,
    fontSize: 16,
    lineHeight: 27,
    marginTop: 4,
  },
  coachBodyTextCjk: {
    fontFamily: fonts.ui,
    lineHeight: 27,
  },
  coachHeadlineText: {
    color: colors.text,
    fontFamily: fonts.coachBold,
    fontSize: 16.5,
    lineHeight: 26,
  },
  coachHeadlineTextCjk: {
    fontFamily: fonts.ui,
    fontWeight: '600',
  },
  coachRow: {
    backgroundColor: '#151513',
    borderColor: 'rgba(255,255,255,0.05)',
    borderRadius: 18,
    borderTopColor: 'rgba(255,255,255,0.10)',
    borderTopWidth: 1,
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    elevation: 2,
    marginHorizontal: 16,
    marginTop: 20,
    paddingHorizontal: 18,
    paddingVertical: 18,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  compactHeaderTitle: {
    color: colors.text,
    fontFamily: fonts.coachBold,
    fontSize: 20,
  },
  composerError: {
    color: colors.destructive,
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 8,
  },
  composerRow: {
    alignItems: 'flex-end',
    flexDirection: 'row',
    gap: 10,
  },
  composerShell: {
    backgroundColor: colors.background,
    borderTopColor: colors.separator,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 4,
  },
  dayLabel: {
    color: colors.textTertiary,
    fontSize: 12,
    fontWeight: '500',
    letterSpacing: 1.5,
    marginHorizontal: 12,
    textTransform: 'uppercase',
  },
  dayLine: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    flex: 1,
    height: StyleSheet.hairlineWidth,
  },
  daySeparator: {
    alignItems: 'center',
    flexDirection: 'row',
    marginVertical: 24,
    paddingHorizontal: 16,
  },
  disabled: {
    opacity: 0.5,
  },
  emptyState: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
  },
  emptyStateText: {
    color: colors.textSecondary,
    fontFamily: fonts.ui,
    fontSize: 17,
    marginTop: 16,
  },
  errorBody: {
    color: colors.textSecondary,
    fontSize: 15,
    lineHeight: 22,
    marginTop: 8,
    textAlign: 'center',
  },
  errorState: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  errorTitle: {
    color: colors.text,
    fontFamily: fonts.coachBold,
    fontSize: 24,
    textAlign: 'center',
  },
  gearButton: {
    alignItems: 'center',
    borderRadius: radii.pill,
    height: 44,
    justifyContent: 'center',
    width: 44,
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  greeting: {
    color: colors.text,
    fontFamily: fonts.ui,
    fontSize: 26,
    fontWeight: '300',
    letterSpacing: -0.5,
    lineHeight: 34,
    marginTop: 12,
  },
  header: {
    backgroundColor: colors.background,
    paddingHorizontal: 20,
    paddingBottom: 14,
    paddingTop: 8,
  },
  headerTopRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  inlineItalic: {
    fontStyle: 'italic',
  },
  inlineMono: {
    fontFamily: fonts.mono,
    fontSize: 15,
  },
  inlineStrong: {
    fontFamily: fonts.coachBold,
  },
  input: {
    backgroundColor: colors.surface,
    borderColor: 'rgba(255,255,255,0.06)',
    borderRadius: 22,
    borderWidth: StyleSheet.hairlineWidth,
    color: colors.text,
    flex: 1,
    fontSize: 16,
    lineHeight: 22,
    minHeight: INPUT_MIN_HEIGHT,
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  inputWrap: {
    flex: 1,
    justifyContent: 'center',
    position: 'relative',
  },
  listContent: {
    flexGrow: 1,
  },
  pendingMessage: {
    opacity: 0.6,
  },
  pressed: {
    opacity: 0.65,
  },
  queueNotice: {
    color: colors.textTertiary,
    fontSize: 12,
    lineHeight: 18,
    marginBottom: 8,
  },
  replyBanner: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.separator,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  replyBannerText: {
    color: colors.textSecondary,
    flex: 1,
    fontSize: 13,
    marginRight: 12,
  },
  retryButton: {
    alignItems: 'center',
    alignSelf: 'center',
    backgroundColor: colors.accent,
    borderRadius: radii.pill,
    justifyContent: 'center',
    marginTop: 20,
    minHeight: 46,
    paddingHorizontal: 20,
  },
  retryButtonText: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '600',
  },
  runnerMessageText: {
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 16,
    color: colors.textSecondary,
    fontFamily: fonts.ui,
    fontSize: 15.5,
    lineHeight: 23,
    maxWidth: '75%',
    overflow: 'hidden',
    paddingHorizontal: 14,
    paddingVertical: 8,
    textAlign: 'right',
  },
  runnerRow: {
    alignItems: 'flex-end',
    marginTop: 14,
    paddingHorizontal: 20,
  },
  runnerBubble: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 9,
    maxWidth: '75%',
  },
  screen: {
    backgroundColor: colors.background,
    flex: 1,
  },
  sideAction: {
    alignItems: 'center',
    height: 44,
    justifyContent: 'center',
    width: 28,
  },
  socialAction: {
    paddingVertical: 4,
  },
  socialActionText: {
    color: colors.textSecondary,
    fontSize: 13,
  },
  socialActions: {
    flexDirection: 'row',
    gap: 16,
    marginTop: 10,
  },
  socialImage: {
    borderRadius: 18,
    height: 220,
    width: '100%',
  },
  socialPostCard: {
    marginBottom: 12,
  },
  subheading: {
    color: colors.textSecondary,
    fontFamily: fonts.ui,
    fontSize: 15,
    lineHeight: 22,
    marginTop: 2,
  },
  trailingAction: {
    alignItems: 'center',
    bottom: 8,
    height: 28,
    justifyContent: 'center',
    position: 'absolute',
    right: 12,
    width: 28,
  },
  typingRow: {
    marginTop: 16,
    paddingHorizontal: 24,
  },
  typingDot: {
    backgroundColor: colors.textTertiary,
    borderRadius: 3,
    height: 6,
    width: 6,
  },
  typingDots: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
  },
});
