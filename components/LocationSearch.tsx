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
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=5&addressdetails=1`,
        {
          headers: { "User-Agent": "WalkSafeApp/1.0" },
        }
      );
      const data = await res.json();

      const results: Suggestion[] = data.map(
        (item: Record<string, unknown>) => ({
          id: String(item.place_id),
          title: String(item.display_name).split(",")[0],
          subtitle: String(item.display_name),
          latitude: parseFloat(String(item.lat)),
          longitude: parseFloat(String(item.lon)),
        })
      );

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
        <Text style={styles.label}>{label}</Text>
      </View>
      <View style={styles.inputContainer}>
        <TextInput
          style={styles.input}
          value={value}
          onChangeText={handleChange}
          placeholder={placeholder}
          placeholderTextColor="#999"
          returnKeyType="search"
        />
        {loading && (
          <ActivityIndicator
            size="small"
            color="#999"
            style={styles.spinner}
          />
        )}
        {value.length > 0 && (
          <TouchableOpacity
            onPress={() => {
              onChangeText("");
              setSuggestions([]);
              setShowList(false);
            }}
            style={styles.clearBtn}
          >
            <Ionicons name="close-circle" size={18} color="#bbb" />
          </TouchableOpacity>
        )}
      </View>

      {showList && (
        <View style={styles.suggestionBox}>
          <FlatList
            data={suggestions}
            keyExtractor={(item) => item.id}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => (
              <TouchableOpacity
                style={styles.suggestionItem}
                onPress={() => handleSelect(item)}
              >
                <Ionicons
                  name="location-outline"
                  size={16}
                  color="#007AFF"
                  style={{ marginRight: 10 }}
                />
                <View style={{ flex: 1 }}>
                  <Text style={styles.suggestionTitle} numberOfLines={1}>
                    {item.title}
                  </Text>
                  <Text style={styles.suggestionSub} numberOfLines={1}>
                    {item.subtitle}
                  </Text>
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
  row: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 6,
  },
  label: {
    fontSize: 13,
    fontWeight: "600",
    color: "#444",
    marginLeft: 8,
  },
  inputContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F2F2F7",
    borderRadius: 10,
    paddingHorizontal: 12,
  },
  input: {
    flex: 1,
    paddingVertical: 10,
    fontSize: 15,
    color: "#000",
  },
  spinner: { marginLeft: 8 },
  clearBtn: { marginLeft: 8, padding: 2 },
  suggestionBox: {
    position: "absolute",
    top: 74,
    left: 0,
    right: 0,
    backgroundColor: "#fff",
    borderRadius: 10,
    maxHeight: 200,
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
    borderBottomColor: "#E5E5EA",
  },
  suggestionTitle: { fontSize: 14, fontWeight: "500", color: "#000" },
  suggestionSub: { fontSize: 12, color: "#888", marginTop: 2 },
});
