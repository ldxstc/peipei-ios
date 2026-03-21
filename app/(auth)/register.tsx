import { useMutation } from '@tanstack/react-query';
import { Link } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { colors, fonts, radii, spacing } from '../../src/design/tokens';
import { ApiError } from '../../src/lib/api';
import { useAuth } from '../../src/providers/auth-provider';

export default function RegisterScreen() {
  const { signUp } = useAuth();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const registerMutation = useMutation({
    mutationFn: async () => {
      await signUp(name.trim(), email.trim(), password);
    },
  });

  const errorMessage =
    registerMutation.error instanceof ApiError
      ? registerMutation.error.message
      : registerMutation.error instanceof Error
        ? registerMutation.error.message
        : null;

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.keyboard}
    >
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.hero}>
          <Text style={styles.kicker}>PeiPei</Text>
          <Text style={styles.title}>Start running.</Text>
          <Text style={styles.subtitle}>
            Create your account and step straight into the coach conversation.
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.label}>Name</Text>
          <TextInput
            accessibilityHint="Enter your full name."
            accessibilityLabel="Name"
            autoCapitalize="words"
            autoComplete="name"
            onChangeText={setName}
            placeholder="Your name"
            placeholderTextColor={colors.muted}
            style={styles.input}
            textContentType="name"
            value={name}
          />

          <Text style={[styles.label, styles.labelSpacing]}>Email</Text>
          <TextInput
            accessibilityHint="Enter the email address for your new PeiPei account."
            accessibilityLabel="Email"
            autoCapitalize="none"
            autoComplete="email"
            autoCorrect={false}
            keyboardType="email-address"
            onChangeText={setEmail}
            placeholder="runner@peipei.run"
            placeholderTextColor={colors.muted}
            style={styles.input}
            textContentType="emailAddress"
            value={email}
          />

          <Text style={[styles.label, styles.labelSpacing]}>Password</Text>
          <TextInput
            accessibilityHint="Create a password for your PeiPei account."
            accessibilityLabel="Password"
            autoCapitalize="none"
            autoComplete="password-new"
            autoCorrect={false}
            onChangeText={setPassword}
            placeholder="Choose a password"
            placeholderTextColor={colors.muted}
            secureTextEntry
            style={styles.input}
            textContentType="newPassword"
            value={password}
          />

          {errorMessage ? <Text style={styles.error}>{errorMessage}</Text> : null}

          <Pressable
            accessibilityLabel="Create account"
            accessibilityRole="button"
            disabled={registerMutation.isPending}
            onPress={() => registerMutation.mutate()}
            style={({ pressed }) => [
              styles.primaryButton,
              pressed && styles.buttonPressed,
              registerMutation.isPending && styles.buttonDisabled,
            ]}
          >
            {registerMutation.isPending ? (
              <ActivityIndicator color={colors.text} />
            ) : (
              <Text style={styles.primaryButtonText}>Create account</Text>
            )}
          </Pressable>

          <Link
            accessibilityLabel="Go to sign in"
            href="/login"
            style={styles.secondaryLink}
          >
            Already have an account? Sign in
          </Link>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  keyboard: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: spacing.xl,
    gap: spacing.xl,
  },
  hero: {
    gap: spacing.md,
  },
  kicker: {
    color: colors.muted,
    fontFamily: fonts.coach,
    fontSize: 14,
    letterSpacing: 4,
    textTransform: 'uppercase',
  },
  title: {
    color: colors.text,
    fontFamily: fonts.coach,
    fontSize: 42,
    lineHeight: 48,
  },
  subtitle: {
    color: colors.muted,
    fontSize: 16,
    lineHeight: 24,
  },
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.card,
    borderWidth: StyleSheet.hairlineWidth,
    padding: spacing.xl,
  },
  label: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.3,
    marginBottom: spacing.sm,
  },
  labelSpacing: {
    marginTop: spacing.lg,
  },
  input: {
    backgroundColor: colors.background,
    borderColor: colors.border,
    borderRadius: radii.input,
    borderWidth: StyleSheet.hairlineWidth,
    color: colors.text,
    fontSize: 16,
    minHeight: 54,
    paddingHorizontal: spacing.lg,
  },
  error: {
    color: '#D28282',
    marginTop: spacing.md,
  },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: colors.accent,
    borderRadius: radii.pill,
    justifyContent: 'center',
    marginTop: spacing.xl,
    minHeight: 54,
  },
  primaryButtonText: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '600',
  },
  secondaryLink: {
    color: colors.muted,
    marginTop: spacing.lg,
    textAlign: 'center',
  },
  buttonPressed: {
    opacity: 0.86,
  },
  buttonDisabled: {
    opacity: 0.72,
  },
});
