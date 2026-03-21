import { Stack } from 'expo-router';

import { colors } from '../../src/design/tokens';

export default function AppLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: {
          backgroundColor: colors.background,
        },
      }}
    >
      <Stack.Screen name="index" />
      <Stack.Screen
        name="settings"
        options={{
          animation: 'slide_from_bottom',
          contentStyle: {
            backgroundColor: 'transparent',
          },
          presentation: 'transparentModal',
        }}
      />
    </Stack>
  );
}
