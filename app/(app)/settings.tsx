import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, fonts, radii } from '../../src/design/tokens';
import {
  type CoachLanguagePreference,
  type UnitsPreference,
  ApiError,
  disconnectGarmin,
  getSettingsPanel,
  patchUserSettings,
  syncGarmin,
} from '../../src/lib/api';
import { useAuth } from '../../src/providers/auth-provider';

const WEB_SETTINGS_URL = 'https://peipei-run.com/settings';

function getErrorMessage(error: unknown) {
  if (error instanceof ApiError) {
    return error.message;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return 'Something went wrong.';
}

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { refreshSession, sessionCookie, signOut, user } = useAuth();
  const [displayName, setDisplayName] = useState('');
  const [units, setUnits] = useState<UnitsPreference>('metric');
  const [coachLanguage, setCoachLanguage] =
    useState<CoachLanguagePreference>('en');
  const [hasHydrated, setHasHydrated] = useState(false);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const settingsQuery = useQuery({
    queryKey: ['settings-panel'],
    queryFn: () => getSettingsPanel(sessionCookie ?? ''),
    enabled: Boolean(sessionCookie),
    retry: false,
  });

  useEffect(() => {
    if (!settingsQuery.data) {
      return;
    }

    setDisplayName(settingsQuery.data.displayName);
    setUnits(settingsQuery.data.units);
    setCoachLanguage(settingsQuery.data.coachLanguage);
    setHasHydrated(true);
  }, [settingsQuery.data]);

  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, []);

  const saveMutation = useMutation({
    mutationFn: async (nextInput: {
      coachLanguage: CoachLanguagePreference;
      displayName: string;
      units: UnitsPreference;
    }) => {
      if (!sessionCookie || !settingsQuery.data) {
        return;
      }

      await patchUserSettings(sessionCookie, {
        coachLanguage: nextInput.coachLanguage,
        customInstructions: settingsQuery.data.customInstructions,
        displayName: nextInput.displayName,
        units: nextInput.units,
      });
      await refreshSession({ name: nextInput.displayName });
      await settingsQuery.refetch();
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    },
  });

  const syncMutation = useMutation({
    mutationFn: async () => {
      if (!sessionCookie) {
        return;
      }

      await syncGarmin(sessionCookie);
      await settingsQuery.refetch();
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
  });

  const disconnectMutation = useMutation({
    mutationFn: async () => {
      if (!sessionCookie) {
        return;
      }

      await disconnectGarmin(sessionCookie);
      await settingsQuery.refetch();
    },
  });

  const snapshot = useMemo(
    () =>
      settingsQuery.data
        ? {
            coachLanguage: settingsQuery.data.coachLanguage,
            displayName: settingsQuery.data.displayName,
            units: settingsQuery.data.units,
          }
        : null,
    [settingsQuery.data],
  );

  useEffect(() => {
    if (!hasHydrated || !snapshot) {
      return;
    }

    const isDirty =
      displayName !== snapshot.displayName ||
      units !== snapshot.units ||
      coachLanguage !== snapshot.coachLanguage;

    if (!isDirty) {
      return;
    }

    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    saveTimeoutRef.current = setTimeout(() => {
      void saveMutation.mutateAsync({
        coachLanguage,
        displayName,
        units,
      });
    }, 500);
  }, [coachLanguage, displayName, hasHydrated, saveMutation, snapshot, units]);

  function confirmDisconnectGarmin() {
    Alert.alert(
      'Disconnect Garmin',
      'This will remove the Garmin connection from your account.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Disconnect',
          style: 'destructive',
          onPress: () => disconnectMutation.mutate(),
        },
      ],
    );
  }

  function confirmDeleteAccount() {
    Alert.alert(
      'Delete account',
      'Account deletion is managed on the web app right now. Continue there?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Continue',
          style: 'destructive',
          onPress: () => {
            void Linking.openURL(WEB_SETTINGS_URL);
          },
        },
      ],
    );
  }

  return (
    <ScrollView
      contentContainerStyle={[
        styles.content,
        {
          paddingTop: insets.top + 12,
          paddingBottom: Math.max(insets.bottom, 24) + 24,
        },
      ]}
      style={styles.screen}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <Ionicons color={colors.text} name="chevron-back" size={22} />
        </Pressable>
        <Text style={styles.title}>Settings</Text>
        <View style={styles.backButton} />
      </View>

      {settingsQuery.isLoading ? (
        <View style={styles.stateBlock}>
          <ActivityIndicator color={colors.text} />
          <Text style={styles.stateText}>Loading your settings...</Text>
        </View>
      ) : settingsQuery.error ? (
        <View style={styles.stateBlock}>
          <Text style={styles.stateError}>{getErrorMessage(settingsQuery.error)}</Text>
        </View>
      ) : (
        <>
          <Section label="Profile">
            <View style={styles.group}>
              <InputRow
                label="Display Name"
                onChangeText={setDisplayName}
                value={displayName}
              />
              <SegmentedRow
                label="Units"
                onChange={(value) => setUnits(value as UnitsPreference)}
                options={[
                  { label: 'Metric', value: 'metric' },
                  { label: 'Imperial', value: 'imperial' },
                ]}
                value={units}
              />
              <SegmentedRow
                label="Coach Language"
                onChange={(value) =>
                  setCoachLanguage(value as CoachLanguagePreference)
                }
                options={[
                  { label: 'English', value: 'en' },
                  { label: '简体中文', value: 'zh-Hans' },
                ]}
                value={coachLanguage}
              />
            </View>
          </Section>

          <Section label="Garmin">
            <View style={styles.group}>
              <StaticRow
                label="Status"
                value={settingsQuery.data?.garmin.connected ? 'Connected' : 'Not connected'}
                valueTone={settingsQuery.data?.garmin.connected ? 'success' : 'secondary'}
              />
              <ActionRow
                label="Sync Now"
                loading={syncMutation.isPending}
                onPress={() => syncMutation.mutate()}
              />
              <ActionRow
                destructive
                disabled={!settingsQuery.data?.garmin.connected}
                label="Disconnect"
                loading={disconnectMutation.isPending}
                onPress={confirmDisconnectGarmin}
              />
            </View>
          </Section>

          <Section label="Coach">
            <View style={styles.group}>
              <NavigationRow
                label="Instructions"
                value={
                  settingsQuery.data?.customInstructions
                    ? 'Edit your coaching style'
                    : 'Add custom instructions'
                }
                onPress={() => router.push('/(app)/coach-instructions')}
              />
            </View>
          </Section>

          <Section label="Billing">
            <View style={styles.group}>
              <StaticRow
                label="Tier"
                value={settingsQuery.data?.billing.tierLabel || 'Free'}
              />
            </View>
          </Section>

          <Section label="Account">
            <View style={styles.group}>
              <StaticRow
                label="Email"
                value={settingsQuery.data?.accountEmail || user?.email || 'Unknown'}
              />
              <ActionRow
                destructive
                label="Sign Out"
                onPress={() => {
                  void signOut();
                  router.replace('/login');
                }}
              />
              <ActionRow destructive label="Delete Account" onPress={confirmDeleteAccount} />
            </View>
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
      {children}
    </View>
  );
}

function RowContainer({
  children,
  isLast = false,
}: {
  children: React.ReactNode;
  isLast?: boolean;
}) {
  return (
    <View
      style={[
        styles.row,
        !isLast && styles.rowBorder,
      ]}
    >
      {children}
    </View>
  );
}

function StaticRow({
  label,
  value,
  valueTone = 'primary',
}: {
  label: string;
  value: string;
  valueTone?: 'primary' | 'secondary' | 'success';
}) {
  return (
    <RowContainer>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text
        style={[
          styles.rowValue,
          valueTone === 'secondary' && styles.rowValueSecondary,
          valueTone === 'success' && styles.rowValueSuccess,
        ]}
      >
        {value}
      </Text>
    </RowContainer>
  );
}

function NavigationRow({
  label,
  onPress,
  value,
}: {
  label: string;
  onPress: () => void;
  value?: string;
}) {
  return (
    <Pressable onPress={onPress}>
      {({ pressed }) => (
        <RowContainer>
          <View style={styles.rowTextBlock}>
            <Text style={styles.rowLabel}>{label}</Text>
            {value ? <Text style={styles.rowValueSecondary}>{value}</Text> : null}
          </View>
          <Ionicons color={colors.textTertiary} name="chevron-forward" size={16} />
        </RowContainer>
      )}
    </Pressable>
  );
}

function ActionRow({
  destructive = false,
  disabled = false,
  label,
  loading = false,
  onPress,
}: {
  destructive?: boolean;
  disabled?: boolean;
  label: string;
  loading?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable disabled={disabled || loading} onPress={onPress}>
      {({ pressed }) => (
        <RowContainer>
          <Text
            style={[
              styles.rowLabel,
              destructive && styles.destructiveLabel,
              (pressed || disabled) && styles.rowFaded,
            ]}
          >
            {label}
          </Text>
          {loading ? (
            <ActivityIndicator color={destructive ? colors.destructive : colors.text} />
          ) : (
            <Ionicons color={colors.textTertiary} name="chevron-forward" size={16} />
          )}
        </RowContainer>
      )}
    </Pressable>
  );
}

function InputRow({
  label,
  onChangeText,
  value,
}: {
  label: string;
  onChangeText: (value: string) => void;
  value: string;
}) {
  return (
    <RowContainer>
      <View style={styles.rowTextBlock}>
        <Text style={styles.rowLabel}>{label}</Text>
        <TextInput
          onChangeText={onChangeText}
          placeholder="Your name"
          placeholderTextColor={colors.textTertiary}
          style={styles.inlineInput}
          value={value}
        />
      </View>
    </RowContainer>
  );
}

function SegmentedRow({
  label,
  onChange,
  options,
  value,
}: {
  label: string;
  onChange: (value: string) => void;
  options: Array<{ label: string; value: string }>;
  value: string;
}) {
  return (
    <RowContainer>
      <View style={styles.rowTextBlock}>
        <Text style={styles.rowLabel}>{label}</Text>
        <View style={styles.segmentedControl}>
          {options.map((option) => {
            const selected = option.value === value;

            return (
              <Pressable
                key={option.value}
                onPress={() => onChange(option.value)}
                style={[styles.segment, selected && styles.segmentSelected]}
              >
                <Text
                  style={[
                    styles.segmentText,
                    selected && styles.segmentTextSelected,
                  ]}
                >
                  {option.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>
    </RowContainer>
  );
}

const styles = StyleSheet.create({
  backButton: {
    alignItems: 'center',
    height: 32,
    justifyContent: 'center',
    width: 32,
  },
  content: {
    paddingHorizontal: 16,
  },
  destructiveLabel: {
    color: colors.destructive,
  },
  group: {
    backgroundColor: colors.surfaceElevated,
    borderColor: colors.separator,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 22,
  },
  inlineInput: {
    color: colors.text,
    fontSize: 16,
    marginTop: 6,
    padding: 0,
  },
  row: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 52,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  rowBorder: {
    borderBottomColor: colors.separator,
    borderBottomWidth: StyleSheet.hairlineWidth,
    marginLeft: 16,
  },
  rowFaded: {
    opacity: 0.55,
  },
  rowLabel: {
    color: colors.text,
    fontSize: 16,
  },
  rowTextBlock: {
    flex: 1,
    paddingRight: 16,
  },
  rowValue: {
    color: colors.text,
    fontFamily: fonts.coach,
    fontSize: 17,
  },
  rowValueSecondary: {
    color: colors.textSecondary,
    fontSize: 14,
    marginTop: 4,
  },
  rowValueSuccess: {
    color: colors.success,
    fontFamily: fonts.ui,
    fontSize: 15,
    fontWeight: '600',
  },
  screen: {
    backgroundColor: colors.background,
    flex: 1,
  },
  section: {
    marginBottom: 24,
  },
  sectionLabel: {
    color: colors.textTertiary,
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 2,
    marginBottom: 8,
    paddingHorizontal: 8,
    textTransform: 'uppercase',
  },
  segmentedControl: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
  },
  segment: {
    backgroundColor: colors.surface,
    borderRadius: radii.pill,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  segmentSelected: {
    backgroundColor: colors.accentSubtle,
  },
  segmentText: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: '600',
  },
  segmentTextSelected: {
    color: colors.text,
  },
  stateBlock: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 320,
    paddingHorizontal: 24,
  },
  stateError: {
    color: colors.destructive,
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
  },
  stateText: {
    color: colors.textSecondary,
    fontSize: 15,
    marginTop: 12,
  },
  title: {
    color: colors.text,
    fontSize: 22,
    fontWeight: '600',
  },
});
