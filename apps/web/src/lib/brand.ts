/**
 * Trans-SAS identity used before a company profile has been saved, and for the sign-in
 * screens. Once the profile exists, its name (and uploaded logo) take precedence.
 */
export const BRAND = {
  shortName: 'Trans-SAS',
  fullName: 'Trans-SAS Trading & Mfg. Co. Ltd.',
  /** Static copy of the company logo, served from /public. */
  logoSrc: '/trans-logo.png',
} as const;
