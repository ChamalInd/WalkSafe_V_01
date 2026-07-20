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
import LocationSearch from "@/components/LocationSearch";
import { useTheme } from "@/contexts/ThemeContext";

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
  name: string;
  rating: number;
  trips: number;
}

const ROUTE_COLORS = ["#007AFF", "#FF9500", "#AF52DE"];

const WALKERS: Walker[] = [
  { id: "1", name: "Kamal Perera", rating: 4.8, trips: 124 },
  { id: "2", name: "Nadeesha Silva", rating: 4.6, trips: 89 },
  { id: "3", name: "Amila Fernando", rating: 4.9, trips: 201 },
  { id: "4", name: "Dilini Rajapaksa", rating: 4.5, trips: 67 },
  { id: "5", name: "Tharaka Bandara", rating: 4.7, trips: 153 },
  { id: "6", name: "Hashini Liyana", rating: 4.4, trips: 42 },
  { id: "7", name: "Chamod Weerasinghe", rating: 4.8, trips: 178 },
  { id: "8", name: "Saduni Karunaratne", rating: 4.3, trips: 31 },
];

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

type Stage = "selecting" | "routes" | "walkers" | "confirmation" | "navigating" | "feedback";

export default function ScheduleScreen() {
  const { colors } = useTheme();
  const { location: currentLocation, error: locationError, loading: locationLoading } = useCurrentLocation();

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
  const [userConfirmed, setUserConfirmed] = useState(false);
  const [partnerConfirmed, setPartnerConfirmed] = useState(false);

  const [remainingDistance, setRemainingDistance] = useState(0);
  const [feedbackRating, setFeedbackRating] = useState(0);
  const [feedbackText, setFeedbackText] = useState("");
  const [feedbackSubmitted, setFeedbackSubmitted] = useState(false);

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
    if (stage === "confirmation" && userConfirmed && !partnerConfirmed) {
      const timer = setTimeout(() => setPartnerConfirmed(true), 3000);
      return () => clearTimeout(timer);
    }
  }, [stage, userConfirmed, partnerConfirmed]);

  useEffect(() => {
    if (stage === "confirmation" && userConfirmed && partnerConfirmed) {
      const timer = setTimeout(() => {
        setStage("navigating");
        if (currentLocation) animateTo({ latitude: currentLocation.latitude, longitude: currentLocation.longitude, latitudeDelta: 0.005, longitudeDelta: 0.005 });
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [stage, userConfirmed, partnerConfirmed, currentLocation]);

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
          <View style={{ marginLeft: 10 }}><Text style={[s.walkersTitle, { color: colors.text }]}>Available Walkers</Text><Text style={[s.walkersSubtitle, { color: colors.textTertiary }]}>{WALKERS.length} walkers online near you</Text></View>
        </View>
        <FlatList data={WALKERS} keyExtractor={(item) => item.id} contentContainerStyle={s.walkersList} renderItem={({ item }) => (
          <TouchableOpacity style={[s.walkerCard, { backgroundColor: colors.cardBg }]} onPress={() => { setSelectedWalker(item); setStage("confirmation"); setUserConfirmed(false); setPartnerConfirmed(false); }}>
            <View style={[s.walkerAvatar, { backgroundColor: colors.primary }]}><Text style={s.walkerInitial}>{item.name.charAt(0)}</Text></View>
            <View style={s.walkerInfo}>
              <Text style={[s.walkerName, { color: colors.text }]}>{item.name}</Text>
              <View style={s.walkerMeta}><Ionicons name="star" size={12} color={colors.warning} /><Text style={[s.walkerRating, { color: colors.warning }]}>{item.rating}</Text><Text style={[s.walkerSep, { color: colors.textTertiary }]}>·</Text><Text style={[s.walkerTrips, { color: colors.textTertiary }]}>{item.trips} trips</Text></View>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
          </TouchableOpacity>
        )} />
      </View>
    );
  }

  // ─── CONFIRMATION ────────────────────────────────────────────────
  if (stage === "confirmation") {
    return (
      <View style={[s.container, { backgroundColor: colors.background }]}>
        <View style={[s.searchSection, { backgroundColor: colors.background }]}>
          <TouchableOpacity style={s.backBtn} onPress={() => setStage("walkers")}><Ionicons name="arrow-back" size={20} color={colors.primary} /><Text style={[s.backBtnText, { color: colors.primary }]}>Back</Text></TouchableOpacity>
        </View>
        <View style={s.confirmCentered}>
          <View style={[s.confirmCard, { backgroundColor: colors.cardBg }]}>
            <Ionicons name="hand-right" size={40} color={colors.primary} />
            <Text style={[s.confirmTitle, { color: colors.text }]}>Meet at the Starting Point</Text>
            <Text style={[s.confirmSubtitle, { color: colors.textSecondary }]}>Both you and {selectedWalker?.name} must confirm arrival at the meeting point before navigation begins.</Text>
            <View style={s.confirmPeople}>
              <View style={s.confirmPerson}>
                <View style={[s.confirmAvatar, { backgroundColor: colors.surfaceSecondary }, userConfirmed && { backgroundColor: colors.success }]}>{userConfirmed ? <Ionicons name="checkmark" size={22} color="#fff" /> : <Ionicons name="person" size={22} color="#fff" />}</View>
                <Text style={[s.confirmName, { color: colors.text }]}>You</Text>
                <Text style={[s.confirmStatus, { color: colors.textTertiary }, userConfirmed && { color: colors.success }]}>{userConfirmed ? "Confirmed" : "Waiting..."}</Text>
              </View>
              <View style={s.confirmLine}><View style={[s.confirmLineBar, { backgroundColor: colors.surfaceSecondary }, userConfirmed && partnerConfirmed && { backgroundColor: colors.success }]} /></View>
              <View style={s.confirmPerson}>
                <View style={[s.confirmAvatar, { backgroundColor: colors.surfaceSecondary }, partnerConfirmed && { backgroundColor: colors.success }]}>{partnerConfirmed ? <Ionicons name="checkmark" size={22} color="#fff" /> : <Ionicons name="person" size={22} color="#fff" />}</View>
                <Text style={[s.confirmName, { color: colors.text }]}>{selectedWalker?.name?.split(" ")[0]}</Text>
                <Text style={[s.confirmStatus, { color: colors.textTertiary }, partnerConfirmed && { color: colors.success }]}>{partnerConfirmed ? "Confirmed" : "Waiting..."}</Text>
              </View>
            </View>
            {!userConfirmed ? (
              <TouchableOpacity style={[s.primaryBtn, { backgroundColor: colors.success, marginHorizontal: 0, paddingVertical: 18 }]} onPress={() => setUserConfirmed(true)}>
                <Text style={s.primaryBtnText}>I&apos;ve Arrived</Text><Ionicons name="checkmark-circle-outline" size={18} color="#fff" />
              </TouchableOpacity>
            ) : !partnerConfirmed ? (
              <View style={s.waitingBanner}><ActivityIndicator size="small" color={colors.primary} /><Text style={[s.waitingText, { color: colors.primary }]}>Waiting for {selectedWalker?.name?.split(" ")[0]}...</Text></View>
            ) : (
              <View style={s.bothConfirmedBanner}><Ionicons name="checkmark-done-circle" size={22} color={colors.success} /><Text style={[s.bothConfirmedText, { color: colors.success }]}>Both confirmed! Starting navigation...</Text></View>
            )}
          </View>
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
          <View style={s.navProgress}>
            <View style={[s.navProgressBar, { backgroundColor: colors.surfaceSecondary }]}>
              <View style={[s.navProgressFill, { backgroundColor: colors.primary, width: `${Math.min(100, Math.max(0, 100 - (remainingDistance / (activeRoute?.distance ?? 1)) * 100))}%` }]} />
            </View>
            <Text style={[s.navProgressText, { color: colors.textTertiary }]}>{Math.min(100, Math.max(0, Math.round(100 - (remainingDistance / (activeRoute?.distance ?? 1)) * 100)))}% complete</Text>
          </View>
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
            <TouchableOpacity style={[s.primaryBtn, { backgroundColor: colors.primary }]} onPress={() => { setStage("selecting"); setDestination(null); setDestText(""); setRoutes([]); setSelectedRoute(0); setSelectedWalker(null); setUserConfirmed(false); setPartnerConfirmed(false); setFeedbackRating(0); setFeedbackText(""); setFeedbackSubmitted(false); setRemainingDistance(0); if (origin) animateTo({ latitude: origin.latitude, longitude: origin.longitude, latitudeDelta: 0.05, longitudeDelta: 0.05 }); }}>
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
            <TouchableOpacity style={[s.primaryBtn, { backgroundColor: colors.success }, feedbackRating === 0 && { backgroundColor: colors.surface }]} disabled={feedbackRating === 0} onPress={() => setFeedbackSubmitted(true)}>
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
  primaryBtn: { marginHorizontal: 20, marginBottom: 34, borderRadius: 12, paddingVertical: 16, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
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
  navProgress: { marginHorizontal: 20, marginTop: 12 },
  navProgressBar: { height: 6, borderRadius: 3, overflow: "hidden" },
  navProgressFill: { height: "100%", borderRadius: 3 },
  navProgressText: { fontSize: 12, textAlign: "center", marginTop: 6 },
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
});
