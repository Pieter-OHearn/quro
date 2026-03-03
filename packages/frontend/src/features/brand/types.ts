export type BrandPaletteColor = {
  readonly name: string;
  readonly hex: string;
  readonly role: string;
  readonly text: string;
  readonly border?: boolean;
};

export type BrandLogoSize = {
  readonly label: string;
  readonly px: number;
};

export type BrandAnatomyItem = {
  readonly dot: string;
  readonly label: string;
  readonly desc: string;
};

export type BrandContextVariant = {
  readonly bg: string;
  readonly label: string;
  readonly showBg: boolean;
  readonly inverted: boolean;
};

export type BrandData = {
  readonly palette: readonly BrandPaletteColor[];
  readonly sizes: readonly BrandLogoSize[];
  readonly donts: readonly string[];
  readonly anatomyItems: readonly BrandAnatomyItem[];
  readonly contextVariants: readonly BrandContextVariant[];
  readonly heroTags: readonly string[];
};
