import { Feather, Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import * as Clipboard from 'expo-clipboard';
import { LinearGradient } from 'expo-linear-gradient';
import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import { Stack, useRouter } from 'expo-router';
import {
  Component,
  memo,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ErrorInfo,
  type MutableRefObject,
  type ReactNode,
} from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Easing,
  FlatList,
  Image,
  KeyboardAvoidingView,
  LayoutAnimation,
  PanResponder,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
  type LayoutChangeEvent,
  type NativeSyntheticEvent,
  type PanResponderInstance,
  type TextInputContentSizeChangeEventData,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CoachDataSidebar } from '../../src/components/sidebar/coach-data-sidebar';
import { colors, fonts, radii, spacing } from '../../src/design/tokens';
import {
  type ChatAttachmentInput,
  type ChatRequestMessage,
  type CoachMessage,
  ApiError,
  consumeTextStream,
  createLocalId,
  getCoachChat,
  getCoachSidebar,
  openCoachChatStream,
} from '../../src/lib/api';
import { syncPeiPeiWidgets } from '../../src/lib/peipei-widgets';
import {
  saveRemoteImageToLibrary,
  shareRemoteImage,
} from '../../src/lib/social-sharing';
import { useAuth } from '../../src/providers/auth-provider';

type DensityTier = 'today' | 'yesterday' | 'this_week' | 'older';

type ChatItem =
  | {
      data: CoachMessage;
      densityTier: DensityTier;
      id: string;
      isFirstInSequence: boolean;
      type: 'message';
    }
  | { date: Date; id: string; type: 'day_label' }
  | { id: string; type: 'loading_shimmer' }
  | { id: string; type: 'typing_indicator' };

type CoachErrorPresentation = {
  description: string;
  primaryActionLabel: string;
  requiresSignOut?: boolean;
  title: string;
};

type ComposerAttachment = {
  id: string;
  kind: 'audio' | 'image';
  label: string;
  mimeType: string;
  name: string;
  uri: string;
};

type MessageRowProps = {
  densityTier: DensityTier;
  isExpanded: boolean;
  isFirstInSequence: boolean;
  isPending: boolean;
  message: CoachMessage;
  onCopyCaption: () => void;
  onExpand: (messageId: string) => void;
  onReply: (message: CoachMessage) => void;
  onSaveImage: () => void;
  onShareImage: () => void;
};

type CoachContentModel = {
  cardParagraphs: string[];
  closingLine: string | null;
  floatingHeadline: string | null;
  previewText: string;
  useSemanticCards: boolean;
};

const INITIAL_VISIBLE_MESSAGES = 40;
const INPUT_MIN_HEIGHT = 44;
const INPUT_MAX_HEIGHT = 120;
const LOAD_MORE_BATCH = 20;
const TABLET_BREAKPOINT = 960;
const COLLAPSE_CHARACTER_THRESHOLD = 132;
const DATA_REFERENCE_PATTERN =
  /(\d{1,2}:\d{2}\s*\/\s*(?:km|mi)|\d{2,3}\s*(?:bpm|次\/分)|\d+(?:\.\d+)?\s*(?:km|公里|K)(?![a-zA-Z]))/gi;
const INLINE_TOKEN_PATTERN =
  /(\*\*.+?\*\*|\*[^*\n]+\*|\d{1,2}:\d{2}\s*\/\s*(?:km|mi)|\d{2,3}\s*(?:bpm|次\/分)|\d+(?:\.\d+)?\s*(?:km|公里|K)(?![a-zA-Z]))/gi;

function isNetworkFailure(error: unknown) {
  return (
    error instanceof Error &&
    /network|internet|timed out|offline/i.test(error.message)
  );
}

function getCoachErrorPresentation(error: unknown): CoachErrorPresentation {
  if (error instanceof ApiError && error.status === 401) {
    return {
      description: 'Your session ended. Sign in again to continue the conversation.',
      primaryActionLabel: 'Sign In Again',
      requiresSignOut: true,
      title: 'Session expired',
    };
  }

  if (error instanceof ApiError && error.status >= 503) {
    return {
      description:
        'PeiPei is temporarily unavailable. Give the coach a minute and try again.',
      primaryActionLabel: 'Try Again',
      title: 'Coach unavailable',
    };
  }

  if (isNetworkFailure(error)) {
    return {
      description: 'Check your connection, then retry when you are back online.',
      primaryActionLabel: 'Try Again',
      title: 'Network error',
    };
  }

  if (error instanceof ApiError) {
    return {
      description: error.message,
      primaryActionLabel: 'Try Again',
      title: 'Unable to load coach chat',
    };
  }

  return {
    description:
      error instanceof Error
        ? error.message
        : 'The conversation could not be loaded right now.',
    primaryActionLabel: 'Try Again',
    title: 'Unable to load coach chat',
  };
}

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
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

function getDensityTier(createdAt: Date, now: Date): DensityTier {
  const diffInDays = Math.round(
    (startOfDay(now).getTime() - startOfDay(createdAt).getTime()) / 86_400_000,
  );
  const startOfWeek = startOfDay(now);
  startOfWeek.setDate(startOfWeek.getDate() - ((startOfWeek.getDay() + 6) % 7));

  if (diffInDays <= 0) {
    return 'today';
  }

  if (diffInDays === 1) {
    return 'yesterday';
  }

  if (startOfDay(createdAt) >= startOfWeek) {
    return 'this_week';
  }

  return 'older';
}

function getSequenceSpacing(tier: DensityTier, isFirstInSequence: boolean) {
  return isFirstInSequence ? 16 : 4;
}

function formatDayLabel(date: Date) {
  const now = new Date();
  const diffInDays = Math.round(
    (startOfDay(now).getTime() - startOfDay(date).getTime()) / 86_400_000,
  );
  const startOfWeek = startOfDay(now);
  startOfWeek.setDate(startOfWeek.getDate() - ((startOfWeek.getDay() + 6) % 7));

  if (diffInDays <= 0) {
    return 'TODAY';
  }

  if (diffInDays === 1) {
    return 'YDAY';
  }

  if (startOfDay(date) >= startOfWeek) {
    return date
      .toLocaleDateString('en-US', { weekday: 'short' })
      .toUpperCase();
  }

  return date
    .toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    .toUpperCase();
}

function formatMessageTimestamp(date: Date) {
  return date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  });
}

function getMessageSummary(message: CoachMessage) {
  if (message.messageType === 'social_post' && message.socialPost?.caption) {
    return message.socialPost.caption;
  }

  return message.content;
}

