import { useQuery } from '@tanstack/react-query';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import { Stack } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, fonts, radii, spacing } from '../../src/design/tokens';
import {
  type CoachMessage,
  ApiError,
  consumeTextStream,
  createLocalId,
  getCoachChat,
  openCoachChatStream,
} from '../../src/lib/api';
import { useAuth } from '../../src/providers/auth-provider';

type DensityConfig = {
  numberOfLines?: number;
  spacing: number;
};

const MESSAGE_MAX_WIDTH = '82%';

export default function CoachScreen() {
  const insets = useSafeAreaInsets();
  const { sessionCookie, signOut, user } = useAuth();
  const [composerValue, setComposerValue] = useState('');
  const [expandedMessageIds, setExpandedMessageIds] = useState<
    Record<string, true>
  >({});
  const [isStreaming, setIsStreaming] = useState(false);
  const [transientMessages, setTransientMessages] = useState<CoachMessage[] | null>(
    null,
  );
  const [waitingForFirstToken, setWaitingForFirstToken] = useState(false);

  const chatQuery = useQuery({
    queryKey: ['coach-chat'],
    queryFn: () => getCoachChat(sessionCookie ?? ''),
    enabled: Boolean(sessionCookie),
  });

  const baseMessages = chatQuery.data?.messages ?? [];
  const conversation = transientMessages ?? baseMessages;
  const displayMessages = [...conversation].sort(
    (left, right) =>
      new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime(),
  );

  async function handleCopy(message: CoachMessage) {
    await Clipboard.setStringAsync(message.content);
    await Haptics.selectionAsync();
  }

  async function handleAttachment() {
    const launchPicker = async (mode: 'camera' | 'library') => {
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
              quality: 0.8,
            })
          : await ImagePicker.launchImageLibraryAsync({
              allowsEditing: false,
              mediaTypes: ['images'],
              quality: 0.8,
            });

      if (!result.canceled) {
        Alert.alert(
          'Photo selected',
          'Camera and library access are wired up, but the current coach API only accepts text messages in Phase 1.',
        );
      }
    };

    Alert.alert('Add attachment', 'Choose where the image should come from.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Camera', onPress: () => void launchPicker('camera') },
      { text: 'Photo Library', onPress: () => void launchPicker('library') },
    ]);
  }

  async function handleSend() {
    const trimmed = composerValue.trim();

    if (!trimmed || !sessionCookie || isStreaming) {
      return;
    }

    const draft = composerValue;
    const now = new Date().toISOString();
    const userMessage: CoachMessage = {
      id: createLocalId('user'),
      role: 'user',
      content: trimmed,
      createdAt: now,
    };
    const assistantMessage: CoachMessage = {
      id: createLocalId('assistant'),
      role: 'assistant',
      content: '',
      createdAt: now,
    };
    const outboundMessages = [...baseMessages, userMessage].map((message) => ({
      id: message.id,
      role: message.role,
      content: message.content,
      createdAt: message.createdAt,
    }));

    setComposerValue('');
    setTransientMessages([...baseMessages, userMessage, assistantMessage]);
    setIsStreaming(true);
    setWaitingForFirstToken(true);
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    try {
      const response = await openCoachChatStream(sessionCookie, {
        messages: outboundMessages,
        contextType: 'general',
      });

      let receivedFirstChunk = false;

      await consumeTextStream(response, async (chunk) => {
        if (!receivedFirstChunk) {
          receivedFirstChunk = true;
          setWaitingForFirstToken(false);
          await Haptics.selectionAsync();
        }

        setTransientMessages((current) =>
          current
            ? current.map((message) =>
                message.id === assistantMessage.id
                  ? {
                      ...message,
                      content: `${message.content}${chunk}`,
                    }
                  : message,
              )
            : current,
        );
      });

      setWaitingForFirstToken(false);
      await chatQuery.refetch();
      setTransientMessages(null);
    } catch (error) {
      setComposerValue(draft);
      setTransientMessages(null);
      setWaitingForFirstToken(false);

      const message =
        error instanceof ApiError
          ? error.message
          : error instanceof Error
            ? error.message
            : 'The message could not be delivered.';

      Alert.alert('Unable to send', message);
    } finally {
      setIsStreaming(false);
    }
  }

  function toggleExpanded(messageId: string) {
    setExpandedMessageIds((current) => {
      if (current[messageId]) {
        const next = { ...current };
        delete next[messageId];
        return next;
      }

      return {
        ...current,
        [messageId]: true,
      };
    });
  }

  if (chatQuery.isLoading) {
    return (
      <View style={styles.centered}>
        <Stack.Screen options={{ headerShown: false }} />
        <ActivityIndicator color={colors.text} size="large" />
        <Text style={styles.loadingText}>Connecting to your coach...</Text>
      </View>
    );
  }

  if (chatQuery.error) {
    const message =
      chatQuery.error instanceof ApiError
        ? chatQuery.error.message
        : chatQuery.error instanceof Error
          ? chatQuery.error.message
          : 'The conversation could not be loaded.';

    return (
      <View style={styles.centered}>
        <Text style={styles.errorTitle}>Unable to load coach chat</Text>
        <Text style={styles.errorBody}>{message}</Text>
        <Pressable
          onPress={() => chatQuery.refetch()}
          style={({ pressed }) => [
            styles.retryButton,
            pressed && styles.buttonPressed,
          ]}
        >
          <Text style={styles.retryButtonText}>Try again</Text>
        </Pressable>
        <Pressable
          onPress={() => void signOut()}
          style={({ pressed }) => [
            styles.ghostButton,
            pressed && styles.buttonPressed,
          ]}
        >
          <Text style={styles.ghostButtonText}>Sign out</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={0}
      style={styles.screen}
    >
      <Stack.Screen options={{ headerShown: false }} />

      <View style={[styles.header, { paddingTop: insets.top + spacing.md }]}>
        <View>
          <Text style={styles.headerEyebrow}>Coach</Text>
          <Text style={styles.headerTitle}>
            {user?.name ? `${user.name}'s long run` : 'Daily conversation'}
          </Text>
        </View>
        <Pressable
          onPress={() => void signOut()}
          style={({ pressed }) => [
            styles.headerAction,
            pressed && styles.buttonPressed,
          ]}
        >
          <Text style={styles.headerActionText}>Sign out</Text>
        </Pressable>
      </View>

      <FlatList
        contentContainerStyle={[
          styles.listContent,
          {
            paddingBottom: spacing.xl,
            paddingTop: spacing.lg,
          },
        ]}
        data={displayMessages}
        inverted
        keyExtractor={(item) => item.id}
        keyboardShouldPersistTaps="handled"
        onRefresh={() => chatQuery.refetch()}
        refreshing={chatQuery.isRefetching && !chatQuery.isLoading}
        renderItem={({ item, index }) => {
          const nextMessage = displayMessages[index + 1];
          const density = getMessageDensity(item.createdAt);
          const showDayLabel =
            !nextMessage || !isSameCalendarDay(item.createdAt, nextMessage.createdAt);
          const isExpanded = Boolean(expandedMessageIds[item.id]);
          const canExpand = density.numberOfLines !== undefined;

          return (
            <MessageRow
              dayLabel={showDayLabel ? formatDayLabel(item.createdAt) : null}
              density={density}
              isExpanded={isExpanded}
              message={item}
              onLongPress={() => void handleCopy(item)}
              onPress={() => {
                if (canExpand) {
                  toggleExpanded(item.id);
                }
              }}
              showTypingIndicator={
                waitingForFirstToken &&
                isStreaming &&
                item.role === 'assistant' &&
                item.content.length === 0
              }
            />
          );
        }}
        style={styles.list}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>No coach messages yet</Text>
            <Text style={styles.emptyBody}>
              Start the conversation below and PeiPei will respond in real time.
            </Text>
          </View>
        }
        refreshControl={
          <RefreshControl
            onRefresh={() => chatQuery.refetch()}
            refreshing={chatQuery.isRefetching && !chatQuery.isLoading}
            tintColor={colors.text}
          />
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
        <View style={styles.composer}>
          <Pressable
            onPress={() => void handleAttachment()}
            style={({ pressed }) => [
              styles.attachmentButton,
              pressed && styles.buttonPressed,
            ]}
          >
            <Text style={styles.attachmentButtonText}>+</Text>
          </Pressable>

          <TextInput
            multiline
            onChangeText={setComposerValue}
            placeholder="Tell PeiPei how the legs feel..."
            placeholderTextColor={colors.muted}
            style={styles.composerInput}
            value={composerValue}
          />

          <Pressable
            disabled={!composerValue.trim() || isStreaming}
            onPress={() => void handleSend()}
            style={({ pressed }) => [
              styles.sendButton,
              pressed && styles.buttonPressed,
              (!composerValue.trim() || isStreaming) && styles.buttonDisabled,
            ]}
          >
            {isStreaming ? (
              <ActivityIndicator color={colors.text} size="small" />
            ) : (
              <Text style={styles.sendButtonText}>Send</Text>
            )}
          </Pressable>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

function MessageRow({
  dayLabel,
  density,
  isExpanded,
  message,
  onLongPress,
  onPress,
  showTypingIndicator,
}: {
  dayLabel: string | null;
  density: DensityConfig;
  isExpanded: boolean;
  message: CoachMessage;
  onLongPress: () => void;
  onPress: () => void;
  showTypingIndicator: boolean;
}) {
  const isUser = message.role === 'user';
  const bubbleTextStyle = isUser ? styles.userMessageText : styles.coachMessageText;
  const bubbleStyle = isUser ? styles.userBubble : styles.coachBubble;

  return (
    <View style={[styles.messageRow, { marginBottom: density.spacing }]}>
      {dayLabel ? <Text style={styles.dayLabel}>{dayLabel}</Text> : null}

      <View
        style={[
          styles.messageContainer,
          isUser ? styles.userContainer : styles.coachContainer,
        ]}
      >
        <Pressable
          delayLongPress={180}
          onLongPress={onLongPress}
          onPress={onPress}
          style={({ pressed }) => [
            styles.bubble,
            bubbleStyle,
            pressed && styles.bubblePressed,
          ]}
        >
          {showTypingIndicator ? (
            <TypingIndicator />
          ) : (
            <Text
              numberOfLines={
                isExpanded ? undefined : density.numberOfLines
              }
              style={bubbleTextStyle}
            >
              {message.content}
            </Text>
          )}
        </Pressable>
      </View>
    </View>
  );
}

function TypingIndicator() {
  return (
    <View style={styles.typingRow}>
      <TypingDot delay={0} />
      <TypingDot delay={120} />
      <TypingDot delay={240} />
    </View>
  );
}

function TypingDot({ delay }: { delay: number }) {
  const opacity = useSharedValue(0.28);

  useEffect(() => {
    opacity.value = withDelay(
      delay,
      withRepeat(
        withTiming(1, {
          duration: 520,
          easing: Easing.inOut(Easing.ease),
        }),
        -1,
        true,
      ),
    );
  }, [delay, opacity]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: 0.92 + opacity.value * 0.08 }],
  }));

  return <Animated.View style={[styles.typingDot, animatedStyle]} />;
}

