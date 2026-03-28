import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, fonts } from '../../src/design/tokens';
import { getSettingsPanel, patchUserSettings } from '../../src/lib/api';
import { useAuth } from '../../src/providers/auth-provider';

export default function CoachInstructionsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { refreshSession, sessionCookie } = useAuth();
  const [value, setValue] = useState('');
  const [hasHydrated, setHasHydrated] = useState(false);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const settingsQuery = useQuery({
    queryKey: ['settings-panel'],
    queryFn: () => getSettingsPanel(sessionCookie ?? ''),
    enabled: Boolean(sessionCookie),
    retry: false,
  });

  const saveMutation = useMutation({
    mutationFn: async (nextValue: string) => {
      if (!sessionCookie || !settingsQuery.data) {
        return;
      }

      await patchUserSettings(sessionCookie, {
        coachLanguage: settingsQuery.data.coachLanguage,
        customInstructions: nextValue,
        displayName: settingsQuery.data.displayName,
        units: settingsQuery.data.units,
      });
      await refreshSession({ name: settingsQuery.data.displayName });
      await settingsQuery.refetch();
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    },
  });

  useEffect(() => {
    if (!settingsQuery.data) {
      return;
    }

    setValue(settingsQuery.data.customInstructions);
    setHasHydrated(true);
  }, [settingsQuery.data]);

  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!hasHydrated || !settingsQuery.data) {
      return;
    }

    if (value === settingsQuery.data.customInstructions) {
      return;
    }

    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    saveTimeoutRef.current = setTimeout(() => {
      void saveMutation.mutateAsync(value.trim());
    }, 500);
  }, [hasHydrated, saveMutation, settingsQuery.data, value]);

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.screen}
    >
      <ScrollView
        contentContainerStyle={[
          styles.content,
          {
            paddingTop: insets.top + 12,
            paddingBottom: Math.max(insets.bottom, 24) + 24,
          },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Ionicons
            color={colors.text}
            name="chevron-back"
            onPress={() => router.back()}
            size={22}
          />
          <Text style={styles.title}>Coach Instructions</Text>
          <View style={styles.placeholder} />
        </View>

        <Text style={styles.caption}>
          Tell PeiPei how you want the coach to respond. Changes save automatically.
        </Text>

        {settingsQuery.isLoading ? (
          <View style={styles.stateBlock}>
            <ActivityIndicator color={colors.text} />
          </View>
        ) : (
          <>
            <TextInput
              multiline
              onChangeText={setValue}
              placeholder="Calm, direct, and specific. Focus on recovery and pacing."
              placeholderTextColor={colors.textTertiary}
              style={styles.input}
              textAlignVertical="top"
              value={value}
            />
            <Text style={styles.statusText}>
              {saveMutation.isPending ? 'Saving...' : 'Saved automatically'}
            </Text>
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  caption: {
    color: colors.textSecondary,
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 16,
  },
  content: {
    paddingHorizontal: 16,
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 18,
  },
  input: {
    backgroundColor: colors.surfaceElevated,
    borderColor: colors.separator,
    borderRadius: 22,
    borderWidth: StyleSheet.hairlineWidth,
    color: colors.text,
    fontSize: 16,
    lineHeight: 24,
    minHeight: 320,
    padding: 18,
  },
  placeholder: {
    width: 22,
  },
  screen: {
    backgroundColor: colors.background,
    flex: 1,
  },
  stateBlock: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 180,
  },
  statusText: {
    color: colors.textTertiary,
    fontSize: 12,
    marginTop: 10,
  },
  title: {
    color: colors.text,
    fontSize: 22,
    fontWeight: '600',
  },
});
