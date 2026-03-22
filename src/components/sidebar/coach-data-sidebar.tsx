import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import {
  ActivityIndicator,
  Animated,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  PanGestureHandler,
  State,
  type PanGestureHandlerGestureEvent,
  type PanGestureHandlerStateChangeEvent,
} from 'react-native-gesture-handler';

import { colors, fonts, radii, spacing } from '../../design/tokens';
import { ApiError, getCoachSidebar } from '../../lib/api';

const SIDEBAR_WIDTH = 280;

type CoachDataSidebarProps = {
  bottomInset: number;
  isOpen: boolean;
  onClose: () => void;
  onOpen: () => void;
  sessionCookie: string | null;
  topInset: number;
  variant?: 'overlay' | 'docked';
};

export function CoachDataSidebar({
  bottomInset,
  isOpen,
  onClose,
  onOpen,
  sessionCookie,
  topInset,
  variant = 'overlay',
}: CoachDataSidebarProps) {
  const isDocked = variant === 'docked';
  const translateX = useRef(new Animated.Value(SIDEBAR_WIDTH)).current;
  const sidebarQuery = useQuery({
    queryKey: ['coach-sidebar'],
    queryFn: () => getCoachSidebar(sessionCookie ?? ''),
    enabled: Boolean(sessionCookie) && (isOpen || isDocked),
  });

  useEffect(() => {
    Animated.spring(translateX, {
      bounciness: 0,
      speed: 18,
      toValue: isOpen ? 0 : SIDEBAR_WIDTH,
      useNativeDriver: true,
    }).start();
  }, [isOpen, translateX]);

  const scrimOpacity = translateX.interpolate({
    extrapolate: 'clamp',
    inputRange: [0, SIDEBAR_WIDTH],
    outputRange: [0.26, 0],
  });

  function clamp(value: number) {
    return Math.max(0, Math.min(SIDEBAR_WIDTH, value));
  }

  function handleEdgeGesture(event: PanGestureHandlerGestureEvent) {
    const { translationX } = event.nativeEvent;

    if (translationX < 0) {
      translateX.setValue(clamp(SIDEBAR_WIDTH + translationX));
    }
  }

  function handleEdgeStateChange(event: PanGestureHandlerStateChangeEvent) {
    if (event.nativeEvent.oldState !== State.ACTIVE) {
      return;
    }

    const { translationX, velocityX } = event.nativeEvent;
    const shouldOpen = translationX < -SIDEBAR_WIDTH / 4 || velocityX < -600;

    if (shouldOpen) {
      onOpen();
      return;
    }

    onClose();
  }

  function handlePanelGesture(event: PanGestureHandlerGestureEvent) {
    const { translationX } = event.nativeEvent;

    if (translationX < 0) {
      translateX.setValue(clamp(-translationX));
    }
  }

  function handlePanelStateChange(event: PanGestureHandlerStateChangeEvent) {
    if (event.nativeEvent.oldState !== State.ACTIVE) {
      return;
    }

    const { translationX, velocityX } = event.nativeEvent;
    const shouldClose = translationX < -SIDEBAR_WIDTH / 4 || velocityX < -600;

    if (shouldClose) {
      onClose();
      return;
    }

    onOpen();
  }

  function sidebarErrorMessage(error: unknown) {
    if (error instanceof ApiError) {
      return error.message;
    }

    if (error instanceof Error) {
      return error.message;
    }

    return 'The panel could not load.';
  }

  const panelContent = (
    <>
      <View style={styles.panelHeader}>
        <View>
          <Text style={styles.panelEyebrow}>Data</Text>
          <Text style={styles.panelTitle}>Training snapshot</Text>
        </View>
        {!isDocked ? (
          <Pressable
            accessibilityLabel="Close data panel"
            accessibilityRole="button"
            onPress={onClose}
            style={({ pressed }) => [
              styles.closeButton,
              pressed && styles.pressed,
            ]}
          >
            <Ionicons color={colors.text} name="close" size={18} />
          </Pressable>
        ) : null}
      </View>

      {sidebarQuery.isLoading ? (
        <View style={styles.stateContainer}>
          <ActivityIndicator color={colors.text} />
          <Text style={styles.stateText}>Loading training data...</Text>
        </View>
      ) : sidebarQuery.error ? (
        <View style={styles.stateContainer}>
          <Text style={styles.errorTitle}>Unable to load data</Text>
          <Text style={styles.errorText}>
            {sidebarErrorMessage(sidebarQuery.error)}
          </Text>
          <Pressable
            accessibilityLabel="Retry loading training data"
            accessibilityRole="button"
            onPress={() => sidebarQuery.refetch()}
            style={({ pressed }) => [
              styles.retryButton,
              pressed && styles.pressed,
            ]}
          >
            <Text style={styles.retryButtonText}>Try again</Text>
          </Pressable>
        </View>
      ) : (
        <View style={styles.panelContent}>
          <SectionCard title="This Week">
            <View style={styles.statsRow}>
              <WeekStat label="km" value={sidebarQuery.data?.thisWeek.km || '0'} />
              <WeekStat
                label="runs"
                value={sidebarQuery.data?.thisWeek.runs || '0'}
              />
              <WeekStat
                label="avg pace"
                value={sidebarQuery.data?.thisWeek.avgPace || '--'}
              />
            </View>
          </SectionCard>

          <SectionCard title="Recent Runs">
            {(sidebarQuery.data?.recentRuns ?? []).length ? (
              (sidebarQuery.data?.recentRuns ?? []).map((run) => (
                <View key={run.id} style={styles.runRow}>
                  <Text style={styles.runTitle}>{run.title}</Text>
                  <Text style={styles.runSubtitle}>
                    {run.subtitle || run.detail}
                  </Text>
                </View>
              ))
            ) : (
              <Text style={styles.emptyText}>No recent runs yet.</Text>
            )}
          </SectionCard>

          <SectionCard title="Goal Progress">
            <Text style={styles.goalTitle}>
              {sidebarQuery.data?.goalProgress.title || 'Goal Progress'}
            </Text>
            <Text style={styles.goalCountdown}>
              {sidebarQuery.data?.goalProgress.countdown || 'No race set'}
            </Text>
            <Text style={styles.goalDetail}>
              {sidebarQuery.data?.goalProgress.detail ||
                'Set a race goal in the web app'}
            </Text>
          </SectionCard>
        </View>
      )}
    </>
  );

  if (isDocked) {
    return (
      <View
        style={[
          styles.dockedPanel,
          {
            paddingBottom: Math.max(bottomInset, spacing.lg),
            paddingTop: topInset + spacing.xl,
          },
        ]}
      >
        {panelContent}
      </View>
    );
  }

  return (
    <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
      <PanGestureHandler
        onGestureEvent={handleEdgeGesture}
        onHandlerStateChange={handleEdgeStateChange}
      >
        <View style={styles.edgeTrigger} />
      </PanGestureHandler>

      <Animated.View
        pointerEvents={isOpen ? 'auto' : 'none'}
        style={[styles.scrim, { opacity: scrimOpacity }]}
      >
        <Pressable onPress={onClose} style={StyleSheet.absoluteFill} />
      </Animated.View>

      <PanGestureHandler
        enabled={isOpen}
        onGestureEvent={handlePanelGesture}
        onHandlerStateChange={handlePanelStateChange}
      >
        <Animated.View
          style={[
            styles.panel,
            {
              paddingBottom: Math.max(bottomInset, spacing.lg),
              paddingTop: topInset + spacing.xl,
              transform: [{ translateX }],
            },
          ]}
        >
          {panelContent}
        </Animated.View>
      </PanGestureHandler>
    </View>
  );
}

