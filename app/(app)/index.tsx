import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import { Stack, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActionSheetIOS,
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
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

import { CoachDataSidebar } from '../../src/components/sidebar/coach-data-sidebar';
import { colors, fonts, radii, spacing } from '../../src/design/tokens';
import {
  type CoachMessage,
  ApiError,
  consumeTextStream,
  createCoachSocialPost,
  createLocalId,
  getCoachChat,
  getCoachSidebar,
  openCoachChatStream,
} from '../../src/lib/api';
import { syncPeiPeiWidgets } from '../../src/lib/peipei-widgets';
import {
  openLinkedInShare,
  saveRemoteImageToLibrary,
  shareRemoteImage,
} from '../../src/lib/social-sharing';
import { useAuth } from '../../src/providers/auth-provider';

type DensityConfig = {
  numberOfLines?: number;
  spacing: number;
};

type CoachErrorPresentation = {
  description: string;
  primaryActionLabel: string;
  requiresSignOut?: boolean;
  title: string;
};

const MESSAGE_MAX_WIDTH = '82%';
const MESSAGE_ACCESSIBILITY_PREVIEW_LENGTH = 90;
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

function buildMessageAccessibilityLabel(message: CoachMessage) {
  const summary = (
    message.messageType === 'social_post'
      ? message.socialPost?.caption ?? message.content
      : message.content
  )
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MESSAGE_ACCESSIBILITY_PREVIEW_LENGTH);

  if (message.messageType === 'social_post') {
    return `Coach social post. ${summary}`;
  }

  return `${message.role === 'user' ? 'Your' : 'Coach'} message. ${summary}`;
}

