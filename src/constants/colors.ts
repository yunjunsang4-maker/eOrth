// eOrth Design System - Color Tokens
// Extracted from Figma wireframe design

export const Colors = {
  // Backgrounds
  bgDeep: '#0A0118',        // Main deep purple-black background
  bgDark: '#100620',        // Slightly lighter background (BG #100620)
  bgCard: '#1A1A2E',        // Card/surface background
  bgCardAlt: '#16142A',     // Alternate card background
  bgOverlay: 'rgba(10, 1, 24, 0.85)', // Modal overlay

  // Primary Purple
  primary: '#7B61FF',       // Main accent purple
  primaryLight: '#9B85FF',  // Lighter purple
  primaryDark: '#5A42DD',   // Darker purple
  primaryGlow: 'rgba(192, 132, 252, 0.65)', // Glow effect (from Figma: Glow rgba(192,132,252,0.65))

  // Globe gradient purples
  globeOuter: '#3B1E8E',    // Outer globe ring
  globeInner: '#7B61FF',    // Inner globe highlight
  globeCore: '#C084FC',     // Globe center glow

  // Accent colors
  gold: '#FFD700',          // Gold for milestones/ranking
  kakaoYellow: '#FEE500',   // Kakao login button
  success: '#4ADE80',       // Success green

  // Text
  textPrimary: '#FFFFFF',   // Primary white text
  textSecondary: '#A0A0B0', // Secondary gray text
  textMuted: '#6B6B80',     // Muted text

  // Social Login
  googleWhite: '#FFFFFF',   // Google button background
  appleBlack: '#000000',    // Apple button background

  // Tab Bar
  tabActive: '#7B61FF',     // Active tab icon
  tabInactive: '#6B6B80',   // Inactive tab icon

  // Borders
  border: 'rgba(123, 97, 255, 0.2)',   // Subtle purple border
  borderActive: 'rgba(123, 97, 255, 0.6)', // Active border

  // Pagination dots
  dotActive: '#7B61FF',
  dotInactive: '#3D3D55',

  // Stats / Charts
  chartPurple: '#7B61FF',
  chartPurpleLight: 'rgba(123, 97, 255, 0.3)',

  // Transparent utilities
  transparent: 'transparent',
  white: '#FFFFFF',
  black: '#000000',
};

export const Gradients = {
  // Background gradients
  bgMain: ['#0A0118', '#100620'],
  bgCard: ['#1A1A2E', '#16142A'],

  // Globe visualization
  globe: ['#3B1E8E', '#7B61FF', '#C084FC'],
  globeGlow: ['rgba(192, 132, 252, 0.4)', 'rgba(123, 97, 255, 0)', 'transparent'],

  // Primary button
  primaryBtn: ['#7B61FF', '#5A42DD'],
  primaryBtnHover: ['#9B85FF', '#7B61FF'],

  // Purple glow radial-ish (simulated with linear)
  glow: ['rgba(123,97,255,0.5)', 'rgba(123,97,255,0)'],
};
