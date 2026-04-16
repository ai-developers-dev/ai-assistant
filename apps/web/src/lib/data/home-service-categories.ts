export const HOME_SERVICE_CATEGORIES = [
  "roofing contractor",
  "HVAC contractor",
  "plumber",
  "electrician",
  "landscaping company",
  "pest control",
  "gutter installation",
  "window replacement",
  "siding contractor",
  "general contractor",
] as const;

export type HomeServiceCategory = (typeof HOME_SERVICE_CATEGORIES)[number];
