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
  PanResponder,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type PanResponderInstance,
  type TextInputContentSizeChangeEventData,
  type ViewToken,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CoachDataSidebar } from '../../src/components/sidebar/coach-data-sidebar';
import { colors, fonts, radii, spacing } from '../../src/design/tokens';
import {
  type ChatAttachmentInput,
  type ChatRequestMessage,
  type CoachSidebarData,
  type CoachMessage,
  ApiError,
  createLocalId,
  getCoachChat,
  getCoachSidebar,
  streamCoachChat,
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
      animationDelay: number;
      data: CoachMessage;
      densityTier: DensityTier;
      id: string;
      isCascadeClosing: boolean;
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
  animationDelay: number;
  coachBubbleColor: string;
  densityTier: DensityTier;
  isCascadeClosing: boolean;
  isFirstInSequence: boolean;
  isPending: boolean;
  messageTextColor: string;
  message: CoachMessage;
  onCopyCaption: () => void;
  onReply: (message: CoachMessage) => void;
  runnerBubbleColor: string;
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
const CASCADE_TIMESTAMP_STEP_MS = 30_000;
const LOAD_MORE_BATCH = 20;
const TABLET_BREAKPOINT = 960;
const MESSAGE_ENTRY_STAGGER_MS = 800;
const MESSAGE_ENTRY_EASING = Easing.bezier(0.25, 0.1, 0.25, 1);
const COACH_CLOSING_PHRASE_RE =
  /关手机|明天见|去睡觉|晚安|good night|sleep well|rest up/i;
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
  return isFirstInSequence ? 24 : 12;
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

function formatStickyDayLabel(date: Date) {
  const now = new Date();
  const diffInDays = Math.round(
    (startOfDay(now).getTime() - startOfDay(date).getTime()) / 86_400_000,
  );

  if (diffInDays <= 0) {
    return 'Today';
  }

  if (diffInDays === 1) {
    return 'Yesterday';
  }

  return date.toLocaleDateString('en-US', {
    day: 'numeric',
    month: 'short',
  });
}

function buildSessionSummary(sidebarData: CoachSidebarData | undefined) {
  if (!sidebarData) {
    return null;
  }

  const parts = [
    sidebarData.goalProgress.title,
    sidebarData.goalProgress.countdown,
    sidebarData.goalProgress.detail,
  ]
    .map((part) => part.trim())
    .filter(Boolean);

  if (!parts.length) {
    return null;
  }

  return `🏃 ${parts.join(' · ')}`;
}

function formatMessageTimestamp(date: Date) {
  return date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  });
}

function getCascadeTimestamp(createdAt: string, paragraphIndex: number) {
  return new Date(
    new Date(createdAt).getTime() + paragraphIndex * CASCADE_TIMESTAMP_STEP_MS,
  ).toISOString();
}