function stripDisplayMarkup(value: string) {
  return value
    .replace(/<tool_calls>[\s\S]*?<\/tool_calls>/gi, '')
    .replace(/<tool_call>[\s\S]*?<\/tool_call>/gi, '')
    .replace(/<\/?tool_calls\s*\/?>/gi, '')
    .replace(/<\/?tool_call\s*\/?>/gi, '')
    .replace(/^##+\s*/gm, '')
    .trim();
}

function isDataReference(value: string) {
  DATA_REFERENCE_PATTERN.lastIndex = 0;
  return DATA_REFERENCE_PATTERN.test(value);
}

function createInlineRuns(
  text: string,
  baseStyle: object,
  keyPrefix: string,
): ReactNode[] {
  return text
    .split(INLINE_TOKEN_PATTERN)
    .filter(Boolean)
    .map((part, index) => {
      const isBold = /^\*\*.+\*\*$/.test(part);
      const isItalic = !isBold && /^\*[^*\n]+\*$/.test(part);
      const cleanPart = isBold
        ? part.slice(2, -2)
        : isItalic
          ? part.slice(1, -1)
          : part;

      if (!cleanPart) {
        return null;
      }

      if (isDataReference(cleanPart)) {
        return (
          <Text key={`${keyPrefix}-data-${index}`} style={styles.dataReferenceText}>
            {cleanPart}
          </Text>
        );
      }

      if (isBold) {
        return (
          <Text
            key={`${keyPrefix}-bold-${index}`}
            style={[baseStyle, styles.inlineStrong, styles.inlineStrongText]}
          >
            {cleanPart}
          </Text>
        );
      }

      if (isItalic) {
        return (
          <Text
            key={`${keyPrefix}-italic-${index}`}
            style={[baseStyle, styles.inlineEmphasis]}
          >
            {cleanPart}
          </Text>
        );
      }

      return (
        <Text key={`${keyPrefix}-text-${index}`} style={baseStyle}>
          {cleanPart}
        </Text>
      );
    });
}

function renderMarkdown(
  text: string,
  tone: 'coach' | 'user',
): ReactNode[] {
  const cleaned = stripDisplayMarkup(text);
  const paragraphs = cleaned.split(/\n\s*\n/).filter(Boolean);
  const baseStyle =
    tone === 'coach' ? styles.coachMessageText : styles.runnerMessageText;

  return paragraphs.flatMap((paragraph, index) => {
    const trimmed = paragraph.trim();
    const isBullet = /^\*\s+/.test(trimmed);
    const content = `${isBullet ? '• ' : ''}${trimmed
      .replace(/^\*\s+/, '')
      .replace(/^##+\s*/, '')
      .split('\n')
      .map((line) => line.trim())
      .join('\n')}`;
    const segments = createInlineRuns(content, baseStyle, `paragraph-${index}`);

    if (index === 0) {
      return segments;
    }

    return [
      <Text key={`markdown-break-${index}`} style={baseStyle}>
        {'\n\n'}
      </Text>,
      ...segments,
    ];
  });
}

function splitDisplayParagraphs(text: string) {
  return stripDisplayMarkup(text)
    .split(/\n\s*\n/)
    .map((paragraph) =>
      paragraph
        .trim()
        .replace(/^##+\s*/gm, '')
        .split('\n')
        .map((line) => line.trim())
        .join('\n')
        .trim(),
    )
    .filter(Boolean);
}

function getCoachContentModel(text: string): CoachContentModel {
  const paragraphs = splitDisplayParagraphs(text);

  if (!paragraphs.length) {
    return {
      cardParagraphs: [],
      closingLine: null,
      floatingHeadline: null,
      previewText: '',
      useSemanticCards: false,
    };
  }

  const useSemanticCards = paragraphs.length >= 3;

  if (!useSemanticCards) {
    return {
      cardParagraphs: paragraphs,
      closingLine: null,
      floatingHeadline: null,
      previewText: paragraphs.join('\n\n').trim(),
      useSemanticCards: false,
    };
  }

  const cardParagraphs = [...paragraphs];
  const firstParagraph = cardParagraphs[0] ?? '';
  const floatingHeadline =
    firstParagraph.length > 0 && firstParagraph.length <= 40
      ? cardParagraphs.shift() ?? null
      : null;
  const lastParagraph = cardParagraphs[cardParagraphs.length - 1] ?? '';
  const closingLine =
    lastParagraph.length > 0 && lastParagraph.length < 25
      ? cardParagraphs.pop() ?? null
      : null;

  return {
    cardParagraphs,
    closingLine,
    floatingHeadline,
    previewText: [...cardParagraphs, closingLine].filter(Boolean).join('\n\n').trim(),
    useSemanticCards: true,
  };
}

function buildOptimisticContent(text: string, attachments: ComposerAttachment[]) {
  if (text.trim()) {
    return text.trim();
  }

  if (attachments.length === 1) {
    return attachments[0].kind === 'audio' ? 'Voice message' : 'Photo attachment';
  }

  if (attachments.length > 1) {
    return `${attachments.length} attachments`;
  }

  return '';
}

function mapAttachmentsForApi(
  attachments: ComposerAttachment[],
): ChatAttachmentInput[] {
  return (attachments ?? []).map((attachment) => ({
    name: attachment.name,
    type: attachment.mimeType,
    uri: attachment.uri,
  }));
}

function buildChatItems(
  messagesDesc: CoachMessage[],
  now: Date,
  loadingMore: boolean,
  typingIndicatorMessageId: string | null,
) {
  const items: ChatItem[] = [];

  (messagesDesc ?? []).forEach((message, index) => {
    const olderMessage = messagesDesc[index + 1];
    const densityTier = getDensityTier(new Date(message.createdAt), now);
    const isFirstInSequence =
      !olderMessage ||
      olderMessage.role !== message.role ||
      !isSameCalendarDay(message.createdAt, olderMessage.createdAt);

    if (
      typingIndicatorMessageId &&
      message.id === typingIndicatorMessageId &&
      message.content.trim().length === 0
    ) {
      items.push({
        id: 'typing-indicator',
        type: 'typing_indicator',
      });
    } else {
      items.push({
        data: message,
        densityTier,
        id: message.id,
        isFirstInSequence,
        type: 'message',
      });
    }

    if (!olderMessage || !isSameCalendarDay(message.createdAt, olderMessage.createdAt)) {
      items.push({
        date: new Date(message.createdAt),
        id: `day-${message.id}`,
        type: 'day_label',
      });
    }
  });

  if (loadingMore) {
    items.push({
      id: 'loading-shimmer',
      type: 'loading_shimmer',
    });
  }

  return items;
}

function buildSafeChatViewState({
  chatData,
  draftMessages,
  isLoadingMore,
  visibleMessageCount,
  waitingForFirstToken,
}: {
  chatData: { hasMore?: boolean; messages?: CoachMessage[] } | undefined;
  draftMessages: CoachMessage[];
  isLoadingMore: boolean;
  visibleMessageCount: number;
  waitingForFirstToken: boolean;
}) {
  try {
    const persistedMessages = Array.isArray(chatData?.messages)
      ? chatData.messages
      : [];
    const safeDraftMessages = Array.isArray(draftMessages) ? draftMessages : [];
    const mergedMessagesDesc = [...persistedMessages, ...safeDraftMessages].sort(
      (left, right) =>
        new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime(),
    );
    const visibleMessagesDesc = mergedMessagesDesc.slice(0, visibleMessageCount);
    const activeAssistantMessage =
      safeDraftMessages.find((message) => message.role === 'assistant') ?? null;
    const chatItems = buildChatItems(
      visibleMessagesDesc,
      new Date(),
      isLoadingMore,
      waitingForFirstToken ? activeAssistantMessage?.id ?? null : null,
    );

    return {
      activeAssistantMessage,
      chatItems,
      mergedMessagesDesc,
      persistedMessages,
      visibleMessagesDesc,
    };
  } catch {
    return {
      activeAssistantMessage: null,
      chatItems: [],
      mergedMessagesDesc: [],
      persistedMessages: [],
      visibleMessagesDesc: [],
    };
  }
}

function createAttachmentFromPicker(
  asset: ImagePicker.ImagePickerAsset,
): ComposerAttachment {
  const mimeType = asset.mimeType || 'image/jpeg';
  const fallbackExtension = mimeType.includes('png') ? 'png' : 'jpg';

  return {
    id: createLocalId('attachment'),
    kind: 'image',
    label: asset.fileName || 'Photo',
    mimeType,
    name:
      asset.fileName || `photo-${Date.now().toString(36)}.${fallbackExtension}`,
    uri: asset.uri,
  };
}

function normalizeMetering(metering?: number) {
  if (typeof metering !== 'number') {
    return 0.12;
  }

  return Math.max(0.12, Math.min(1, (metering + 60) / 60));
}

function delay(ms: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
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
    return {
      error,
    };
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
            <Text style={styles.errorBody}>
              Reload the conversation and try again.
            </Text>
            <Pressable
              accessibilityLabel="Reload coach screen"
              accessibilityRole="button"
              onPress={this.props.onReload}
              style={({ pressed }) => [
                styles.retryButton,
                pressed && styles.buttonPressed,
              ]}
            >
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
  const loadMoreInFlightRef = useRef(false);
  const scrollIndicatorFadeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const scrollIndicatorOpacity = useRef(new Animated.Value(0)).current;
  const scrollIndicatorY = useRef(new Animated.Value(0)).current;
  const shouldStopRecordingRef = useRef(false);
  const { width } = useWindowDimensions();
  const { sessionCookie, signOut } = useAuth();
  const recorder = useAudioRecorder({
    ...RecordingPresets.HIGH_QUALITY,
    isMeteringEnabled: true,
  });
  const recorderState = useAudioRecorderState(recorder, 120);

  const [attachments, setAttachments] = useState<ComposerAttachment[]>([]);
  const [composerError, setComposerError] = useState<CoachErrorPresentation | null>(
    null,
  );
  const [composerValue, setComposerValue] = useState('');
  const [draftMessages, setDraftMessages] = useState<CoachMessage[]>([]);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set());
  const [headerHeight, setHeaderHeight] = useState(0);
  const [inputHeight, setInputHeight] = useState(INPUT_MIN_HEIGHT);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [isRecordingStarting, setIsRecordingStarting] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [listContentHeight, setListContentHeight] = useState(1);
  const [listViewportHeight, setListViewportHeight] = useState(1);
  const [meterSamples, setMeterSamples] = useState<number[]>([]);
  const [pendingIds, setPendingIds] = useState<Set<string>>(() => new Set());
  const [replyingTo, setReplyingTo] = useState<CoachMessage | null>(null);
  const [typingStartedAt, setTypingStartedAt] = useState<number | null>(null);
  const [visibleMessageCount, setVisibleMessageCount] = useState(
    INITIAL_VISIBLE_MESSAGES,
  );
  const [waitingForFirstToken, setWaitingForFirstToken] = useState(false);

  const chatQuery = useQuery({
    queryKey: ['coach-chat'],
    queryFn: () => getCoachChat(sessionCookie ?? ''),
    enabled: Boolean(sessionCookie),
    retry: false,
  });

  const coachSidebarQuery = useQuery({
    queryKey: ['coach-sidebar'],
    queryFn: () => getCoachSidebar(sessionCookie ?? ''),
    enabled: Boolean(sessionCookie),
    retry: false,
    staleTime: 60_000,
  });

  const isTabletLayout = width >= TABLET_BREAKPOINT;
  const isRecording = recorderState.isRecording;
  const {
    activeAssistantMessage,
    chatItems,
    mergedMessagesDesc,
    persistedMessages,
  } = useMemo(
    () =>
      buildSafeChatViewState({
        chatData: chatQuery.data,
        draftMessages,
        isLoadingMore,
        visibleMessageCount,
        waitingForFirstToken,
      }),
    [
      chatQuery.data,
      draftMessages,
      isLoadingMore,
      visibleMessageCount,
      waitingForFirstToken,
    ],
  );
  const chatErrorPresentation =
    chatQuery.error && !persistedMessages.length
      ? getCoachErrorPresentation(chatQuery.error)
      : null;

  useEffect(() => {
    if (!coachSidebarQuery.data) {
      return;
    }

    const latestCoachMessage =
      mergedMessagesDesc.find(
        (message) =>
          message.role === 'assistant' && getMessageSummary(message).trim().length > 0,
      )?.content ?? 'PeiPei is ready when you are.';
    const daysToRaceLabel = coachSidebarQuery.data.goalProgress.countdown;
    const daysToRaceNumber = Number(
      daysToRaceLabel.match(/\d+/)?.[0] ?? Number.POSITIVE_INFINITY,
    );

    void syncPeiPeiWidgets({
      daysToRace: daysToRaceLabel,
      isRaceWeek: Number.isFinite(daysToRaceNumber) && daysToRaceNumber < 7,
      lastCoachMessage: latestCoachMessage.slice(0, 60),
      plannedWorkout: coachSidebarQuery.data.todayPlan.title,
      trainingStatus: coachSidebarQuery.data.todayPlan.title,
      workoutDistance: coachSidebarQuery.data.todayPlan.distance,
    });
  }, [coachSidebarQuery.data, mergedMessagesDesc]);

  useEffect(() => {
    if (isTabletLayout && isSidebarOpen) {
      setIsSidebarOpen(false);
    }
  }, [isSidebarOpen, isTabletLayout]);

  useEffect(() => {
    if (isRecording && typeof recorderState.metering === 'number') {
      setMeterSamples((current) => [
        ...current.slice(-17),
        normalizeMetering(recorderState.metering),
      ]);
      return;
    }

    if (!isRecording && !isRecordingStarting && meterSamples.length) {
      setMeterSamples([]);
    }
  }, [isRecording, isRecordingStarting, meterSamples.length, recorderState.metering]);

  useEffect(() => {
    return () => {
      if (scrollIndicatorFadeTimeoutRef.current) {
        clearTimeout(scrollIndicatorFadeTimeoutRef.current);
      }

      if (recorderState.isRecording) {
        recorder.stop().catch(() => {
          // Ignore recorder cleanup errors on screen unmount.
        });
      }
    };
  }, [recorder, recorderState.isRecording]);

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

  async function handleCopyCaption(message: CoachMessage) {
    await Clipboard.setStringAsync(getMessageSummary(message));
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }

  function runAction(action: () => Promise<void>) {
    action().catch((error: unknown) => {
      const message =
        error instanceof ApiError
          ? error.message
          : error instanceof Error
            ? error.message
            : 'The action could not be completed.';

      Alert.alert('Unable to continue', message);
    });
  }

  function handleHeaderLayout(event: LayoutChangeEvent) {
    setHeaderHeight(event.nativeEvent.layout.height);
  }

  function handleComposerContentSizeChange(
    event: NativeSyntheticEvent<TextInputContentSizeChangeEventData>,
  ) {
    const nextHeight = Math.min(
      INPUT_MAX_HEIGHT,
      Math.max(INPUT_MIN_HEIGHT, event.nativeEvent.contentSize.height + 12),
    );
    setInputHeight(nextHeight);
  }

  function handleExpand(messageId: string) {
    LayoutAnimation.spring();
    setExpandedIds((current) => {
      const next = new Set(current);
      next.add(messageId);
      return next;
    });
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }

  function handleReply(message: CoachMessage) {
    setReplyingTo(message);
    inputRef.current?.focus();
  }

  function clearReply() {
    setReplyingTo(null);
  }

  function scheduleScrollIndicatorFade() {
    if (scrollIndicatorFadeTimeoutRef.current) {
      clearTimeout(scrollIndicatorFadeTimeoutRef.current);
    }

    scrollIndicatorFadeTimeoutRef.current = setTimeout(() => {
      Animated.timing(scrollIndicatorOpacity, {
        duration: 180,
        easing: Easing.out(Easing.ease),
        toValue: 0,
        useNativeDriver: true,
      }).start();
    }, 1000);
  }

  function revealScrollIndicator() {
    scrollIndicatorOpacity.stopAnimation((value) => {
      if (value < 0.98) {
        Animated.timing(scrollIndicatorOpacity, {
          duration: 120,
          easing: Easing.out(Easing.ease),
          toValue: 1,
          useNativeDriver: true,
        }).start();
      }
    });
    scheduleScrollIndicatorFade();
  }

  const scrollableDistance = Math.max(1, listContentHeight - listViewportHeight);
  const scrollIndicatorHeight =
    listContentHeight > listViewportHeight
      ? Math.max(24, (listViewportHeight * listViewportHeight) / listContentHeight)
      : 0;
  const scrollIndicatorTravel = Math.max(0, listViewportHeight - scrollIndicatorHeight);

  async function loadOlderMessages() {
    if (loadMoreInFlightRef.current) {
      return;
    }

    if (
      visibleMessageCount >= mergedMessagesDesc.length &&
      !chatQuery.data?.hasMore
    ) {
      return;
    }

    loadMoreInFlightRef.current = true;
    setIsLoadingMore(true);
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    try {
      if (visibleMessageCount < mergedMessagesDesc.length) {
        setVisibleMessageCount((current) =>
          Math.min(current + LOAD_MORE_BATCH, mergedMessagesDesc.length),
        );
      } else {
        const result = await chatQuery.refetch();
        const nextCount = Array.isArray(result.data?.messages)
          ? result.data.messages.length
          : mergedMessagesDesc.length;
        setVisibleMessageCount((current) =>
          Math.min(current + LOAD_MORE_BATCH, nextCount),
        );
      }
    } finally {
      setTimeout(() => {
        loadMoreInFlightRef.current = false;
        setIsLoadingMore(false);
      }, 600);
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
          ? 'Camera access is required to capture a photo.'
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

    const nextAttachments = (result.assets ?? []).map(createAttachmentFromPicker);
    setAttachments((current) => [...current, ...nextAttachments]);
    setComposerError(null);
    inputRef.current?.focus();
  }

  function handleAttachmentPicker() {
    Alert.alert('Add attachment', 'Choose where the image should come from.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Take Photo', onPress: () => void pickImage('camera') },
      { text: 'Choose Photo', onPress: () => void pickImage('library') },
    ]);
  }

  function removeAttachment(attachmentId: string) {
    setAttachments((current) =>
      current.filter((attachment) => attachment.id !== attachmentId),
    );
  }

  async function submitMessage(options?: {
    attachments?: ComposerAttachment[];
    composerText?: string;
    optimisticContent?: string;
  }) {
    const composerText = options?.composerText ?? composerValue;
    const outgoingAttachments = options?.attachments ?? attachments;
    const text = composerText.trim();

    if (!sessionCookie || isStreaming || (!text && !outgoingAttachments.length)) {
      return;
    }

    const composerTextBeforeSend = composerValue;
    const attachmentsBeforeSend = attachments;
    const replyBeforeSend = replyingTo;
    const inputHeightBeforeSend = inputHeight;
    const optimisticContent =
      options?.optimisticContent ?? buildOptimisticContent(text, outgoingAttachments);
    const now = new Date();
    const userMessage: CoachMessage = {
      content: optimisticContent,
      createdAt: now.toISOString(),
      id: createLocalId('runner'),
      role: 'user',
    };
    const assistantMessage: CoachMessage = {
      content: '',
      createdAt: new Date(now.getTime() + 1).toISOString(),
      id: createLocalId('coach'),
      role: 'assistant',
    };
    const outboundMessages: ChatRequestMessage[] = [
      ...persistedMessages,
      {
        content: text,
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
    setDraftMessages([userMessage, assistantMessage]);
    setPendingIds((current) => {
      const next = new Set(current);
      next.add(userMessage.id);
      return next;
    });
    setIsStreaming(true);
    setWaitingForFirstToken(true);
    setTypingStartedAt(Date.now());
    // Let the optimistic message render before the response parser starts work.
    await delay(50);
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      const response = await openCoachChatStream(sessionCookie, {
        attachments:
          outgoingAttachments.length > 0
            ? mapAttachmentsForApi(outgoingAttachments)
            : undefined,
        contextType: 'general',
        messages: outboundMessages,
      });

      let hasReceivedFirstToken = false;

      await consumeTextStream(response, async (chunk) => {
        if (!hasReceivedFirstToken) {
          hasReceivedFirstToken = true;
          setWaitingForFirstToken(false);
          await Haptics.notificationAsync(
            Haptics.NotificationFeedbackType.Success,
          );
        }

        setDraftMessages((current) =>
          (current ?? []).map((message) =>
            message.id === assistantMessage.id
              ? {
                  ...message,
                  content: `${message.content}${chunk}`,
                }
              : message,
          ),
        );
      });

      setPendingIds((current) => {
        const next = new Set(current);
        next.delete(userMessage.id);
        return next;
      });
      setWaitingForFirstToken(false);
      setTypingStartedAt(null);
      await chatQuery.refetch();
      setDraftMessages([]);
    } catch (error) {
      setDraftMessages([]);
      setPendingIds((current) => {
        const next = new Set(current);
        next.delete(userMessage.id);
        return next;
      });
      setWaitingForFirstToken(false);
      setTypingStartedAt(null);
      setComposerValue(composerTextBeforeSend);
      setAttachments(attachmentsBeforeSend);
      setReplyingTo(replyBeforeSend);
      setInputHeight(inputHeightBeforeSend);

      const errorPresentation = getCoachErrorPresentation(error);

      if (errorPresentation.requiresSignOut) {
        Alert.alert(errorPresentation.title, errorPresentation.description);
        await signOut();
        router.replace('/login');
      } else {
        setComposerError(errorPresentation);
      }
    } finally {
      setIsStreaming(false);
    }
  }

  async function startRecording() {
    if (
      isStreaming ||
      isRecording ||
      isRecordingStarting ||
      composerValue.trim() ||
      attachments.length
    ) {
      return;
    }

    shouldStopRecordingRef.current = false;
    setComposerError(null);
    setMeterSamples([]);
    setIsRecordingStarting(true);

    try {
      const permission = await requestRecordingPermissionsAsync();

      if (!permission.granted) {
        throw new Error('Microphone access is required to record a voice message.');
      }

      await setAudioModeAsync({
        allowsRecording: true,
        interruptionMode: 'mixWithOthers',
        playsInSilentMode: true,
      });

      await recorder.prepareToRecordAsync();
      recorder.record();
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Voice recording could not be started.';

      Alert.alert('Unable to record', message);
    } finally {
      setIsRecordingStarting(false);

      if (shouldStopRecordingRef.current) {
        void stopRecording();
      }
    }
  }

  async function stopRecording() {
    shouldStopRecordingRef.current = true;

    if (!isRecording && !isRecordingStarting) {
      return;
    }

    try {
      await recorder.stop();
      await setAudioModeAsync({
        allowsRecording: false,
        interruptionMode: 'mixWithOthers',
        playsInSilentMode: true,
      });
      const uri = recorder.getStatus().url;

      if (!uri) {
        throw new Error('The recording file could not be created.');
      }

      const audioAttachment: ComposerAttachment = {
        id: createLocalId('audio'),
        kind: 'audio',
        label: 'Voice message',
        mimeType: 'audio/m4a',
        name: `voice-${Date.now().toString(36)}.m4a`,
        uri,
      };

      setMeterSamples([]);
      await submitMessage({
        attachments: [audioAttachment],
        composerText: '',
        optimisticContent: 'Voice message',
      });
    } catch (error) {
      setMeterSamples([]);

      if (
        error instanceof Error &&
        /E_AUDIO_NODATA/i.test(error.message)
      ) {
        return;
      }

      const message =
        error instanceof Error
          ? error.message
          : 'Voice recording could not be sent.';

      Alert.alert('Unable to record', message);
    }
  }

  const renderChatItem = ({ item }: { item: ChatItem }) => {
    if (item.type === 'day_label') {
      return <DayLabelRow label={formatDayLabel(item.date)} />;
    }

    if (item.type === 'typing_indicator') {
      return (
        <TypingIndicatorRow
          startedAt={typingStartedAt ?? Date.now()}
        />
      );
    }

    if (item.type === 'loading_shimmer') {
      return <LoadingShimmerRow />;
    }

    return (
      <MessageRow
        densityTier={item.densityTier}
        isExpanded={expandedIds.has(item.data.id)}
        isFirstInSequence={item.isFirstInSequence}
        isPending={pendingIds.has(item.data.id)}
        message={item.data}
        onCopyCaption={() => runAction(() => handleCopyCaption(item.data))}
        onExpand={handleExpand}
        onReply={handleReply}
        onSaveImage={() => runAction(() => handleSaveSocialImage(item.data))}
        onShareImage={() => runAction(() => handleShareSocialImage(item.data))}
      />
    );
  };

  return (
    <View style={[styles.screen, isTabletLayout && styles.tabletShell]}>
      <Stack.Screen options={{ headerShown: false }} />

      <LinearGradient
        colors={['rgba(15, 14, 12, 0.98)', 'rgba(15, 14, 12, 0)']}
        pointerEvents="none"
        style={styles.topStatusFade}
      />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={headerHeight}
        style={[styles.conversationPane, isTabletLayout && styles.tabletConversation]}
      >
        <View
          onLayout={handleHeaderLayout}
          style={[styles.header, { paddingTop: insets.top + spacing.md }]}
        >
          <LinearGradient
            colors={[
              'rgba(15, 14, 12, 0.98)',
              'rgba(15, 14, 12, 0.82)',
              'rgba(15, 14, 12, 0)',
            ]}
            pointerEvents="none"
            style={styles.headerGradient}
          />

          <View style={styles.headerContent}>
            <Pressable
              accessibilityHint="Long press to open settings."
              accessibilityLabel="PeiPei header"
              accessibilityRole="button"
              delayLongPress={280}
              onLongPress={() => {
                setIsSidebarOpen(false);
                router.push('/settings');
              }}
              style={({ pressed }) => [
                styles.headerTitleButton,
                pressed && styles.headerTitlePressed,
              ]}
            >
              <Text style={styles.headerEyebrow}>Coach</Text>
              <Text style={styles.headerTitle}>pei·pei</Text>
            </Pressable>
          </View>
        </View>

        {chatQuery.isLoading && !persistedMessages.length ? (
          <ChatLoadingState />
        ) : chatErrorPresentation ? (
          <CoachErrorStateCard
            errorPresentation={chatErrorPresentation}
            onPrimaryAction={async () => {
              if (chatErrorPresentation.requiresSignOut) {
                await signOut();
                router.replace('/login');
                return;
              }

              await chatQuery.refetch();
            }}
            onSecondaryAction={
              chatErrorPresentation.requiresSignOut
                ? undefined
                : async () => {
                    await signOut();
                    router.replace('/login');
                  }
            }
          />
        ) : (
          <>
            <View
              onLayout={(event) => {
                setListViewportHeight(event.nativeEvent.layout.height);
              }}
              style={styles.listShell}
            >
              <LinearGradient
                colors={['rgba(15, 14, 12, 0.98)', 'rgba(15, 14, 12, 0)']}
                pointerEvents="none"
                style={styles.contentTopFade}
              />

              <FlatList
                ref={listRef}
                contentContainerStyle={styles.listContent}
                data={chatItems}
                inverted
                initialNumToRender={20}
                keyboardDismissMode="interactive"
                keyboardShouldPersistTaps="handled"
                keyExtractor={(item) => item.id}
                maintainVisibleContentPosition={{
                  autoscrollToTopThreshold: 10,
                  minIndexForVisible: 1,
                }}
                maxToRenderPerBatch={10}
                onEndReached={() => {
                  void loadOlderMessages();
                }}
                onEndReachedThreshold={0.3}
                onMomentumScrollBegin={revealScrollIndicator}
                onMomentumScrollEnd={scheduleScrollIndicatorFade}
                onScroll={Animated.event(
                  [{ nativeEvent: { contentOffset: { y: scrollIndicatorY } } }],
                  {
                    listener: () => {
                      revealScrollIndicator();
                    },
                    useNativeDriver: false,
                  },
                )}
                onScrollBeginDrag={revealScrollIndicator}
                onScrollEndDrag={scheduleScrollIndicatorFade}
                onContentSizeChange={(_, height) => {
                  setListContentHeight(height);
                }}
                removeClippedSubviews
                renderItem={renderChatItem}
                scrollEventThrottle={16}
                showsVerticalScrollIndicator={false}
                style={styles.list}
                windowSize={10}
                ListEmptyComponent={
                  <View style={styles.emptyState}>
                    <Text style={styles.emptyTitle}>No coach messages yet</Text>
                    <Text style={styles.emptyBody}>
                      Start the conversation below and PeiPei will respond in real
                      time.
                    </Text>
                  </View>
                }
              />

              <LinearGradient
                colors={['rgba(15, 14, 12, 0)', 'rgba(15, 14, 12, 0.96)']}
                pointerEvents="none"
                style={styles.listEdgeGradient}
              />

              {scrollIndicatorHeight > 0 ? (
                <Animated.View
                  pointerEvents="none"
                  style={[
                    styles.scrollIndicator,
                    {
                      height: scrollIndicatorHeight,
                      opacity: scrollIndicatorOpacity,
                      transform: [
                        {
                          translateY: scrollIndicatorY.interpolate({
                            extrapolate: 'clamp',
                            inputRange: [0, scrollableDistance],
                            outputRange: [0, scrollIndicatorTravel],
                          }),
                        },
                      ],
                    },
                  ]}
                />
              ) : null}
            </View>

            <View
              style={[
                styles.composerContainer,
                {
                  paddingBottom: insets.bottom + spacing.sm,
                },
              ]}
            >
              {replyingTo ? (
                <ReplyBar
                  onClear={clearReply}
                  preview={getMessageSummary(replyingTo)}
                />
              ) : null}

              {attachments.length ? (
                <AttachmentTray
                  attachments={attachments}
                  onRemove={removeAttachment}
                />
              ) : null}

              {isRecording || isRecordingStarting ? (
                <RecordingPreview
                  isStarting={isRecordingStarting}
                  meterSamples={meterSamples}
                />
              ) : null}

              {composerError ? (
                <View style={styles.inlineErrorBanner}>
                  <Text style={styles.inlineErrorTitle}>{composerError.title}</Text>
                  <Text style={styles.inlineErrorBody}>
                    {composerError.description}
                  </Text>
                </View>
              ) : null}

              <View style={styles.inputBar}>
                <Pressable
                  accessibilityHint="Opens camera and photo library options."
                  accessibilityLabel="Add attachment"
                  accessibilityRole="button"
                  onPress={handleAttachmentPicker}
                  style={({ pressed }) => [
                    styles.attachButton,
                    pressed && styles.iconControlPressed,
                  ]}
                >
                  <Feather
                    color={colors.muted}
                    name="paperclip"
                    size={16}
                  />
                </Pressable>

                <TextInput
                  ref={inputRef}
                  accessibilityHint="Composes a message to your running coach."
                  accessibilityLabel="Message composer"
                  blurOnSubmit={false}
                  multiline
                  onChangeText={(nextValue) => {
                    setComposerError(null);
                    setComposerValue(nextValue);
                  }}
                  onContentSizeChange={handleComposerContentSizeChange}
                  placeholder=""
                  placeholderTextColor={colors.muted}
                  returnKeyType="default"
                  style={[styles.input, { height: inputHeight }]}
                  value={composerValue}
                />

                {composerValue.trim() || attachments.length > 0 ? (
                  <Pressable
                    accessibilityHint="Sends your message to PeiPei."
                    accessibilityLabel="Send message"
                    accessibilityRole="button"
                    disabled={isStreaming}
                    onPress={() => {
                      void submitMessage();
                    }}
                    style={({ pressed }) => [
                      styles.sendButton,
                      pressed && styles.buttonPressed,
                      isStreaming && styles.buttonDisabled,
                    ]}
                  >
                    {isStreaming ? (
                      <ActivityIndicator color={colors.text} size="small" />
                    ) : (
                      <Ionicons color={colors.accent} name="arrow-up" size={16} />
                    )}
                  </Pressable>
                ) : (
                  <Pressable
                    accessibilityHint="Hold to record a voice message."
                    accessibilityLabel="Record voice message"
                    accessibilityRole="button"
                    delayLongPress={220}
                    onLongPress={() => {
                      void startRecording();
                    }}
                    onPressOut={() => {
                      void stopRecording();
                    }}
                    style={({ pressed }) => [
                      styles.micButton,
                      pressed && styles.iconControlPressed,
                      (pressed || isRecording || isRecordingStarting) &&
                        styles.micButtonActive,
                    ]}
                  >
                    <Feather
                      color={colors.muted}
                      name="mic"
                      size={16}
                    />
                  </Pressable>
                )}
              </View>
            </View>
          </>
        )}
      </KeyboardAvoidingView>

      {isTabletLayout ? (
        <View style={styles.tabletSidebar}>
          <CoachDataSidebar
            bottomInset={insets.bottom}
            isOpen
            onClose={() => undefined}
            onOpen={() => undefined}
            sessionCookie={sessionCookie}
            topInset={insets.top}
            variant="docked"
          />
        </View>
      ) : (
        <CoachDataSidebar
          bottomInset={insets.bottom}
          isOpen={isSidebarOpen}
          onClose={() => setIsSidebarOpen(false)}
          onOpen={() => setIsSidebarOpen(true)}
          sessionCookie={sessionCookie}
          topInset={insets.top}
          variant="overlay"
        />
      )}
    </View>
  );
}

const DayLabelRow = memo(function DayLabelRow({ label }: { label: string }) {
  return (
    <View style={styles.dayLabelRow}>
      <Text style={styles.dayLabelText}>{label}</Text>
    </View>
  );
});

const CoachIndicator = memo(function CoachIndicator() {
  return (
    <LinearGradient
      colors={['rgba(255, 255, 255, 0.08)', 'rgba(255, 255, 255, 0.02)']}
      end={{ x: 1, y: 0.5 }}
      start={{ x: 0, y: 0.5 }}
      style={styles.coachIndicator}
    />
  );
});

const CoachMessageContent = memo(function CoachMessageContent({
  content,
  isClamped,
  timestampLabel,
}: {
  content: string;
  isClamped: boolean;
  timestampLabel: string;
}) {
  const model = useMemo(() => getCoachContentModel(content), [content]);

  if (isClamped || !model.useSemanticCards) {
    return (
      <View style={styles.messageTextContainer}>
        {model.floatingHeadline ? (
          <Text style={styles.coachFloatingHeadline}>
            {createInlineRuns(
              model.floatingHeadline,
              styles.coachFloatingHeadline,
              'coach-headline',
            )}
          </Text>
        ) : null}

        {model.previewText ? (
          <Text numberOfLines={4} style={styles.coachMessageText}>
            {renderMarkdown(model.previewText, 'coach')}
          </Text>
        ) : null}
      </View>
    );
  }

  return (
    <View style={styles.messageTextContainer}>
      {model.floatingHeadline ? (
        <Text style={styles.coachFloatingHeadline}>
          {createInlineRuns(
            model.floatingHeadline,
            styles.coachFloatingHeadline,
            'coach-headline',
          )}
        </Text>
      ) : null}

      <View style={styles.coachCardStack}>
        {model.cardParagraphs.map((paragraph, index) => {
          const isFirstCard = index === 0;
          const isLastCard = index === model.cardParagraphs.length - 1;

          return (
            <View
              key={`coach-paragraph-${index}`}
              style={[
                styles.coachMiniCard,
                isFirstCard && styles.coachMiniCardFirst,
                !isLastCard && styles.coachMiniCardSpaced,
              ]}
            >
              {isFirstCard ? (
                <Text style={styles.cardTimestampText}>{timestampLabel}</Text>
              ) : null}

              <Text
                style={[
                  styles.coachMessageText,
                  isFirstCard &&
                    !model.floatingHeadline &&
                    styles.coachLeadCardText,
                ]}
              >
                {renderMarkdown(paragraph, 'coach')}
              </Text>
            </View>
          );
        })}
      </View>

      {model.closingLine ? (
        <Text style={styles.coachPostscriptText}>
          {renderMarkdown(model.closingLine, 'coach')}
        </Text>
      ) : null}
    </View>
  );
});

const CoachMonolithicContent = memo(function CoachMonolithicContent({
  content,
  isClamped,
  onTextLayout,
}: {
  content: string;
  isClamped: boolean;
  onTextLayout?: (lineCount: number) => void;
}) {
  const maxLines = isClamped ? 6 : undefined;
  const cleaned = stripDisplayMarkup(content);
  const firstLineBreakIndex = cleaned.indexOf('\n');
  const leadLine =
    firstLineBreakIndex >= 0 ? cleaned.slice(0, firstLineBreakIndex) : cleaned;
  const remainder =
    firstLineBreakIndex >= 0 ? cleaned.slice(firstLineBreakIndex + 1).trim() : '';

  return (
    <View style={styles.messageTextContainer}>
      <View style={styles.markdownBlock}>
        <Text
          numberOfLines={maxLines}
          onTextLayout={
            !isClamped && onTextLayout
              ? (event) => {
                  onTextLayout(event.nativeEvent.lines.length);
                }
              : undefined
          }
          style={styles.coachMessageText}
        >
          <Text style={styles.coachFirstLineText}>
            {createInlineRuns(leadLine, styles.coachFirstLineText, 'coach-first-line')}
          </Text>
          {remainder ? (
            <Text style={styles.coachMessageText}>
              {'\n'}
              {renderMarkdown(remainder, 'coach')}
            </Text>
          ) : null}
        </Text>
      </View>
    </View>
  );
});

const MessageRow = memo(function MessageRow({
  densityTier,
  isExpanded,
  isFirstInSequence,
  isPending,
  message,
  onCopyCaption,
  onExpand,
  onReply,
  onSaveImage,
  onShareImage,
}: MessageRowProps) {
  const translateX = useRef(new Animated.Value(0)).current;
  const replyTriggeredRef = useRef(false);
  const entryOpacity = useRef(new Animated.Value(0)).current;
  const [measuredLineCount, setMeasuredLineCount] = useState(0);
  const isUser = message.role === 'user';
  const messageBody = getMessageSummary(message);
  const estimatedOverflow = stripDisplayMarkup(messageBody).length > 320;
  const isCollapsible =
    !isUser &&
    densityTier !== 'today' &&
    (measuredLineCount > 8 || (!measuredLineCount && estimatedOverflow));
  const shouldClamp = isCollapsible && !isExpanded;
  const rowPanResponder = useMemo(
    () =>
      createReplyPanResponder({
        message,
        onReply,
        replyTriggeredRef,
        translateX,
      }),
    [message, onReply, translateX],
  );
  const timestampLabel = formatMessageTimestamp(new Date(message.createdAt));

  useEffect(() => {
    Animated.timing(entryOpacity, {
      duration: 200,
      easing: Easing.out(Easing.ease),
      toValue: isPending ? 0.6 : 1,
      useNativeDriver: true,
    }).start();
  }, [entryOpacity, isPending]);

  return (
    <Animated.View
      style={[
        styles.messageRow,
        {
          marginTop: getSequenceSpacing(densityTier, isFirstInSequence),
          opacity: entryOpacity,
          transform: [{ translateX }],
        },
      ]}
      {...rowPanResponder.panHandlers}
    >
      {!isUser && isFirstInSequence ? (
        <View style={styles.coachSide}>
          <CoachIndicator />
        </View>
      ) : null}

      <View
        style={[
          styles.messageBodyColumn,
          isUser ? styles.runnerColumn : styles.coachColumn,
        ]}
      >
        <Pressable
          accessibilityHint={
            shouldClamp
              ? 'Double tap to expand the full message.'
              : undefined
          }
          accessibilityLabel={`${isUser ? 'Your' : 'Coach'} message. ${messageBody}`}
          accessibilityRole="button"
          onPress={() => {
            if (shouldClamp) {
              onExpand(message.id);
            }
          }}
          style={[
            styles.messageBubble,
            isUser ? styles.runnerBubble : styles.coachBubble,
            message.messageType === 'social_post' && styles.socialBubble,
          ]}
        >
          {message.messageType === 'social_post' && message.socialPost ? (
            <>
              <SocialPostCard
                caption={message.socialPost.caption}
                imageUrl={message.socialPost.imageUrl}
                onCopyCaption={onCopyCaption}
                onSaveImage={onSaveImage}
                onShareImage={onShareImage}
              />

              {!isPending ? (
                <Text style={styles.bubbleTimestampText}>
                  {timestampLabel}
                </Text>
              ) : null}
            </>
          ) : (
            <View style={styles.messageTextContainer}>
              {isUser ? (
                <View style={styles.markdownBlock}>
                  <Text
                    numberOfLines={shouldClamp ? 6 : undefined}
                    style={styles.runnerMessageText}
                  >
                    {renderMarkdown(message.content, 'user')}
                  </Text>
                </View>
              ) : (
                <CoachMonolithicContent
                  content={message.content}
                  isClamped={shouldClamp}
                  onTextLayout={(lineCount) => {
                    setMeasuredLineCount((current) =>
                      current === lineCount ? current : lineCount,
                    );
                  }}
                />
              )}

              {!isPending ? (
                <Text style={styles.bubbleTimestampText}>
                  {timestampLabel}
                </Text>
              ) : null}

              {shouldClamp ? (
                <LinearGradient
                  colors={[
                    'rgba(15, 14, 12, 0)',
                    'rgba(15, 14, 12, 0.92)',
                  ]}
                  pointerEvents="none"
                  style={styles.messageFade}
                />
              ) : null}
            </View>
          )}
        </Pressable>
      </View>
    </Animated.View>
  );
}, areMessageRowPropsEqual);

const SocialPostCard = memo(function SocialPostCard({
  caption,
  imageUrl,
  onCopyCaption,
  onSaveImage,
  onShareImage,
}: {
  caption: string;
  imageUrl: string;
  onCopyCaption: () => void;
  onSaveImage: () => void;
  onShareImage: () => void;
}) {
  return (
    <View style={styles.socialCard}>
      <Image source={{ uri: imageUrl }} style={styles.socialImage} />
      <Text style={styles.socialCaption}>{caption}</Text>
      <View style={styles.socialActions}>
        <ActionPill label="Copy Caption" onPress={onCopyCaption} />
        <ActionPill label="Save Image" onPress={onSaveImage} />
        <ActionPill label="Share" onPress={onShareImage} />
      </View>
    </View>
  );
});

function ActionPill({
  label,
  onPress,
}: {
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.socialActionButton,
        pressed && styles.buttonPressed,
      ]}
    >
      <Text style={styles.socialActionText}>{label}</Text>
    </Pressable>
  );
}

