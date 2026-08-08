import "../global.css";

import { QueryClientProvider } from "@tanstack/react-query";
import { IMFellEnglish_400Regular } from "@expo-google-fonts/im-fell-english";
import { useFonts } from "expo-font";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider, initialWindowMetrics } from "react-native-safe-area-context";
import { PortalHost } from "@rn-primitives/portal";
import { queryClient } from "@/lib/api";
import { RouteStatus, colors } from "@/ui";
import { learnerTerm } from "@/learn/vocabulary";

export default function RootLayout() {
  // The credential no longer needs a bootstrap step: the session cookie is read synchronously
  // out of SecureStore (native) or held by the browser (web), so nothing has to be hydrated
  // before the first authenticated request. The map display face joins the bootstrap gate
  // (plan 2026-07-18-001 KTD4) so map-title headings never flash the system font. A load error
  // falls back to the system face rather than blocking entry.
  const [fontsLoaded, fontError] = useFonts({ IMFellEnglish_400Regular });
  const ready = fontsLoaded || fontError !== null;
  // Native metrics are available synchronously at startup: without them the first frame
  // renders with zero insets and every header visibly drops once the provider measures.
  // The value is null on web, which the prop accepts.
  return (
    <SafeAreaProvider initialMetrics={initialWindowMetrics}>
      <QueryClientProvider client={queryClient}>
        <StatusBar style="dark" />
        {/* Font loading is a visible bootstrap state, not a blank frame (plan
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
