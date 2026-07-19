import "../global.css";

import { useEffect, useState } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { IMFellEnglish_400Regular } from "@expo-google-fonts/im-fell-english";
import { useFonts } from "expo-font";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { PortalHost } from "@rn-primitives/portal";
import { hydrateToken, queryClient } from "@/lib/api";
import { RouteStatus, colors } from "@/ui";
import { learnerTerm } from "@/learn/vocabulary";

export default function RootLayout() {
  // SecureStore reads are async; the token mirror hydrates once before any screen can
  // fire an authenticated request, so the `hc` headers callback stays synchronous.
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    void hydrateToken().finally(() => setHydrated(true));
  }, []);
  // The map display face joins the bootstrap gate (plan 2026-07-18-001 KTD4) so
  // map-title headings never flash the system font. A load error falls back to the
  // system face rather than blocking entry.
  const [fontsLoaded, fontError] = useFonts({ IMFellEnglish_400Regular });
  const ready = hydrated && (fontsLoaded || fontError !== null);
  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <StatusBar style="dark" />
        {/* Token hydration is a visible bootstrap state, not a blank frame (plan
            2026-07-14-001 R6). It renders inside the providers so RouteStatus's Screen
            still reads safe-area insets. */}
        {ready ? (
          <>
            <Stack
              screenOptions={{
                headerShown: false,
                contentStyle: { backgroundColor: colors.background }
              }}
            />
            {/* Native overlay layer for Dialog/FullScreenDialog portals (KTD4). */}
            <PortalHost />
          </>
        ) : (
          <RouteStatus tone="loading" title={learnerTerm("bootstrapLoading")} />
        )}
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