const TypingIndicatorRow = memo(function TypingIndicatorRow({
  startedAt,
}: {
  startedAt: number;
}) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setElapsed(Date.now() - startedAt);
    }, 240);

    return () => {
      clearInterval(interval);
    };
  }, [startedAt]);

  const activeCount = elapsed >= 5000 ? 3 : elapsed >= 2000 ? 2 : 1;

  return (
    <View style={[styles.messageRow, { marginTop: spacing.md }]}>
      <View style={styles.coachSide}>
        <CoachIndicator />
      </View>

      <View style={styles.messageBodyColumn}>
        <View style={[styles.messageBubble, styles.coachBubble, styles.typingBubble]}>
          <View style={styles.typingDotsRow}>
            <TypingDot delay={0} isActive={activeCount >= 1} />
            <TypingDot delay={200} isActive={activeCount >= 2} />
            <TypingDot delay={400} isActive={activeCount >= 3} />
          </View>
        </View>
      </View>
    </View>
  );
});

function TypingDot({
  delay,
  isActive,
}: {
  delay: number;
  isActive: boolean;
}) {
  const animatedValue = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(animatedValue, {
          duration: 320,
          easing: Easing.inOut(Easing.ease),
          toValue: 1,
          useNativeDriver: true,
        }),
        Animated.timing(animatedValue, {
          duration: 320,
          easing: Easing.inOut(Easing.ease),
          toValue: 0,
          useNativeDriver: true,
        }),
      ]),
    );

    animation.start();

    return () => {
      animation.stop();
    };
  }, [animatedValue, delay]);

  const scale = animatedValue.interpolate({
    inputRange: [0, 1],
    outputRange: [0.6, 1],
  });
  const opacity = animatedValue.interpolate({
    inputRange: [0, 1],
    outputRange: [0.45, 1],
  });

  return (
    <Animated.View
      style={[
        styles.typingDot,
        isActive ? styles.typingDotActive : styles.typingDotInactive,
        {
          opacity: isActive ? opacity : 0.7,
          transform: [{ scale: isActive ? scale : 0.75 }],
        },
      ]}
    />
  );
}

