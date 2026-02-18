export interface Theme {
  // Logo / branding
  logo: string;
  // Tree spine
  spine: string;
  // Cursor
  selected: string;
  selectedText: string;
  active: string;
  activeText: string;
  // Text
  text: string;
  dim: string;
  bold: string;
  // Status
  clean: string;
  dirty: string;
  // Mode
  modeNormal: string;
  modeInsert: string;
  // Accents
  accent: string;
  warning: string;
  error: string;
}

export const nord: Theme = {
  logo: "#A3BE8C",       // nord14 green
  spine: "#4C566A",      // nord3
  selected: "#A3BE8C",   // nord14 green
  selectedText: "#A3BE8C",
  active: "#88C0D0",     // nord8 frost
  activeText: "#88C0D0",
  text: "#D8DEE9",       // nord4
  dim: "#4C566A",        // nord3
  bold: "#ECEFF4",       // nord6
  clean: "#A3BE8C",      // nord14 green
  dirty: "#BF616A",      // nord11 red
  modeNormal: "#81A1C1", // nord9 blue
  modeInsert: "#EBCB8B", // nord13 yellow
  accent: "#88C0D0",     // nord8 frost
  warning: "#D08770",    // nord12 orange
  error: "#BF616A",      // nord11 red
};

// Active theme
export const theme = nord;
