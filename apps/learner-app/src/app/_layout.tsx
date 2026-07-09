import "../global.css";

import { useEffect, useState } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { hydrateToken, queryClient } from "@/lib/api";

export default function RootLayout() {
  // SecureStore reads are async; the token mirror hydrates once before any screen can
  // fire an authenticated request, so the `hc` headers callback stays synchronous.
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    void hydrateToken().finally(() => setHydrated(true));
  }, []);
  if (!hydrated) return null;
  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <StatusBar style="dark" />
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: "#f7f0de" }
          }}
        />
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
