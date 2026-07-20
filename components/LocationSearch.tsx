import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { useTheme } from "@/contexts/ThemeContext";

interface Suggestion {
  id: string;
  title: string;
  subtitle: string;
  latitude: number;
  longitude: number;
}

interface Props {
  label: string;
  icon: "radio-button-on" | "location";
  iconColor: string;
  value: string;
  onChangeText: (text: string) => void;
  onSelect: (suggestion: Suggestion) => void;
  placeholder?: string;
}

export default function LocationSearch({
  label,
  icon,
  iconColor,
  value,
  onChangeText,
  onSelect,
  placeholder = "Search location...",
}: Props) {
  const { colors } = useTheme();
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [showList, setShowList] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  function handleChange(text: string) {
    onChangeText(text);
    if (timerRef.current) clearTimeout(timerRef.current);
    if (text.trim().length < 3) {
      setSuggestions([]);
      setShowList(false);
      return;
    }
    timerRef.current = setTimeout(() => search(text.trim()), 400);
  }

  async function search(query: string) {
    setLoading(true);
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=5&addressdetails=1&countrycodes=lk`,
        { headers: { "User-Agent": "WalkSafeApp/1.0" } }
      );
      const data = await res.json();
      const results: Suggestion[] = data.map((item: Record<string, unknown>) => ({
        id: String(item.place_id),
        title: String(item.display_name).split(",")[0],
        subtitle: String(item.display_name),
        latitude: parseFloat(String(item.lat)),
        longitude: parseFloat(String(item.lon)),
      }));
      setSuggestions(results);
      setShowList(results.length > 0);
    } catch {
      setSuggestions([]);
      setShowList(false);
    } finally {
      setLoading(false);
    }
  }

  function handleSelect(item: Suggestion) {
    onChangeText(item.title);
    setShowList(false);
    setSuggestions([]);
    onSelect(item);
  }

  return (
    <View style={styles.wrapper}>
      <View style={styles.row}>
        <Ionicons name={icon} size={20} color={iconColor} />
        <Text style={[styles.label, { color: colors.textSecondary }]}>{label}</Text>
      </View>
      <View style={[styles.inputContainer, { backgroundColor: colors.inputBg }]}>
        <TextInput
          style={[styles.input, { color: colors.text }]}
          value={value}
          onChangeText={handleChange}
          placeholder={placeholder}
          placeholderTextColor={colors.textTertiary}
          returnKeyType="search"
        />
        {loading && <ActivityIndicator size="small" color={colors.textTertiary} style={styles.spinner} />}
        {value.length > 0 && (
          <TouchableOpacity
            onPress={() => { onChangeText(""); setSuggestions([]); setShowList(false); }}
            style={styles.clearBtn}
          >
            <Ionicons name="close-circle" size={18} color={colors.textTertiary} />
          </TouchableOpacity>
        )}
      </View>

      {showList && (
        <View style={[styles.suggestionBox, { backgroundColor: colors.background, borderColor: colors.border }]}>
          <FlatList
            data={suggestions}
            keyExtractor={(item) => item.id}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => (
              <TouchableOpacity
                style={[styles.suggestionItem, { borderBottomColor: colors.border }]}
                onPress={() => handleSelect(item)}
              >
                <Ionicons name="location-outline" size={16} color={colors.primary} style={{ marginRight: 10 }} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.suggestionTitle, { color: colors.text }]} numberOfLines={1}>{item.title}</Text>
                  <Text style={[styles.suggestionSub, { color: colors.textTertiary }]} numberOfLines={1}>{item.subtitle}</Text>
                </View>
              </TouchableOpacity>
            )}
          />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { zIndex: 1 },
  row: { flexDirection: "row", alignItems: "center", marginBottom: 6 },
  label: { fontSize: 13, fontWeight: "600", marginLeft: 8 },
  inputContainer: { flexDirection: "row", alignItems: "center", borderRadius: 10, paddingHorizontal: 12 },
  input: { flex: 1, paddingVertical: 10, fontSize: 15 },
  spinner: { marginLeft: 8 },
  clearBtn: { marginLeft: 8, padding: 2 },
  suggestionBox: {
    position: "absolute",
    top: 74,
    left: 0,
    right: 0,
    borderRadius: 10,
    maxHeight: 200,
    borderWidth: 1,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
    overflow: "hidden",
    zIndex: 10,
  },
  suggestionItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  suggestionTitle: { fontSize: 14, fontWeight: "500" },
  suggestionSub: { fontSize: 12, marginTop: 2 },
});
