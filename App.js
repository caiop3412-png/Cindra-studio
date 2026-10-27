import React, { useEffect, useState, useCallback } from 'react';
import { StatusBar, BackHandler, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as SplashScreen from 'expo-splash-screen';
import CindraStudioScreen, { NoticeCardHost } from './CindraStudio';

SplashScreen.preventAutoHideAsync();

export default function App() {
  const [pronto, setPronto] = useState(false);

  useEffect(() => {
    setPronto(true);
  }, []);

  const onLayout = useCallback(async () => {
    if (pronto) await SplashScreen.hideAsync();
  }, [pronto]);

  if (!pronto) return null;

  return (
    <SafeAreaProvider>
      <View style={{ flex: 1, backgroundColor: '#0c0c0d' }} onLayout={onLayout}>
        <StatusBar barStyle="light-content" backgroundColor="#000000" />
        <CindraStudioScreen visible onClose={() => BackHandler.exitApp()} />
        <NoticeCardHost />
      </View>
    </SafeAreaProvider>
  );
}
