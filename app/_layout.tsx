import { Jura_300Light } from '@expo-google-fonts/jura';
import { LibreBaskerville_400Regular } from '@expo-google-fonts/libre-baskerville';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useFonts } from 'expo-font';
import { Stack, useRootNavigationState, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { StyleSheet } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { PushNotificationBridge } from '../src/components/notifications/push-notification-bridge';
import { colors } from '../src/design/tokens';
import { AuthProvider, useAuth } from '../src/providers/auth-provider';

SplashScreen.preventAutoHideAsync().catch(() => {
  // Ignore duplicate splash calls during fast refresh.
});

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnReconnect: true,
      refetchOnWindowFocus: false,
    },
  },
});

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    Jura_300Light,
    LibreBaskerville_400Regular,
  });

  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <RootNavigator fontsLoaded={fontsLoaded} />
          </AuthProvider>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

function RootNavigator({ fontsLoaded }: { fontsLoaded: boolean }) {
  const navigationState = useRootNavigationState();
  const router = useRouter();
  const segments = useSegments();
  const { onboardingStatus, status } = useAuth();

  useEffect(() => {
    if (
      !fontsLoaded ||
      !navigationState?.key ||
      status === 'loading' ||
      onboardingStatus === 'loading'
    ) {
      return;
    }

    const activeGroup = segments[0];
    const activeScreen = segments.at(1);
    const isOnboardingRoute =
      activeGroup === '(app)' && activeScreen === 'onboarding';

    if (status === 'authenticated' && onboardingStatus === 'pending') {
      if (!isOnboardingRoute) {
        router.navigate('/(app)/onboarding');
      }
      return;
    }

    if (
      status === 'authenticated' &&
      (activeGroup !== '(app)' || isOnboardingRoute)
    ) {
      router.navigate('/(app)');
      return;
    }

    if (status === 'unauthenticated' && activeGroup !== '(auth)') {
      router.navigate('/(auth)/login');
    }
  }, [fontsLoaded, navigationState?.key, onboardingStatus, router, segments, status]);

  useEffect(() => {
    if (
      fontsLoaded &&
      status !== 'loading' &&
      onboardingStatus !== 'loading'
    ) {
      SplashScreen.hideAsync().catch(() => {
        // Ignore splash errors on repeated hides.
      });
    }
  }, [fontsLoaded, onboardingStatus, status]);

  if (
    !fontsLoaded ||
    status === 'loading' ||
    onboardingStatus === 'loading'
  ) {
    return null;
  }

  return (
    <>
      <StatusBar style="light" backgroundColor={colors.background} />
      <Stack
        screenOptions={{
          headerShown: false,
          animation: 'fade',
          contentStyle: {
            backgroundColor: colors.background,
          },
        }}
      >
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(app)" />
      </Stack>
      <PushNotificationBridge />
    </>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
  },
});
