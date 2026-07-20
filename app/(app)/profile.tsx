import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { useAuth } from "@/contexts/AuthContext";

export default function ProfileScreen() {
  const { user, profile, signOut } = useAuth();

  return (
    <View style={styles.container}>
      <Text style={styles.label}>Name</Text>
      <Text style={styles.value}>{profile?.displayName ?? "—"}</Text>

      <Text style={styles.label}>Email</Text>
      <Text style={styles.value}>{user?.email}</Text>

      <TouchableOpacity style={styles.button} onPress={() => signOut()}>
        <Text style={styles.buttonText}>Sign Out</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 80,
  },
  label: {
    fontSize: 13,
    color: "#888",
    marginTop: 16,
  },
  value: {
    fontSize: 18,
    fontWeight: "500",
  },
  button: {
    backgroundColor: "#d32f2f",
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 40,
  },
  buttonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
});
