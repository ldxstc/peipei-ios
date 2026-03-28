import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import {
  ActivityIndicator,
  Animated,
  Pressable,
  ScrollView,
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
const FLOATING_PANEL_WIDTH = 328;

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
          <Text style={styles.panelEyebrow}>Daily View</Text>
          <Text style={styles.panelTitle}>For the long run</Text>
          <Text style={styles.panelSubtitle}>
            Today&apos;s plan, your recent rhythm, and what the goal still asks of you.
          </Text>
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
        <ScrollView
          bounces={false}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.panelContent}>
            <View style={styles.heroCard}>
              <Text style={styles.heroEyebrow}>Today</Text>
              <Text style={styles.heroTitle}>
                {sidebarQuery.data?.todayPlan.title || "Check today's plan"}
              </Text>
              <Text style={styles.heroMetric}>
                {sidebarQuery.data?.todayPlan.distance || '--'}
              </Text>
              <Text style={styles.heroDetail}>
                Open the day with intention, then let the coach conversation carry the rest.
              </Text>
            </View>

            <SectionCard overline="Week" title="Current rhythm">
              <View style={styles.statsRow}>
                <WeekStat label="Distance" value={sidebarQuery.data?.thisWeek.km || '0'} />
                <WeekStat
                  label="Runs"
                  value={sidebarQuery.data?.thisWeek.runs || '0'}
                />
                <WeekStat
                  label="Pace"
                  value={sidebarQuery.data?.thisWeek.avgPace || '--'}
                />
              </View>
            </SectionCard>

            <SectionCard overline="Recent" title="Last efforts">
              {(sidebarQuery.data?.recentRuns ?? []).length ? (
                (sidebarQuery.data?.recentRuns ?? []).map((run, index, runs) => (
                  <View
                    key={run.id}
                    style={[
                      styles.runRow,
                      index === runs.length - 1 && styles.runRowLast,
                    ]}
                  >
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

            <SectionCard overline="Goal" title="What we are building toward">
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
        </ScrollView>
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
              bottom: spacing.sm,
              paddingBottom: Math.max(bottomInset, spacing.lg),
              paddingTop: spacing.xl,
              right: spacing.sm,
              top: topInset + spacing.sm,
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
  overline,
  title,
}: {
  children: React.ReactNode;
  overline?: string;
  title: string;
}) {
  return (
    <View style={styles.section}>
      {overline ? <Text style={styles.sectionOverline}>{overline}</Text> : null}
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
    backgroundColor: 'rgba(22, 21, 20, 0.98)',
    borderColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 32,
    borderWidth: StyleSheet.hairlineWidth,
    bottom: spacing.sm,
    overflow: 'hidden',
    position: 'absolute',
    right: spacing.sm,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 20 },
    shadowOpacity: 0.35,
    shadowRadius: 32,
    top: spacing.sm,
    width: FLOATING_PANEL_WIDTH,
  },
  dockedPanel: {
    backgroundColor: colors.surface,
    borderLeftColor: colors.border,
    borderLeftWidth: StyleSheet.hairlineWidth,
    flex: 1,
    width: SIDEBAR_WIDTH,
  },
  panelHeader: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xl,
  },
  panelEyebrow: {
    color: colors.muted,
    fontFamily: fonts.ui,
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 2.2,
    textTransform: 'uppercase',
  },
  panelTitle: {
    color: colors.text,
    fontFamily: fonts.coach,
    fontSize: 28,
    lineHeight: 34,
    marginTop: 6,
  },
  panelSubtitle: {
    color: '#8B877F',
    fontSize: 13,
    lineHeight: 19,
    marginTop: spacing.sm,
    maxWidth: 220,
  },
  closeButton: {
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: radii.pill,
    borderWidth: StyleSheet.hairlineWidth,
    height: 34,
    justifyContent: 'center',
    width: 34,
  },
  scrollContent: {
    paddingBottom: spacing.xl,
  },
  panelContent: {
    gap: spacing.lg,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xl,
  },
  heroCard: {
    backgroundColor: '#F2EDE4',
    borderRadius: 30,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.xl,
  },
  heroEyebrow: {
    color: '#6F675F',
    fontFamily: fonts.ui,
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 1.9,
    textTransform: 'uppercase',
  },
  heroTitle: {
    color: '#111111',
    fontFamily: fonts.coach,
    fontSize: 30,
    lineHeight: 36,
    marginTop: spacing.sm,
  },
  heroMetric: {
    color: '#8B3A3A',
    fontFamily: fonts.ui,
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0.3,
    marginTop: spacing.md,
  },
  heroDetail: {
    color: '#55514B',
    fontSize: 14,
    lineHeight: 20,
    marginTop: spacing.md,
  },
  section: {
    backgroundColor: 'rgba(255, 255, 255, 0.025)',
    borderColor: 'rgba(255, 255, 255, 0.06)',
    borderRadius: 30,
    borderWidth: StyleSheet.hairlineWidth,
    padding: spacing.xl,
  },
  sectionOverline: {
    color: '#6F6A64',
    fontFamily: fonts.ui,
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 1.8,
    textTransform: 'uppercase',
  },
  sectionTitle: {
    color: colors.text,
    fontFamily: fonts.coach,
    fontSize: 24,
    lineHeight: 30,
    marginBottom: spacing.md,
    marginTop: 6,
  },
  statsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  statCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderColor: 'rgba(255, 255, 255, 0.06)',
    borderRadius: 22,
    borderWidth: StyleSheet.hairlineWidth,
    flex: 1,
    minHeight: 88,
    padding: spacing.md,
  },
  statValue: {
    color: colors.text,
    fontFamily: fonts.coach,
    fontSize: 24,
    lineHeight: 30,
  },
  statLabel: {
    color: '#8B877F',
    fontFamily: fonts.ui,
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 1.1,
    marginTop: spacing.sm,
    textTransform: 'uppercase',
  },
  runRow: {
    borderBottomColor: 'rgba(255, 255, 255, 0.07)',
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingVertical: spacing.md,
  },
  runRowLast: {
    borderBottomWidth: 0,
    paddingBottom: 0,
  },
  runTitle: {
    color: colors.text,
    fontFamily: fonts.coach,
    fontSize: 18,
    lineHeight: 24,
  },
  runSubtitle: {
    color: '#8B877F',
    fontSize: 13,
    lineHeight: 19,
    marginTop: spacing.xs,
  },
  goalTitle: {
    color: colors.text,
    fontFamily: fonts.coach,
    fontSize: 20,
    lineHeight: 26,
  },
  goalCountdown: {
    color: colors.text,
    fontFamily: fonts.coach,
    fontSize: 34,
    lineHeight: 40,
    marginTop: spacing.sm,
  },
  goalDetail: {
    color: '#8B877F',
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
    color: '#8B877F',
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
    color: '#8B877F',
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
    color: '#8B877F',
    lineHeight: 20,
  },
  pressed: {
    opacity: 0.86,
  },
});
