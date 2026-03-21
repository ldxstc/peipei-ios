import * as FileSystem from 'expo-file-system/legacy';
import * as MediaLibrary from 'expo-media-library';
import * as Sharing from 'expo-sharing';
import { Linking } from 'react-native';

function inferExtension(url: string) {
  const cleanUrl = url.split('?')[0] ?? url;
  const extension = cleanUrl.split('.').pop();

  if (!extension || extension.length > 5) {
    return 'png';
  }

  return extension;
}

export async function downloadRemoteImage(url: string) {
  const cacheDirectory = FileSystem.cacheDirectory;

  if (!cacheDirectory) {
    throw new Error('The local cache directory is unavailable.');
  }

  const localPath = `${cacheDirectory}peipei-social-${Date.now()}.${inferExtension(
    url,
  )}`;
  const result = await FileSystem.downloadAsync(url, localPath);

  return result.uri;
}

export async function saveRemoteImageToLibrary(url: string) {
  const permission = await MediaLibrary.requestPermissionsAsync();

  if (!permission.granted) {
    throw new Error('Photos permission is required to save images.');
  }

  const localUri = await downloadRemoteImage(url);
  await MediaLibrary.saveToLibraryAsync(localUri);

  return localUri;
}

export async function shareRemoteImage(url: string) {
  const localUri = await downloadRemoteImage(url);
  const isAvailable = await Sharing.isAvailableAsync();

  if (!isAvailable) {
    throw new Error('Sharing is not available on this device.');
  }

  await Sharing.shareAsync(localUri);
}

export async function openLinkedInShare(text: string) {
  const url = `https://www.linkedin.com/feed/?shareActive=true&text=${encodeURIComponent(
    text,
  )}`;
  await Linking.openURL(url);
}
