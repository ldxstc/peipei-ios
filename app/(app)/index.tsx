import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import * as Clipboard from 'expo-clipboard';
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
  memo,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
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

const HEADER_ICON_SIZE = 18;
const INITIAL_VISIBLE_MESSAGES = 40;
const INPUT_MIN_HEIGHT = 44;
const INPUT_MAX_HEIGHT = 120;
const LOAD_MORE_BATCH = 20;
const MESSAGE_MAX_WIDTH = '88%';
const TABLET_BREAKPOINT = 960;

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

function getMaxLines(tier: DensityTier) {
  if (tier === 'this_week') {
    return 2;
  }

  if (tier === 'older') {
    return 1;
  }

  return undefined;
}

function getSequenceSpacing(tier: DensityTier, isFirstInSequence: boolean) {
  if (!isFirstInSequence) {
    return spacing.xs;
  }

  switch (tier) {
    case 'today':
      return 16;
    case 'yesterday':
      return 10;
    case 'this_week':
      return 8;
    case 'older':
      return 6;
  }
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

function formatTimestamp(date: Date) {
  return date.toLocaleString('en-US', {
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    month: 'short',
  });
}

function getMessageSummary(message: CoachMessage) {
  if (message.messageType === 'social_post' && message.socialPost?.caption) {
    return message.socialPost.caption;
  }

  return message.content;
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
  return attachments.map((attachment) => ({
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

  messagesDesc.forEach((message, index) => {
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

export default function CoachScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const inputRef = useRef<TextInput>(null);
  const listRef = useRef<FlatList<ChatItem>>(null);
  const loadMoreInFlightRef = useRef(false);
  const shouldStopRecordingRef = useRef(false);
  const { width } = useWindowDimensions();
  const { sessionCookie, signOut, user } = useAuth();
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
  });

  const coachSidebarQuery = useQuery({
    queryKey: ['coach-sidebar'],
    queryFn: () => getCoachSidebar(sessionCookie ?? ''),
    enabled: Boolean(sessionCookie),
    staleTime: 60_000,
  });

  const isTabletLayout = width >= TABLET_BREAKPOINT;
  const isRecording = recorderState.isRecording;
  const persistedMessages = chatQuery.data?.messages ?? [];
  const mergedMessagesDesc = [...persistedMessages, ...draftMessages].sort(
    (left, right) =>
      new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime(),
  );
  const visibleMessagesDesc = mergedMessagesDesc.slice(0, visibleMessageCount);
  const chatItems = buildChatItems(
    visibleMessagesDesc,
    new Date(),
    isLoadingMore,
    waitingForFirstToken
      ? draftMessages.find((message) => message.role === 'assistant')?.id ?? null
      : null,
  );
  const activeAssistantMessage =
    draftMessages.find((message) => message.role === 'assistant') ?? null;
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
        const nextCount = result.data?.messages.length ?? mergedMessagesDesc.length;
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

    if (result.canceled || !result.assets.length) {
      return;
    }

    const nextAttachments = result.assets.map(createAttachmentFromPicker);
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
          current.map((message) =>
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

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={headerHeight}
        style={[styles.conversationPane, isTabletLayout && styles.tabletConversation]}
      >
        <View
          onLayout={handleHeaderLayout}
          style={[styles.header, { paddingTop: insets.top + spacing.md }]}
        >
          <View>
            <Text style={styles.headerEyebrow}>Coach</Text>
            <Text style={styles.headerTitle}>
              {user?.name ? `${user.name}'s long run` : 'Daily conversation'}
            </Text>
          </View>

          <View style={styles.headerActions}>
            {!isTabletLayout ? (
              <Pressable
                accessibilityHint="Opens the training summary panel."
                accessibilityLabel="Open training data"
                accessibilityRole="button"
                onPress={() => setIsSidebarOpen((current) => !current)}
                style={({ pressed }) => [
                  styles.iconButton,
                  pressed && styles.buttonPressed,
                ]}
              >
                <Ionicons
                  color={colors.text}
                  name="stats-chart-outline"
                  size={HEADER_ICON_SIZE}
                />
              </Pressable>
            ) : null}

            <Pressable
              accessibilityHint="Opens your profile, Garmin, billing, and account settings."
              accessibilityLabel="Open settings"
              accessibilityRole="button"
              onPress={() => {
                setIsSidebarOpen(false);
                router.push('/settings');
              }}
              style={({ pressed }) => [
                styles.iconButton,
                pressed && styles.buttonPressed,
              ]}
            >
              <Ionicons
                color={colors.text}
                name="settings-outline"
                size={HEADER_ICON_SIZE}
              />
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
              removeClippedSubviews
              renderItem={renderChatItem}
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

            <View
              style={[
                styles.composerContainer,
                {
                  paddingBottom: Math.max(insets.bottom, spacing.md),
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
                    pressed && styles.buttonPressed,
                  ]}
                >
                  <Ionicons
                    color={colors.muted}
                    name="attach-outline"
                    size={20}
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
                  placeholder="Tell PeiPei how the legs feel..."
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
                      <Ionicons color={colors.accent} name="arrow-up" size={20} />
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
                      (pressed || isRecording || isRecordingStarting) &&
                        styles.micButtonActive,
                    ]}
                  >
                    <Ionicons
                      color={
                        isRecording || isRecordingStarting
                          ? colors.text
                          : colors.muted
                      }
                      name="mic-outline"
                      size={20}
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
    <View style={styles.coachIndicator}>
      <Text style={styles.coachIndicatorText}>P</Text>
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
  const timestampOpacity = useRef(new Animated.Value(0)).current;
  const timestampTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const replyTriggeredRef = useRef(false);
  const [lineCount, setLineCount] = useState(0);
  const [isTimestampVisible, setIsTimestampVisible] = useState(false);
  const maxLines = getMaxLines(densityTier);
  const hiddenLines =
    maxLines && lineCount > maxLines ? lineCount - maxLines : 0;
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

  useEffect(() => {
    return () => {
      if (timestampTimeoutRef.current) {
        clearTimeout(timestampTimeoutRef.current);
      }
    };
  }, []);

  async function handleLongPress() {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    setIsTimestampVisible(true);

    if (timestampTimeoutRef.current) {
      clearTimeout(timestampTimeoutRef.current);
    }

    Animated.timing(timestampOpacity, {
      duration: 160,
      easing: Easing.out(Easing.ease),
      toValue: 1,
      useNativeDriver: true,
    }).start();

    timestampTimeoutRef.current = setTimeout(() => {
      Animated.timing(timestampOpacity, {
        duration: 180,
        easing: Easing.in(Easing.ease),
        toValue: 0,
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) {
          setIsTimestampVisible(false);
        }
      });
    }, 3000);
  }

  return (
    <Animated.View
      style={[
        styles.messageRow,
        {
          marginTop: getSequenceSpacing(densityTier, isFirstInSequence),
          opacity: isPending ? 0.6 : 1,
          transform: [{ translateX }],
        },
      ]}
      {...rowPanResponder.panHandlers}
    >
      {!isUser ? (
        <View style={styles.coachSide}>
          {isFirstInSequence ? <CoachIndicator /> : <View style={styles.indicatorSpacer} />}
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
            hiddenLines > 0
              ? 'Double tap to expand the full message. Long press to show the timestamp.'
              : 'Long press to show the timestamp.'
          }
          accessibilityLabel={`${isUser ? 'Your' : 'Coach'} message. ${messageBody}`}
          accessibilityRole="button"
          delayLongPress={400}
          onLongPress={() => {
            void handleLongPress();
          }}
          onPress={() => {
            if (hiddenLines > 0 && !isExpanded) {
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
            <SocialPostCard
              caption={message.socialPost.caption}
              imageUrl={message.socialPost.imageUrl}
              onCopyCaption={onCopyCaption}
              onSaveImage={onSaveImage}
              onShareImage={onShareImage}
            />
          ) : (
            <>
              <Text
                numberOfLines={isExpanded ? undefined : maxLines}
                onTextLayout={(event) => {
                  setLineCount(event.nativeEvent.lines.length);
                }}
                style={isUser ? styles.runnerMessageText : styles.coachMessageText}
              >
                {message.content}
              </Text>

              {hiddenLines > 0 && !isExpanded ? (
                <Pressable
                  accessibilityLabel={`Show ${hiddenLines} more lines`}
                  accessibilityRole="button"
                  onPress={() => {
                    onExpand(message.id);
                  }}
                  style={({ pressed }) => [
                    styles.expandHintButton,
                    pressed && styles.buttonPressed,
                  ]}
                >
                  <Text style={styles.expandHintText}>
                    → {hiddenLines} more line{hiddenLines === 1 ? '' : 's'}
                  </Text>
                </Pressable>
              ) : null}
            </>
          )}
        </Pressable>

        {!isPending && isTimestampVisible ? (
          <Animated.View
            style={[
              styles.timestampContainer,
              isUser ? styles.timestampRight : styles.timestampLeft,
              { opacity: timestampOpacity },
            ]}
          >
            <Text style={styles.timestampText}>
              {formatTimestamp(new Date(message.createdAt))}
            </Text>
          </Animated.View>
        ) : null}
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
      {attachments.map((attachment) => (
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
  const samples = meterSamples.length ? meterSamples : new Array(18).fill(0.16);

  return (
    <View style={styles.recordingBar}>
      <View style={styles.recordingPulse} />
      <Text style={styles.recordingText}>
        {isStarting ? 'Starting recorder…' : 'Recording voice message'}
      </Text>
      <View style={styles.waveformRow}>
        {samples.map((sample, index) => (
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
    alignItems: 'flex-end',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingBottom: spacing.lg,
    paddingHorizontal: spacing.lg,
  },
  headerEyebrow: {
    color: colors.muted,
    fontFamily: fonts.mono,
    fontSize: 11,
    letterSpacing: 2.2,
  },
  headerTitle: {
    color: colors.text,
    fontFamily: fonts.coach,
    fontSize: 28,
    lineHeight: 34,
    marginTop: spacing.xs,
  },
  headerActions: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
  },
  iconButton: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.pill,
    borderWidth: StyleSheet.hairlineWidth,
    height: 38,
    justifyContent: 'center',
    width: 38,
  },
  list: {
    flex: 1,
  },
  listContent: {
    paddingBottom: spacing.lg,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
  dayLabelRow: {
    alignItems: 'center',
    marginBottom: spacing.sm,
    marginTop: spacing.lg,
  },
  dayLabelText: {
    color: colors.dim,
    fontFamily: fonts.mono,
    fontSize: 11,
    letterSpacing: 1.4,
    textAlign: 'center',
  },
  messageRow: {
    flexDirection: 'row',
    width: '100%',
  },
  coachSide: {
    alignItems: 'center',
    justifyContent: 'flex-end',
    marginRight: spacing.sm,
    width: 28,
  },
  coachIndicator: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.pill,
    borderWidth: StyleSheet.hairlineWidth,
    height: 24,
    justifyContent: 'center',
    width: 24,
  },
  coachIndicatorText: {
    color: colors.text,
    fontFamily: fonts.coach,
    fontSize: 12,
    lineHeight: 14,
  },
  indicatorSpacer: {
    width: 24,
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
    borderRadius: radii.card,
    maxWidth: MESSAGE_MAX_WIDTH,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  coachBubble: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: StyleSheet.hairlineWidth,
  },
  runnerBubble: {
    backgroundColor: '#311B1B',
    borderColor: '#4A2323',
    borderWidth: StyleSheet.hairlineWidth,
  },
  socialBubble: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
  },
  coachMessageText: {
    color: colors.text,
    fontFamily: fonts.coach,
    fontSize: 15,
    lineHeight: 22,
  },
  runnerMessageText: {
    color: colors.text,
    fontFamily: fonts.ui,
    fontSize: 15,
    lineHeight: 22,
  },
  expandHintButton: {
    marginTop: spacing.sm,
  },
  expandHintText: {
    color: colors.muted,
    fontFamily: fonts.mono,
    fontSize: 11,
    letterSpacing: 0.4,
  },
  timestampContainer: {
    marginTop: spacing.xs,
  },
  timestampLeft: {
    alignSelf: 'flex-start',
  },
  timestampRight: {
    alignSelf: 'flex-end',
  },
  timestampText: {
    color: colors.muted,
    fontFamily: fonts.mono,
    fontSize: 11,
    letterSpacing: 0.3,
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
    lineHeight: 22,
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
    paddingHorizontal: spacing.lg,
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
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.card,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: spacing.sm,
    padding: spacing.sm,
  },
  attachButton: {
    alignItems: 'center',
    borderColor: colors.border,
    borderRadius: radii.pill,
    borderWidth: StyleSheet.hairlineWidth,
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  input: {
    color: colors.text,
    flex: 1,
    fontSize: 15,
    lineHeight: 20,
    maxHeight: INPUT_MAX_HEIGHT,
    minHeight: INPUT_MIN_HEIGHT,
    paddingHorizontal: spacing.xs,
    paddingTop: spacing.sm,
  },
  sendButton: {
    alignItems: 'center',
    alignSelf: 'flex-end',
    backgroundColor: '#241514',
    borderColor: '#432120',
    borderRadius: radii.pill,
    borderWidth: StyleSheet.hairlineWidth,
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  micButton: {
    alignItems: 'center',
    alignSelf: 'flex-end',
    backgroundColor: colors.background,
    borderColor: colors.border,
    borderRadius: radii.pill,
    borderWidth: StyleSheet.hairlineWidth,
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  micButtonActive: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
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
