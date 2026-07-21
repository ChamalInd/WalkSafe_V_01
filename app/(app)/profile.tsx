import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import {
  EmailAuthProvider,
  reauthenticateWithCredential,
  updatePassword,
} from "firebase/auth";
import { doc, getDoc, updateDoc, collection, query, where, getDocs } from "firebase/firestore";

import { useFocusEffect } from "expo-router";

import { useAuth } from "@/contexts/AuthContext";
import { useTheme, ThemeMode } from "@/contexts/ThemeContext";
import { db } from "@/firebaseConfig";

const THEME_OPTIONS: { value: ThemeMode; label: string; icon: "sunny" | "moon" | "phone-portrait" }[] = [
  { value: "light", label: "Light", icon: "sunny" },
  { value: "dark", label: "Dark", icon: "moon" },
  { value: "system", label: "System", icon: "phone-portrait" },
];

export default function ProfileScreen() {
  const { user, profile, signOut } = useAuth();
  const { colors, mode, setMode } = useTheme();

  const [userRating, setUserRating] = useState<number>(5.0);
  const [userTotalRatings, setUserTotalRatings] = useState<number>(0);
  const [totalJourneys, setTotalJourneys] = useState(0);
  const [totalFriends, setTotalFriends] = useState(0);
  const [totalReports, setTotalReports] = useState(0);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  useFocusEffect(
    useCallback(() => {
      if (!user) return;

      getDoc(doc(db, "users", user.uid)).then((snap) => {
        if (snap.exists()) {
          const d = snap.data();
          setUserRating(d.rating ?? 5.0);
          setUserTotalRatings(d.totalRatings ?? 0);
        }
      }).catch(() => {});

      const uid = user.uid;

      const journeysQ = query(collection(db, "journey_requests"), where("status", "==", "completed"));
      getDocs(journeysQ).then((snap) => {
        const myJourneys = snap.docs.filter((d) => {
          const data = d.data();
          return data.requesterUid === uid || data.partnerUid === uid;
        });
        setTotalJourneys(myJourneys.length);

        const friends = new Set<string>();
        myJourneys.forEach((d) => {
          const data = d.data();
          if (data.requesterUid === uid) friends.add(data.partnerUid);
          else friends.add(data.requesterUid);
        });
        setTotalFriends(friends.size);
      }).catch(() => {});

      const reportsQ = query(collection(db, "danger_zones"), where("reporters", "array-contains", uid));
      getDocs(reportsQ).then((snap) => setTotalReports(snap.size)).catch(() => {});
    }, [user])
  );

  async function handleChangePassword() {
    if (!currentPassword || !newPassword || !confirmPassword) {
      Alert.alert("Error", "Please fill in all fields.");
      return;
    }
    if (newPassword.length < 6) {
      Alert.alert("Error", "New password must be at least 6 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      Alert.alert("Error", "New passwords do not match.");
      return;
    }
    if (!user || !user.email) {
      Alert.alert("Error", "No user session found.");
      return;
    }

    setPasswordLoading(true);
    try {
      const credential = EmailAuthProvider.credential(user.email, currentPassword);
      await reauthenticateWithCredential(user, credential);
      await updatePassword(user, newPassword);
      await updateDoc(doc(db, "users", user.uid), { passwordUpdatedAt: new Date().toISOString() });

      setShowPasswordModal(false);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      Alert.alert("Success", "Your password has been updated.");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      if (msg.includes("auth/wrong-password") || msg.includes("auth/invalid-credential")) {
        Alert.alert("Error", "Current password is incorrect.");
      } else if (msg.includes("auth/weak-password")) {
        Alert.alert("Error", "New password is too weak.");
      } else {
        Alert.alert("Error", "Failed to update password. Please try again.");
      }
    } finally {
      setPasswordLoading(false);
    }
  }

  function closePasswordModal() {
    setShowPasswordModal(false);
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setShowCurrent(false);
    setShowNew(false);
    setShowConfirm(false);
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* ─── HEADER ──────────────────────── */}
      <View style={styles.header}>
        <View style={[styles.avatar, { backgroundColor: colors.primary }]}>
          <Text style={styles.avatarText}>
            {(profile?.displayName ?? user?.email ?? "?").charAt(0).toUpperCase()}
          </Text>
        </View>
        <Text style={[styles.name, { color: colors.text }]}>{profile?.displayName ?? "—"}</Text>
        <Text style={[styles.email, { color: colors.textTertiary }]}>{user?.email}</Text>
        <View style={styles.ratingRow}>
          <Ionicons name="star" size={16} color="#F5A623" />
          <Text style={[styles.ratingText, { color: colors.text }]}>{userRating.toFixed(1)}</Text>
          <Text style={[styles.ratingCount, { color: colors.textTertiary }]}>
            ({userTotalRatings} {userTotalRatings === 1 ? "rating" : "ratings"})
          </Text>
        </View>
      </View>

      {/* ─── STATS ───────────────────────── */}
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.textTertiary }]}>STATS</Text>
        <View style={[styles.statsGrid, { backgroundColor: colors.cardBg }]}>
          <View style={[styles.statsCell, { borderRightWidth: StyleSheet.hairlineWidth, borderRightColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }]}>
            <Ionicons name="walk" size={22} color={colors.primary} />
            <Text style={[styles.statsNum, { color: colors.text }]}>{totalJourneys}</Text>
            <Text style={[styles.statsLabel, { color: colors.textSecondary }]}>Journeys</Text>
          </View>
          <View style={[styles.statsCell, { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }]}>
            <Ionicons name="people" size={22} color={colors.success} />
            <Text style={[styles.statsNum, { color: colors.text }]}>{totalFriends}</Text>
            <Text style={[styles.statsLabel, { color: colors.textSecondary }]}>Friends</Text>
          </View>
          <View style={[styles.statsCell, { borderRightWidth: StyleSheet.hairlineWidth, borderRightColor: colors.border }]}>
            <Ionicons name="flag" size={22} color={colors.warning} />
            <Text style={[styles.statsNum, { color: colors.text }]}>{totalReports}</Text>
            <Text style={[styles.statsLabel, { color: colors.textSecondary }]}>Reports</Text>
          </View>
          <View style={styles.statsCell}>
            <Ionicons name="star" size={22} color="#F5A623" />
            <Text style={[styles.statsNum, { color: colors.text }]}>{userTotalRatings}</Text>
            <Text style={[styles.statsLabel, { color: colors.textSecondary }]}>Reviews</Text>
          </View>
        </View>
      </View>

      {/* ─── APPEARANCE ──────────────────── */}
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.textTertiary }]}>APPEARANCE</Text>
        <View style={[styles.card, { backgroundColor: colors.cardBg }]}>
          {THEME_OPTIONS.map((opt, i) => (
            <TouchableOpacity
              key={opt.value}
              style={[styles.themeRow, i < THEME_OPTIONS.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }]}
              onPress={() => setMode(opt.value)}
              activeOpacity={0.6}
            >
              <View style={styles.themeLeft}>
                <Ionicons name={opt.icon} size={20} color={colors.textSecondary} />
                <Text style={[styles.themeLabel, { color: colors.text }]}>{opt.label}</Text>
              </View>
              {mode === opt.value && <Ionicons name="checkmark" size={20} color={colors.primary} />}
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* ─── ACCOUNT ─────────────────────── */}
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.textTertiary }]}>ACCOUNT</Text>
        <View style={[styles.card, { backgroundColor: colors.cardBg }]}>
          <TouchableOpacity
            style={styles.menuRow}
            onPress={() => setShowPasswordModal(true)}
            activeOpacity={0.6}
          >
            <View style={styles.menuLeft}>
              <Ionicons name="lock-closed-outline" size={20} color={colors.textSecondary} />
              <Text style={[styles.menuLabel, { color: colors.text }]}>Change Password</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
          </TouchableOpacity>
        </View>
      </View>

      {/* ─── SIGN OUT ────────────────────── */}
      <View style={styles.section}>
        <TouchableOpacity style={[styles.signOutBtn, { backgroundColor: colors.danger }]} onPress={() => signOut()} activeOpacity={0.7}>
          <Ionicons name="log-out-outline" size={20} color="#fff" />
          <Text style={styles.signOutText}>Sign Out</Text>
        </TouchableOpacity>
      </View>

      {/* ─── PASSWORD MODAL ──────────────── */}
      <Modal visible={showPasswordModal} animationType="slide" presentationStyle="pageSheet" onRequestClose={closePasswordModal}>
        <View style={[styles.modalContainer, { backgroundColor: colors.background }]}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={closePasswordModal}>
              <Text style={[styles.modalCancel, { color: colors.primary }]}>Cancel</Text>
            </TouchableOpacity>
            <Text style={[styles.modalTitle, { color: colors.text }]}>Change Password</Text>
            <TouchableOpacity onPress={handleChangePassword} disabled={passwordLoading}>
              {passwordLoading ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <Text style={[styles.modalSave, { color: colors.primary }]}>Save</Text>
              )}
            </TouchableOpacity>
          </View>

          <View style={styles.modalBody}>
            <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>Current Password</Text>
            <View style={[styles.inputRow, { backgroundColor: colors.inputBg, borderColor: colors.border }]}>
              <TextInput
                style={[styles.input, { color: colors.text }]}
                value={currentPassword}
                onChangeText={setCurrentPassword}
                secureTextEntry={!showCurrent}
                placeholder="Enter current password"
                placeholderTextColor={colors.textTertiary}
                autoCapitalize="none"
              />
              <TouchableOpacity onPress={() => setShowCurrent(!showCurrent)} style={styles.eyeBtn}>
                <Ionicons name={showCurrent ? "eye-off-outline" : "eye-outline"} size={20} color={colors.textTertiary} />
              </TouchableOpacity>
            </View>

            <Text style={[styles.inputLabel, { color: colors.textSecondary, marginTop: 20 }]}>New Password</Text>
            <View style={[styles.inputRow, { backgroundColor: colors.inputBg, borderColor: colors.border }]}>
              <TextInput
                style={[styles.input, { color: colors.text }]}
                value={newPassword}
                onChangeText={setNewPassword}
                secureTextEntry={!showNew}
                placeholder="Enter new password"
                placeholderTextColor={colors.textTertiary}
                autoCapitalize="none"
              />
              <TouchableOpacity onPress={() => setShowNew(!showNew)} style={styles.eyeBtn}>
                <Ionicons name={showNew ? "eye-off-outline" : "eye-outline"} size={20} color={colors.textTertiary} />
              </TouchableOpacity>
            </View>

            <Text style={[styles.inputLabel, { color: colors.textSecondary, marginTop: 20 }]}>Confirm New Password</Text>
            <View style={[styles.inputRow, { backgroundColor: colors.inputBg, borderColor: colors.border }]}>
              <TextInput
                style={[styles.input, { color: colors.text }]}
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                secureTextEntry={!showConfirm}
                placeholder="Re-enter new password"
                placeholderTextColor={colors.textTertiary}
                autoCapitalize="none"
              />
              <TouchableOpacity onPress={() => setShowConfirm(!showConfirm)} style={styles.eyeBtn}>
                <Ionicons name={showConfirm ? "eye-off-outline" : "eye-outline"} size={20} color={colors.textTertiary} />
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },

  /* header */
  header: { alignItems: "center", paddingTop: 70, paddingBottom: 20 },
  avatar: { width: 80, height: 80, borderRadius: 40, alignItems: "center", justifyContent: "center" },
  avatarText: { color: "#fff", fontSize: 32, fontWeight: "700" },
  name: { fontSize: 22, fontWeight: "700", marginTop: 14 },
  email: { fontSize: 14, marginTop: 4 },
  ratingRow: { flexDirection: "row", alignItems: "center", marginTop: 8, gap: 4 },
  ratingText: { fontSize: 15, fontWeight: "600" },
  ratingCount: { fontSize: 13 },

  /* stats */
  statsGrid: { borderRadius: 14, flexDirection: "row", flexWrap: "wrap", overflow: "hidden" },
  statsCell: { width: "50%", alignItems: "center", paddingVertical: 16 },
  statsNum: { fontSize: 24, fontWeight: "700", marginTop: 6 },
  statsLabel: { fontSize: 12, marginTop: 2 },

  /* sections */
  section: { marginTop: 16, paddingHorizontal: 20 },
  sectionTitle: { fontSize: 12, fontWeight: "600", letterSpacing: 0.5, marginBottom: 8, marginLeft: 4 },
  card: { borderRadius: 14, overflow: "hidden" },

  /* theme */
  themeRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 14, paddingHorizontal: 14 },
  themeLeft: { flexDirection: "row", alignItems: "center", gap: 12 },
  themeLabel: { fontSize: 16 },

  /* menu */
  menuRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 14, paddingHorizontal: 14 },
  menuLeft: { flexDirection: "row", alignItems: "center", gap: 12 },
  menuLabel: { fontSize: 16 },

  /* sign out */
  signOutBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", borderRadius: 14, paddingVertical: 14, gap: 8 },
  signOutText: { color: "#fff", fontSize: 16, fontWeight: "600" },

  /* modal */
  modalContainer: { flex: 1 },
  modalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingTop: 60, paddingBottom: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "#E5E5EA" },
  modalTitle: { fontSize: 17, fontWeight: "600" },
  modalCancel: { fontSize: 16 },
  modalSave: { fontSize: 16, fontWeight: "600" },
  modalBody: { paddingHorizontal: 20, paddingTop: 24 },
  inputLabel: { fontSize: 13, fontWeight: "600", marginBottom: 6 },
  inputRow: { flexDirection: "row", alignItems: "center", borderRadius: 10, paddingHorizontal: 12, borderWidth: 1 },
  input: { flex: 1, paddingVertical: 12, fontSize: 15 },
  eyeBtn: { padding: 4 },
});
