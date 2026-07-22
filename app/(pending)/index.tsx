import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/contexts/ThemeContext";

export default function PendingApprovalScreen() {
  const { approvalStatus, signOut, profile } = useAuth();
  const { colors } = useTheme();

  const isRejected = approvalStatus === "rejected";

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.card, { backgroundColor: colors.cardBg }]}>
        {isRejected ? (
          <>
            <View style={[styles.iconCircle, { backgroundColor: colors.danger + "15" }]}>
              <Ionicons name="close-circle" size={56} color={colors.danger} />
            </View>
            <Text style={[styles.title, { color: colors.text }]}>Request Declined</Text>
            <Text style={[styles.message, { color: colors.textSecondary }]}>
              Unfortunately, your account request has been declined by the admin.
              Please contact support for more information.
            </Text>
          </>
        ) : (
          <>
            <View style={[styles.iconCircle, { backgroundColor: colors.warning + "15" }]}>
              <Ionicons name="hourglass-outline" size={56} color={colors.warning} />
            </View>
            <Text style={[styles.title, { color: colors.text }]}>Account Pending</Text>
            <Text style={[styles.message, { color: colors.textSecondary }]}>
              Hi {profile?.displayName?.split(" ")[0] ?? "there"}, your account is waiting for admin approval. You&apos;ll be able to use WalkSafe once approved.
            </Text>
            <View style={styles.statusRow}>
              <ActivityIndicator size="small" color={colors.primary} />
              <Text style={[styles.statusText, { color: colors.primary }]}>Waiting for approval...</Text>
            </View>
          </>
        )}
      </View>

      <TouchableOpacity style={[styles.signOutBtn, { borderColor: colors.border }]} onPress={signOut}>
        <Text style={[styles.signOutText, { color: colors.textSecondary }]}>Sign Out</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: "center", alignItems: "center", paddingHorizontal: 24 },
  card: { borderRadius: 20, padding: 32, alignItems: "center", width: "100%" },
  iconCircle: { width: 100, height: 100, borderRadius: 50, alignItems: "center", justifyContent: "center", marginBottom: 20 },
  title: { fontSize: 22, fontWeight: "700", marginBottom: 8, textAlign: "center" },
  message: { fontSize: 15, textAlign: "center", lineHeight: 22, marginBottom: 16 },
  statusRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  statusText: { fontSize: 14, fontWeight: "600" },
  signOutBtn: { marginTop: 24, borderWidth: 1, borderRadius: 10, paddingHorizontal: 32, paddingVertical: 12 },
  signOutText: { fontSize: 15, fontWeight: "500" },
});
