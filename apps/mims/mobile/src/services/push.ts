import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { registerMobilePushDevice } from './api';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

type PushRegistrationResult =
  | { status: 'registered'; pushToken: string }
  | { status: 'unsupported'; reason: string }
  | { status: 'skipped'; reason: string };

function getAppBuild() {
  return (
    Constants.expoConfig?.version ||
    Constants.nativeAppVersion ||
    Constants.nativeBuildVersion ||
    'dev'
  );
}

export async function registerPushForSession(token: string): Promise<PushRegistrationResult> {
  if (Platform.OS === 'web') {
    return { status: 'skipped', reason: 'Push registration is disabled in browser preview.' };
  }

  if (!Device.isDevice) {
    return { status: 'unsupported', reason: 'Expo push registration requires a physical device.' };
  }

  const permissionState = await Notifications.getPermissionsAsync();
  let finalStatus = permissionState.status;

  if (finalStatus !== 'granted') {
    const requested = await Notifications.requestPermissionsAsync();
    finalStatus = requested.status;
  }

  if (finalStatus !== 'granted') {
    return { status: 'unsupported', reason: 'Notification permission was not granted.' };
  }

  const projectId =
    Constants.expoConfig?.extra?.eas?.projectId ||
    Constants.easConfig?.projectId;

  if (!projectId) {
    return { status: 'unsupported', reason: 'Expo project id is missing for push setup.' };
  }

  const pushToken = (
    await Notifications.getExpoPushTokenAsync({ projectId })
  ).data;

  await registerMobilePushDevice(token, {
    pushToken,
    platform: Platform.OS,
    deviceLabel: Device.modelName || Device.deviceName || 'Mobile device',
    appBuild: getAppBuild(),
    provider: 'expo',
  });

  return { status: 'registered', pushToken };
}