function SectionCard({
  children,
  title,
}: {
  children: React.ReactNode;
  title: string;
}) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function WeekStat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.statCard}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  edgeTrigger: {
    ...StyleSheet.absoluteFillObject,
    left: undefined,
    width: 20,
  },
  scrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#000000',
  },
  panel: {
    backgroundColor: colors.surface,
    borderLeftColor: colors.border,
    borderLeftWidth: StyleSheet.hairlineWidth,
    bottom: 0,
    position: 'absolute',
    right: 0,
    top: 0,
    width: SIDEBAR_WIDTH,
  },
  dockedPanel: {
    backgroundColor: colors.surface,
    borderLeftColor: colors.border,
    borderLeftWidth: StyleSheet.hairlineWidth,
    flex: 1,
    width: SIDEBAR_WIDTH,
  },
  panelHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
  },
  panelEyebrow: {
    color: colors.muted,
    fontSize: 12,
    letterSpacing: 2.5,
    textTransform: 'uppercase',
  },
  panelTitle: {
    color: colors.text,
    fontFamily: fonts.coach,
    fontSize: 24,
    lineHeight: 30,
    marginTop: spacing.xs,
  },
  closeButton: {
    alignItems: 'center',
    borderColor: colors.border,
    borderRadius: radii.pill,
    borderWidth: StyleSheet.hairlineWidth,
    height: 34,
    justifyContent: 'center',
    width: 34,
  },
  panelContent: {
    gap: spacing.lg,
    padding: spacing.lg,
  },
  section: {
    backgroundColor: colors.background,
    borderColor: colors.border,
    borderRadius: radii.card,
    borderWidth: StyleSheet.hairlineWidth,
    padding: spacing.lg,
  },
  sectionTitle: {
    color: colors.text,
    fontFamily: fonts.coach,
    fontSize: 18,
    lineHeight: 24,
    marginBottom: spacing.md,
  },
  statsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  statCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.input,
    borderWidth: StyleSheet.hairlineWidth,
    flex: 1,
    minHeight: 78,
    padding: spacing.md,
  },
  statValue: {
    color: colors.text,
    fontFamily: fonts.coach,
    fontSize: 22,
    lineHeight: 28,
  },
  statLabel: {
    color: colors.muted,
    fontSize: 11,
    letterSpacing: 1.2,
    marginTop: spacing.sm,
    textTransform: 'uppercase',
  },
  runRow: {
    borderBottomColor: colors.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingVertical: spacing.sm,
  },
  runTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '600',
  },
  runSubtitle: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 18,
    marginTop: spacing.xs,
  },
  goalTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '600',
  },
  goalCountdown: {
    color: colors.text,
    fontFamily: fonts.coach,
    fontSize: 28,
    lineHeight: 34,
    marginTop: spacing.sm,
  },
  goalDetail: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 20,
    marginTop: spacing.sm,
  },
  stateContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xxl,
  },
  stateText: {
    color: colors.muted,
    marginTop: spacing.md,
  },
  errorTitle: {
    color: colors.text,
    fontFamily: fonts.coach,
    fontSize: 20,
    lineHeight: 26,
    textAlign: 'center',
  },
  errorText: {
    color: colors.muted,
    lineHeight: 20,
    marginTop: spacing.sm,
    textAlign: 'center',
  },
  retryButton: {
    alignItems: 'center',
    backgroundColor: colors.accent,
    borderRadius: radii.pill,
    justifyContent: 'center',
    marginTop: spacing.lg,
    minHeight: 44,
    paddingHorizontal: spacing.lg,
  },
  retryButtonText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '600',
  },
  emptyText: {
    color: colors.muted,
    lineHeight: 20,
  },
  pressed: {
    opacity: 0.86,
  },
});
