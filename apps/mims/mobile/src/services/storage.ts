import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const SESSION_KEY = 'mims_mobile_session';
const REMEMBER_DEVICE_KEY = 'mims_mobile_2fa_device_token';

async function readWebStorage(key: string) {
  if (typeof globalThis.localStorage === 'undefined') return null;
  return globalThis.localStorage.getItem(key);
}

async function writeWebStorage(key: string, value: string) {
  if (typeof globalThis.localStorage === 'undefined') return;
  globalThis.localStorage.setItem(key, value);
}

async function removeWebStorage(key: string) {
  if (typeof globalThis.localStorage === 'undefined') return;
  globalThis.localStorage.removeItem(key);
}

async function getItem(key: string) {
  if (Platform.OS === 'web') return readWebStorage(key);
  return SecureStore.getItemAsync(key);
}

async function setItem(key: string, value: string) {
  if (Platform.OS === 'web') return writeWebStorage(key, value);
  return SecureStore.setItemAsync(key, value);
}

async function deleteItem(key: string) {
  if (Platform.OS === 'web') return removeWebStorage(key);
  return SecureStore.deleteItemAsync(key);
}

export async function loadStoredSession() {
  return getItem(SESSION_KEY);
}

export async function storeSession(value: string) {
  return setItem(SESSION_KEY, value);
}

export async function clearStoredSession() {
  return deleteItem(SESSION_KEY);
}

export async function loadRememberedDeviceToken() {
  return getItem(REMEMBER_DEVICE_KEY);
}

export async function storeRememberedDeviceToken(value: string) {
  return setItem(REMEMBER_DEVICE_KEY, value);
}

export async function clearRememberedDeviceToken() {
  return deleteItem(REMEMBER_DEVICE_KEY);
}