function getTimeAwareUi(hour: number) {
  const neutral = {
    bodyTextColor: '#E8E8ED',
    coachBubbleColor: 'rgba(28, 28, 30, 0.85)',
    coachLabelColor: '#6E6E73',
    runnerBubbleColor: 'rgba(28, 28, 30, 0.72)',
  };

  if (hour >= 6 && hour < 12) {
    return {
      ...neutral,
      coachLabelColor: '#7D7462',
    };
  }

  if (hour >= 22 || hour < 6) {
    return {
      ...neutral,
      bodyTextColor: '#F5E6D3',
      coachBubbleColor: 'rgba(25,18,10,0.9)',
      runnerBubbleColor: 'rgba(25,18,10,0.82)',
    };
  }

  return neutral;
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
  baseStyle: object | object[],
  keyPrefix: string,
  textColor?: string,
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
          <Text
            key={`${keyPrefix}-data-${index}`}
            style={[styles.dataReferenceText, textColor ? { color: textColor } : null]}
          >
            {cleanPart}
          </Text>
        );
      }

      if (isBold) {
        return (
          <Text key={`${keyPrefix}-bold-${index}`} style={[baseStyle, styles.inlineStrong]}>
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
  textColor?: string,
): ReactNode[] {
  const cleaned = stripDisplayMarkup(text);
  const paragraphs = cleaned.split(/\n\s*\n/).filter(Boolean);
  const baseStyle = [
    tone === 'coach' ? styles.coachMessageText : styles.runnerMessageText,
    textColor ? { color: textColor } : null,
  ];

  return paragraphs.flatMap((paragraph, index) => {
    const trimmed = paragraph.trim();
    const isBullet = /^\*\s+/.test(trimmed);
    const content = `${isBullet ? '• ' : ''}${trimmed
      .replace(/^\*\s+/, '')
      .replace(/^##+\s*/, '')
      .split('\n')
      .map((line) => line.trim())
      .join('\n')}`;
    const segments = createInlineRuns(
      content,
      baseStyle,
      `paragraph-${index}`,
      textColor,
    );

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
  showTypingIndicator: boolean,
) {
  const items: ChatItem[] = [];

  if (showTypingIndicator) {
    items.push({
      id: 'typing-indicator',
      type: 'typing_indicator',
    });
  }

  (messagesDesc ?? []).forEach((message, index) => {
    const olderMessage = messagesDesc[index + 1];
    const newerMessage = messagesDesc[index - 1];
    const densityTier = getDensityTier(new Date(message.createdAt), now);
    const isFirstInSequence =
      !olderMessage ||
      olderMessage.role !== message.role ||
      !isSameCalendarDay(message.createdAt, olderMessage.createdAt);
    const isLastInSequence =
      !newerMessage ||
      newerMessage.role !== message.role ||
      !isSameCalendarDay(message.createdAt, newerMessage.createdAt);

    if (message.role === 'assistant' && message.messageType !== 'social_post') {
      const paragraphs = splitDisplayParagraphs(message.content);

      if (paragraphs.length > 1) {
        for (let paragraphIndex = paragraphs.length - 1; paragraphIndex >= 0; paragraphIndex -= 1) {
          const paragraph = paragraphs[paragraphIndex];

          if (!paragraph) {
            continue;
          }

          items.push({
            animationDelay: paragraphIndex * MESSAGE_ENTRY_STAGGER_MS,
            data: {
              ...message,
              content: paragraph,
              createdAt: getCascadeTimestamp(message.createdAt, paragraphIndex),
            },
            densityTier,
            id: `${message.id}-p${paragraphIndex}`,
            isCascadeClosing:
              paragraphIndex === paragraphs.length - 1 && paragraph.trim().length < 25,
            isFirstInSequence:
              paragraphIndex === 0 ? isFirstInSequence : false,
            type: 'message',
          });
        }
      } else {
        items.push({
          animationDelay: 0,
          data: message,
          densityTier,
          id: message.id,
          isCascadeClosing:
            isLastInSequence &&
            !isFirstInSequence &&
            message.content.trim().length < 25,
          isFirstInSequence,
          type: 'message',
        });
      }
    } else {
      items.push({
        animationDelay: 0,
        data: message,
        densityTier,
        id: message.id,
        isCascadeClosing: false,
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
    const chatItems = buildChatItems(
      visibleMessagesDesc,
      new Date(),
      isLoadingMore,
      waitingForFirstToken,
    );

    return {
      chatItems,
      mergedMessagesDesc,
      persistedMessages,
      visibleMessagesDesc,
    };
  } catch {
    return {
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
  const closingCeremonyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const loadMoreInFlightRef = useRef(false);
  const scrollIndicatorFadeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const avatarScale = useRef(new Animated.Value(1)).current;
  const avatarOpacity = useRef(new Animated.Value(0.85)).current;
  const closingCeremonyOpacity = useRef(new Animated.Value(0)).current;
  const composerBarOpacity = useRef(new Animated.Value(1)).current;
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
  const [closingCeremonyActive, setClosingCeremonyActive] = useState(false);
  const [composerError, setComposerError] = useState<CoachErrorPresentation | null>(
    null,
  );
  const [composerWakeOverride, setComposerWakeOverride] = useState(false);
  const [composerValue, setComposerValue] = useState('');
  const [currentHour, setCurrentHour] = useState(() => new Date().getHours());
  const [draftMessages, setDraftMessages] = useState<CoachMessage[]>([]);
  const [headerHeight, setHeaderHeight] = useState(0);
  const [inputHeight, setInputHeight] = useState(INPUT_MIN_HEIGHT);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [isRecordingStarting, setIsRecordingStarting] = useState(false);
  const [isSessionSummaryVisible, setIsSessionSummaryVisible] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [listContentHeight, setListContentHeight] = useState(1);
  const [listViewportHeight, setListViewportHeight] = useState(1);
  const [meterSamples, setMeterSamples] = useState<number[]>([]);
  const [pendingIds, setPendingIds] = useState<Set<string>>(() => new Set());
  const [replyingTo, setReplyingTo] = useState<CoachMessage | null>(null);
  const [stickyDayLabel, setStickyDayLabel] = useState(() =>
    formatStickyDayLabel(new Date()),
  );
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
  const viewabilityConfig = useRef({
    itemVisiblePercentThreshold: 25,
  }).current;
  const onViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      const sortedItems = [...viewableItems].sort(
        (left, right) => (left.index ?? 0) - (right.index ?? 0),
      );
      const anchorItem = sortedItems
        .reverse()
        .map((entry) => entry.item as ChatItem)
        .find((item) => item.type === 'day_label' || item.type === 'message');

      if (!anchorItem) {
        return;
      }

      if (anchorItem.type === 'day_label') {
        setStickyDayLabel(formatStickyDayLabel(anchorItem.date));
        return;
      }

      if (anchorItem.type === 'message') {
        setStickyDayLabel(formatStickyDayLabel(new Date(anchorItem.data.createdAt)));
      }
    },
  ).current;
  const shouldShowSessionSummary =
    listContentHeight <= listViewportHeight + 1 ? true : isSessionSummaryVisible;
  const sessionSummary = useMemo(
    () => buildSessionSummary(coachSidebarQuery.data),
    [coachSidebarQuery.data],
  );
  const visibleSessionSummary = sessionSummary || '🏃 Week 5 · Boston 29 days';
  const {
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
  const lastCoachMessage =
    mergedMessagesDesc.find(
      (message) =>
        message.role === 'assistant' && getMessageSummary(message).trim().length > 0,
    )?.content ?? '';
  const shouldRestComposer =
    COACH_CLOSING_PHRASE_RE.test(stripDisplayMarkup(lastCoachMessage));
  const isComposerResting = shouldRestComposer && !composerWakeOverride;
  const timeAwareUi = useMemo(() => getTimeAwareUi(currentHour), [currentHour]);
  const chatErrorPresentation =
    chatQuery.error && !persistedMessages.length
      ? getCoachErrorPresentation(chatQuery.error)
      : null;

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentHour(new Date().getHours());
    }, 60_000);

    return () => {
      clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    if (!coachSidebarQuery.data) {
      return;
    }

    const daysToRaceLabel = coachSidebarQuery.data.goalProgress.countdown;
    const daysToRaceNumber = Number(
      daysToRaceLabel.match(/\d+/)?.[0] ?? Number.POSITIVE_INFINITY,
    );

    void syncPeiPeiWidgets({
      daysToRace: daysToRaceLabel,
      isRaceWeek: Number.isFinite(daysToRaceNumber) && daysToRaceNumber < 7,
      lastCoachMessage: lastCoachMessage.slice(0, 60) || 'PeiPei is ready when you are.',
      plannedWorkout: coachSidebarQuery.data.todayPlan.title,
      trainingStatus: coachSidebarQuery.data.todayPlan.title,
      workoutDistance: coachSidebarQuery.data.todayPlan.distance,
    });
  }, [coachSidebarQuery.data, lastCoachMessage]);

  useEffect(() => {
    setComposerWakeOverride(false);
  }, [lastCoachMessage]);

  useEffect(() => {
    if (!isComposerResting) {
      if (closingCeremonyTimeoutRef.current) {
        clearTimeout(closingCeremonyTimeoutRef.current);
      }

      setClosingCeremonyActive(false);
      closingCeremonyOpacity.setValue(0);
      Animated.timing(composerBarOpacity, {
        duration: 180,
        easing: Easing.out(Easing.ease),
        toValue: 1,
        useNativeDriver: true,
      }).start();
      return;
    }

    if (closingCeremonyTimeoutRef.current) {
      clearTimeout(closingCeremonyTimeoutRef.current);
    }

    closingCeremonyTimeoutRef.current = setTimeout(() => {
      Animated.timing(composerBarOpacity, {
        duration: 1500,
        easing: Easing.out(Easing.ease),
        toValue: 0.2,
        useNativeDriver: true,
      }).start();

      setClosingCeremonyActive(true);
      Animated.timing(closingCeremonyOpacity, {
        duration: 1000,
        easing: Easing.out(Easing.ease),
        toValue: 1,
        useNativeDriver: true,
      }).start();

      setTimeout(() => {
        listRef.current?.scrollToOffset({
          animated: true,
          offset: 20,
        });
      }, 120);
    }, 1000);

    return () => {
      if (closingCeremonyTimeoutRef.current) {
        clearTimeout(closingCeremonyTimeoutRef.current);
      }
    };
  }, [closingCeremonyOpacity, composerBarOpacity, isComposerResting]);

  useEffect(() => {
    Animated.timing(avatarOpacity, {
      duration: 220,
      easing: Easing.out(Easing.ease),
      toValue: isStreaming ? 1 : 0.85,
      useNativeDriver: true,
    }).start();

    avatarScale.setValue(1);

    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(avatarScale, {
          duration: isStreaming ? 750 : 1250,
          easing: Easing.inOut(Easing.ease),
          toValue: isStreaming ? 1.2 : 1.12,
          useNativeDriver: true,
        }),
        Animated.timing(avatarScale, {
          duration: isStreaming ? 750 : 1250,
          easing: Easing.inOut(Easing.ease),
          toValue: 1,
          useNativeDriver: true,
        }),
      ]),
    );

    pulse.start();

    return () => {
      pulse.stop();
    };
  }, [avatarOpacity, avatarScale, isStreaming]);

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
      if (closingCeremonyTimeoutRef.current) {
        clearTimeout(closingCeremonyTimeoutRef.current);
      }

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

  function wakeComposer() {
    if (!isComposerResting) {
      return;
    }

    composerBarOpacity.stopAnimation();
    composerBarOpacity.setValue(1);
    closingCeremonyOpacity.stopAnimation();
    closingCeremonyOpacity.setValue(0);
    setClosingCeremonyActive(false);
    setComposerWakeOverride(true);
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
    setDraftMessages([userMessage]);
    setPendingIds((current) => {
      const next = new Set(current);
      next.add(userMessage.id);
      return next;
    });
    setIsStreaming(true);
    setWaitingForFirstToken(true);
    setTypingStartedAt(Date.now());
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      let paragraphBuffer = '';
      let paragraphIndex = 0;
      let hasDeliveredParagraph = false;

      const appendAssistantParagraph = async (paragraph: string) => {
        const trimmed = paragraph.trim();

        if (!trimmed) {
          return;
        }

        if (hasDeliveredParagraph) {
          setWaitingForFirstToken(true);
          setTypingStartedAt(Date.now());
          await delay(400);
        } else {
          setWaitingForFirstToken(false);
          await Haptics.notificationAsync(
            Haptics.NotificationFeedbackType.Success,
          );
        }

        const nextAssistantMessage: CoachMessage = {
          content: trimmed,
          createdAt: new Date(
            now.getTime() + paragraphIndex * CASCADE_TIMESTAMP_STEP_MS,
          ).toISOString(),
          id: createLocalId('coach'),
          role: 'assistant',
        };

        paragraphIndex += 1;
        hasDeliveredParagraph = true;
        setDraftMessages((current) => [...(current ?? []), nextAssistantMessage]);
        setWaitingForFirstToken(false);
        setTypingStartedAt(null);
      };

      const flushParagraphs = async (finalChunk: boolean) => {
        const normalizedBuffer = paragraphBuffer.replace(/\r\n/g, '\n');
        const segments = normalizedBuffer.split(/\n\s*\n/);
        const completeParagraphs = finalChunk ? segments : segments.slice(0, -1);

        paragraphBuffer = finalChunk ? '' : segments.at(-1) ?? '';

        for (const paragraph of completeParagraphs) {
          await appendAssistantParagraph(paragraph);
        }
      };

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
          paragraphBuffer += chunk;
          await flushParagraphs(false);
        },
      );

      await flushParagraphs(true);

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
          bubbleColor={timeAwareUi.coachBubbleColor}
          startedAt={typingStartedAt ?? Date.now()}
        />
      );
    }

    if (item.type === 'loading_shimmer') {
      return <LoadingShimmerRow />;
    }

    return (
      <MessageRow
        animationDelay={item.animationDelay}
        coachBubbleColor={timeAwareUi.coachBubbleColor}
        densityTier={item.densityTier}
        isCascadeClosing={item.isCascadeClosing}
        isFirstInSequence={item.isFirstInSequence}
        isPending={pendingIds.has(item.data.id)}
        messageTextColor={timeAwareUi.bodyTextColor}
        message={item.data}
        onCopyCaption={() => runAction(() => handleCopyCaption(item.data))}
        onReply={handleReply}
        runnerBubbleColor={timeAwareUi.runnerBubbleColor}
        onSaveImage={() => runAction(() => handleSaveSocialImage(item.data))}
        onShareImage={() => runAction(() => handleShareSocialImage(item.data))}
      />
    );
  };

  return (
    <View style={[styles.screen, isTabletLayout && styles.tabletShell]}>
      <Stack.Screen options={{ headerShown: false }} />

      <LinearGradient
        colors={['rgba(0, 0, 0, 1)', 'rgba(0, 0, 0, 0)']}
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
          style={[
            styles.header,
            {
              minHeight: insets.top + 88,
              paddingTop: insets.top + 14,
            },
          ]}
        >
          <LinearGradient
            colors={[
              'rgba(0, 0, 0, 1)',
              'rgba(0, 0, 0, 0.94)',
              'rgba(0, 0, 0, 0)',
            ]}
            pointerEvents="none"
            style={styles.headerGradient}
          />

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
              styles.headerContent,
              pressed && styles.headerTitlePressed,
            ]}
          >
            <Animated.View
              style={[
                styles.headerAvatar,
                {
                  backgroundColor: isStreaming ? '#42D965' : '#2BB84D',
                  opacity: avatarOpacity,
                  transform: [{ scale: avatarScale }],
                },
              ]}
            >
              <Text style={styles.headerAvatarText}>P</Text>
            </Animated.View>

            <View style={styles.headerTitleBlock}>
              <Text style={[styles.headerEyebrow, { color: timeAwareUi.coachLabelColor }]}>
                COACH
              </Text>
              <Text style={styles.headerTitle}>pei·pei</Text>
            </View>
          </Pressable>

          <View style={styles.headerDivider} />
        </View>

        <Animated.View
          pointerEvents="none"
          style={[
            styles.stickyDateContainer,
            {
              opacity: scrollIndicatorOpacity,
              top: headerHeight + 8,
            },
          ]}
        >
          <View style={styles.stickyDatePill}>
            <Text style={styles.stickyDatePillText}>{stickyDayLabel}</Text>
          </View>
        </Animated.View>

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
                colors={['rgba(0, 0, 0, 1)', 'rgba(0, 0, 0, 0)']}
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
                    listener: (event: NativeSyntheticEvent<NativeScrollEvent>) => {
                      const nextOffset = event.nativeEvent.contentOffset.y;
                      const nextScrollableDistance = Math.max(
                        1,
                        listContentHeight - listViewportHeight,
                      );
                      const nextVisible =
                        nextScrollableDistance <= 1 ||
                        nextScrollableDistance - nextOffset <= 2;

                      setIsSessionSummaryVisible((current) =>
                        current === nextVisible ? current : nextVisible,
                      );
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
                onViewableItemsChanged={onViewableItemsChanged}
                removeClippedSubviews
                renderItem={renderChatItem}
                scrollEventThrottle={16}
                showsVerticalScrollIndicator={false}
                style={styles.list}
                viewabilityConfig={viewabilityConfig}
                windowSize={10}
                ListFooterComponent={
                  <SessionContinuitySlot
                    summary={visibleSessionSummary}
                    visible={shouldShowSessionSummary}
                  />
                }
                ListHeaderComponent={
                  closingCeremonyActive ? (
                    <ClosingCeremonyRow opacity={closingCeremonyOpacity} />
                  ) : null
                }
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
                colors={['rgba(0, 0, 0, 0)', 'rgba(0, 0, 0, 1)']}
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

              <Animated.View style={[styles.inputBar, { opacity: composerBarOpacity }]}>
                <Pressable
                  accessibilityHint="Opens camera and photo library options."
                  accessibilityLabel="Add attachment"
                  accessibilityRole="button"
                  onPress={handleAttachmentPicker}
                  style={({ pressed }) => [
                    styles.attachButton,
                    isComposerResting && styles.inputAccessoryResting,
                    pressed && styles.iconControlPressed,
                  ]}
                >
                  <Feather
                    color="#636366"
                    name="paperclip"
                    size={24}
                    strokeWidth={1.5}
                  />
                </Pressable>

                <TextInput
                  ref={inputRef}
                  accessibilityHint="Composes a message to your running coach."
                  accessibilityLabel="Message composer"
                  blurOnSubmit={false}
                  multiline
                  onFocus={wakeComposer}
                  onChangeText={(nextValue) => {
                    setComposerError(null);
                    setComposerValue(nextValue);
                  }}
                  onContentSizeChange={handleComposerContentSizeChange}
                  placeholder={
                    isComposerResting ? '💤 Coach says rest...' : 'Message pei·pei...'
                  }
                  placeholderTextColor="#48484A"
                  returnKeyType="default"
                  style={[
                    styles.input,
                    isComposerResting && styles.inputResting,
                    { height: inputHeight },
                  ]}
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
                      isComposerResting && styles.inputAccessoryResting,
                      pressed && styles.buttonPressed,
                      isStreaming && styles.buttonDisabled,
                    ]}
                  >
                    {isStreaming ? (
                      <ActivityIndicator color={colors.text} size="small" />
                    ) : (
                      <Feather
                        color="#636366"
                        name="arrow-up"
                        size={24}
                        strokeWidth={1.5}
                      />
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
                      isComposerResting && styles.inputAccessoryResting,
                      pressed && styles.iconControlPressed,
                      (pressed || isRecording || isRecordingStarting) &&
                        styles.micButtonActive,
                    ]}
                  >
                    <Feather
                      color="#636366"
                      name="mic"
                      size={24}
                      strokeWidth={1.5}
                    />
                  </Pressable>
                )}
              </Animated.View>
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