const LoadingShimmerRow = memo(function LoadingShimmerRow() {
  const opacity = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          duration: 1000,
          easing: Easing.inOut(Easing.ease),
          toValue: 0.8,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          duration: 1000,
          easing: Easing.inOut(Easing.ease),
          toValue: 0.3,
          useNativeDriver: true,
        }),
      ]),
    );

    animation.start();

    return () => {
      animation.stop();
    };
  }, [opacity]);

  return (
    <Animated.View style={[styles.shimmerBlock, { opacity }]}>
      <View style={styles.shimmerRow}>
        <View style={[styles.shimmerBubble, styles.shimmerCoachBubble]} />
      </View>
      <View style={styles.shimmerRow}>
        <View style={[styles.shimmerBubble, styles.shimmerRunnerBubble]} />
      </View>
      <View style={styles.shimmerRow}>
        <View style={[styles.shimmerBubble, styles.shimmerCoachBubbleShort]} />
      </View>
    </Animated.View>
  );
});

function ReplyBar({
  onClear,
  preview,
}: {
  onClear: () => void;
  preview: string;
}) {
  return (
    <View style={styles.replyBar}>
      <View style={styles.replyLine} />
      <View style={styles.replyContent}>
        <Text numberOfLines={1} style={styles.replyText}>
          {preview}
        </Text>
      </View>
      <Pressable
        accessibilityLabel="Clear reply"
        accessibilityRole="button"
        onPress={onClear}
        style={({ pressed }) => [
          styles.replyCloseButton,
          pressed && styles.buttonPressed,
        ]}
      >
        <Ionicons color={colors.muted} name="close" size={16} />
      </Pressable>
    </View>
  );
}

