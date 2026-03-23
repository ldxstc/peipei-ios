import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, fonts, radii, spacing } from '../../src/design/tokens';
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

const PRICING_URL = 'https://peipei-run.com/pricing';
const WEB_SETTINGS_URL = 'https://peipei-run.com/settings';

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { refreshSession, sessionCookie, signOut, user } = useAuth();
  const [displayName, setDisplayName] = useState('');
  const [units, setUnits] = useState<UnitsPreference>('metric');
  const [coachLanguage, setCoachLanguage] =
    useState<CoachLanguagePreference>('en');
  const [customInstructions, setCustomInstructions] = useState('');
  const [instructionsDraft, setInstructionsDraft] = useState('');
  const [isInstructionsModalVisible, setIsInstructionsModalVisible] =
    useState(false);
  const [garminSyncFeedback, setGarminSyncFeedback] = useState<{
    text: string;
    tone: 'error' | 'success';
  } | null>(null);
  const garminSyncFeedbackTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

  const settingsQuery = useQuery({
    queryKey: ['settings-panel'],
    queryFn: () => getSettingsPanel(sessionCookie ?? ''),
    enabled: Boolean(sessionCookie),
  });

  useEffect(() => {
    if (!settingsQuery.data) {
      return;
    }

    setDisplayName(settingsQuery.data.displayName);
    setUnits(settingsQuery.data.units);
    setCoachLanguage(settingsQuery.data.coachLanguage);
    setCustomInstructions(settingsQuery.data.customInstructions);
    setInstructionsDraft(settingsQuery.data.customInstructions);
  }, [settingsQuery.data]);

  useEffect(() => {
    return () => {
      if (garminSyncFeedbackTimeoutRef.current) {
        clearTimeout(garminSyncFeedbackTimeoutRef.current);
      }
    };
  }, []);

  function showGarminSyncFeedback(
    tone: 'error' | 'success',
    text: string,
    durationMs = 2000,
  ) {
    if (garminSyncFeedbackTimeoutRef.current) {
      clearTimeout(garminSyncFeedbackTimeoutRef.current);
    }

    setGarminSyncFeedback({ text, tone });

    garminSyncFeedbackTimeoutRef.current = setTimeout(() => {
      setGarminSyncFeedback(null);
      garminSyncFeedbackTimeoutRef.current = null;
    }, durationMs);
  }

  const saveMutation = useMutation({
    mutationFn: async (nextInstructions?: string) => {
      if (!sessionCookie) {
        throw new Error('No active session found.');
      }

      await patchUserSettings(sessionCookie, {
        coachLanguage,
        customInstructions: nextInstructions ?? customInstructions,
        displayName,
        units,
      });
      await settingsQuery.refetch();
      await refreshSession({ name: displayName });
    },
    onSuccess: () => {
      Alert.alert('Saved', 'Your settings were updated.');
    },
  });

  const syncMutation = useMutation({
    mutationFn: async () => {
      if (!sessionCookie) {
        throw new Error('No active session found.');
      }

      await syncGarmin(sessionCookie);
      await settingsQuery.refetch();
    },
    onSuccess: () => {
      showGarminSyncFeedback('success', 'Synced!');
    },
    onError: (error) => {
      showGarminSyncFeedback('error', getErrorMessage(error), 3200);
    },
  });

  const disconnectMutation = useMutation({
    mutationFn: async () => {
      if (!sessionCookie) {
        throw new Error('No active session found.');
      }

      await disconnectGarmin(sessionCookie);
      await settingsQuery.refetch();
    },
    onSuccess: () => {
      Alert.alert('Garmin disconnected', 'Your Garmin account was disconnected.');
    },
  });

  function getErrorMessage(error: unknown) {
    if (error instanceof ApiError) {
      return error.message;
    }

    if (error instanceof Error) {
      return error.message;
    }

    return 'Something went wrong.';
  }

  async function openUrl(url: string) {
    await Linking.openURL(url);
  }

  async function handleSaveInstructions() {
    const nextInstructions = instructionsDraft.trim();
    setCustomInstructions(nextInstructions);
    setIsInstructionsModalVisible(false);
    await saveMutation.mutateAsync(nextInstructions);
  }

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
            void openUrl(WEB_SETTINGS_URL);
          },
        },
      ],
    );
  }

  async function handleSignOut() {
    await signOut();
    router.replace('/login');
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.backdrop}
    >
      <Pressable onPress={() => router.back()} style={StyleSheet.absoluteFill} />

      <View
        style={[
          styles.sheet,
          {
            marginTop: insets.top + spacing.xl,
            paddingBottom: Math.max(insets.bottom, spacing.lg),
          },
        ]}
      >
        <View style={styles.sheetHeader}>
          <Text style={styles.sheetTitle}>Settings</Text>
          <Pressable
            accessibilityLabel="Close settings"
            onPress={() => router.back()}
            style={({ pressed }) => [
              styles.closeButton,
              pressed && styles.pressed,
            ]}
          >
            <Ionicons color={colors.text} name="close" size={20} />
          </Pressable>
        </View>

        {settingsQuery.isLoading ? (
          <View style={styles.stateContainer}>
            <ActivityIndicator color={colors.text} />
            <Text style={styles.stateText}>Loading your settings...</Text>
          </View>
        ) : settingsQuery.error ? (
          <View style={styles.stateContainer}>
            <Text style={styles.errorTitle}>Unable to load settings</Text>
            <Text style={styles.errorText}>
              {getErrorMessage(settingsQuery.error)}
            </Text>
            <Pressable
              onPress={() => settingsQuery.refetch()}
              style={({ pressed }) => [
                styles.primaryButton,
                pressed && styles.pressed,
              ]}
            >
              <Text style={styles.primaryButtonText}>Try again</Text>
            </Pressable>
          </View>
        ) : (
          <ScrollView
            contentContainerStyle={styles.content}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <SectionCard title="Profile">
              <Text style={styles.fieldLabel}>Display Name</Text>
              <TextInput
                accessibilityLabel="Display name"
                onChangeText={setDisplayName}
                placeholder="Your name"
                placeholderTextColor={colors.muted}
                style={styles.input}
                value={displayName}
              />

              <Text style={[styles.fieldLabel, styles.fieldSpacing]}>Units</Text>
              <OptionSelector
                onChange={setUnits}
                options={[
                  { label: 'Metric', value: 'metric' },
                  { label: 'Imperial', value: 'imperial' },
                ]}
                value={units}
              />

              <Text style={[styles.fieldLabel, styles.fieldSpacing]}>
                Coach Language
              </Text>
              <OptionSelector
                onChange={setCoachLanguage}
                options={[
                  { label: 'English', value: 'en' },
                  { label: '简体中文', value: 'zh-Hans' },
                ]}
                value={coachLanguage}
              />

              <Pressable
                accessibilityLabel="Save profile changes"
                accessibilityRole="button"
                disabled={saveMutation.isPending}
                onPress={() => saveMutation.mutate(undefined)}
                style={({ pressed }) => [
                  styles.primaryButton,
                  styles.sectionButton,
                  pressed && styles.pressed,
                  saveMutation.isPending && styles.disabled,
                ]}
              >
                {saveMutation.isPending ? (
                  <ActivityIndicator color={colors.text} size="small" />
                ) : (
                  <Text style={styles.primaryButtonText}>Save Changes</Text>
                )}
              </Pressable>
            </SectionCard>

            <SectionCard title="Garmin">
              <DetailRow
                label="Status"
                value={
                  settingsQuery.data?.garmin.connected ? 'Connected' : 'Not connected'
                }
              />
              <DetailRow
                label="Email"
                value={
                  settingsQuery.data?.garmin.email || 'No Garmin email linked'
                }
              />

              <View style={styles.buttonRow}>
                <Pressable
                  accessibilityLabel="Sync Garmin data"
                  accessibilityRole="button"
                  disabled={syncMutation.isPending}
                  onPress={() => syncMutation.mutate()}
                  style={({ pressed }) => [
                    styles.secondaryButton,
                    pressed && styles.pressed,
                    syncMutation.isPending && styles.disabled,
                  ]}
                >
                  {syncMutation.isPending ? (
                    <ActivityIndicator color={colors.text} size="small" />
                  ) : (
                    <Text style={styles.secondaryButtonText}>Sync Now</Text>
                  )}
                </Pressable>

                <Pressable
                  accessibilityLabel="Disconnect Garmin"
                  accessibilityRole="button"
                  disabled={
                    !settingsQuery.data?.garmin.connected ||
                    disconnectMutation.isPending
                  }
                  onPress={confirmDisconnectGarmin}
                  style={({ pressed }) => [
                    styles.secondaryButton,
                    styles.destructiveButton,
                    pressed && styles.pressed,
                    (!settingsQuery.data?.garmin.connected ||
                      disconnectMutation.isPending) &&
                      styles.disabled,
                  ]}
                >
                  <Text style={styles.destructiveButtonText}>Disconnect</Text>
                </Pressable>
              </View>

              {garminSyncFeedback ? (
                <Text
                  style={[
                    styles.feedbackText,
                    garminSyncFeedback.tone === 'error'
                      ? styles.feedbackError
                      : styles.feedbackSuccess,
                  ]}
                >
                  {garminSyncFeedback.text}
                </Text>
              ) : null}
            </SectionCard>

            <SectionCard title="Coach Instructions">
              <Text style={styles.instructionsText}>
                {customInstructions || 'No custom instructions yet.'}
              </Text>
              <Pressable
                accessibilityLabel="Edit coach instructions"
                accessibilityRole="button"
                onPress={() => {
                  setInstructionsDraft(customInstructions);
                  setIsInstructionsModalVisible(true);
                }}
                style={({ pressed }) => [
                  styles.secondaryButton,
                  styles.sectionButton,
                  pressed && styles.pressed,
                ]}
              >
                <Text style={styles.secondaryButtonText}>Edit</Text>
              </Pressable>
            </SectionCard>

            <SectionCard title="Billing">
              <DetailRow
                label="Tier"
                value={settingsQuery.data?.billing.tierLabel || 'Free'}
              />
              {!settingsQuery.data?.billing.isPro ? (
                <Pressable
                  accessibilityLabel="Open pricing"
                  accessibilityRole="button"
                  onPress={() => {
                    void openUrl(PRICING_URL);
                  }}
                  style={({ pressed }) => [
                    styles.primaryButton,
                    styles.sectionButton,
                    pressed && styles.pressed,
                  ]}
                >
                  <Text style={styles.primaryButtonText}>Upgrade</Text>
                </Pressable>
              ) : null}
            </SectionCard>

            <SectionCard title="Account">
              <DetailRow
                label="Email"
                value={
                  settingsQuery.data?.accountEmail || user?.email || 'Unknown'
                }
              />
              <Pressable
                accessibilityLabel="Sign out"
                accessibilityRole="button"
                onPress={() => {
                  void handleSignOut();
                }}
                style={({ pressed }) => [
                  styles.secondaryButton,
                  styles.sectionButton,
                  styles.destructiveButton,
                  pressed && styles.pressed,
                ]}
              >
                <Text style={styles.destructiveButtonText}>Sign Out</Text>
              </Pressable>
            </SectionCard>

            <SectionCard title="Data">
              <Pressable
                accessibilityLabel="Export data"
                accessibilityRole="button"
                onPress={() => {
                  void openUrl(WEB_SETTINGS_URL);
                }}
                style={({ pressed }) => [
                  styles.secondaryButton,
                  pressed && styles.pressed,
                ]}
              >
                <Text style={styles.secondaryButtonText}>Export Data</Text>
              </Pressable>

              <Pressable
                accessibilityLabel="Delete account"
                accessibilityRole="button"
                onPress={confirmDeleteAccount}
                style={({ pressed }) => [
                  styles.secondaryButton,
                  styles.sectionButton,
                  styles.destructiveButton,
                  pressed && styles.pressed,
                ]}
              >
                <Text style={styles.destructiveButtonText}>Delete Account</Text>
              </Pressable>
            </SectionCard>
          </ScrollView>
        )}
      </View>

      <Modal
        animationType="slide"
        onRequestClose={() => setIsInstructionsModalVisible(false)}
        transparent
        visible={isInstructionsModalVisible}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Coach Instructions</Text>
            <TextInput
              accessibilityLabel="Coach instructions"
              multiline
              onChangeText={setInstructionsDraft}
              placeholder="Tell PeiPei how you want the coach to respond."
              placeholderTextColor={colors.muted}
              style={styles.instructionsInput}
              textAlignVertical="top"
              value={instructionsDraft}
            />

            <View style={styles.modalActions}>
              <Pressable
                accessibilityLabel="Cancel editing coach instructions"
                accessibilityRole="button"
                onPress={() => setIsInstructionsModalVisible(false)}
                style={({ pressed }) => [
                  styles.secondaryButton,
                  styles.modalButton,
                  pressed && styles.pressed,
                ]}
              >
                <Text style={styles.secondaryButtonText}>Cancel</Text>
              </Pressable>

              <Pressable
                accessibilityLabel="Save coach instructions"
                accessibilityRole="button"
                disabled={saveMutation.isPending}
                onPress={() => {
                  void handleSaveInstructions();
                }}
                style={({ pressed }) => [
                  styles.primaryButton,
                  styles.modalButton,
                  pressed && styles.pressed,
                  saveMutation.isPending && styles.disabled,
                ]}
              >
                {saveMutation.isPending ? (
                  <ActivityIndicator color={colors.text} size="small" />
                ) : (
                  <Text style={styles.primaryButtonText}>Save</Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

function SectionCard({
  children,
  title,
}: {
  children: ReactNode;
  title: string;
}) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value}</Text>
    </View>
  );
}

