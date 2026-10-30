export const pondPalettes = {
  jade: {
    name: "Jade",
    stops: ["#193e3f", "#173435", "#102829"],
    glow: "154,172,139",
    water: [23, 52, 53],
    shadow: "#07191a",
    light: false,
  },
  indigo: {
    name: "Indigo",
    stops: ["#394965", "#26334e", "#141f35"],
    glow: "177,185,214",
    water: [38, 51, 78],
    shadow: "#0a1022",
    light: false,
  },
  slate: {
    name: "Slate",
    stops: ["#777b89", "#525c6c", "#303c4b"],
    glow: "200,210,220",
    water: [82, 92, 108],
    shadow: "#182330",
    light: false,
  },
  sand: {
    name: "Sand",
    stops: ["#c3b79a", "#a19c83", "#6e7b70"],
    glow: "246,230,186",
    water: [161, 156, 131],
    shadow: "#394c42",
    light: true,
  },
  dusk: {
    name: "Dusk",
    stops: ["#51443e", "#373333", "#20272c"],
    glow: "212,173,145",
    water: [55, 51, 51],
    shadow: "#141719",
    light: false,
  },
} as const;

export type PondPalette = keyof typeof pondPalettes;
export const pondPaletteKey = (value: unknown): PondPalette =>
  typeof value === "string" && Object.hasOwn(pondPalettes, value)
    ? (value as PondPalette)
    : "jade";