function AttachmentTray({
  attachments,
  onRemove,
}: {
  attachments: ComposerAttachment[];
  onRemove: (attachmentId: string) => void;
}) {
  return (
    <View style={styles.attachmentTray}>
      {(attachments ?? []).map((attachment) => (
        <View key={attachment.id} style={styles.attachmentChip}>
          <Text numberOfLines={1} style={styles.attachmentChipText}>
            {attachment.label}
          </Text>
          <Pressable
            accessibilityLabel={`Remove ${attachment.label}`}
            accessibilityRole="button"
            onPress={() => onRemove(attachment.id)}
            style={({ pressed }) => [
              styles.attachmentChipButton,
              pressed && styles.buttonPressed,
            ]}
          >
            <Ionicons color={colors.muted} name="close" size={14} />
          </Pressable>
        </View>
      ))}
    </View>
  );
}

function RecordingPreview({
  isStarting,
  meterSamples,
}: {
  isStarting: boolean;
  meterSamples: number[];
}) {
  const samples =
    Array.isArray(meterSamples) && meterSamples.length
      ? meterSamples
      : new Array(18).fill(0.16);

  return (
    <View style={styles.recordingBar}>
      <View style={styles.recordingPulse} />
      <Text style={styles.recordingText}>
        {isStarting ? 'Starting recorder…' : 'Recording voice message'}
      </Text>
      <View style={styles.waveformRow}>
        {(samples ?? []).map((sample, index) => (
          <View
            key={`${index}-${sample.toFixed(2)}`}
            style={[
              styles.waveformBar,
              {
                height: 8 + sample * 18,
              },
            ]}
          />
        ))}
      </View>
    </View>
  );
}

