import { useMutation } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, fonts, radii, spacing } from '../../src/design/tokens';
import { useAuth } from '../../src/providers/auth-provider';

const WEB_SETTINGS_URL = 'https://peipei-run.com/settings';

const ONBOARDING_STEPS = [
  {
    body: 'Bring your Garmin data into PeiPei so your plan starts from real training, not guesswork.',
    eyebrow: 'Step 1',
    primaryAction: 'Connect Garmin',
    secondaryAction: 'Continue',
    title: 'Connect your Garmin to start',
  },
  {
    body: 'Your coach will proactively check in, adjust training, and keep the plan moving with you every day.',
    eyebrow: 'Step 2',
    primaryAction: 'Open Coach',
    secondaryAction: null,
    title: 'Your coach will reach out',
  },
] as const;

export default function OnboardingScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { completeOnboarding } = useAuth();
  const [stepIndex, setStepIndex] = useState(0);

  const finishMutation = useMutation({
    mutationFn: async () => {
      await completeOnboarding();
    },
    onSuccess: () => {
      router.replace('/');
    },
  });

  const step = ONBOARDING_STEPS[stepIndex];
  const isLastStep = stepIndex === ONBOARDING_STEPS.length - 1;

  async function handlePrimaryAction() {
    if (stepIndex === 0) {
      await Linking.openURL(WEB_SETTINGS_URL);
      return;
    }

    await finishMutation.mutateAsync();
  }

  async function handleSecondaryAction() {
    if (isLastStep) {
      return;
    }

    setStepIndex((current) => current + 1);
  }

  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          {
            paddingBottom: Math.max(insets.bottom, spacing.xl),
            paddingTop: insets.top + spacing.xl,
          },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.hero}>
          <Text style={styles.kicker}>pei·pei</Text>
          <Text style={styles.title}>{step.title}</Text>
          <Text style={styles.body}>{step.body}</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.stepLabel}>{step.eyebrow}</Text>
          <Text style={styles.stepTitle}>{step.title}</Text>
          <Text style={styles.stepBody}>{step.body}</Text>

          <View style={styles.progressRow}>
            {(ONBOARDING_STEPS ?? []).map((item, index) => (
              <View
                key={item.title}
                style={[
                  styles.progressDot,
                  index === stepIndex && styles.progressDotActive,
                ]}
              />
            ))}
          </View>

          <Pressable
            accessibilityHint={
              stepIndex === 0
                ? 'Opens PeiPei settings in the browser so you can connect Garmin.'
                : 'Completes onboarding and opens your coach conversation.'
            }
            accessibilityLabel={step.primaryAction}
            accessibilityRole="button"
            disabled={finishMutation.isPending}
            onPress={() => {
              void handlePrimaryAction();
            }}
            style={({ pressed }) => [
              styles.primaryButton,
              pressed && styles.pressed,
              finishMutation.isPending && styles.disabled,
            ]}
          >
            {finishMutation.isPending ? (
              <ActivityIndicator color={colors.text} size="small" />
            ) : (
              <Text style={styles.primaryButtonText}>{step.primaryAction}</Text>
            )}
          </Pressable>

          {step.secondaryAction ? (
            <Pressable
              accessibilityHint="Moves to the next onboarding screen."
              accessibilityLabel={step.secondaryAction}
              accessibilityRole="button"
              onPress={() => {
                void handleSecondaryAction();
              }}
              style={({ pressed }) => [
                styles.secondaryButton,
                pressed && styles.pressed,
              ]}
            >
              <Text style={styles.secondaryButtonText}>{step.secondaryAction}</Text>
            </Pressable>
          ) : null}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    backgroundColor: colors.background,
    flex: 1,
  },
  content: {
    flexGrow: 1,
    gap: spacing.xxl,
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xl,
  },
  hero: {
    gap: spacing.md,
  },
  kicker: {
    color: colors.muted,
    fontFamily: fonts.brand,
    fontSize: 18,
    letterSpacing: 1.8,
  },
  title: {
    color: colors.text,
    fontFamily: fonts.coach,
    fontSize: 40,
    lineHeight: 48,
  },
  body: {
    color: colors.muted,
    fontSize: 17,
    lineHeight: 26,
    maxWidth: 440,
  },
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.card,
    borderWidth: StyleSheet.hairlineWidth,
    gap: spacing.md,
    padding: spacing.xl,
  },
  stepLabel: {
    color: colors.muted,
    fontSize: 12,
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  stepTitle: {
    color: colors.text,
    fontFamily: fonts.coach,
    fontSize: 28,
    lineHeight: 34,
  },
  stepBody: {
    color: colors.muted,
    fontSize: 16,
    lineHeight: 24,
  },
  progressRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  progressDot: {
    backgroundColor: colors.border,
    borderRadius: radii.pill,
    height: 8,
    width: 32,
  },
  progressDotActive: {
    backgroundColor: colors.accent,
  },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: colors.accent,
    borderRadius: radii.pill,
    justifyContent: 'center',
    minHeight: 52,
    paddingHorizontal: spacing.lg,
  },
  primaryButtonText: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '600',
  },
  secondaryButton: {
    alignItems: 'center',
    backgroundColor: colors.background,
    borderColor: colors.border,
    borderRadius: radii.pill,
    borderWidth: StyleSheet.hairlineWidth,
    justifyContent: 'center',
    minHeight: 52,
    paddingHorizontal: spacing.lg,
  },
  secondaryButtonText: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '600',
  },
  pressed: {
    opacity: 0.88,
  },
  disabled: {
    opacity: 0.72,
  },
});
