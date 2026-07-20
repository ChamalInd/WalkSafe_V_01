import { createContext, ReactNode, useContext, useEffect, useMemo, useState } from "react";
import { useColorScheme as rnUseColorScheme } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

export type ThemeMode = "light" | "dark" | "system";

interface ThemeColors {
  background: string;
  surface: string;
  surfaceSecondary: string;
  text: string;
  textSecondary: string;
  textTertiary: string;
  border: string;
  primary: string;
  danger: string;
  success: string;
  warning: string;
  inputBg: string;
  cardBg: string;
}

interface ThemeContextType {
  mode: ThemeMode;
  colors: ThemeColors;
  isDark: boolean;
  setMode: (mode: ThemeMode) => void;
}

const STORAGE_KEY = "@walksafe_theme";

const lightColors: ThemeColors = {
  background: "#FFFFFF",
  surface: "#F2F2F7",
  surfaceSecondary: "#E5E5EA",
  text: "#000000",
  textSecondary: "#3C3C43",
  textTertiary: "#8E8E93",
  border: "#E5E5EA",
  primary: "#007AFF",
  danger: "#FF3B30",
  success: "#34C759",
  warning: "#FF9500",
  inputBg: "#F2F2F7",
  cardBg: "#F2F2F7",
};

const darkColors: ThemeColors = {
  background: "#000000",
  surface: "#1C1C1E",
  surfaceSecondary: "#2C2C2E",
  text: "#FFFFFF",
  textSecondary: "#EBEBF5",
  textTertiary: "#8E8E93",
  border: "#38383A",
  primary: "#0A84FF",
  danger: "#FF453A",
  success: "#30D158",
  warning: "#FF9F0A",
  inputBg: "#1C1C1E",
  cardBg: "#1C1C1E",
};

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const systemScheme = rnUseColorScheme();
  const [mode, setModeState] = useState<ThemeMode>("system");

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((stored) => {
      if (stored === "light" || stored === "dark" || stored === "system") {
        setModeState(stored);
      }
    });
  }, []);

  function setMode(m: ThemeMode) {
    setModeState(m);
    AsyncStorage.setItem(STORAGE_KEY, m);
  }

  const isDark = mode === "dark" || (mode === "system" && systemScheme === "dark");
  const colors = isDark ? darkColors : lightColors;

  const value = useMemo(() => ({ mode, colors, isDark, setMode }), [mode, isDark]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context;
}