function OptionSelector<T extends string>({
  onChange,
  options,
  value,
}: {
  onChange: (nextValue: T) => void;
  options: Array<{ label: string; value: T }>;
  value: T;
}) {
  return (
    <View style={styles.selectorRow}>
      {(options ?? []).map((option) => {
        const selected = option.value === value;

        return (
          <Pressable
            accessibilityLabel={option.label}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            key={option.value}
            onPress={() => onChange(option.value)}
            style={({ pressed }) => [
              styles.selectorOption,
              selected && styles.selectorOptionSelected,
              pressed && styles.pressed,
            ]}
          >
            <Text
              style={[
                styles.selectorLabel,
                selected && styles.selectorLabelSelected,
              ]}
            >
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    backgroundColor: 'rgba(15, 14, 12, 0.5)',
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radii.card,
    borderTopRightRadius: radii.card,
    maxHeight: '92%',
    overflow: 'hidden',
  },
  sheetHeader: {
    alignItems: 'center',
    borderBottomColor: colors.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
  },
  sheetTitle: {
    color: colors.text,
    fontFamily: fonts.coach,
    fontSize: 26,
    lineHeight: 32,
  },
  closeButton: {
    alignItems: 'center',
    borderColor: colors.border,
    borderRadius: radii.pill,
    borderWidth: StyleSheet.hairlineWidth,
    height: 36,
    justifyContent: 'center',
    width: 36,
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
    fontSize: 24,
    lineHeight: 30,
    textAlign: 'center',
  },
  errorText: {
    color: colors.muted,
    lineHeight: 22,
    marginTop: spacing.sm,
    textAlign: 'center',
  },
  content: {
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
    fontSize: 20,
    lineHeight: 26,
    marginBottom: spacing.md,
  },
  fieldLabel: {
    color: colors.muted,
    fontSize: 12,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  fieldSpacing: {
    marginTop: spacing.lg,
  },
  input: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.input,
    borderWidth: StyleSheet.hairlineWidth,
    color: colors.text,
    fontSize: 16,
    marginTop: spacing.sm,
    minHeight: 50,
    paddingHorizontal: spacing.lg,
  },
  selectorRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  selectorOption: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.pill,
    borderWidth: StyleSheet.hairlineWidth,
    flex: 1,
    justifyContent: 'center',
    minHeight: 44,
    paddingHorizontal: spacing.md,
  },
  selectorOptionSelected: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  selectorLabel: {
    color: colors.muted,
    fontSize: 15,
    fontWeight: '600',
  },
  selectorLabelSelected: {
    color: colors.text,
  },
  detailRow: {
    gap: spacing.xs,
    marginBottom: spacing.sm,
  },
  detailLabel: {
    color: colors.muted,
    fontSize: 12,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  detailValue: {
    color: colors.text,
    fontSize: 16,
    lineHeight: 24,
  },
  instructionsText: {
    color: colors.text,
    fontSize: 16,
    lineHeight: 24,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: colors.accent,
    borderRadius: radii.pill,
    justifyContent: 'center',
    minHeight: 48,
    paddingHorizontal: spacing.lg,
  },
  primaryButtonText: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '600',
  },
  secondaryButton: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.pill,
    borderWidth: StyleSheet.hairlineWidth,
    justifyContent: 'center',
    minHeight: 48,
    paddingHorizontal: spacing.lg,
  },
  secondaryButtonText: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '600',
  },
  feedbackText: {
    fontSize: 13,
    lineHeight: 18,
    marginTop: spacing.md,
  },
  feedbackSuccess: {
    color: colors.text,
  },
  feedbackError: {
    color: '#E4A0A0',
  },
  destructiveButton: {
    borderColor: '#6D3030',
  },
  destructiveButtonText: {
    color: '#E4A0A0',
    fontSize: 15,
    fontWeight: '600',
  },
  sectionButton: {
    marginTop: spacing.md,
  },
  modalBackdrop: {
    backgroundColor: 'rgba(15, 14, 12, 0.72)',
    flex: 1,
    justifyContent: 'center',
    padding: spacing.xl,
  },
  modalCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.card,
    borderWidth: StyleSheet.hairlineWidth,
    padding: spacing.lg,
  },
  modalTitle: {
    color: colors.text,
    fontFamily: fonts.coach,
    fontSize: 22,
    lineHeight: 28,
  },
  instructionsInput: {
    backgroundColor: colors.background,
    borderColor: colors.border,
    borderRadius: radii.input,
    borderWidth: StyleSheet.hairlineWidth,
    color: colors.text,
    fontSize: 16,
    lineHeight: 24,
    marginTop: spacing.lg,
    minHeight: 180,
    padding: spacing.lg,
  },
  modalActions: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
  modalButton: {
    flex: 1,
  },
  disabled: {
    opacity: 0.5,
  },
  pressed: {
    opacity: 0.86,
  },
});