const SessionContinuityRow = memo(function SessionContinuityRow({
  summary,
}: {
  summary: string;
}) {
  return (
    <View style={styles.sessionSummaryRow}>
      <Text style={styles.sessionSummaryText}>{summary}</Text>
    </View>
  );
});

const SessionContinuitySlot = memo(function SessionContinuitySlot({
  summary,
  visible,
}: {
  summary: string;
  visible: boolean;
}) {
  return visible ? (
    <SessionContinuityRow summary={summary} />
  ) : (
    <View style={styles.sessionSummarySpacer} />
  );
});

const ClosingCeremonyRow = memo(function ClosingCeremonyRow({
  opacity,
}: {
  opacity: Animated.Value;
}) {
  return (
    <Animated.View style={[styles.closingCeremonyRow, { opacity }]}>
      <Text style={styles.closingCeremonyText}>— 教练已离线 · 明天继续 —</Text>
    </Animated.View>
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

const MessageRow = memo(function MessageRow({
  animationDelay,
  coachBubbleColor,
  densityTier,
  isCascadeClosing,
  isFirstInSequence,
  isPending,
  messageTextColor,
  message,
  onCopyCaption,
  onReply,
  runnerBubbleColor,
  onSaveImage,
  onShareImage,
}: MessageRowProps) {
  const translateX = useRef(new Animated.Value(0)).current;
  const replyTriggeredRef = useRef(false);
  const entryOpacity = useRef(new Animated.Value(0)).current;
  const entryTranslateY = useRef(new Animated.Value(20)).current;
  const isUser = message.role === 'user';
  const messageBody = getMessageSummary(message);
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
    Animated.parallel([
      Animated.timing(entryOpacity, {
        delay: animationDelay,
        duration: 350,
        easing: MESSAGE_ENTRY_EASING,
        toValue: isPending ? 0.6 : 1,
        useNativeDriver: true,
      }),
      Animated.timing(entryTranslateY, {
        delay: animationDelay,
        duration: 350,
        easing: MESSAGE_ENTRY_EASING,
        toValue: 0,
        useNativeDriver: true,
      }),
    ]).start();
  }, [animationDelay, entryOpacity, entryTranslateY, isPending]);

  return (
    <Animated.View
      style={[
        styles.messageRow,
        {
          marginTop: getSequenceSpacing(densityTier, isFirstInSequence),
          opacity: entryOpacity,
          transform: [{ translateX }, { translateY: entryTranslateY }],
        },
      ]}
      {...rowPanResponder.panHandlers}
    >
      <View
        style={[
          styles.messageBodyColumn,
          isUser ? styles.runnerColumn : styles.coachColumn,
        ]}
      >
        <Pressable
          accessibilityLabel={`${isUser ? 'Your' : 'Coach'} message. ${messageBody}`}
          accessibilityRole="button"
          delayLongPress={400}
          onLongPress={() => {
            void onCopyCaption();
          }}
          style={[
            styles.messageBubble,
            isUser ? styles.runnerBubble : styles.coachBubble,
            {
              backgroundColor: isUser ? runnerBubbleColor : coachBubbleColor,
            },
            !isUser && isCascadeClosing && styles.closingBubbleAccent,
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
              <View style={styles.markdownBlock}>
                <Text
                  style={[
                    isUser
                      ? [styles.runnerMessageText, { color: messageTextColor }]
                      : [styles.coachMessageText, { color: messageTextColor }],
                    !isUser && isCascadeClosing && styles.coachClosingMessageText,
                  ]}
                >
                  {renderMarkdown(
                    message.content,
                    isUser ? 'user' : 'coach',
                    messageTextColor,
                  )}
                </Text>
              </View>

              {!isPending ? (
                <Text style={styles.bubbleTimestampText}>
                  {timestampLabel}
                </Text>
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
  bubbleColor,
  startedAt,
}: {
  bubbleColor: string;
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
      <View style={styles.messageBodyColumn}>
        <View
          style={[
            styles.messageBubble,
            styles.coachBubble,
            styles.typingBubble,
            { backgroundColor: bubbleColor },
          ]}
        >
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
    previous.animationDelay === next.animationDelay &&
    previous.coachBubbleColor === next.coachBubbleColor &&
    previous.densityTier === next.densityTier &&
    previous.isCascadeClosing === next.isCascadeClosing &&
    previous.isFirstInSequence === next.isFirstInSequence &&
    previous.isPending === next.isPending &&
    previous.messageTextColor === next.messageTextColor &&
    previous.message.id === next.message.id &&
    previous.message.role === next.message.role &&
    previous.message.content === next.message.content &&
    previous.message.createdAt === next.message.createdAt &&
    previous.message.messageType === next.message.messageType &&
    previous.runnerBubbleColor === next.runnerBubbleColor &&
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
    overflow: 'hidden',
    paddingBottom: 12,
    paddingHorizontal: 20,
    position: 'relative',
  },
  headerGradient: {
    ...StyleSheet.absoluteFillObject,
    bottom: -24,
  },
  headerContent: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'flex-start',
  },
  headerAvatar: {
    alignItems: 'center',
    backgroundColor: '#2BB84D',
    borderRadius: 18,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  headerAvatarText: {
    color: '#F5F5F7',
    fontFamily: fonts.ui,
    fontSize: 15,
    fontWeight: '500',
  },
  headerTitlePressed: {
    opacity: 0.92,
  },
  headerTitleBlock: {
    marginLeft: 12,
  },
  headerEyebrow: {
    color: '#6E6E73',
    fontFamily: fonts.ui,
    fontSize: 11,
    fontWeight: '500',
    letterSpacing: 1.8,
  },
  headerTitle: {
    color: '#F5F5F7',
    fontFamily: fonts.brand,
    fontSize: 28,
    fontWeight: '600',
    lineHeight: 32,
    marginTop: 4,
  },
  headerDivider: {
    backgroundColor: '#38383A',
    height: StyleSheet.hairlineWidth,
    marginTop: 12,
    width: '100%',
  },
  stickyDateContainer: {
    alignItems: 'center',
    left: 0,
    position: 'absolute',
    right: 0,
    zIndex: 11,
  },
  stickyDatePill: {
    alignItems: 'center',
    backgroundColor: 'rgba(44, 44, 46, 0.9)',
    borderRadius: 14,
    height: 28,
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  stickyDatePillText: {
    color: '#8E8E93',
    fontFamily: fonts.ui,
    fontSize: 12,
    fontWeight: '600',
  },
  list: {
    flex: 1,
  },
  listShell: {
    flex: 1,
    position: 'relative',
  },
  contentTopFade: {
    height: 40,
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
  sessionSummaryRow: {
    alignItems: 'center',
    alignSelf: 'stretch',
    backgroundColor: '#1C1C1E',
    borderBottomColor: '#2C2C2E',
    borderBottomWidth: StyleSheet.hairlineWidth,
    justifyContent: 'center',
    marginTop: 24,
    minHeight: 42,
    paddingVertical: 10,
  },
  sessionSummarySpacer: {
    marginTop: 24,
    minHeight: 42,
  },
  sessionSummaryText: {
    color: '#48484A',
    fontFamily: fonts.ui,
    fontSize: 11,
    textAlign: 'center',
  },
  closingCeremonyRow: {
    alignItems: 'center',
    marginTop: 24,
    paddingBottom: 12,
  },
  closingCeremonyText: {
    color: '#48484A',
    fontFamily: fonts.ui,
    fontSize: 12,
    textAlign: 'center',
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
    paddingBottom: 28,
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  coachBubble: {
    backgroundColor: 'rgba(28, 28, 30, 0.85)',
    maxWidth: '82%',
    overflow: 'hidden',
  },
  runnerBubble: {
    backgroundColor: 'rgba(28, 28, 30, 0.72)',
    borderRadius: 16,
    maxWidth: '82%',
    overflow: 'hidden',
  },
  closingBubbleAccent: {
    borderLeftColor: '#2BB84D',
    borderLeftWidth: 3,
  },
  socialBubble: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
  },
  coachMessageText: {
    color: '#E8E8ED',
    fontFamily: fonts.coach,
    fontSize: 16.5,
    lineHeight: 24,
  },
  coachClosingMessageText: {
    color: 'rgba(232,232,237,0.7)',
    fontStyle: 'italic',
  },
  coachFirstLineText: {
    color: colors.text,
    fontFamily: fonts.coach,
    fontSize: 15,
    fontWeight: '500',
    lineHeight: 25,
  },
  runnerMessageText: {
    color: '#E8E8ED',
    fontFamily: fonts.ui,
    fontSize: 16.5,
    lineHeight: 24,
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
    color: '#E8E8ED',
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
    color: '#E8E8ED',
    fontFamily: fonts.mono,
    fontSize: 16.5,
    lineHeight: 24,
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
    color: '#48484A',
    fontFamily: fonts.ui,
    fontSize: 11,
    lineHeight: 13,
    position: 'absolute',
    right: 0,
    bottom: -12,
    textAlign: 'right',
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
    backgroundColor: '#000000',
    gap: spacing.sm,
    minHeight: 78,
    paddingHorizontal: 16,
    paddingTop: 10,
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
    alignItems: 'center',
    backgroundColor: '#000000',
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 0,
    paddingVertical: 6,
  },
  attachButton: {
    alignItems: 'center',
    height: 24,
    justifyContent: 'center',
    opacity: 1,
    width: 24,
  },
  input: {
    backgroundColor: '#2C2C2E',
    borderColor: 'transparent',
    borderRadius: 22,
    borderWidth: 0,
    color: '#E8E8ED',
    flex: 1,
    fontSize: 15,
    lineHeight: 20,
    maxHeight: INPUT_MAX_HEIGHT,
    minHeight: INPUT_MIN_HEIGHT,
    paddingBottom: 12,
    paddingHorizontal: 16,
    paddingTop: 12,
    textAlignVertical: 'center',
  },
  inputResting: {
    fontStyle: 'italic',
  },
  sendButton: {
    alignItems: 'center',
    alignSelf: 'center',
    height: 24,
    justifyContent: 'center',
    width: 24,
  },
  micButton: {
    alignItems: 'center',
    alignSelf: 'center',
    height: 24,
    justifyContent: 'center',
    opacity: 1,
    width: 24,
  },
  micButtonActive: {
    opacity: 1,
  },
  inputAccessoryResting: {
    opacity: 0.2,
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
