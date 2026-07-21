import {
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";

import useIncomingRequest from "@/hooks/useIncomingRequest";
import { useTheme } from "@/contexts/ThemeContext";
import { db } from "@/firebaseConfig";
import { doc, updateDoc, deleteDoc } from "firebase/firestore";

export default function JourneyRequestModal() {
  const { colors } = useTheme();
  const router = useRouter();
  const incoming = useIncomingRequest();
  const visible = incoming !== null;

  async function handleAccept() {
    if (!incoming) return;
    await updateDoc(doc(db, "journey_requests", incoming.id), {
      status: "accepted",
    }).catch(() => {});
    router.replace("/(app)/schedule");
  }

  async function handleReject() {
    if (!incoming) return;
    await deleteDoc(doc(db, "journey_requests", incoming.id)).catch(() => {});
  }

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.overlay}>
        <View style={[styles.card, { backgroundColor: colors.cardBg }]}>
          <View style={[styles.avatar, { backgroundColor: colors.primary }]}>
            <Text style={styles.avatarText}>
              {incoming?.requesterName?.charAt(0) ?? "?"}
            </Text>
          </View>
          <Text style={[styles.title, { color: colors.text }]}>
            Journey Request
          </Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
            {incoming?.requesterName ?? "Someone"} wants to walk with you!
          </Text>
          <View style={styles.row}>
            <TouchableOpacity
              style={[styles.btn, { backgroundColor: colors.danger }]}
              onPress={handleReject}
            >
              <Ionicons name="close-circle-outline" size={18} color="#fff" />
              <Text style={styles.btnText}>Reject</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.btn, { backgroundColor: colors.success }]}
              onPress={handleAccept}
            >
              <Ionicons
                name="checkmark-circle-outline"
                size={18}
                color="#fff"
              />
              <Text style={styles.btnText}>Accept</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 30,
  },
  card: {
    width: "100%",
    borderRadius: 20,
    padding: 28,
    alignItems: "center",
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { color: "#fff", fontSize: 26, fontWeight: "700" },
  title: { fontSize: 20, fontWeight: "700", marginTop: 16 },
  subtitle: { fontSize: 14, textAlign: "center", marginTop: 8, lineHeight: 20 },
  row: { flexDirection: "row", gap: 12, marginTop: 24, width: "100%" },
  btn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    paddingVertical: 14,
    gap: 6,
  },
  btnText: { color: "#fff", fontSize: 15, fontWeight: "600" },
});
