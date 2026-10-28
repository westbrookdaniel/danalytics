import { useEffect, useState } from "react"

export type ThemePref = "system" | "light" | "dark"

const KEY = "fc-theme"

function readPref(): ThemePref {
  try {
    const v = localStorage.getItem(KEY)
    return v === "light" || v === "dark" ? v : "system"
  } catch {
    return "system"
  }
}

/** Applies shadcn's `.dark` class from a stored preference, following the OS when unset. */
export function useTheme() {
  const [pref, setPref] = useState<ThemePref>(readPref)
  const [systemDark, setSystemDark] = useState(() => matchMedia("(prefers-color-scheme: dark)").matches)

  useEffect(() => {
    const mq = matchMedia("(prefers-color-scheme: dark)")
    const onChange = () => setSystemDark(mq.matches)
    mq.addEventListener("change", onChange)
    return () => mq.removeEventListener("change", onChange)
  }, [])

  const isDark = pref === "dark" || (pref === "system" && systemDark)

  useEffect(() => {
    document.documentElement.classList.toggle("dark", isDark)
    try {
      if (pref === "system") localStorage.removeItem(KEY)
      else localStorage.setItem(KEY, pref)
    } catch {
      // Storage can be blocked; the theme still applies for this visit.
    }
  }, [isDark, pref])

  return { pref, setPref, isDark }
}

/**
 * Chart colours from the dataviz reference palette: the first three categorical
 * slots, which stay distinguishable for every pair (incl. colour-vision deficiency)
 * in both modes. Labs beyond OpenAI and Anthropic share the third slot and are
 * told apart by direct labels.
 */
export const CHART_COLORS = {
  light: {
    OpenAI: "#2a78d6",
    Anthropic: "#eb6834",
    "Other labs": "#1baf7a",
    surface: "#ffffff",
    ink: "#0b0b0b",
    inkMuted: "#52514e",
    grid: "#e1e0d9",
    frontier: "#0b0b0b",
  },
  dark: {
    OpenAI: "#3987e5",
    Anthropic: "#d95926",
    "Other labs": "#199e70",
    surface: "#1c1c1c",
    ink: "#f0efec",
    inkMuted: "#c3c2b7",
    grid: "#2c2c2a",
    frontier: "#f0efec",
  },
} as const
export type ChartPalette = (typeof CHART_COLORS)["light" | "dark"]