export default function CoachScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const { sessionCookie, signOut, user } = useAuth();
  const [composerValue, setComposerValue] = useState('');
  const [composerError, setComposerError] = useState<CoachErrorPresentation | null>(
    null,
  );
  const [expandedMessageIds, setExpandedMessageIds] = useState<
    Record<string, true>
  >({});
  const [generatedSocialMessages, setGeneratedSocialMessages] = useState<
    CoachMessage[]
  >([]);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
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
  const coachSidebarQuery = useQuery({
    queryKey: ['coach-sidebar'],
    queryFn: () => getCoachSidebar(sessionCookie ?? ''),
    enabled: Boolean(sessionCookie),
    staleTime: 60_000,
  });

  const baseMessages = chatQuery.data?.messages ?? [];
  const displayBaseMessages = [...baseMessages, ...generatedSocialMessages];
  const conversation = transientMessages ?? displayBaseMessages;
  const displayMessages = [...conversation].sort(
    (left, right) =>
      new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime(),
  );
  const isTabletLayout = width >= TABLET_BREAKPOINT;
  const chatErrorPresentation = chatQuery.error
    ? getCoachErrorPresentation(chatQuery.error)
    : null;

  useEffect(() => {
    if (!coachSidebarQuery.data) {
      return;
    }

    const latestCoachMessage =
      displayMessages.find(
        (message) =>
          message.role === 'assistant' && message.content.trim().length > 0,
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
  }, [coachSidebarQuery.data, displayMessages]);

  useEffect(() => {
    if (isTabletLayout && isSidebarOpen) {
      setIsSidebarOpen(false);
    }
  }, [isSidebarOpen, isTabletLayout]);

  function handleComposerChange(nextValue: string) {
    setComposerError(null);
    setComposerValue(nextValue);
  }

  async function handleCopy(message: CoachMessage) {
    await Clipboard.setStringAsync(message.content);
    await Haptics.selectionAsync();
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

  async function handleCreateSocialPost(message: CoachMessage) {
    if (!sessionCookie) {
      return;
    }

    const socialPost = await createCoachSocialPost(sessionCookie, message.content);
    const socialMessage: CoachMessage = {
      content: socialPost.caption,
      createdAt: new Date().toISOString(),
      id: createLocalId('social-post'),
      messageType: 'social_post',
      role: 'assistant',
      socialPost,
    };

    setGeneratedSocialMessages((current) => [...current, socialMessage]);
    await shareRemoteImage(socialPost.imageUrl);
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

  function showCoachActionSheet(message: CoachMessage) {
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          cancelButtonIndex: 3,
          options: ['Copy text', 'Share as image', 'Share to LinkedIn', 'Cancel'],
        },
        (buttonIndex) => {
          if (buttonIndex === 0) {
            runAction(() => handleCopy(message));
          } else if (buttonIndex === 1) {
            runAction(() => handleCreateSocialPost(message));
          } else if (buttonIndex === 2) {
            runAction(() => openLinkedInShare(message.content));
          }
        },
      );
      return;
    }

    Alert.alert('Share coach message', message.content, [
      { text: 'Copy text', onPress: () => runAction(() => handleCopy(message)) },
      {
        text: 'Share as image',
        onPress: () => runAction(() => handleCreateSocialPost(message)),
      },
      {
        text: 'Share to LinkedIn',
        onPress: () => runAction(() => openLinkedInShare(message.content)),
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }

  function showSocialPostActionSheet(message: CoachMessage) {
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          cancelButtonIndex: 3,
          options: ['Copy Caption', 'Save Image', 'Share', 'Cancel'],
        },
        (buttonIndex) => {
          if (buttonIndex === 0) {
            runAction(() => handleCopy(message));
          } else if (buttonIndex === 1) {
            runAction(() => handleSaveSocialImage(message));
          } else if (buttonIndex === 2) {
            runAction(() => handleShareSocialImage(message));
          }
        },
      );
      return;
    }

    Alert.alert('Social post actions', message.content, [
      { text: 'Copy Caption', onPress: () => runAction(() => handleCopy(message)) },
      {
        text: 'Save Image',
        onPress: () => runAction(() => handleSaveSocialImage(message)),
      },
      { text: 'Share', onPress: () => runAction(() => handleShareSocialImage(message)) },
      { text: 'Cancel', style: 'cancel' },
    ]);
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
    setComposerError(null);
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

  return (
    <View style={[styles.screen, isTabletLayout && styles.tabletShell]}>
      <Stack.Screen options={{ headerShown: false }} />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={0}
        style={[styles.conversationPane, isTabletLayout && styles.tabletConversation]}
      >
        <View style={[styles.header, { paddingTop: insets.top + spacing.md }]}>
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
                <Ionicons color={colors.text} name="stats-chart-outline" size={18} />
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
              <Ionicons color={colors.text} name="settings-outline" size={18} />
            </Pressable>
          </View>
        </View>

        {chatQuery.isLoading ? (
          <CoachLoadingState />
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
              renderItem={({ item, index }) => {
                const nextMessage = displayMessages[index + 1];
                const density = getMessageDensity(item.createdAt);
                const showDayLabel =
                  !nextMessage ||
                  !isSameCalendarDay(item.createdAt, nextMessage.createdAt);
                const isExpanded = Boolean(expandedMessageIds[item.id]);
                const canExpand = density.numberOfLines !== undefined;

                return (
                  <MessageRow
                    dayLabel={showDayLabel ? formatDayLabel(item.createdAt) : null}
                    density={density}
                    isExpanded={isExpanded}
                    message={item}
                    onCopyCaption={() => runAction(() => handleCopy(item))}
                    onLongPress={() => {
                      if (item.messageType === 'social_post') {
                        showSocialPostActionSheet(item);
                        return;
                      }

                      if (item.role === 'assistant') {
                        showCoachActionSheet(item);
                        return;
                      }

                      runAction(() => handleCopy(item));
                    }}
                    onPress={() => {
                      if (canExpand) {
                        toggleExpanded(item.id);
                      }
                    }}
                    onSaveImage={() => runAction(() => handleSaveSocialImage(item))}
                    onShareImage={() => runAction(() => handleShareSocialImage(item))}
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
                    Start the conversation below and PeiPei will respond in real
                    time.
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
              {composerError ? (
                <View style={styles.inlineErrorBanner}>
                  <Text style={styles.inlineErrorTitle}>{composerError.title}</Text>
                  <Text style={styles.inlineErrorBody}>
                    {composerError.description}
                  </Text>
                </View>
              ) : null}

              <View style={styles.composer}>
                <Pressable
                  accessibilityHint="Opens the camera or photo library."
                  accessibilityLabel="Add photo attachment"
                  accessibilityRole="button"
                  onPress={() => void handleAttachment()}
                  style={({ pressed }) => [
                    styles.attachmentButton,
                    pressed && styles.buttonPressed,
                  ]}
                >
                  <Text style={styles.attachmentButtonText}>+</Text>
                </Pressable>

                <TextInput
                  accessibilityHint="Composes a message to your running coach."
                  accessibilityLabel="Message composer"
                  multiline
                  onChangeText={handleComposerChange}
                  placeholder="Tell PeiPei how the legs feel..."
                  placeholderTextColor={colors.muted}
                  style={styles.composerInput}
                  value={composerValue}
                />

                <Pressable
                  accessibilityHint="Sends your message to PeiPei."
                  accessibilityLabel="Send message"
                  accessibilityRole="button"
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

function MessageRow({
  dayLabel,
  density,
  isExpanded,
  message,
  onCopyCaption,
  onLongPress,
  onPress,
  onSaveImage,
  onShareImage,
  showTypingIndicator,
}: {
  dayLabel: string | null;
  density: DensityConfig;
  isExpanded: boolean;
  message: CoachMessage;
  onCopyCaption: () => void;
  onLongPress: () => void;
  onPress: () => void;
  onSaveImage: () => void;
  onShareImage: () => void;
  showTypingIndicator: boolean;
}) {
  const isUser = message.role === 'user';
  const bubbleTextStyle = isUser ? styles.userMessageText : styles.coachMessageText;
  const bubbleStyle = isUser ? styles.userBubble : styles.coachBubble;
  const canExpand = density.numberOfLines !== undefined;
  const accessibilityHint =
    message.messageType === 'social_post'
      ? 'Long press for sharing actions. Use the buttons inside the card to copy, save, or share.'
      : canExpand
        ? 'Double tap to expand or collapse. Long press to copy or share.'
        : 'Long press to copy or share this message.';

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
          accessibilityHint={accessibilityHint}
          accessibilityLabel={buildMessageAccessibilityLabel(message)}
          accessibilityRole="button"
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
          ) : message.messageType === 'social_post' && message.socialPost ? (
            <SocialPostCard
              caption={message.socialPost.caption}
              imageUrl={message.socialPost.imageUrl}
              onCopyCaption={onCopyCaption}
              onLongPress={onLongPress}
              onSaveImage={onSaveImage}
              onShareImage={onShareImage}
            />
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

function SocialPostCard({
  caption,
  imageUrl,
  onCopyCaption,
  onLongPress,
  onSaveImage,
  onShareImage,
}: {
  caption: string;
  imageUrl: string;
  onCopyCaption: () => void;
  onLongPress: () => void;
  onSaveImage: () => void;
  onShareImage: () => void;
}) {
  return (
    <View style={styles.socialCard}>
      <Pressable
        accessibilityHint="Long press for social post actions."
        accessibilityLabel="Coach social card image"
        accessibilityRole="button"
        delayLongPress={180}
        onLongPress={onLongPress}
      >
        <Image source={{ uri: imageUrl }} style={styles.socialImage} />
      </Pressable>
      <Text style={styles.socialCaption}>{caption}</Text>
      <View style={styles.socialActions}>
        <Pressable
          accessibilityLabel="Copy social post caption"
          accessibilityRole="button"
          onPress={onCopyCaption}
          style={({ pressed }) => [
            styles.socialActionButton,
            pressed && styles.buttonPressed,
          ]}
        >
          <Text style={styles.socialActionText}>Copy Caption</Text>
        </Pressable>
        <Pressable
          accessibilityLabel="Save social post image"
          accessibilityRole="button"
          onPress={onSaveImage}
          style={({ pressed }) => [
            styles.socialActionButton,
            pressed && styles.buttonPressed,
          ]}
        >
          <Text style={styles.socialActionText}>Save Image</Text>
        </Pressable>
        <Pressable
          accessibilityLabel="Share social post image"
          accessibilityRole="button"
          onPress={onShareImage}
          style={({ pressed }) => [
            styles.socialActionButton,
            pressed && styles.buttonPressed,
          ]}
        >
          <Text style={styles.socialActionText}>Share</Text>
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

function CoachLoadingState() {
  return (
    <View style={styles.loadingShell}>
      <View style={styles.loadingDayRow}>
        <View style={[styles.skeletonBlock, styles.loadingDayLabel]} />
      </View>
      <View style={styles.loadingMessageColumn}>
        <View style={[styles.skeletonBubble, styles.skeletonCoachBubbleLarge]} />
        <View style={[styles.skeletonBubble, styles.skeletonUserBubble]} />
        <View style={[styles.skeletonBubble, styles.skeletonCoachBubbleMedium]} />
        <View style={[styles.skeletonBubble, styles.skeletonCoachBubbleSmall]} />
      </View>
      <View style={styles.loadingComposer}>
        <View style={[styles.skeletonBlock, styles.loadingComposerButton]} />
        <View style={[styles.skeletonBlock, styles.loadingComposerInput]} />
        <View style={[styles.skeletonBlock, styles.loadingComposerSend]} />
      </View>
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
    <View style={styles.centered}>
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
  centered: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: colors.background,
    justifyContent: 'center',
    padding: spacing.xl,
  },
  loadingShell: {
    flex: 1,
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
    paddingTop: spacing.lg,
  },
  loadingDayRow: {
    alignItems: 'center',
  },
  loadingDayLabel: {
    borderRadius: radii.pill,
    height: 12,
    width: 72,
  },
  loadingMessageColumn: {
    flex: 1,
    gap: spacing.lg,
    justifyContent: 'center',
  },
  loadingComposer: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
  },
  loadingComposerButton: {
    borderRadius: radii.pill,
    height: 42,
    width: 42,
  },
  loadingComposerInput: {
    borderRadius: radii.card,
    flex: 1,
    height: 52,
  },
  loadingComposerSend: {
    borderRadius: radii.pill,
    height: 42,
    width: 78,
  },
  skeletonBubble: {
    backgroundColor: colors.surface,
    borderRadius: radii.bubble,
    height: 72,
  },
  skeletonCoachBubbleLarge: {
    width: '78%',
  },
  skeletonCoachBubbleMedium: {
    width: '72%',
  },
  skeletonCoachBubbleSmall: {
    width: '58%',
  },
  skeletonUserBubble: {
    alignSelf: 'flex-end',
    backgroundColor: '#4F2A2A',
    width: '52%',
  },
  skeletonBlock: {
    backgroundColor: colors.surface,
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
    fontSize: 15,
    lineHeight: 22,
  },
  socialActions: {
    flexDirection: 'row',
    gap: spacing.sm,
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
  inlineErrorBanner: {
    backgroundColor: '#2A1717',
    borderColor: '#6D3030',
    borderRadius: radii.input,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: spacing.sm,
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
