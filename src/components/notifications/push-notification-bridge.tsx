import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, radii, spacing } from '../../design/tokens';
import { registerPushToken } from '../../lib/api';
import { useAuth } from '../../providers/auth-provider';

const PUSH_PERMISSION_KEY = 'peipei.push.permission-requested';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: false,
    shouldSetBadge: false,
    shouldShowBanner: false,
    shouldShowList: false,
  }),
});

type BannerState = {
  body: string;
  title: string;
} | null;

export function PushNotificationBridge() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { sessionCookie, status } = useAuth();
  const [banner, setBanner] = useState<BannerState>(null);
  const translateY = useRef(new Animated.Value(-120)).current;

  useEffect(() => {
    const receivedSubscription = Notifications.addNotificationReceivedListener(
      (notification) => {
        setBanner({
          body: notification.request.content.body || 'Your coach checked in.',
          title: notification.request.content.title || 'PeiPei',
        });
      },
    );
    const responseSubscription =
      Notifications.addNotificationResponseReceivedListener(() => {
        router.replace('/');
      });

    Notifications.getLastNotificationResponseAsync().then((response) => {
      if (response) {
        router.replace('/');
      }
    });

    return () => {
      receivedSubscription.remove();
      responseSubscription.remove();
    };
  }, [router]);

  useEffect(() => {
    if (!banner) {
      Animated.timing(translateY, {
        duration: 180,
        toValue: -120,
        useNativeDriver: true,
      }).start();
      return;
    }

    Animated.spring(translateY, {
      bounciness: 0,
      speed: 18,
      toValue: 0,
      useNativeDriver: true,
    }).start();

    const timeout = setTimeout(() => {
      setBanner(null);
    }, 4200);

    return () => {
      clearTimeout(timeout);
    };
  }, [banner, translateY]);

  useEffect(() => {
    if (status !== 'authenticated' || !sessionCookie) {
      return;
    }

    let active = true;
    const activeSessionCookie = sessionCookie;

    async function setupPushNotifications() {
      const requestedBefore = await AsyncStorage.getItem(PUSH_PERMISSION_KEY);
      let permissions = await Notifications.getPermissionsAsync();
      const hasPermission =
        permissions.granted ||
        permissions.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL;

      if (!hasPermission && !requestedBefore) {
        permissions = await Notifications.requestPermissionsAsync();
        await AsyncStorage.setItem(PUSH_PERMISSION_KEY, 'true');
      }

      const grantedAfterRequest =
        permissions.granted ||
        permissions.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL;

      if (!grantedAfterRequest || !active) {
        return;
      }

      try {
        const tokenResponse = await Notifications.getDevicePushTokenAsync();
        const token = String(tokenResponse.data);
        await registerPushToken(
          activeSessionCookie,
          token,
          Platform.OS === 'ios' ? 'ios' : 'android',
        );
      } catch {
        // Ignore placeholder push registration errors until the backend endpoint exists.
      }
    }

    void setupPushNotifications();

    return () => {
      active = false;
    };
  }, [sessionCookie, status]);

  if (!banner) {
    return null;
  }

  return (
    <Animated.View
      pointerEvents="box-none"
      style={[
        styles.container,
        {
          paddingTop: insets.top + spacing.sm,
          transform: [{ translateY }],
        },
      ]}
    >
      <Pressable
        accessibilityLabel="Open coach notification"
        onPress={() => {
          setBanner(null);
          router.replace('/');
        }}
        style={({ pressed }) => [
          styles.banner,
          pressed && styles.pressed,
        ]}
      >
        <Text style={styles.bannerTitle}>{banner.title}</Text>
        <Text style={styles.bannerBody}>{banner.body}</Text>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    left: 0,
    paddingHorizontal: spacing.lg,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  banner: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.card,
    borderWidth: StyleSheet.hairlineWidth,
    padding: spacing.lg,
    shadowColor: '#000000',
    shadowOffset: { height: 12, width: 0 },
    shadowOpacity: 0.22,
    shadowRadius: 24,
  },
  bannerTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '700',
  },
  bannerBody: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 20,
    marginTop: spacing.xs,
  },
  pressed: {
    opacity: 0.9,
  },
});
