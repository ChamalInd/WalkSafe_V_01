import { ActivityIndicator, StyleSheet, View } from "react-native";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";

import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { ThemeProvider, useTheme } from "@/contexts/ThemeContext";

export const unstable_settings = {
  anchor: "(app)",
};

function RootNavigator() {
  const { user, initializing, approvalStatus } = useAuth();
  const { colors } = useTheme();

  if (initializing || (user && approvalStatus === null)) {
    return (
      <View style={[styles.loading, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  const isApproved = !!user && approvalStatus === "approved";
  const isPendingOrRejected = !!user && approvalStatus !== "approved";

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Protected guard={isApproved}>
        <Stack.Screen name="(app)" />
      </Stack.Protected>

      <Stack.Protected guard={isPendingOrRejected}>
        <Stack.Screen name="(pending)" />
      </Stack.Protected>

      <Stack.Protected guard={!user}>
        <Stack.Screen name="(auth)" />
      </Stack.Protected>
    </Stack>
  );
}

function ThemedStatusBar() {
  const { isDark } = useTheme();
  return <StatusBar style={isDark ? "light" : "dark"} />;
}

export default function RootLayout() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <RootNavigator />
        <ThemedStatusBar />
      </AuthProvider>
    </ThemeProvider>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
});
