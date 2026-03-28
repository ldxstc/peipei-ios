import { Ionicons } from '@expo/vector-icons';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as AuthSession from 'expo-auth-session';
import Constants from 'expo-constants';
import * as Crypto from 'expo-crypto';
import * as WebBrowser from 'expo-web-browser';
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

import { PeiPeiLogo } from '../../src/components/branding/peipei-logo';
import { colors, fonts, radii, spacing } from '../../src/design/tokens';
import { ApiError, type SocialAuthProvider } from '../../src/lib/api';
import { useAuth } from '../../src/providers/auth-provider';

WebBrowser.maybeCompleteAuthSession();

const GOOGLE_DISCOVERY_ISSUER = 'https://accounts.google.com';
const expoExtra = Constants.expoConfig?.extra as
  | {
      googleClientId?: unknown;
    }
  | undefined;
const GOOGLE_CLIENT_ID =
  typeof expoExtra?.googleClientId === 'string' &&
  expoExtra.googleClientId.trim()
    ? expoExtra.googleClientId.trim()
    : null;

export default function LoginScreen() {
  const router = useRouter();
  const { signIn, signInWithSocial } = useAuth();
  const submitLockRef = useRef(false);
  const googleNonceRef = useRef(Crypto.randomUUID());
  const appleNonceRef = useRef(Crypto.randomUUID());
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [appleAuthAvailable, setAppleAuthAvailable] = useState(false);
  const [activeSocialProvider, setActiveSocialProvider] =
    useState<SocialAuthProvider | null>(null);
  const [socialErrorMessage, setSocialErrorMessage] = useState<string | null>(
    null,
  );

  const googleRedirectUri = AuthSession.makeRedirectUri({
    path: 'oauthredirect',
    scheme: 'peipei',
  });
  const googleDiscovery = AuthSession.useAutoDiscovery(GOOGLE_DISCOVERY_ISSUER);
  const [googleRequest, , promptGoogleAsync] = AuthSession.useAuthRequest(
    {
      clientId: GOOGLE_CLIENT_ID ?? 'missing-google-client-id',
      extraParams: {
        nonce: googleNonceRef.current,
        prompt: 'select_account',
      },
      redirectUri: googleRedirectUri,
      responseType: 'id_token token',
      scopes: ['openid', 'profile', 'email'],
      usePKCE: false,
    },
    googleDiscovery,
  );

  const loginMutation = useMutation({
    mutationFn: async () => {
      await signIn(email.trim(), password);
    },
  });

  useEffect(() => {
    let isMounted = true;

    async function checkAppleAvailability() {
      if (Platform.OS !== 'ios') {
        return;
      }

      try {
        const isAvailable = await AppleAuthentication.isAvailableAsync();

        if (isMounted) {
          setAppleAuthAvailable(isAvailable);
        }
      } catch {
        if (isMounted) {
          setAppleAuthAvailable(false);
        }
      }
    }

    void checkAppleAvailability();

    return () => {
      isMounted = false;
    };
  }, []);

  const emailErrorMessage =
    loginMutation.error instanceof ApiError
      ? loginMutation.error.message
      : loginMutation.error instanceof Error
        ? loginMutation.error.message
        : null;
  const errorMessage = socialErrorMessage || emailErrorMessage;
  const isAuthenticating =
    loginMutation.isPending || activeSocialProvider !== null;

  function getErrorMessage(error: unknown) {
    if (error instanceof ApiError) {
      return error.message;
    }

    if (error instanceof Error) {
      return error.message;
    }

    return 'Unable to continue.';
  }

  async function completeSocialSignIn(
    provider: SocialAuthProvider,
    token: string,
    accessToken?: string,
    nonce?: string,
  ) {
    await signInWithSocial({
      accessToken,
      nonce,
      provider,
      token,
    });
    router.navigate('/(app)');
  }

  async function handleSignIn() {
    if (isAuthenticating || submitLockRef.current) {
      return;
    }

    submitLockRef.current = true;
    setSocialErrorMessage(null);
    loginMutation.reset();

    try {
      await loginMutation.mutateAsync();
      router.navigate('/(app)');
    } finally {
      submitLockRef.current = false;
    }
  }

  async function handleGoogleSignIn() {
    if (isAuthenticating || submitLockRef.current) {
      return;
    }

    if (!GOOGLE_CLIENT_ID) {
      setSocialErrorMessage('Google Sign-In is not configured.');
      return;
    }

    if (!googleDiscovery || !googleRequest) {
      setSocialErrorMessage('Google Sign-In is still loading.');
      return;
    }

    submitLockRef.current = true;
    loginMutation.reset();
    setSocialErrorMessage(null);
    setActiveSocialProvider('google');

    try {
      const result = await promptGoogleAsync();

      if (result.type === 'cancel' || result.type === 'dismiss') {
        return;
      }

      if (result.type !== 'success') {
        throw new Error('Google Sign-In was not completed.');
      }

      const idToken =
        typeof result.params.id_token === 'string' ? result.params.id_token : null;
      const accessToken =
        typeof result.params.access_token === 'string'
          ? result.params.access_token
          : undefined;

      if (!idToken) {
        throw new Error('Google did not return an ID token.');
      }

      await completeSocialSignIn(
        'google',
        idToken,
        accessToken,
        googleNonceRef.current,
      );
    } catch (error) {
      setSocialErrorMessage(getErrorMessage(error));
    } finally {
      setActiveSocialProvider(null);
      submitLockRef.current = false;
    }
  }

  async function handleAppleSignIn() {
    if (isAuthenticating || submitLockRef.current || !appleAuthAvailable) {
      return;
    }

    submitLockRef.current = true;
    loginMutation.reset();
    setSocialErrorMessage(null);
    setActiveSocialProvider('apple');

    try {
      const credential = await AppleAuthentication.signInAsync({
        nonce: appleNonceRef.current,
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });

      if (!credential.identityToken) {
        throw new Error('Apple did not return an identity token.');
      }

      await completeSocialSignIn(
        'apple',
        credential.identityToken,
        undefined,
        appleNonceRef.current,
      );
    } catch (error) {
      if (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        error.code === 'ERR_REQUEST_CANCELED'
      ) {
        return;
      }

      setSocialErrorMessage(getErrorMessage(error));
    } finally {
      setActiveSocialProvider(null);
      submitLockRef.current = false;
    }
  }

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
          <PeiPeiLogo markSize={48} style={styles.logoLockup} />
          <Text style={styles.title}>For the long run.</Text>
          <Text style={styles.subtitle}>
            Sign in to pick up your coach conversation where you left it.
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.label}>Email</Text>
          <TextInput
            accessibilityHint="Enter the email address for your PeiPei account."
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
            accessibilityHint="Enter your account password."
            accessibilityLabel="Password"
            autoCapitalize="none"
            autoComplete="password"
            autoCorrect={false}
            onChangeText={setPassword}
            placeholder="Your password"
            placeholderTextColor={colors.muted}
            secureTextEntry
            style={styles.input}
            textContentType="password"
            value={password}
          />

          {errorMessage ? <Text style={styles.error}>{errorMessage}</Text> : null}

          <Pressable
            accessibilityLabel="Sign in"
            accessibilityRole="button"
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

          <Text style={styles.divider}>— or —</Text>

          <Pressable
            accessibilityLabel="Continue with Google"
            accessibilityRole="button"
            disabled={
              isAuthenticating ||
              !GOOGLE_CLIENT_ID ||
              !googleDiscovery ||
              !googleRequest
            }
            onPress={() => {
              void handleGoogleSignIn();
            }}
            style={({ pressed }) => [
              styles.socialButton,
              styles.googleButton,
              pressed && styles.buttonPressed,
              (isAuthenticating ||
                !GOOGLE_CLIENT_ID ||
                !googleDiscovery ||
                !googleRequest) &&
                styles.buttonDisabled,
            ]}
          >
            {activeSocialProvider === 'google' ? (
              <ActivityIndicator color="#111111" />
            ) : (
              <>
                <View style={styles.googleIconBadge}>
                  <Ionicons color="#DB4437" name="logo-google" size={18} />
                </View>
                <Text style={styles.googleButtonText}>Continue with Google</Text>
              </>
            )}
          </Pressable>

          {appleAuthAvailable ? (
            <View
              style={[
                styles.appleButtonWrapper,
                activeSocialProvider === 'apple' && styles.buttonDisabled,
              ]}
            >
              <AppleAuthentication.AppleAuthenticationButton
                buttonStyle={
                  AppleAuthentication.AppleAuthenticationButtonStyle.BLACK
                }
                buttonType={
                  AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN
                }
                cornerRadius={27}
                onPress={() => {
                  void handleAppleSignIn();
                }}
                style={styles.appleButton}
              />
            </View>
          ) : null}

          <Link
            accessibilityLabel="Go to registration"
            href="/(auth)/register"
            style={styles.secondaryLink}
          >
            Need an account? Register
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
    alignItems: 'center',
    gap: spacing.md,
  },
  logoLockup: {
    marginBottom: spacing.sm,
  },
  title: {
    color: colors.text,
    fontFamily: fonts.coach,
    fontSize: 42,
    lineHeight: 48,
    textAlign: 'center',
  },
  subtitle: {
    color: colors.muted,
    fontSize: 16,
    lineHeight: 24,
    textAlign: 'center',
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
  divider: {
    color: colors.muted,
    marginTop: spacing.lg,
    textAlign: 'center',
  },
  socialButton: {
    alignItems: 'center',
    borderRadius: radii.pill,
    flexDirection: 'row',
    gap: spacing.md,
    justifyContent: 'center',
    marginTop: spacing.lg,
    minHeight: 54,
    paddingHorizontal: spacing.lg,
  },
  googleButton: {
    backgroundColor: '#FFFFFF',
    borderColor: '#DADCE0',
    borderWidth: StyleSheet.hairlineWidth,
  },
  googleIconBadge: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 11,
    height: 22,
    justifyContent: 'center',
    width: 22,
  },
  googleButtonText: {
    color: '#111111',
    fontSize: 16,
    fontWeight: '600',
  },
  appleButtonWrapper: {
    marginTop: spacing.lg,
  },
  appleButton: {
    height: 54,
    width: '100%',
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
