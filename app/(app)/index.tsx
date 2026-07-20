import { StyleSheet, Text, View } from "react-native";

import { useAuth } from "@/contexts/AuthContext";

export default function HomeScreen() {
  const { profile, user } = useAuth();

  return (
    <View style={styles.container}>
      <Text style={styles.title}>WalkSafe</Text>
      <Text style={styles.greeting}>
        Hi {profile?.displayName ?? user?.email}, you&apos;re signed in 👋
      </Text>
      <Text style={styles.body}>
        This is your protected home screen. Build your WalkSafe features here.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  title: {
    fontSize: 32,
    fontWeight: "700",
    marginBottom: 12,
  },
  greeting: {
    fontSize: 18,
    marginBottom: 8,
    textAlign: "center",
  },
  body: {
    fontSize: 14,
    color: "#666",
    textAlign: "center",
  },
});
