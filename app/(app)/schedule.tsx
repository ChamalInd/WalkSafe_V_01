import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import MapView, { Marker, Polyline } from "react-native-maps";
import * as Location from "expo-location";
import { Ionicons } from "@expo/vector-icons";

import useCurrentLocation from "@/hooks/useCurrentLocation";
import useNearbyWalkers from "@/hooks/useNearbyWalkers";
import LocationSearch from "@/components/LocationSearch";
import { useTheme } from "@/contexts/ThemeContext";
import { db } from "@/firebaseConfig";
import { doc, updateDoc, setDoc, deleteDoc, onSnapshot, query, collection, where, addDoc, serverTimestamp, orderBy, limit, getDocs, writeBatch, getDoc } from "firebase/firestore";
import { useAuth } from "@/contexts/AuthContext";

interface Point {
  latitude: number;
  longitude: number;
  address: string;
}

interface Route {
  distance: number;
  duration: number;
  geometry: { latitude: number; longitude: number }[];
}

interface Walker {
  id: string;
  uid?: string;
  name: string;
  rating: number;
  trips: number;
  distanceKm?: number;
}

const ROUTE_COLORS = ["#007AFF", "#FF9500", "#AF52DE"];

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

function getDistance(a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }): number {
  const R = 6371000;
  const dLat = ((b.latitude - a.latitude) * Math.PI) / 180;
  const dLon = ((b.longitude - a.longitude) * Math.PI) / 180;
  const x =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((a.latitude * Math.PI) / 180) *
      Math.cos((b.latitude * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

type Stage = "selecting" | "routes" | "walkers" | "requesting" | "confirmation" | "navigating" | "feedback";

export default function ScheduleScreen() {
  const { colors } = useTheme();
  const { user } = useAuth();
  const { location: currentLocation, error: locationError, loading: locationLoading } = useCurrentLocation();
  const { walkers: nearbyWalkers, loading: walkersLoading } = useNearbyWalkers(
    currentLocation?.latitude,
    currentLocation?.longitude
  );

  const liveWalkers: Walker[] = nearbyWalkers.map((w) => ({
    id: w.uid,
    uid: w.uid,
    name: w.displayName,
    rating: w.rating,
    trips: w.totalRatings,
    distanceKm: w.distanceKm,
  }));

  const [origin, setOrigin] = useState<Point | null>(null);
  const [destination, setDestination] = useState<Point | null>(null);
  const [mapRegion, setMapRegion] = useState({ latitude: 6.9271, longitude: 79.8612, latitudeDelta: 0.05, longitudeDelta: 0.05 });
  const [originText, setOriginText] = useState("");
  const [destText, setDestText] = useState("");
  const originSet = useRef(false);

  const [stage, setStage] = useState<Stage>("selecting");
  const [routes, setRoutes] = useState<Route[]>([]);
  const [selectedRoute, setSelectedRoute] = useState(0);
  const [routesLoading, setRoutesLoading] = useState(false);
  const [routesError, setRoutesError] = useState<string | null>(null);

  const [selectedWalker, setSelectedWalker] = useState<Walker | null>(null);
  const [isRequester, setIsRequester] = useState(false);
  const [requestStatus, setRequestStatus] = useState<"pending" | "accepted" | "rejected">("pending");
  const [userConfirmed, setUserConfirmed] = useState(false);
  const [partnerConfirmed, setPartnerConfirmed] = useState(false);

  const [remainingDistance, setRemainingDistance] = useState(0);
  const [feedbackRating, setFeedbackRating] = useState(0);
  const [feedbackText, setFeedbackText] = useState("");
  const [feedbackSubmitted, setFeedbackSubmitted] = useState(false);

  const [chatMessages, setChatMessages] = useState<{ id: string; senderUid: string; text: string; createdAt: number }[]>([]);
  const [chatText, setChatText] = useState("");
  const chatListRef = useRef<FlatList>(null);

  const mapRef = useRef<MapView>(null);
  const suppressRegion = useRef(false);

  function animateTo(region: { latitude: number; longitude: number; latitudeDelta: number; longitudeDelta: number }) {
    suppressRegion.current = true;
    setMapRegion(region);
    mapRef.current?.animateToRegion(region, 300);
    setTimeout(() => { suppressRegion.current = false; }, 400);
  }

  function handleRegionChange(region: { latitude: number; longitude: number; latitudeDelta: number; longitudeDelta: number }) {
    if (!suppressRegion.current) setMapRegion(region);
  }

  useEffect(() => {
    if (currentLocation && !originSet.current) {
      originSet.current = true;
      reverseGeocode(currentLocation.latitude, currentLocation.longitude).then((addr) => {
        setOrigin({ latitude: currentLocation.latitude, longitude: currentLocation.longitude, address: addr });
        setOriginText(addr.split(",")[0]);
        animateTo({ latitude: currentLocation.latitude, longitude: currentLocation.longitude, latitudeDelta: 0.05, longitudeDelta: 0.05 });
      });
    }
  }, [currentLocation]);

  const checkArrival = useCallback(() => {
    if (stage !== "navigating" || !currentLocation || !destination) return;
    const dist = getDistance(currentLocation, destination);
    setRemainingDistance(dist);
    if (dist < 50) setStage("feedback");
  }, [stage, currentLocation, destination]);

  useEffect(() => { checkArrival(); }, [currentLocation, checkArrival]);

  useEffect(() => {
    if (stage !== "requesting" || !selectedWalker?.uid || !user) return;

    const requestId = [user.uid, selectedWalker.uid].sort().join("_");
    const requestRef = doc(db, "journey_requests", requestId);

    const unsub = onSnapshot(requestRef, (snap) => {
      if (!snap.exists()) return;
      const data = snap.data();
      if (data.status === "accepted") {
        setRequestStatus("accepted");
        setStage("confirmation");
        setUserConfirmed(false);
        setPartnerConfirmed(false);
        if (selectedWalker?.uid) updateDoc(doc(db, "live_users", selectedWalker.uid), { onJourney: true }).catch(() => {});
      } else if (data.status === "rejected") {
        setRequestStatus("rejected");
        setStage("walkers");
        setSelectedWalker(null);
        deleteDoc(requestRef).catch(() => {});
      }
    }, () => {});

    return () => unsub();
  }, [stage, selectedWalker, user]);

  useEffect(() => {
    if (stage !== "confirmation" || !selectedWalker?.uid || !user) return;

    const requestId = [user.uid, selectedWalker.uid].sort().join("_");
    const requestRef = doc(db, "journey_requests", requestId);

    const unsub = onSnapshot(requestRef, (snap) => {
      if (!snap.exists()) return;
      const data = snap.data();
      const myConfirmed = isRequester ? !!data.userConfirmed : !!data.partnerConfirmed;
      const theirConfirmed = isRequester ? !!data.partnerConfirmed : !!data.userConfirmed;
      setUserConfirmed(myConfirmed);
      setPartnerConfirmed(theirConfirmed);

      if (data.userConfirmed && data.partnerConfirmed) {
        const messagesRef = collection(db, "journey_chats", requestId, "messages");
        getDocs(messagesRef).then((snap) => {
          const batch = writeBatch(db);
          snap.docs.forEach((d) => batch.delete(d.ref));
          batch.commit().catch(() => {});
        }).catch(() => {});
        setChatMessages([]);
        setRemainingDistance(currentLocation && destination ? getDistance(currentLocation, destination) : (routes[selectedRoute]?.distance ?? 1));
        setStage("navigating");
        if (currentLocation) animateTo({ latitude: currentLocation.latitude, longitude: currentLocation.longitude, latitudeDelta: 0.005, longitudeDelta: 0.005 });
      }
    }, () => {});

    return () => unsub();
  }, [stage, selectedWalker, user, isRequester, currentLocation, routes, selectedRoute]);

  async function handleConfirmArrival() {
    if (!selectedWalker?.uid || !user) return;
    setUserConfirmed(true);
    const requestId = [user.uid, selectedWalker.uid].sort().join("_");
    await updateDoc(doc(db, "journey_requests", requestId), {
      [isRequester ? "userConfirmed" : "partnerConfirmed"]: true,
    }).catch(() => {});
  }

  useEffect(() => {
    if (stage !== "confirmation" || !selectedWalker?.uid || !user) return;

    const requestId = [user.uid, selectedWalker.uid].sort().join("_");
    const messagesRef = collection(db, "journey_chats", requestId, "messages");
    const q = query(messagesRef, orderBy("createdAt", "asc"), limit(50));

    const unsub = onSnapshot(q, (snap) => {
      const msgs = snap.docs.map((d) => ({ id: d.id, ...d.data() } as { id: string; senderUid: string; text: string; createdAt: number }));
      setChatMessages(msgs);
      setTimeout(() => chatListRef.current?.scrollToEnd({ animated: true }), 100);
    }, () => {});

    return () => unsub();
  }, [stage, selectedWalker, user]);

  async function sendChatMessage() {
    if (!chatText.trim() || !selectedWalker?.uid || !user) return;
    const requestId = [user.uid, selectedWalker.uid].sort().join("_");
    const messagesRef = collection(db, "journey_chats", requestId, "messages");
    const text = chatText.trim();
    setChatText("");
    await addDoc(messagesRef, {
      senderUid: user.uid,
      senderName: user.displayName ?? user.email ?? "You",
      text,
      createdAt: Date.now(),
    }).catch(() => {});
  }

  async function submitFeedback() {
    if (!selectedWalker?.uid || !user || feedbackRating === 0) return;

    try {
      await addDoc(collection(db, "feedback"), {
        walkerUid: selectedWalker.uid,
        reviewerUid: user.uid,
        rating: feedbackRating,
        comment: feedbackText.trim(),
        createdAt: Date.now(),
      });

      const walkerRef = doc(db, "users", selectedWalker.uid);
      const walkerSnap = await getDoc(walkerRef);
      let updatedRating = feedbackRating;
      let updatedTotal = 1;
      if (walkerSnap.exists()) {
        const d = walkerSnap.data();
        const oldRating = d.rating ?? 5.0;
        const oldTotal = d.totalRatings ?? 0;
        updatedTotal = oldTotal + 1;
        updatedRating = Math.round(((oldRating * oldTotal + feedbackRating) / updatedTotal) * 10) / 10;
        await updateDoc(walkerRef, { rating: updatedRating, totalRatings: updatedTotal });
      }

      const liveUserSnap = await getDoc(doc(db, "live_users", selectedWalker.uid));
      if (liveUserSnap.exists()) {
        await updateDoc(doc(db, "live_users", selectedWalker.uid), { rating: updatedRating, totalRatings: updatedTotal });
      }

      setFeedbackSubmitted(true);
    } catch (err) {
      console.error("submitFeedback error:", err);
    }
  }

  useEffect(() => {
    if (stage !== "selecting" && stage !== "routes" && stage !== "walkers") return;
    if (!user) return;

    const q = query(
      collection(db, "journey_requests"),
      where("partnerUid", "==", user.uid),
      where("status", "==", "accepted")
    );

    const unsub = onSnapshot(q, (snap) => {
      if (snap.empty) return;
      const docSnap = snap.docs[0];
      const data = docSnap.data();

      setIsRequester(false);
      setSelectedWalker({
        id: data.requesterUid,
        uid: data.requesterUid,
        name: data.requesterName,
        rating: 0,
        trips: 0,
      });
      setUserConfirmed(false);
      setPartnerConfirmed(false);

      if (data.destinationLat && data.destinationLon) {
        const dest: Point = { latitude: data.destinationLat, longitude: data.destinationLon, address: data.destinationAddress ?? "" };
        setDestination(dest);
        setDestText(dest.address.split(",")[0]);

        if (currentLocation) {
          const partnerOrigin: Point = { latitude: currentLocation.latitude, longitude: currentLocation.longitude, address: "" };
          reverseGeocode(partnerOrigin.latitude, partnerOrigin.longitude).then((addr) => {
            partnerOrigin.address = addr;
            setOrigin(partnerOrigin);
            setOriginText(addr.split(",")[0]);

            const coords = `${partnerOrigin.longitude},${partnerOrigin.latitude};${dest.longitude},${dest.latitude}`;
            fetch(`https://router.project-osrm.org/route/v1/driving/${coords}?alternatives=false&overview=full&geometries=polyline`)
              .then((res) => res.json())
              .then((routeData) => {
                if (routeData.code === "Ok" && routeData.routes?.length > 0) {
                  const parsed: Route[] = routeData.routes.map((r: Record<string, unknown>) => ({ distance: r.distance as number, duration: r.duration as number, geometry: decodePolyline(r.geometry as string) }));
                  setRoutes(parsed);
                  setSelectedRoute(0);
                }
              })
              .catch(() => {});
          });
        }
      }

      updateDoc(doc(db, "live_users", data.requesterUid), { onJourney: true }).catch(() => {});
      setStage("confirmation");
    }, () => {});

    return () => unsub();
  }, [stage, user, currentLocation]);

  useEffect(() => {
    if (stage !== "feedback") return;
    if (user) {
      updateDoc(doc(db, "live_users", user.uid), { onJourney: false }).catch(() => {});
    }
    if (selectedWalker?.uid && user) {
      updateDoc(doc(db, "live_users", selectedWalker.uid), { onJourney: false }).catch(() => {});
      const requestId = [user.uid, selectedWalker.uid].sort().join("_");
      updateDoc(doc(db, "journey_requests", requestId), { status: "completed" }).catch(() => {});
    }
  }, [stage, user, selectedWalker]);

  useEffect(() => {
    if (stage !== "navigating" || !selectedWalker?.uid || !user) return;

    const requestId = [user.uid, selectedWalker.uid].sort().join("_");
    const requestRef = doc(db, "journey_requests", requestId);

    const unsub = onSnapshot(requestRef, (snap) => {
      if (!snap.exists()) return;
      const data = snap.data();
      if (data.status === "completed") {
        setStage("feedback");
      }
    }, () => {});

    return () => unsub();
  }, [stage, selectedWalker, user]);

  async function sendJourneyRequest(walker: Walker) {
    if (!user || !walker.uid) return;
    setSelectedWalker(walker);
    setIsRequester(true);
    setRequestStatus("pending");
    setStage("requesting");

    const requestId = [user.uid, walker.uid].sort().join("_");
    await setDoc(doc(db, "journey_requests", requestId), {
      requesterUid: user.uid,
      requesterName: user.displayName ?? user.email ?? "Unknown",
      partnerUid: walker.uid,
      partnerName: walker.name,
      destinationLat: destination?.latitude ?? null,
      destinationLon: destination?.longitude ?? null,
      destinationAddress: destination?.address ?? null,
      originLat: origin?.latitude ?? null,
      originLon: origin?.longitude ?? null,
      status: "pending",
      createdAt: Date.now(),
    }).catch(() => {});
  }

  async function handleRejectRequest() {
    if (!selectedWalker?.uid || !user) return;
    const requestId = [user.uid, selectedWalker.uid].sort().join("_");
    await deleteDoc(doc(db, "journey_requests", requestId)).catch(() => {});
    setStage("walkers");
    setSelectedWalker(null);
  }

  async function reverseGeocode(lat: number, lon: number): Promise<string> {
    try {
      const results = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lon });
      if (results.length > 0) { const r = results[0]; return [r.name, r.street, r.city, r.region, r.country].filter(Boolean).join(", "); }
    } catch {}
    return `${lat.toFixed(4)}, ${lon.toFixed(4)}`;
  }

  function handleOriginSelect(s: { latitude: number; longitude: number; title: string }) {
    setOrigin({ latitude: s.latitude, longitude: s.longitude, address: s.title });
    animateTo({ ...mapRegion, latitude: s.latitude, longitude: s.longitude });
  }

  function handleDestSelect(s: { latitude: number; longitude: number; title: string }) {
    setDestination({ latitude: s.latitude, longitude: s.longitude, address: s.title });
    animateTo({ ...mapRegion, latitude: s.latitude, longitude: s.longitude });
  }

  async function handleMarkerDrag(lat: number, lon: number) {
    const addr = await reverseGeocode(lat, lon);
    setDestination({ latitude: lat, longitude: lon, address: addr });
    setDestText(addr.split(",")[0]);
  }

  function handleMapPress(e: { nativeEvent: { coordinate: { latitude: number; longitude: number } } }) {
    handleMarkerDrag(e.nativeEvent.coordinate.latitude, e.nativeEvent.coordinate.longitude);
  }

  async function fetchRoutes() {
    if (!origin || !destination) return;
    setRoutesLoading(true);
    setRoutesError(null);
    try {
      const coords = `${origin.longitude},${origin.latitude};${destination.longitude},${destination.latitude}`;
      const res = await fetch(`https://router.project-osrm.org/route/v1/driving/${coords}?alternatives=true&overview=full&geometries=polyline`);
      const data = await res.json();
      if (data.code !== "Ok" || !data.routes || data.routes.length === 0) { setRoutesError("No routes found between these locations."); setRoutes([]); return; }
      const parsed: Route[] = data.routes.map((r: Record<string, unknown>) => ({ distance: r.distance as number, duration: r.duration as number, geometry: decodePolyline(r.geometry as string) }));
      setRoutes(parsed);
      setSelectedRoute(0);
      setStage("routes");
      if (parsed.length > 0) {
        const allLats = parsed.flatMap((r) => r.geometry.map((p) => p.latitude));
        const allLngs = parsed.flatMap((r) => r.geometry.map((p) => p.longitude));
        animateTo({ latitude: (Math.min(...allLats) + Math.max(...allLats)) / 2, longitude: (Math.min(...allLngs) + Math.max(...allLngs)) / 2, latitudeDelta: (Math.max(...allLats) - Math.min(...allLats)) * 0.3 + 0.01, longitudeDelta: (Math.max(...allLngs) - Math.min(...allLngs)) * 0.3 + 0.01 });
      }
    } catch { setRoutesError("Failed to calculate routes. Please try again."); setRoutes([]); } finally { setRoutesLoading(false); }
  }

  function handleBack() {
    setStage("selecting"); setRoutes([]); setRoutesError(null);
    if (origin) animateTo({ ...mapRegion, latitude: origin.latitude, longitude: origin.longitude });
  }

  function handleBackToRoutes() {
    setStage("routes");
    if (routes.length > 0) {
      const allLats = routes.flatMap((r) => r.geometry.map((p) => p.latitude));
      const allLngs = routes.flatMap((r) => r.geometry.map((p) => p.longitude));
      animateTo({ latitude: (Math.min(...allLats) + Math.max(...allLats)) / 2, longitude: (Math.min(...allLngs) + Math.max(...allLngs)) / 2, latitudeDelta: (Math.max(...allLats) - Math.min(...allLats)) * 0.3 + 0.01, longitudeDelta: (Math.max(...allLngs) - Math.min(...allLngs)) * 0.3 + 0.01 });
    }
  }

  if (locationLoading) return <View style={[s.centered, { backgroundColor: colors.background }]}><ActivityIndicator size="large" color={colors.primary} /><Text style={[s.loadingText, { color: colors.textSecondary }]}>Getting your location...</Text></View>;
  if (locationError) return <View style={[s.centered, { backgroundColor: colors.background }]}><Ionicons name="location-outline" size={48} color={colors.textTertiary} /><Text style={[s.errorText, { color: colors.textSecondary }]}>{locationError}</Text></View>;

  // ─── SELECTING / ROUTES ──────────────────────────────────────────
  if (stage === "selecting" || stage === "routes") {
    return (
      <View style={[s.container, { backgroundColor: colors.background }]}>
        <View style={[s.searchSection, { backgroundColor: colors.background }]}>
          {stage === "routes" && <TouchableOpacity style={s.backBtn} onPress={handleBack}><Ionicons name="arrow-back" size={20} color={colors.primary} /><Text style={[s.backBtnText, { color: colors.primary }]}>Back</Text></TouchableOpacity>}
          <LocationSearch label="Starting from" icon="radio-button-on" iconColor={colors.success} value={originText} onChangeText={setOriginText} onSelect={handleOriginSelect} placeholder="Current location" />
          <View style={[s.divider, { backgroundColor: colors.border }]} />
          <LocationSearch label="Going to" icon="location" iconColor={colors.danger} value={destText} onChangeText={setDestText} onSelect={handleDestSelect} placeholder="Search destination..." />
        </View>

        <View style={s.mapSection}>
          <MapView ref={mapRef} style={s.map} region={mapRegion} onRegionChangeComplete={handleRegionChange} onPress={stage === "selecting" ? handleMapPress : undefined}>
            {origin && <Marker coordinate={{ latitude: origin.latitude, longitude: origin.longitude }} title="Start" description={origin.address} pinColor={colors.success} />}
            {destination && <Marker coordinate={{ latitude: destination.latitude, longitude: destination.longitude }} title="Destination" description={destination.address} pinColor={colors.danger} draggable={stage === "selecting"} onDragEnd={stage === "selecting" ? (e) => handleMarkerDrag(e.nativeEvent.coordinate.latitude, e.nativeEvent.coordinate.longitude) : undefined} />}
            {stage === "routes" && routes.map((route, i) => <Polyline key={i} coordinates={route.geometry} strokeColor={i === selectedRoute ? ROUTE_COLORS[i] : colors.textTertiary} strokeWidth={i === selectedRoute ? 5 : 3} />)}
          </MapView>
          {stage === "selecting" && !destination && <View style={[s.mapHint, { backgroundColor: colors.cardBg }]}><Ionicons name="finger-print-outline" size={16} color={colors.textSecondary} /><Text style={[s.mapHintText, { color: colors.textSecondary }]}>Tap the map or search to set destination</Text></View>}
        </View>

        <View style={s.infoSection}>
          <View style={[s.locationCard, { backgroundColor: colors.cardBg }]}><View style={[s.dot, { backgroundColor: colors.success }]} /><Text style={[s.locationText, { color: colors.text }]} numberOfLines={1}>{origin?.address ?? "Current location"}</Text></View>
          <View style={[s.locationCard, { backgroundColor: colors.cardBg }]}><View style={[s.dot, { backgroundColor: colors.danger }]} /><Text style={[s.locationText, { color: colors.text }, !destination && { color: colors.textTertiary }]} numberOfLines={1}>{destination?.address ?? "Select destination"}</Text></View>
        </View>

        {stage === "selecting" && (
          <TouchableOpacity style={[s.primaryBtn, { backgroundColor: colors.primary }, !destination && { backgroundColor: colors.surface }]} disabled={!destination || routesLoading} onPress={fetchRoutes}>
            {routesLoading ? <ActivityIndicator size="small" color="#fff" /> : <><Text style={[s.primaryBtnText, !destination && { color: colors.textTertiary }]}>Find Routes</Text><Ionicons name="arrow-forward" size={18} color={!destination ? colors.textTertiary : "#fff"} /></>}
          </TouchableOpacity>
        )}

        {stage === "routes" && (<>
          {routesError ? <View style={[s.errorBanner, { backgroundColor: colors.danger + "15" }]}><Ionicons name="alert-circle" size={18} color={colors.danger} /><Text style={[s.errorBannerText, { color: colors.danger }]}>{routesError}</Text></View> : (
            <View style={s.routesSection}>
              <Text style={[s.routesTitle, { color: colors.textSecondary }]}>{routes.length} {routes.length === 1 ? "route" : "routes"} found</Text>
              <FlatList data={routes.slice(0, 3)} keyExtractor={(_, i) => String(i)} horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.routesList} renderItem={({ item, index }) => (
                <TouchableOpacity style={[s.routeCard, { backgroundColor: colors.cardBg }, index === selectedRoute && { backgroundColor: colors.primary + "15", borderColor: colors.primary }]} onPress={() => setSelectedRoute(index)}>
                  <View style={s.routeCardHeader}><View style={[s.routeColorDot, { backgroundColor: ROUTE_COLORS[index] }]} /><Text style={[s.routeLabel, { color: colors.textSecondary }]}>{index === 0 ? "Fastest" : index === 1 ? "Alternative" : "Option 3"}</Text>{index === selectedRoute && <Ionicons name="checkmark-circle" size={18} color={ROUTE_COLORS[index]} />}</View>
                  <Text style={[s.routeDistance, { color: colors.text }]}>{formatDistance(item.distance)}</Text>
                  <Text style={[s.routeDuration, { color: colors.textSecondary }]}>{formatDuration(item.duration)}</Text>
                </TouchableOpacity>
              )} />
            </View>
          )}
          <TouchableOpacity style={[s.primaryBtn, { backgroundColor: colors.success }]} onPress={() => setStage("walkers")}>
            <Text style={s.primaryBtnText}>Confirm Route</Text><Ionicons name="checkmark-circle-outline" size={18} color="#fff" />
          </TouchableOpacity>
        </>)}
      </View>
    );
  }

  // ─── WALKERS ─────────────────────────────────────────────────────
  if (stage === "walkers") {
    return (
      <View style={[s.container, { backgroundColor: colors.background }]}>
        <View style={[s.searchSection, { backgroundColor: colors.background }]}>
          <TouchableOpacity style={s.backBtn} onPress={handleBackToRoutes}><Ionicons name="arrow-back" size={20} color={colors.primary} /><Text style={[s.backBtnText, { color: colors.primary }]}>Back</Text></TouchableOpacity>
        </View>
          <View style={s.walkersHeader}>
          <Ionicons name="people" size={24} color={colors.primary} />
          <View style={{ marginLeft: 10 }}><Text style={[s.walkersTitle, { color: colors.text }]}>Available Walkers</Text><Text style={[s.walkersSubtitle, { color: colors.textTertiary }]}>{walkersLoading ? "Searching..." : `${liveWalkers.length} walkers online near you`}</Text></View>
        </View>
        {walkersLoading ? (
          <View style={s.centered}><ActivityIndicator size="large" color={colors.primary} /><Text style={[s.loadingText, { color: colors.textSecondary }]}>Finding nearby walkers...</Text></View>
        ) : liveWalkers.length === 0 ? (
          <View style={s.centered}><Ionicons name="people-outline" size={48} color={colors.textTertiary} /><Text style={[s.loadingText, { color: colors.textSecondary }]}>No walkers nearby right now. Try again later.</Text></View>
        ) : (
        <FlatList data={liveWalkers} keyExtractor={(item) => item.id} contentContainerStyle={s.walkersList} renderItem={({ item }) => (
          <TouchableOpacity style={[s.walkerCard, { backgroundColor: colors.cardBg }]} onPress={() => sendJourneyRequest(item)}>
            <View style={[s.walkerAvatar, { backgroundColor: colors.primary }]}><Text style={s.walkerInitial}>{item.name.charAt(0)}</Text></View>
            <View style={s.walkerInfo}>
              <Text style={[s.walkerName, { color: colors.text }]}>{item.name}</Text>
              <View style={s.walkerMeta}><Ionicons name="star" size={12} color={colors.warning} /><Text style={[s.walkerRating, { color: colors.warning }]}>{item.rating.toFixed(1)}</Text><Text style={[s.walkerSep, { color: colors.textTertiary }]}>·</Text><Text style={[s.walkerTrips, { color: colors.textTertiary }]}>{item.distanceKm != null ? `${item.distanceKm} km away` : `${item.trips} trips`}</Text></View>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
          </TouchableOpacity>
        )} />
        )}
      </View>
    );
  }

  // ─── CONFIRMATION ────────────────────────────────────────────────
  if (stage === "requesting") {
    return (
      <View style={[s.container, { backgroundColor: colors.background }]}>
        <View style={[s.searchSection, { backgroundColor: colors.background }]}>
          <TouchableOpacity style={s.backBtn} onPress={handleRejectRequest}><Ionicons name="arrow-back" size={20} color={colors.primary} /><Text style={[s.backBtnText, { color: colors.primary }]}>Cancel</Text></TouchableOpacity>
        </View>
        <View style={s.confirmCentered}>
          <View style={[s.confirmCard, { backgroundColor: colors.cardBg }]}>
            <Ionicons name="paper-plane" size={40} color={colors.primary} />
            <Text style={[s.confirmTitle, { color: colors.text }]}>Request Sent</Text>
            <Text style={[s.confirmSubtitle, { color: colors.textSecondary }]}>Waiting for {selectedWalker?.name} to accept your journey request...</Text>
            <View style={[s.confirmAvatar, { backgroundColor: colors.primary, marginTop: 24 }]}>
              <Text style={s.walkerInitial}>{selectedWalker?.name?.charAt(0)}</Text>
            </View>
            <Text style={[s.confirmName, { color: colors.text }]}>{selectedWalker?.name}</Text>
            <View style={s.waitingBanner}>
              <ActivityIndicator size="small" color={colors.primary} />
              <Text style={[s.waitingText, { color: colors.primary }]}>Waiting for response...</Text>
            </View>
            <TouchableOpacity style={[s.primaryBtn, { backgroundColor: colors.danger, marginTop: 20 }]} onPress={handleRejectRequest}>
              <Ionicons name="close-circle-outline" size={18} color="#fff" />
              <Text style={s.primaryBtnText}>Cancel Request</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  }

  if (stage === "confirmation") {
    return (
      <View style={[s.container, { backgroundColor: colors.background }]}>
        <View style={[s.searchSection, { backgroundColor: colors.background }]}>
          <TouchableOpacity style={s.backBtn} onPress={() => {
            if (selectedWalker?.uid && user) {
              const requestId = [user.uid, selectedWalker.uid].sort().join("_");
              deleteDoc(doc(db, "journey_requests", requestId)).catch(() => {});
            }
            setStage("walkers");
          }}><Ionicons name="arrow-back" size={20} color={colors.primary} /><Text style={[s.backBtnText, { color: colors.primary }]}>Back</Text></TouchableOpacity>
        </View>

        <View style={s.chatHeader}>
          <View style={s.chatHeaderRow}>
            <View style={[s.chatAvatar, { backgroundColor: colors.primary }]}>
              <Text style={s.walkerInitial}>{selectedWalker?.name?.charAt(0)}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[s.chatHeaderName, { color: colors.text }]}>{selectedWalker?.name}</Text>
              <Text style={[s.chatHeaderSub, { color: colors.textTertiary }]}>Chat until you meet</Text>
            </View>
            <View style={s.confirmStatusPill}>
              {userConfirmed ? (
                <View style={[s.statusPill, { backgroundColor: colors.success + "20" }]}><Ionicons name="checkmark-circle" size={14} color={colors.success} /><Text style={[s.statusPillText, { color: colors.success }]}>You arrived</Text></View>
              ) : (
                <View style={[s.statusPill, { backgroundColor: colors.surfaceSecondary }]}><Ionicons name="ellipse-outline" size={14} color={colors.textTertiary} /><Text style={[s.statusPillText, { color: colors.textTertiary }]}>Not there yet</Text></View>
              )}
            </View>
          </View>
          <View style={s.chatHeaderDivider} />
          <View style={s.chatHeaderRow}>
            <View style={[s.chatAvatar, { backgroundColor: colors.surfaceSecondary }]}>
              <Text style={[s.walkerInitial, { color: colors.text }]}>{selectedWalker?.name?.split(" ")[0]?.charAt(0)}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[s.chatHeaderName, { color: colors.text }]}>{selectedWalker?.name?.split(" ")[0]}</Text>
            </View>
            <View>
              {partnerConfirmed ? (
                <View style={[s.statusPill, { backgroundColor: colors.success + "20" }]}><Ionicons name="checkmark-circle" size={14} color={colors.success} /><Text style={[s.statusPillText, { color: colors.success }]}>Arrived</Text></View>
              ) : (
                <View style={[s.statusPill, { backgroundColor: colors.surfaceSecondary }]}><Ionicons name="ellipse-outline" size={14} color={colors.textTertiary} /><Text style={[s.statusPillText, { color: colors.textTertiary }]}>Not there yet</Text></View>
              )}
            </View>
          </View>
        </View>

        <View style={s.chatMessages}>
          <FlatList
            ref={chatListRef}
            data={chatMessages}
            keyExtractor={(item) => item.id}
            contentContainerStyle={s.chatMessagesInner}
            onContentSizeChange={() => chatListRef.current?.scrollToEnd({ animated: false })}
            renderItem={({ item }) => {
              const isMe = item.senderUid === user?.uid;
              return (
                <View style={[s.chatBubble, isMe ? s.chatBubbleMe : s.chatBubbleThem, { backgroundColor: isMe ? colors.primary : colors.cardBg }]}>
                  <Text style={[s.chatBubbleText, { color: "#fff" }]}>{item.text}</Text>
                </View>
              );
            }}
            ListEmptyComponent={
              <View style={s.chatEmpty}>
                <Ionicons name="chatbubble-ellipses-outline" size={32} color={colors.textTertiary} />
                <Text style={[s.chatEmptyText, { color: colors.textTertiary }]}>Say hello! Coordinate where to meet.</Text>
              </View>
            }
          />
        </View>

        <View style={[s.chatInputBar, { backgroundColor: colors.cardBg, borderTopColor: colors.border }]}>
          <TextInput
            style={[s.chatInput, { backgroundColor: colors.inputBg, color: colors.text }]}
            value={chatText}
            onChangeText={setChatText}
            placeholder="Type a message..."
            placeholderTextColor={colors.textTertiary}
            returnKeyType="send"
            onSubmitEditing={sendChatMessage}
          />
          <TouchableOpacity style={[s.chatSendBtn, { backgroundColor: chatText.trim() ? colors.primary : colors.surfaceSecondary }]} onPress={sendChatMessage} disabled={!chatText.trim()}>
            <Ionicons name="send" size={18} color={chatText.trim() ? "#fff" : colors.textTertiary} />
          </TouchableOpacity>
        </View>

        <View style={s.chatBottomBar}>
          {!userConfirmed ? (
            <TouchableOpacity style={[s.primaryBtn, { backgroundColor: colors.success, marginHorizontal: 0 }]} onPress={handleConfirmArrival}>
              <Ionicons name="checkmark-circle-outline" size={18} color="#fff" />
              <Text style={s.primaryBtnText}>I&apos;ve Arrived</Text>
            </TouchableOpacity>
          ) : !partnerConfirmed ? (
            <View style={s.waitingBanner}><ActivityIndicator size="small" color={colors.primary} /><Text style={[s.waitingText, { color: colors.primary }]}>Waiting for {selectedWalker?.name?.split(" ")[0]}...</Text></View>
          ) : (
            <View style={s.bothConfirmedBanner}><Ionicons name="checkmark-done-circle" size={22} color={colors.success} /><Text style={[s.bothConfirmedText, { color: colors.success }]}>Both confirmed! Starting navigation...</Text></View>
          )}
        </View>
      </View>
    );
  }

  // ─── NAVIGATING ──────────────────────────────────────────────────
  if (stage === "navigating") {
    const activeRoute = routes[selectedRoute];
    return (
      <View style={s.container}>
        <MapView ref={mapRef} style={s.navMap} region={{ latitude: currentLocation?.latitude ?? 6.9271, longitude: currentLocation?.longitude ?? 79.8612, latitudeDelta: 0.005, longitudeDelta: 0.005 }} showsUserLocation>
          {activeRoute && <Polyline coordinates={activeRoute.geometry} strokeColor={colors.primary} strokeWidth={5} />}
          {destination && <Marker coordinate={{ latitude: destination.latitude, longitude: destination.longitude }} title="Destination" pinColor={colors.danger} />}
        </MapView>
        <View style={s.navOverlay}>
          <View style={[s.navCard, { backgroundColor: colors.cardBg }]}>
            <View style={s.navCardRow}>
              <View style={s.navCardItem}><Text style={[s.navCardLabel, { color: colors.textTertiary }]}>Distance Left</Text><Text style={[s.navCardValue, { color: colors.text }]}>{formatDistance(remainingDistance)}</Text></View>
              <View style={[s.navCardDivider, { backgroundColor: colors.border }]} />
              <View style={s.navCardItem}><Text style={[s.navCardLabel, { color: colors.textTertiary }]}>Walking With</Text><Text style={[s.navCardValue, { color: colors.text }]}>{selectedWalker?.name?.split(" ")[0]}</Text></View>
            </View>
          </View>
          <View style={[s.navInstruction, { backgroundColor: colors.cardBg }]}>
            <Ionicons name="navigate" size={22} color={colors.primary} />
            <Text style={[s.navInstructionText, { color: colors.text }]} numberOfLines={2}>
              {remainingDistance > 1000 ? `Continue for ${formatDistance(remainingDistance)} towards your destination` : remainingDistance > 200 ? `Almost there — ${formatDistance(remainingDistance)} remaining` : `You're very close! Look for your destination.`}
            </Text>
          </View>
          <TouchableOpacity style={[s.primaryBtn, { backgroundColor: colors.danger, marginHorizontal: 40, marginTop: 12 }]} onPress={() => setStage("feedback")}>
            <Ionicons name="stop-circle-outline" size={18} color="#fff" />
            <Text style={s.primaryBtnText}>End Journey</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ─── FEEDBACK ────────────────────────────────────────────────────
  if (stage === "feedback") {
    if (feedbackSubmitted) {
      return (
        <View style={[s.container, { backgroundColor: colors.background }]}>
          <View style={s.feedbackCentered}>
            <Ionicons name="checkmark-done-circle" size={72} color={colors.success} />
            <Text style={[s.feedbackThanks, { color: colors.text }]}>Thank You!</Text>
            <Text style={[s.feedbackThanksSub, { color: colors.textSecondary }]}>Your feedback helps keep the WalkSafe community safe.</Text>
            <TouchableOpacity style={[s.primaryBtn, { backgroundColor: colors.primary }]} onPress={() => {
              if (user) {
                updateDoc(doc(db, "live_users", user.uid), { onJourney: false }).catch(() => {});
              }
              if (selectedWalker?.uid && user) {
                updateDoc(doc(db, "live_users", selectedWalker.uid), { onJourney: false }).catch(() => {});
                const requestId = [user.uid, selectedWalker.uid].sort().join("_");
                deleteDoc(doc(db, "journey_requests", requestId)).catch(() => {});
              }
              setStage("selecting"); setDestination(null); setDestText(""); setRoutes([]); setSelectedRoute(0); setSelectedWalker(null); setUserConfirmed(false); setPartnerConfirmed(false); setFeedbackRating(0); setFeedbackText(""); setFeedbackSubmitted(false); setRemainingDistance(0); if (origin) animateTo({ latitude: origin.latitude, longitude: origin.longitude, latitudeDelta: 0.05, longitudeDelta: 0.05 });
            }}>
              <Text style={s.primaryBtnText}>Plan Another Journey</Text>
            </TouchableOpacity>
          </View>
        </View>
      );
    }
    return (
      <View style={[s.container, { backgroundColor: colors.background }]}>
        <View style={s.feedbackCentered}>
          <View style={[s.feedbackCard, { backgroundColor: colors.cardBg }]}>
            <Ionicons name="chatbubble-ellipses" size={40} color={colors.primary} />
            <Text style={[s.feedbackTitle, { color: colors.text }]}>Journey Complete!</Text>
            <Text style={[s.feedbackSubtitle, { color: colors.textSecondary }]}>How was your walk with {selectedWalker?.name}?</Text>
            <Text style={[s.feedbackLabel, { color: colors.textSecondary }]}>Rate this walker</Text>
            <View style={s.ratingRow}>
              {[1, 2, 3, 4, 5].map((star) => (<TouchableOpacity key={star} onPress={() => setFeedbackRating(star)}><Ionicons name={star <= feedbackRating ? "star" : "star-outline"} size={36} color={star <= feedbackRating ? colors.warning : colors.surfaceSecondary} /></TouchableOpacity>))}
            </View>
            <Text style={[s.feedbackLabel, { color: colors.textSecondary }]}>Comments</Text>
            <TextInput style={[s.feedbackInput, { backgroundColor: colors.inputBg, borderColor: colors.border, color: colors.text }]} value={feedbackText} onChangeText={setFeedbackText} placeholder="Share your experience..." placeholderTextColor={colors.textTertiary} multiline numberOfLines={4} textAlignVertical="top" />
            <TouchableOpacity style={[s.primaryBtn, { backgroundColor: colors.success }, feedbackRating === 0 && { backgroundColor: colors.surface }]} disabled={feedbackRating === 0} onPress={submitFeedback}>
              <Text style={[s.primaryBtnText, feedbackRating === 0 && { color: colors.textTertiary }]}>Submit Feedback</Text><Ionicons name="send-outline" size={18} color={feedbackRating === 0 ? colors.textTertiary : "#fff"} />
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  }

  return null;
}

const s = StyleSheet.create({
  container: { flex: 1 },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 24 },
  searchSection: { paddingHorizontal: 20, paddingTop: 60, paddingBottom: 12, zIndex: 2 },
  backBtn: { flexDirection: "row", alignItems: "center", marginBottom: 10, gap: 4 },
  backBtnText: { fontSize: 15, fontWeight: "500" },
  divider: { height: StyleSheet.hairlineWidth, marginVertical: 10, marginLeft: 28 },
  mapSection: { flex: 1, marginHorizontal: 20, borderRadius: 16, overflow: "hidden" },
  map: { width: "100%", height: "100%" },
  mapHint: { position: "absolute", bottom: 16, left: 16, right: 16, borderRadius: 10, paddingVertical: 10, paddingHorizontal: 14, flexDirection: "row", alignItems: "center" },
  mapHintText: { fontSize: 13, marginLeft: 8 },
  infoSection: { paddingHorizontal: 20, paddingVertical: 14, gap: 8 },
  locationCard: { flexDirection: "row", alignItems: "center", borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10 },
  dot: { width: 10, height: 10, borderRadius: 5, marginRight: 10 },
  locationText: { fontSize: 14, flex: 1 },
  primaryBtn: { marginHorizontal: 40, marginBottom: 34, borderRadius: 12, paddingVertical: 16, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  primaryBtnText: { color: "#fff", fontSize: 16, fontWeight: "600" },
  routesSection: { paddingBottom: 8 },
  routesTitle: { fontSize: 13, fontWeight: "600", paddingHorizontal: 20, marginBottom: 8 },
  routesList: { paddingHorizontal: 16, gap: 10 },
  routeCard: { width: 180, borderRadius: 12, padding: 14, borderWidth: 2, borderColor: "transparent" },
  routeCardHeader: { flexDirection: "row", alignItems: "center", marginBottom: 8, gap: 6 },
  routeColorDot: { width: 10, height: 10, borderRadius: 5 },
  routeLabel: { fontSize: 12, fontWeight: "600", flex: 1 },
  routeDistance: { fontSize: 18, fontWeight: "700" },
  routeDuration: { fontSize: 14, marginTop: 2 },
  errorBanner: { flexDirection: "row", alignItems: "center", marginHorizontal: 20, marginBottom: 12, borderRadius: 10, padding: 12, gap: 8 },
  errorBannerText: { fontSize: 14, flex: 1 },
  walkersHeader: { flexDirection: "row", alignItems: "center", paddingHorizontal: 20, paddingVertical: 12 },
  walkersTitle: { fontSize: 20, fontWeight: "700" },
  walkersSubtitle: { fontSize: 13, marginTop: 2 },
  walkersList: { paddingHorizontal: 20, paddingBottom: 20 },
  walkerCard: { flexDirection: "row", alignItems: "center", borderRadius: 14, padding: 14, marginBottom: 10 },
  walkerAvatar: { width: 46, height: 46, borderRadius: 23, alignItems: "center", justifyContent: "center" },
  walkerInitial: { color: "#fff", fontSize: 18, fontWeight: "700" },
  walkerInfo: { flex: 1, marginLeft: 12 },
  walkerName: { fontSize: 16, fontWeight: "600" },
  walkerMeta: { flexDirection: "row", alignItems: "center", marginTop: 4, gap: 4 },
  walkerRating: { fontSize: 13, fontWeight: "600" },
  walkerSep: { fontSize: 13 },
  walkerTrips: { fontSize: 13 },
  confirmCentered: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 24 },
  confirmCard: { width: "100%", borderRadius: 20, padding: 28, alignItems: "center" },
  confirmTitle: { fontSize: 22, fontWeight: "700", marginTop: 16, textAlign: "center" },
  confirmSubtitle: { fontSize: 14, textAlign: "center", marginTop: 8, lineHeight: 20 },
  confirmPeople: { flexDirection: "row", alignItems: "center", marginTop: 28, justifyContent: "center" },
  confirmPerson: { alignItems: "center", width: 80 },
  confirmAvatar: { width: 56, height: 56, borderRadius: 28, alignItems: "center", justifyContent: "center" },
  confirmName: { fontSize: 13, fontWeight: "600", marginTop: 8 },
  confirmStatus: { fontSize: 11, marginTop: 2 },
  confirmLine: { width: 40, alignItems: "center", justifyContent: "center" },
  confirmLineBar: { height: 3, width: 30, borderRadius: 2 },
  waitingBanner: { flexDirection: "row", alignItems: "center", marginTop: 20, gap: 8 },
  waitingText: { fontSize: 14, fontWeight: "500" },
  bothConfirmedBanner: { flexDirection: "row", alignItems: "center", marginTop: 20, gap: 8 },
  bothConfirmedText: { fontSize: 14, fontWeight: "600" },
  navMap: { flex: 1 },
  navOverlay: { position: "absolute", bottom: 0, left: 0, right: 0, paddingBottom: 20 },
  navCard: { marginHorizontal: 20, borderRadius: 16, padding: 16 },
  navCardRow: { flexDirection: "row", alignItems: "center" },
  navCardItem: { flex: 1, alignItems: "center" },
  navCardLabel: { fontSize: 12 },
  navCardValue: { fontSize: 20, fontWeight: "700", marginTop: 4 },
  navCardDivider: { width: 1, height: 36 },
  navInstruction: { flexDirection: "row", alignItems: "center", marginHorizontal: 20, marginTop: 12, borderRadius: 12, padding: 14, gap: 10 },
  navInstructionText: { flex: 1, fontSize: 14, lineHeight: 20 },
  feedbackCentered: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 24 },
  feedbackCard: { width: "100%", borderRadius: 20, padding: 28, alignItems: "center" },
  feedbackTitle: { fontSize: 22, fontWeight: "700", marginTop: 16 },
  feedbackSubtitle: { fontSize: 14, textAlign: "center", marginTop: 8 },
  feedbackLabel: { fontSize: 13, fontWeight: "600", alignSelf: "flex-start", marginTop: 20, marginBottom: 8 },
  ratingRow: { flexDirection: "row", gap: 8 },
  feedbackInput: { width: "100%", borderRadius: 12, padding: 14, fontSize: 15, minHeight: 100, borderWidth: 1 },
  feedbackThanks: { fontSize: 24, fontWeight: "700", marginTop: 16 },
  feedbackThanksSub: { fontSize: 14, textAlign: "center", marginTop: 8, marginBottom: 24 },
  loadingText: { fontSize: 16, marginTop: 12 },
  errorText: { fontSize: 16, textAlign: "center", marginTop: 12 },
  chatHeader: { paddingHorizontal: 20, paddingTop: 4, paddingBottom: 0 },
  chatHeaderRow: { flexDirection: "row", alignItems: "center", paddingVertical: 10 },
  chatHeaderDivider: { height: StyleSheet.hairlineWidth, backgroundColor: "#ccc", marginHorizontal: 4 },
  chatAvatar: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  chatHeaderName: { fontSize: 15, fontWeight: "600" },
  chatHeaderSub: { fontSize: 12, marginTop: 1 },
  confirmStatusPill: {},
  statusPill: { flexDirection: "row", alignItems: "center", paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12, gap: 4 },
  statusPillText: { fontSize: 11, fontWeight: "600" },
  chatMessages: { flex: 1, paddingHorizontal: 16 },
  chatMessagesInner: { paddingTop: 12, paddingBottom: 8, gap: 8 },
  chatBubble: { maxWidth: "78%", borderRadius: 16, paddingHorizontal: 14, paddingVertical: 10 },
  chatBubbleMe: { alignSelf: "flex-end", borderBottomRightRadius: 4 },
  chatBubbleThem: { alignSelf: "flex-start", borderBottomLeftRadius: 4 },
  chatBubbleText: { fontSize: 15, lineHeight: 20 },
  chatEmpty: { alignItems: "center", justifyContent: "center", paddingTop: 48, gap: 8 },
  chatEmptyText: { fontSize: 14, textAlign: "center" },
  chatInputBar: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 10, gap: 10, borderTopWidth: StyleSheet.hairlineWidth },
  chatInput: { flex: 1, borderRadius: 20, paddingHorizontal: 16, paddingVertical: 10, fontSize: 15 },
  chatSendBtn: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center" },
  chatBottomBar: { paddingHorizontal: 40, paddingBottom: 20, paddingTop: 4 },
});
