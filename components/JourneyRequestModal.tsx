import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import MapView, { Marker, Polyline } from "react-native-maps";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";

import useIncomingRequest from "@/hooks/useIncomingRequest";
import { useTheme } from "@/contexts/ThemeContext";
import { db } from "@/firebaseConfig";
import { doc, updateDoc } from "firebase/firestore";

function decodePolyline(encoded: string): { latitude: number; longitude: number }[] {
  const points: { latitude: number; longitude: number }[] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;
  while (index < encoded.length) {
    let b: number;
    let shift = 0;
    let result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    lat += result & 1 ? ~(result >> 1) : result >> 1;
    shift = 0;
    result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    lng += result & 1 ? ~(result >> 1) : result >> 1;
    points.push({ latitude: lat / 1e5, longitude: lng / 1e5 });
  }
  return points;
}

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}min`;
  return `${m} min`;
}

function formatDistance(meters: number): string {
  if (meters >= 1000) return `${(meters / 1000).toFixed(1)} km`;
  return `${Math.round(meters)} m`;
}

interface Route {
  distance: number;
  duration: number;
  geometry: { latitude: number; longitude: number }[];
}

export default function JourneyRequestModal() {
  const { colors } = useTheme();
  const router = useRouter();
  const incoming = useIncomingRequest();
  const visible = incoming !== null;
  const [route, setRoute] = useState<Route | null>(null);
  const [routeLoading, setRouteLoading] = useState(false);

  useEffect(() => {
    if (!visible || !incoming?.originLat || !incoming?.originLon || !incoming?.destinationLat || !incoming?.destinationLon) {
      setRoute(null);
      return;
    }

    setRouteLoading(true);
    const coords = `${incoming.originLon},${incoming.originLat};${incoming.destinationLon},${incoming.destinationLat}`;
    fetch(`https://router.project-osrm.org/route/v1/driving/${coords}?alternatives=false&overview=full&geometries=polyline`)
      .then((res) => res.json())
      .then((data) => {
        if (data.code === "Ok" && data.routes?.length > 0) {
          const r = data.routes[0];
          setRoute({ distance: r.distance, duration: r.duration, geometry: decodePolyline(r.geometry) });
        }
      })
      .catch(() => {})
      .finally(() => setRouteLoading(false));
  }, [visible, incoming]);

  async function handleAccept() {
    if (!incoming) return;
    await updateDoc(doc(db, "journey_requests", incoming.id), {
      status: "accepted",
    }).catch(() => {});
    router.replace("/(app)/schedule");
  }

  async function handleReject() {
    if (!incoming) return;
    await updateDoc(doc(db, "journey_requests", incoming.id), {
      status: "rejected",
    }).catch(() => {});
  }

  const hasRoute = incoming?.originLat && incoming?.originLon && incoming?.destinationLat && incoming?.destinationLon;

  const mapRegion = hasRoute
    ? {
        latitude: (incoming!.originLat! + incoming!.destinationLat!) / 2,
        longitude: (incoming!.originLon! + incoming!.destinationLon!) / 2,
        latitudeDelta: Math.abs(incoming!.originLat! - incoming!.destinationLat!) * 0.3 + 0.01,
        longitudeDelta: Math.abs(incoming!.originLon! - incoming!.destinationLon!) * 0.3 + 0.01,
      }
    : { latitude: 6.9271, longitude: 79.8612, latitudeDelta: 0.05, longitudeDelta: 0.05 };

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.overlay}>
        <View style={[styles.card, { backgroundColor: colors.cardBg }]}>
          {hasRoute && (
            <View style={[styles.mapContainer, { borderColor: colors.border }]}>
              {routeLoading ? (
                <View style={styles.mapPlaceholder}>
                  <ActivityIndicator size="small" color={colors.primary} />
                </View>
              ) : (
                <MapView style={styles.map} region={mapRegion} scrollEnabled={false} zoomEnabled={false} pitchEnabled={false} rotateEnabled={false}>
                  {route && <Polyline coordinates={route.geometry} strokeColor={colors.primary} strokeWidth={4} />}
                  <Marker coordinate={{ latitude: incoming!.originLat!, longitude: incoming!.originLon! }} pinColor={colors.success} />
                  <Marker coordinate={{ latitude: incoming!.destinationLat!, longitude: incoming!.destinationLon! }} pinColor={colors.danger} />
                </MapView>
              )}
            </View>
          )}

          {hasRoute && route && (
            <View style={[styles.routeInfo, { backgroundColor: colors.surfaceSecondary }]}>
              <View style={styles.routeInfoItem}>
                <Ionicons name="navigate-outline" size={14} color={colors.primary} />
                <Text style={[styles.routeInfoText, { color: colors.text }]}>{formatDistance(route.distance)}</Text>
              </View>
              <View style={[styles.routeInfoDivider, { backgroundColor: colors.border }]} />
              <View style={styles.routeInfoItem}>
                <Ionicons name="time-outline" size={14} color={colors.primary} />
                <Text style={[styles.routeInfoText, { color: colors.text }]}>{formatDuration(route.duration)}</Text>
              </View>
            </View>
          )}

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
          {incoming?.destinationAddress && (
            <View style={styles.destinationRow}>
              <Ionicons name="location" size={14} color={colors.danger} />
              <Text style={[styles.destinationText, { color: colors.textSecondary }]} numberOfLines={1}>{incoming.destinationAddress}</Text>
            </View>
          )}
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
  mapContainer: {
    width: "100%",
    height: 160,
    borderRadius: 14,
    overflow: "hidden",
    borderWidth: 1,
    marginBottom: 12,
  },
  map: {
    width: "100%",
    height: "100%",
  },
  mapPlaceholder: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  routeInfo: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
    gap: 12,
    marginBottom: 8,
    width: "100%",
  },
  routeInfoItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  routeInfoText: {
    fontSize: 13,
    fontWeight: "600",
  },
  routeInfoDivider: {
    width: 1,
    height: 14,
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
  destinationRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    maxWidth: "100%",
  },
  destinationText: {
    fontSize: 13,
    flex: 1,
  },
  row: { flexDirection: "row", gap: 12, marginTop: 20, width: "100%" },
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