function ChatLoadingState() {
  return (
    <View style={styles.loadingState}>
      <ActivityIndicator color={colors.text} size="small" />
      <Text style={styles.loadingStateText}>Loading your conversation…</Text>
    </View>
  );
}

function CoachErrorStateCard({
  errorPresentation,
  onPrimaryAction,
  onSecondaryAction,
}: {
  errorPresentation: CoachErrorPresentation;
  onPrimaryAction: () => Promise<void>;
  onSecondaryAction?: () => Promise<void>;
}) {
  return (
    <View style={styles.errorState}>
      <Text style={styles.errorTitle}>{errorPresentation.title}</Text>
      <Text style={styles.errorBody}>{errorPresentation.description}</Text>
      <Pressable
        accessibilityLabel={errorPresentation.primaryActionLabel}
        accessibilityRole="button"
        onPress={() => {
          void onPrimaryAction();
        }}
        style={({ pressed }) => [
          styles.retryButton,
          pressed && styles.buttonPressed,
        ]}
      >
        <Text style={styles.retryButtonText}>
          {errorPresentation.primaryActionLabel}
        </Text>
      </Pressable>
      {onSecondaryAction ? (
        <Pressable
          accessibilityLabel="Sign out"
          accessibilityRole="button"
          onPress={() => {
            void onSecondaryAction();
          }}
          style={({ pressed }) => [
            styles.ghostButton,
            pressed && styles.buttonPressed,
          ]}
        >
          <Text style={styles.ghostButtonText}>Sign out</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function areMessageRowPropsEqual(
  previous: Readonly<MessageRowProps>,
  next: Readonly<MessageRowProps>,
) {
  return (
    previous.densityTier === next.densityTier &&
    previous.isExpanded === next.isExpanded &&
    previous.isFirstInSequence === next.isFirstInSequence &&
    previous.isPending === next.isPending &&
    previous.message.id === next.message.id &&
    previous.message.role === next.message.role &&
    previous.message.content === next.message.content &&
    previous.message.createdAt === next.message.createdAt &&
    previous.message.messageType === next.message.messageType &&
    previous.message.socialPost?.caption === next.message.socialPost?.caption &&
    previous.message.socialPost?.imageUrl === next.message.socialPost?.imageUrl
  );
}

function createReplyPanResponder({
  message,
  onReply,
  replyTriggeredRef,
  translateX,
}: {
  message: CoachMessage;
  onReply: (message: CoachMessage) => void;
  replyTriggeredRef: MutableRefObject<boolean>;
  translateX: Animated.Value;
}): PanResponderInstance {
  return PanResponder.create({
    onMoveShouldSetPanResponder: (_, gestureState) =>
      Math.abs(gestureState.dx) > 12 &&
      Math.abs(gestureState.dx) > Math.abs(gestureState.dy),
    onPanResponderGrant: () => {
      replyTriggeredRef.current = false;
    },
    onPanResponderMove: (_, gestureState) => {
      if (gestureState.dx <= 0 || Math.abs(gestureState.dy) >= Math.abs(gestureState.dx)) {
        return;
      }

      translateX.setValue(Math.min(gestureState.dx, 50));
    },
    onPanResponderRelease: async (_, gestureState) => {
      const shouldReply =
        gestureState.dx > 60 && Math.abs(gestureState.dy) < Math.abs(gestureState.dx);

      if (shouldReply && !replyTriggeredRef.current) {
        replyTriggeredRef.current = true;
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onReply(message);
        Animated.sequence([
          Animated.spring(translateX, {
            bounciness: 8,
            speed: 22,
            toValue: 50,
            useNativeDriver: true,
          }),
          Animated.spring(translateX, {
            bounciness: 8,
            speed: 22,
            toValue: 0,
            useNativeDriver: true,
          }),
        ]).start();
        return;
      }

      Animated.spring(translateX, {
        bounciness: 8,
        speed: 22,
        toValue: 0,
        useNativeDriver: true,
      }).start();
    },
    onPanResponderTerminate: () => {
      Animated.spring(translateX, {
        bounciness: 8,
        speed: 22,
        toValue: 0,
        useNativeDriver: true,
      }).start();
    },
  });
}

const styles = StyleSheet.create({
  screen: {
    backgroundColor: colors.background,
    flex: 1,
  },
  topStatusFade: {
    height: 40,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
    zIndex: 10,
  },
  tabletShell: {
    flexDirection: 'row',
  },
  conversationPane: {
    flex: 1,
  },
  tabletConversation: {
    borderRightColor: colors.border,
    borderRightWidth: StyleSheet.hairlineWidth,
  },
  tabletSidebar: {
    backgroundColor: colors.surface,
    width: 280,
  },
  header: {
    borderBottomColor: 'rgba(58,58,55,0.3)',
    borderBottomWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    paddingBottom: spacing.lg,
    paddingHorizontal: 20,
    position: 'relative',
  },
  headerGradient: {
    ...StyleSheet.absoluteFillObject,
    bottom: -24,
  },
  headerContent: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    justifyContent: 'flex-start',
  },
  headerTitleButton: {
    alignSelf: 'flex-start',
  },
  headerTitlePressed: {
    opacity: 0.92,
  },
  headerEyebrow: {
    color: colors.coachLabel,
    fontFamily: fonts.mono,
    fontSize: 11,
    letterSpacing: 0.88,
    textTransform: 'uppercase',
  },
  headerTitle: {
    color: colors.text,
    fontFamily: fonts.brand,
    fontSize: 20,
    lineHeight: 24,
    marginTop: spacing.sm,
  },
  list: {
    flex: 1,
  },
  listShell: {
    flex: 1,
    position: 'relative',
  },
  contentTopFade: {
    height: 30,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
    zIndex: 10,
  },
  listContent: {
    paddingBottom: spacing.lg,
    paddingHorizontal: 20,
    paddingTop: 8,
  },
  listEdgeGradient: {
    bottom: 0,
    height: 12,
    left: 0,
    position: 'absolute',
    right: 0,
  },
  dayLabelRow: {
    alignItems: 'center',
    marginBottom: 8,
    marginTop: 24,
  },
  dayLabelText: {
    color: colors.dim,
    fontFamily: fonts.mono,
    fontSize: 11,
    letterSpacing: 0.88,
    textAlign: 'center',
    textTransform: 'uppercase',
  },
  messageRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    position: 'relative',
    width: '100%',
  },
  coachSide: {
    alignItems: 'center',
    justifyContent: 'flex-start',
    left: 4,
    position: 'absolute',
    top: 18,
    width: 10,
    zIndex: 2,
  },
  coachIndicator: {
    borderRadius: 999,
    height: 8,
    width: 10,
  },
  messageBodyColumn: {
    flex: 1,
  },
  coachColumn: {
    alignItems: 'flex-start',
  },
  runnerColumn: {
    alignItems: 'flex-end',
  },
  messageBubble: {
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  coachBubble: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    maxWidth: '88%',
  },
  runnerBubble: {
    backgroundColor: 'rgba(255,255,255,0.02)',
    borderBottomRightRadius: 6,
    borderRadius: 16,
    maxWidth: '72%',
  },
  socialBubble: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
  },
  coachMessageText: {
    color: colors.text,
    fontFamily: fonts.coach,
    fontSize: 15,
    lineHeight: 25,
  },
  coachFirstLineText: {
    color: colors.text,
    fontFamily: fonts.coach,
    fontSize: 15,
    fontWeight: '500',
    lineHeight: 25,
  },
  runnerMessageText: {
    color: '#FFFFFF',
    fontFamily: fonts.ui,
    fontSize: 15,
    lineHeight: 25,
    textAlign: 'right',
  },
  messageTextContainer: {
    position: 'relative',
  },
  markdownBlock: {
    gap: 0,
  },
  semanticCoachBubble: {
    backgroundColor: 'transparent',
    borderWidth: 0,
    maxWidth: '88%',
    paddingHorizontal: 0,
    paddingVertical: 0,
    shadowOpacity: 0,
  },
  coachFloatingHeadline: {
    color: colors.text,
    fontFamily: fonts.coach,
    fontSize: 17,
    fontWeight: '600',
    lineHeight: 25,
    marginBottom: 12,
  },
  coachCardStack: {
    alignSelf: 'stretch',
  },
  coachMiniCard: {
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  coachMiniCardFirst: {
    borderLeftColor: 'rgba(139,58,58,0.25)',
    borderLeftWidth: 2,
    paddingRight: 52,
  },
  coachMiniCardSpaced: {
    marginBottom: 6,
  },
  cardTimestampText: {
    color: 'rgba(255,255,255,0.15)',
    fontFamily: fonts.ui,
    fontSize: 10,
    lineHeight: 12,
    position: 'absolute',
    right: 12,
    top: 10,
  },
  coachLeadCardText: {
    color: colors.text,
    fontSize: 17,
    fontWeight: '600',
    lineHeight: 26,
  },
  coachPostscriptText: {
    color: 'rgba(242,237,228,0.6)',
    fontFamily: fonts.coach,
    fontSize: 14,
    fontStyle: 'italic',
    lineHeight: 22,
    marginTop: 12,
  },
  markdownClosingGap: {
    lineHeight: 8,
  },
  inlineStrong: {
    fontWeight: '600',
  },
  inlineEmphasis: {
    fontStyle: 'italic',
  },
  inlineStrongText: {
    color: colors.text,
  },
  dataReferenceText: {
    backgroundColor: 'transparent',
    borderRadius: 0,
    color: colors.text,
    fontFamily: fonts.mono,
    fontSize: 15,
    lineHeight: 25,
    paddingHorizontal: 0,
    paddingVertical: 0,
  },
  messageFade: {
    bottom: 0,
    height: 50,
    left: 0,
    position: 'absolute',
    right: 0,
  },
  bubbleTimestampText: {
    alignSelf: 'flex-end',
    color: 'rgba(242,237,228,0.25)',
    fontFamily: fonts.ui,
    fontSize: 10,
    lineHeight: 12,
    paddingTop: 6,
  },
  typingBubble: {
    minHeight: 52,
    minWidth: 88,
  },
  typingDotsRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.xs,
  },
  typingDot: {
    borderRadius: radii.pill,
    height: 8,
    width: 8,
  },
  typingDotActive: {
    backgroundColor: colors.text,
  },
  typingDotInactive: {
    backgroundColor: 'transparent',
    borderColor: colors.muted,
    borderWidth: StyleSheet.hairlineWidth,
  },
  shimmerBlock: {
    gap: spacing.md,
    marginTop: spacing.lg,
  },
  shimmerRow: {
    width: '100%',
  },
  shimmerBubble: {
    backgroundColor: colors.surface,
    borderRadius: radii.card,
    height: 52,
  },
  shimmerCoachBubble: {
    width: '72%',
  },
  shimmerCoachBubbleShort: {
    width: '58%',
  },
  shimmerRunnerBubble: {
    alignSelf: 'flex-end',
    width: '52%',
  },
  socialCard: {
    gap: spacing.md,
  },
  socialImage: {
    backgroundColor: colors.background,
    borderRadius: radii.input,
    height: 220,
    width: '100%',
  },
  socialCaption: {
    color: colors.text,
    fontFamily: fonts.coach,
    fontSize: 15,
    lineHeight: 25,
    paddingHorizontal: spacing.sm,
  },
  socialActions: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.sm,
    paddingBottom: spacing.xs,
  },
  socialActionButton: {
    alignItems: 'center',
    backgroundColor: colors.background,
    borderColor: colors.border,
    borderRadius: radii.pill,
    borderWidth: StyleSheet.hairlineWidth,
    flex: 1,
    justifyContent: 'center',
    minHeight: 34,
    paddingHorizontal: spacing.sm,
  },
  socialActionText: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
  },
  composerContainer: {
    backgroundColor: colors.background,
    borderTopColor: colors.border,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: spacing.sm,
    paddingHorizontal: 20,
    paddingTop: spacing.md,
  },
  replyBar: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.input,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  replyLine: {
    backgroundColor: colors.accent,
    borderRadius: radii.pill,
    height: '100%',
    width: 2,
  },
  replyContent: {
    flex: 1,
  },
  replyText: {
    color: colors.text,
    fontSize: 13,
    lineHeight: 18,
  },
  replyCloseButton: {
    alignItems: 'center',
    height: 24,
    justifyContent: 'center',
    width: 24,
  },
  attachmentTray: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  attachmentChip: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.pill,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: spacing.xs,
    maxWidth: '100%',
    paddingLeft: spacing.md,
    paddingRight: spacing.sm,
    paddingVertical: spacing.xs,
  },
  attachmentChipText: {
    color: colors.text,
    fontSize: 12,
    lineHeight: 16,
    maxWidth: 180,
  },
  attachmentChipButton: {
    alignItems: 'center',
    height: 20,
    justifyContent: 'center',
    width: 20,
  },
  recordingBar: {
    alignItems: 'center',
    backgroundColor: '#2A1717',
    borderColor: '#6D3030',
    borderRadius: radii.input,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  recordingPulse: {
    backgroundColor: '#E4A0A0',
    borderRadius: radii.pill,
    height: 10,
    width: 10,
  },
  recordingText: {
    color: colors.text,
    flexShrink: 0,
    fontSize: 13,
    fontWeight: '600',
  },
  waveformRow: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    gap: 3,
    justifyContent: 'flex-end',
  },
  waveformBar: {
    backgroundColor: '#E4A0A0',
    borderRadius: radii.pill,
    width: 3,
  },
  inlineErrorBanner: {
    backgroundColor: '#2A1717',
    borderColor: '#6D3030',
    borderRadius: radii.input,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  inlineErrorTitle: {
    color: '#F1C4C4',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  inlineErrorBody: {
    color: '#D8A5A5',
    fontSize: 13,
    lineHeight: 18,
    marginTop: spacing.xs,
  },
  inputBar: {
    alignItems: 'flex-end',
    backgroundColor: colors.background,
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 0,
    paddingVertical: 2,
  },
  attachButton: {
    alignItems: 'center',
    height: 28,
    justifyContent: 'center',
    opacity: 0.4,
    width: 24,
  },
  input: {
    backgroundColor: 'transparent',
    borderRadius: 0,
    color: colors.text,
    flex: 1,
    fontSize: 15,
    lineHeight: 25,
    maxHeight: INPUT_MAX_HEIGHT,
    minHeight: INPUT_MIN_HEIGHT,
    paddingHorizontal: 0,
    paddingTop: 4,
  },
  sendButton: {
    alignItems: 'center',
    alignSelf: 'flex-end',
    height: 28,
    justifyContent: 'center',
    width: 24,
  },
  micButton: {
    alignItems: 'center',
    alignSelf: 'flex-end',
    height: 28,
    justifyContent: 'center',
    opacity: 0.4,
    width: 24,
  },
  micButtonActive: {
    opacity: 1,
  },
  iconControlPressed: {
    opacity: 0.8,
  },
  sendButtonPressed: {
    opacity: 0.9,
  },
  scrollIndicator: {
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: radii.pill,
    position: 'absolute',
    right: 4,
    top: 0,
    width: 2,
  },
  buttonPressed: {
    opacity: 0.86,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  loadingState: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    padding: spacing.xl,
  },
  loadingStateText: {
    color: colors.muted,
    marginTop: spacing.md,
  },
  errorState: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    padding: spacing.xl,
  },
  errorTitle: {
    color: colors.text,
    fontFamily: fonts.coach,
    fontSize: 28,
    lineHeight: 34,
    textAlign: 'center',
  },
  errorBody: {
    color: colors.muted,
    fontSize: 15,
    lineHeight: 22,
    marginTop: spacing.md,
    textAlign: 'center',
  },
  retryButton: {
    alignItems: 'center',
    backgroundColor: colors.accent,
    borderRadius: radii.pill,
    justifyContent: 'center',
    marginTop: spacing.xl,
    minHeight: 50,
    paddingHorizontal: spacing.xl,
  },
  retryButtonText: {
    color: colors.text,
    fontWeight: '600',
  },
  ghostButton: {
    alignItems: 'center',
    borderColor: colors.border,
    borderRadius: radii.pill,
    borderWidth: StyleSheet.hairlineWidth,
    justifyContent: 'center',
    marginTop: spacing.md,
    minHeight: 50,
    paddingHorizontal: spacing.xl,
  },
  ghostButtonText: {
    color: colors.muted,
    fontWeight: '600',
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.xxl,
  },
  emptyTitle: {
    color: colors.text,
    fontFamily: fonts.coach,
    fontSize: 26,
    lineHeight: 32,
    textAlign: 'center',
  },
  emptyBody: {
    color: colors.muted,
    fontSize: 15,
    lineHeight: 22,
    marginTop: spacing.md,
    maxWidth: 280,
    textAlign: 'center',
  },
});