function getMessageDensity(createdAt: string): DensityConfig {
  const createdAtDate = new Date(createdAt);
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfMessageDay = new Date(
    createdAtDate.getFullYear(),
    createdAtDate.getMonth(),
    createdAtDate.getDate(),
  );
  const diffInDays = Math.round(
    (startOfToday.getTime() - startOfMessageDay.getTime()) / 86_400_000,
  );
  const startOfWeek = new Date(startOfToday);
  startOfWeek.setDate(startOfToday.getDate() - ((startOfToday.getDay() + 6) % 7));

  if (diffInDays <= 0) {
    return { spacing: 16 };
  }

  if (diffInDays === 1) {
    return { spacing: 8 };
  }

  if (startOfMessageDay >= startOfWeek) {
    return { numberOfLines: 2, spacing: 8 };
  }

  return { numberOfLines: 1, spacing: 4 };
}

function isSameCalendarDay(left: string, right: string) {
  const leftDate = new Date(left);
  const rightDate = new Date(right);

  return (
    leftDate.getFullYear() === rightDate.getFullYear() &&
    leftDate.getMonth() === rightDate.getMonth() &&
    leftDate.getDate() === rightDate.getDate()
  );
}

function formatDayLabel(createdAt: string) {
  const date = new Date(createdAt);
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfMessageDay = new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
  );
  const diffInDays = Math.round(
    (startOfToday.getTime() - startOfMessageDay.getTime()) / 86_400_000,
  );
  const startOfWeek = new Date(startOfToday);
  startOfWeek.setDate(startOfToday.getDate() - ((startOfToday.getDay() + 6) % 7));

  if (diffInDays <= 0) {
    return 'TODAY';
  }

  if (diffInDays === 1) {
    return 'YDAY';
  }

  if (startOfMessageDay >= startOfWeek) {
    return date
      .toLocaleDateString('en-US', { weekday: 'short' })
      .toUpperCase();
  }

  return date
    .toLocaleDateString('en-US', { day: 'numeric', month: 'short' })
    .toUpperCase();
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: colors.background,
    justifyContent: 'center',
    padding: spacing.xl,
  },
  loadingText: {
    color: colors.muted,
    marginTop: spacing.md,
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
  header: {
    alignItems: 'flex-end',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
  },
  headerEyebrow: {
    color: colors.muted,
    fontSize: 12,
    letterSpacing: 3,
    textTransform: 'uppercase',
  },
  headerTitle: {
    color: colors.text,
    fontFamily: fonts.coach,
    fontSize: 28,
    lineHeight: 34,
    marginTop: spacing.xs,
  },
  headerAction: {
    borderColor: colors.border,
    borderRadius: radii.pill,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  headerActionText: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: '600',
  },
  list: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: spacing.lg,
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
  messageRow: {
    width: '100%',
  },
  dayLabel: {
    color: colors.muted,
    fontSize: 11,
    letterSpacing: 2,
    marginBottom: spacing.sm,
    marginTop: spacing.sm,
    textAlign: 'center',
    textTransform: 'uppercase',
  },
  messageContainer: {
    flexDirection: 'row',
    width: '100%',
  },
  coachContainer: {
    justifyContent: 'flex-start',
  },
  userContainer: {
    justifyContent: 'flex-end',
  },
  bubble: {
    borderRadius: radii.bubble,
    maxWidth: MESSAGE_MAX_WIDTH,
    minHeight: 48,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  coachBubble: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: StyleSheet.hairlineWidth,
  },
  userBubble: {
    backgroundColor: colors.accent,
  },
  bubblePressed: {
    opacity: 0.86,
  },
  coachMessageText: {
    color: colors.text,
    fontFamily: fonts.coach,
    fontSize: 17,
    lineHeight: 28,
  },
  userMessageText: {
    color: colors.text,
    fontSize: 16,
    lineHeight: 24,
  },
  typingRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.xs,
    minWidth: 48,
  },
  typingDot: {
    backgroundColor: colors.text,
    borderRadius: radii.pill,
    height: 8,
    width: 8,
  },
  composerContainer: {
    backgroundColor: colors.background,
    borderTopColor: colors.border,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
  composer: {
    alignItems: 'flex-end',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.card,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: spacing.sm,
    padding: spacing.sm,
  },
  attachmentButton: {
    alignItems: 'center',
    borderColor: colors.border,
    borderRadius: radii.pill,
    borderWidth: StyleSheet.hairlineWidth,
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  attachmentButtonText: {
    color: colors.text,
    fontSize: 22,
    lineHeight: 24,
  },
  composerInput: {
    color: colors.text,
    flex: 1,
    fontSize: 16,
    maxHeight: 120,
    minHeight: 42,
    paddingHorizontal: spacing.sm,
    paddingTop: spacing.sm,
  },
  sendButton: {
    alignItems: 'center',
    alignSelf: 'flex-end',
    backgroundColor: colors.accent,
    borderRadius: radii.pill,
    height: 42,
    justifyContent: 'center',
    minWidth: 72,
    paddingHorizontal: spacing.md,
  },
  sendButtonText: {
    color: colors.text,
    fontWeight: '600',
  },
  buttonPressed: {
    opacity: 0.86,
  },
  buttonDisabled: {
    opacity: 0.52,
  },
});
