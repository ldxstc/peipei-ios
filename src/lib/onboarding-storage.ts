import AsyncStorage from '@react-native-async-storage/async-storage';

const ONBOARDING_PENDING_KEY = 'peipei.onboarding.pending';

export async function getOnboardingPending() {
  return (await AsyncStorage.getItem(ONBOARDING_PENDING_KEY)) === 'true';
}

export async function setOnboardingPending(isPending: boolean) {
  if (isPending) {
    await AsyncStorage.setItem(ONBOARDING_PENDING_KEY, 'true');
    return;
  }

  await AsyncStorage.removeItem(ONBOARDING_PENDING_KEY);
}
