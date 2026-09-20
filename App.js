import React from 'react';
import { StatusBar, BackHandler } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import CindraStudioScreen, { NoticeCardHost } from './CindraStudio';

export default function App() {
  return (
    <SafeAreaProvider>
      <StatusBar barStyle="light-content" backgroundColor="#000000" />
      <CindraStudioScreen visible onClose={() => BackHandler.exitApp()} />
      <NoticeCardHost />
    </SafeAreaProvider>
  );
}
