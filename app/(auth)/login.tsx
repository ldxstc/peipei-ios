import { Ionicons } from '@expo/vector-icons';
import { useMutation } from '@tanstack/react-query';
import { Link, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
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
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PeiPeiLogo } from '../../src/components/branding/peipei-logo';
import { colors, fonts, radii, spacing } from '../../src/design/tokens';
import { ApiError } from '../../src/lib/api';
import { useAuth } from '../../src/providers/auth-provider';

export default function LoginScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { signIn } = useAuth();
  const submitLockRef = useRef(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');


  const loginMutation = useMutation({
    mutationFn: async () => {
      await signIn(email.trim(), password);
    },
  });

  const emailErrorMessage = (() => {
    const err = loginMutation.error;
    if (!err) return null;
    if (err instanceof ApiError) return err.message;
    if (err instanceof Error) return err.message;
    return null;
  })();
  const errorMessage = emailErrorMessage;
  const isAuthenticating = loginMutation.isPending;

  function getErrorMessage(error: unknown) {
    if (error instanceof ApiError) {
      return error.message;
    }

    if (error instanceof Error) {
      return error.message;
    }

    return 'Unable to continue.';
  }


  async function handleSignIn() {
    if (isAuthenticating || submitLockRef.current) {
      return;
    }

    submitLockRef.current = true;
    loginMutation.reset();

    try {
      await loginMutation.mutateAsync();
      router.navigate('/(app)');
    } finally {
      submitLockRef.current = false;
    }
  }



  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.keyboard}
    >
      <ScrollView
        contentContainerStyle={[
          styles.content,
          {
            paddingTop: insets.top + 80,
          },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.logoBlock}>
          <PeiPeiLogo
            markSize={56}
            style={styles.logoLockup}
            wordmarkLetterSpacing={4}
            wordmarkSize={24}
            wordmarkStyle={styles.wordmark}
          />
        </View>

        <View style={styles.form}>
          <Text style={styles.label}>Email</Text>
          <TextInput
            accessibilityLabel="Email"
            autoCapitalize="none"
            autoComplete="email"
            autoCorrect={false}
            keyboardType="email-address"
            onChangeText={setEmail}
            placeholder="runner@peipei.run"
            placeholderTextColor={colors.textTertiary}
            style={styles.input}
            textContentType="emailAddress"
            value={email}
          />

          <Text style={[styles.label, styles.fieldSpacing]}>Password</Text>
          <TextInput
            accessibilityLabel="Password"
            autoCapitalize="none"
            autoComplete="password"
            autoCorrect={false}
            onChangeText={setPassword}
            placeholder="Your password"
            placeholderTextColor={colors.textTertiary}
            secureTextEntry
            style={styles.input}
            textContentType="password"
            value={password}
          />

          {errorMessage ? <Text style={styles.error}>{errorMessage}</Text> : null}

          <Pressable
            accessibilityLabel="Sign in"
            disabled={isAuthenticating}
            onPress={() => {
              void handleSignIn();
            }}
            style={({ pressed }) => [
              styles.primaryButton,
              pressed && styles.buttonPressed,
              isAuthenticating && styles.buttonDisabled,
            ]}
          >
            {loginMutation.isPending ? (
              <ActivityIndicator color={colors.text} />
            ) : (
              <Text style={styles.primaryButtonText}>Sign in</Text>
            )}
          </Pressable>

          <Text style={styles.devNote}>
            Google and Apple sign-in are temporarily disabled in local dev builds.
          </Text>

          <Link href="/(auth)/register" style={styles.registerLink}>
            Need an account? Register
          </Link>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  buttonDisabled: {
    opacity: 0.55,
  },
  buttonPressed: {
    opacity: 0.8,
  },
  content: {
    flexGrow: 1,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.xxl,
  },
  devNote: {
    color: colors.textTertiary,
    fontSize: 14,
    marginTop: 24,
    textAlign: 'center',
  },
  error: {
    color: colors.destructive,
    fontSize: 14,
    marginTop: 12,
  },
  fieldSpacing: {
    marginTop: 24,
  },
  form: {
    marginTop: 48,
  },
  input: {
    backgroundColor: colors.surface,
    borderColor: colors.separator,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    color: colors.text,
    fontSize: 16,
    minHeight: 52,
    paddingHorizontal: 16,
  },
  keyboard: {
    backgroundColor: colors.background,
    flex: 1,
  },
  label: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.3,
    marginBottom: 8,
  },
  logoBlock: {
    alignItems: 'center',
  },
  logoLockup: {
    gap: 12,
  },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: colors.accent,
    borderRadius: 14,
    justifyContent: 'center',
    marginTop: 24,
    minHeight: 52,
  },
  primaryButtonText: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '600',
  },
  registerLink: {
    color: colors.textSecondary,
    fontSize: 15,
    marginTop: 32,
    textAlign: 'center',
  },
  socialButton: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.separator,
    borderRadius: radii.pill,
    borderWidth: StyleSheet.hairlineWidth,
    flex: 1,
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    minHeight: 54,
  },
  socialButtonText: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '600',
  },
  socialRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 14,
  },
  wordmark: {
    color: colors.textSecondary,
    fontFamily: fonts.brand,
    letterSpacing: 4,
    marginTop: 12,
  },
});
