import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useMemo, useRef } from 'react';
import {
  ActivityIndicator,
  Animated,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
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
const FLOATING_PANEL_MAX_WIDTH = 364;

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
  const { height, width } = useWindowDimensions();
  const translateY = useRef(new Animated.Value(height)).current;
  const sidebarQuery = useQuery({
    queryKey: ['coach-sidebar'],
    queryFn: () => getCoachSidebar(sessionCookie ?? ''),
    enabled: Boolean(sessionCookie) && (isOpen || isDocked),
  });

  useEffect(() => {
    if (isDocked) {
      return;
    }

    Animated.spring(translateY, {
      bounciness: 0,
      speed: 18,
      toValue: isOpen ? 0 : height,
      useNativeDriver: true,
    }).start();
  }, [height, isDocked, isOpen, translateY]);

  useEffect(() => {
    if (!isDocked && !isOpen) {
      translateY.setValue(height);
    }
  }, [height, isDocked, isOpen, translateY]);

  const panelWidth = useMemo(() => {
    if (isDocked) {
      return SIDEBAR_WIDTH;
    }

    return Math.min(FLOATING_PANEL_MAX_WIDTH, width - spacing.md * 2);
  }, [isDocked, width]);

  const scrimOpacity = translateY.interpolate({
    extrapolate: 'clamp',
    inputRange: [0, height],
    outputRange: [0.42, 0],
  });

  function clampSheetOffset(value: number) {
    return Math.max(0, Math.min(height, value));
  }

  function handlePanelGesture(event: PanGestureHandlerGestureEvent) {
    if (isDocked) {
      return;
    }

    const { translationY } = event.nativeEvent;

    if (translationY > 0) {
      translateY.setValue(clampSheetOffset(translationY));
    }
  }

  function handlePanelStateChange(event: PanGestureHandlerStateChangeEvent) {
    if (isDocked || event.nativeEvent.oldState !== State.ACTIVE) {
      return;
    }

    const { translationY, velocityY } = event.nativeEvent;
    const shouldClose = translationY > 120 || velocityY > 900;

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

  const todayPlanTitle = sidebarQuery.data?.todayPlan.title || "Check today's plan";
  const todayDistance = sidebarQuery.data?.todayPlan.distance || '--';
  const weekDistance = sidebarQuery.data?.thisWeek.km || '0';
  const weekRuns = sidebarQuery.data?.thisWeek.runs || '0';
  const weekPace = sidebarQuery.data?.thisWeek.avgPace || '--';
  const recentRuns = sidebarQuery.data?.recentRuns ?? [];
  const goalTitle = sidebarQuery.data?.goalProgress.title || 'Goal Progress';
  const goalCountdown = sidebarQuery.data?.goalProgress.countdown || 'No race set';
  const goalDetail =
    sidebarQuery.data?.goalProgress.detail || 'Set a race goal in the web app';

  const heroSummary =
    todayDistance !== '--'
      ? `${todayDistance} planned today`
      : weekPace !== '--'
      ? `Week moving at ${weekPace}`
      : 'Open the day with restraint';

  const panelContent = (
    <>
      <View style={styles.panelHeader}>
        {!isDocked ? <View style={styles.grabber} /> : null}

        <View style={styles.headerRow}>
          <View style={styles.headerCopy}>
            <Text style={styles.panelEyebrow}>Today</Text>
            <Text style={styles.panelTitle}>Daily view</Text>
            <Text style={styles.panelSubtitle}>
              A quieter read of the day: the plan, the recent pattern, and the horizon.
            </Text>
          </View>

          {!isDocked ? (
            <Pressable
              accessibilityLabel="Close daily view"
              accessibilityRole="button"
              onPress={onClose}
              style={({ pressed }) => [
                styles.closeButton,
                pressed && styles.pressed,
              ]}
            >
              <Ionicons color={colors.text} name="close" size={17} />
            </Pressable>
          ) : null}
        </View>
      </View>

      {sidebarQuery.isLoading ? (
        <View style={styles.stateContainer}>
          <ActivityIndicator color={colors.text} />
          <Text style={styles.stateText}>Loading the day...</Text>
        </View>
      ) : sidebarQuery.error ? (
        <View style={styles.stateContainer}>
          <Text style={styles.errorTitle}>Unable to load daily view</Text>
          <Text style={styles.errorText}>
            {sidebarErrorMessage(sidebarQuery.error)}
          </Text>
          <Pressable
            accessibilityLabel="Retry loading daily view"
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
          contentContainerStyle={[
            styles.scrollContent,
            { paddingBottom: Math.max(bottomInset, spacing.xl) },
          ]}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.panelContent}>
            <LinearGradient
              colors={['#F3EBDD', '#E7D9C8', '#D5C0A8']}
              end={{ x: 1, y: 1 }}
              start={{ x: 0, y: 0 }}
              style={styles.heroCard}
            >
              <View style={styles.heroTopRow}>
                <Text style={styles.heroEyebrow}>Today&apos;s plan</Text>
                <View style={styles.heroMetricPill}>
                  <Text style={styles.heroMetricPillText}>{todayDistance}</Text>
                </View>
              </View>

              <Text style={styles.heroTitle}>{todayPlanTitle}</Text>

              <Text style={styles.heroDetail}>
                {heroSummary}. Let the plan stay clear, then let the conversation do less.
              </Text>
            </LinearGradient>

            <View style={styles.metricsRow}>
              <MetricTile label="Week" value={weekDistance} />
              <MetricTile label="Runs" value={weekRuns} />
              <MetricTile label="Pace" value={weekPace} />
            </View>

            <SectionCard eyebrow="Recent" title="What the body has been saying">
              {recentRuns.length ? (
                recentRuns.map((run, index) => (
                  <View
                    key={run.id}
                    style={[
                      styles.runRow,
                      index === recentRuns.length - 1 && styles.runRowLast,
                    ]}
                  >
                    <View style={styles.runMarker} />
                    <View
                      style={[
                        styles.runCopy,
                        index === recentRuns.length - 1 && styles.runRowLastCopy,
                      ]}
                    >
                      <Text style={styles.runTitle}>{run.title}</Text>
                      <Text style={styles.runSubtitle}>
                        {run.subtitle || run.detail}
                      </Text>
                    </View>
                  </View>
                ))
              ) : (
                <Text style={styles.emptyText}>No recent runs yet.</Text>
              )}
            </SectionCard>

            <SectionCard eyebrow="Horizon" title={goalTitle}>
              <Text style={styles.goalCountdown}>{goalCountdown}</Text>
              <Text style={styles.goalDetail}>{goalDetail}</Text>
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
            styles.sheet,
            {
              bottom: 0,
              left: (width - panelWidth) / 2,
              paddingTop: topInset + spacing.sm,
              transform: [{ translateY }],
              width: panelWidth,
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
  eyebrow,
  title,
}: {
  children: React.ReactNode;
  eyebrow: string;
  title: string;
}) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionEyebrow}>{eyebrow}</Text>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function MetricTile({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metricTile}>
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  scrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#000000',
  },
  sheet: {
    backgroundColor: 'rgba(13, 13, 14, 0.98)',
    borderColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 34,
    borderWidth: StyleSheet.hairlineWidth,
    maxHeight: '86%',
    overflow: 'hidden',
    position: 'absolute',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: -12 },
    shadowOpacity: 0.4,
    shadowRadius: 32,
  },
  dockedPanel: {
    backgroundColor: '#0F0F10',
    borderLeftColor: colors.border,
    borderLeftWidth: StyleSheet.hairlineWidth,
    flex: 1,
    width: SIDEBAR_WIDTH,
  },
  panelHeader: {
    paddingHorizontal: spacing.xl,
  },
  grabber: {
    alignSelf: 'center',
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderRadius: radii.pill,
    height: 4,
    marginBottom: spacing.lg,
    width: 44,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  headerCopy: {
    flex: 1,
    minWidth: 0,
    paddingRight: spacing.md,
  },
  panelEyebrow: {
    color: '#8E8E93',
    fontFamily: fonts.ui,
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  panelTitle: {
    color: '#F5F5F7',
    fontFamily: fonts.coach,
    fontSize: 31,
    lineHeight: 36,
    marginTop: 6,
  },
  panelSubtitle: {
    color: '#9A968F',
    fontSize: 13,
    lineHeight: 19,
    marginTop: spacing.sm,
    maxWidth: 240,
  },
  closeButton: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderColor: 'rgba(255,255,255,0.08)',
    borderRadius: radii.pill,
    borderWidth: StyleSheet.hairlineWidth,
    height: 34,
    justifyContent: 'center',
    width: 34,
  },
  scrollContent: {
    paddingTop: spacing.xl,
  },
  panelContent: {
    gap: spacing.md,
    paddingHorizontal: spacing.xl,
  },
  heroCard: {
    borderRadius: 32,
    overflow: 'hidden',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.xl,
  },
  heroTopRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  heroEyebrow: {
    color: '#5B534B',
    fontFamily: fonts.ui,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.8,
    textTransform: 'uppercase',
  },
  heroMetricPill: {
    backgroundColor: 'rgba(17, 17, 17, 0.08)',
    borderRadius: radii.pill,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  heroMetricPillText: {
    color: '#4D463F',
    fontFamily: fonts.ui,
    fontSize: 12,
    fontWeight: '700',
  },
  heroTitle: {
    color: '#161312',
    fontFamily: fonts.coach,
    fontSize: 29,
    lineHeight: 35,
    marginTop: spacing.md,
  },
  heroDetail: {
    color: '#5E5750',
    fontSize: 14,
    lineHeight: 20,
    marginTop: spacing.md,
  },
  metricsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  metricTile: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderColor: 'rgba(255,255,255,0.06)',
    borderRadius: 24,
    borderWidth: StyleSheet.hairlineWidth,
    flex: 1,
    minHeight: 84,
    paddingHorizontal: spacing.md,
    paddingVertical: 14,
  },
  metricValue: {
    color: '#F5F5F7',
    fontFamily: fonts.coach,
    fontSize: 22,
    lineHeight: 28,
  },
  metricLabel: {
    color: '#8E8E93',
    fontFamily: fonts.ui,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.4,
    marginTop: spacing.sm,
    textTransform: 'uppercase',
  },
  section: {
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderColor: 'rgba(255,255,255,0.06)',
    borderRadius: 28,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
  },
  sectionEyebrow: {
    color: '#76767B',
    fontFamily: fonts.ui,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.7,
    textTransform: 'uppercase',
  },
  sectionTitle: {
    color: '#F5F5F7',
    fontFamily: fonts.coach,
    fontSize: 23,
    lineHeight: 29,
    marginBottom: spacing.md,
    marginTop: 8,
  },
  runRow: {
    flexDirection: 'row',
    paddingVertical: spacing.md,
  },
  runRowLast: {
    paddingBottom: 0,
  },
  runRowLastCopy: {
    borderBottomWidth: 0,
    paddingBottom: 0,
  },
  runMarker: {
    alignSelf: 'flex-start',
    backgroundColor: '#5B5B60',
    borderRadius: radii.pill,
    height: 7,
    marginRight: 12,
    marginTop: 8,
    width: 7,
  },
  runCopy: {
    borderBottomColor: 'rgba(255,255,255,0.06)',
    borderBottomWidth: StyleSheet.hairlineWidth,
    flex: 1,
    minWidth: 0,
    paddingBottom: spacing.md,
  },
  runTitle: {
    color: '#F5F5F7',
    fontFamily: fonts.coach,
    fontSize: 18,
    lineHeight: 24,
  },
  runSubtitle: {
    color: '#9A968F',
    fontSize: 13,
    lineHeight: 19,
    marginTop: spacing.xs,
  },
  goalCountdown: {
    color: '#F5F5F7',
    fontFamily: fonts.coach,
    fontSize: 36,
    lineHeight: 42,
  },
  goalDetail: {
    color: '#9A968F',
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
    color: '#9A968F',
    marginTop: spacing.md,
  },
  errorTitle: {
    color: '#F5F5F7',
    fontFamily: fonts.coach,
    fontSize: 20,
    lineHeight: 26,
    textAlign: 'center',
  },
  errorText: {
    color: '#9A968F',
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
    color: '#F5F5F7',
    fontSize: 14,
    fontWeight: '600',
  },
  emptyText: {
    color: '#9A968F',
    lineHeight: 20,
  },
  pressed: {
    opacity: 0.86,
  },
});
