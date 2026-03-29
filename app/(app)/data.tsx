import { useQuery } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, fonts, spacing } from '../../src/design/tokens';
import { ApiError, getCoachSidebar, syncGarmin } from '../../src/lib/api';
import { useAuth } from '../../src/providers/auth-provider';

function getErrorMessage(error: unknown) {
  if (error instanceof ApiError) {
    return error.message;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return 'Unable to load training data.';
}

export default function DataScreen() {
  const insets = useSafeAreaInsets();
  const { sessionCookie } = useAuth();
  const [refreshing, setRefreshing] = useState(false);

  const dataQuery = useQuery({
    queryKey: ['coach-sidebar'],
    queryFn: () => getCoachSidebar(sessionCookie ?? ''),
    enabled: Boolean(sessionCookie),
    retry: false,
  });

  const handleRefresh = useCallback(async () => {
    if (!sessionCookie) {
      return;
    }

    setRefreshing(true);

    try {
      await syncGarmin(sessionCookie);
      await dataQuery.refetch();
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } finally {
      setRefreshing(false);
    }
  }, [dataQuery, sessionCookie]);

  return (
    <ScrollView
      contentContainerStyle={[
        styles.content,
        {
          paddingTop: insets.top + 20,
          paddingBottom: Math.max(insets.bottom, 24) + 24,
        },
      ]}
      refreshControl={
        <RefreshControl
          onRefresh={() => {
            void handleRefresh();
          }}
          refreshing={refreshing}
          tintColor={colors.text}
        />
      }
      style={styles.screen}
      showsVerticalScrollIndicator={false}
    >
      <Text style={styles.title}>Training Data</Text>

      {dataQuery.isLoading ? (
        <View style={styles.stateBlock}>
          <ActivityIndicator color={colors.text} />
          <Text style={styles.stateText}>Loading your training data...</Text>
        </View>
      ) : dataQuery.error ? (
        <View style={styles.stateBlock}>
          <Text style={styles.emptyText}>{getErrorMessage(dataQuery.error)}</Text>
        </View>
      ) : !dataQuery.data?.thisWeek.km &&
        !dataQuery.data?.goalProgress.title &&
        !dataQuery.data?.recentRuns.length ? (
        <View style={styles.stateBlock}>
          <Text style={styles.emptyTitle}>No training data yet</Text>
          <Text style={styles.emptyText}>
            Connect your Garmin watch in Settings to see your weekly volume, pace trends, and race countdown here.
          </Text>
        </View>
      ) : (
        <>
          <Section label="This Week">
            <ValueRow label="Total" value={dataQuery.data?.thisWeek.km || '--'} />
            <ValueRow label="Runs" value={dataQuery.data?.thisWeek.runs || '--'} />
            <ValueRow
              label="Avg Pace"
              value={dataQuery.data?.thisWeek.avgPace || '--'}
            />
          </Section>

          <Section label="Today's Plan">
            <Text style={styles.serifValue}>
              {dataQuery.data?.todayPlan.title || 'Rest day'}
            </Text>
            {dataQuery.data?.todayPlan.distance && dataQuery.data.todayPlan.distance !== '--' ? (
              <Text style={styles.valueSupporting}>
                {dataQuery.data.todayPlan.distance}
              </Text>
            ) : (
              <Text style={styles.valueSupporting}>Listen to your legs.</Text>
            )}
          </Section>

          <Section label="Goal">
            <Text style={styles.serifValue}>
              {dataQuery.data?.goalProgress.title || 'No race set'}
            </Text>
            {dataQuery.data?.goalProgress.countdown ? (
              <Text style={styles.goalCountdown}>
                {dataQuery.data.goalProgress.countdown}
              </Text>
            ) : (
              <Text style={styles.valueSupporting}>
                Tell your coach about an upcoming race
              </Text>
            )}
            {dataQuery.data?.goalProgress.detail ? (
              <Text style={styles.valueSupporting}>
                {dataQuery.data.goalProgress.detail}
              </Text>
            ) : null}
          </Section>

          <Section label="Recent Runs">
            {dataQuery.data?.recentRuns.length ? (
              dataQuery.data.recentRuns.map((run, index) => (
                <View
                  key={run.id}
                  style={[
                    styles.runRow,
                    index === dataQuery.data.recentRuns.length - 1 && styles.runRowLast,
                  ]}
                >
                  <Text style={styles.runDate}>{run.title}</Text>
                  <Text style={styles.runDistance}>{run.subtitle || '--'}</Text>
                  <Text style={styles.runPace}>{run.detail || '--'}</Text>
                </View>
              ))
            ) : (
              <Text style={styles.valueSupporting}>No recent runs yet.</Text>
            )}
          </Section>
        </>
      )}
    </ScrollView>
  );
}

function Section({
  children,
  label,
}: {
  children: React.ReactNode;
  label: string;
}) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionLabel}>{label}</Text>
      <View style={styles.sectionBody}>{children}</View>
    </View>
  );
}

function ValueRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.valueRow}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.serifValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: 20,
  },
  emptyTitle: {
    color: colors.text,
    fontFamily: fonts.coach,
    fontSize: 22,
    marginBottom: 12,
    textAlign: 'center',
  },
  emptyText: {
    color: colors.textSecondary,
    fontSize: 15,
    lineHeight: 24,
    maxWidth: 280,
    textAlign: 'center',
  },
  label: {
    color: colors.textSecondary,
    fontSize: 13,
  },
  runDate: {
    color: colors.textTertiary,
    flex: 1,
    fontSize: 13,
  },
  runRow: {
    alignItems: 'center',
    borderBottomColor: colors.separator,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 20,
  },
  runRowLast: {
    borderBottomWidth: 0,
  },
  runDistance: {
    color: colors.text,
    flex: 1,
    fontSize: 15,
    textAlign: 'center',
  },
  runPace: {
    color: colors.metricPace,
    fontFamily: fonts.mono,
    fontSize: 14,
    minWidth: 88,
    textAlign: 'right',
  },
  screen: {
    backgroundColor: colors.background,
    flex: 1,
  },
  section: {
    marginTop: spacing.xxl,
  },
  sectionBody: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    marginTop: 12,
    padding: 20,
  },
  sectionLabel: {
    color: colors.textTertiary,
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  serifValue: {
    color: colors.text,
    fontFamily: fonts.coach,
    fontSize: 28,
    fontWeight: '300',
    lineHeight: 36,
  },
  stateBlock: {
    alignItems: 'center',
    minHeight: 320,
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  stateText: {
    color: colors.textSecondary,
    fontSize: 15,
    marginTop: 12,
  },
  title: {
    color: colors.text,
    fontFamily: fonts.ui,
    fontSize: 22,
    fontWeight: '600',
  },
  valueRow: {
    marginBottom: 20,
  },
  goalCountdown: {
    color: colors.metricPace,
    fontFamily: fonts.mono,
    fontSize: 15,
    fontWeight: '600',
    marginTop: 6,
  },
  valueSupporting: {
    color: colors.textSecondary,
    fontSize: 13,
    lineHeight: 23,
    marginTop: 6,
  },
});
