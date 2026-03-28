# PeiPei iOS — 10 Polish Iterations

Read this file and implement ALL changes below in one pass. This is a visual polish pass on the existing redesigned app.

## Critical: Do NOT touch these files
- `src/lib/*` (api.ts, auth-storage.ts, offline-queue.ts, social-sharing.ts)
- `src/providers/auth-provider.tsx`
- `src/components/branding/peipei-logo.tsx`

## Files to modify
1. `src/design/tokens.ts` — refined colors
2. `app/(app)/index.tsx` — visual polish on coach screen
3. `app/(app)/data.tsx` — visual polish on data tab
4. `app/(app)/settings.tsx` — visual polish
5. `app/(auth)/login.tsx` — visual polish

## 1. Color System Refinement (tokens.ts)

The background is currently pure #0A0A08. That's too close to OLED black. Refine:

```typescript
export const colors = {
  background: '#0C0C0A',      // slightly warmer than pure black
  surface: '#161614',          // cards, input bg — more distinct from background  
  surfaceElevated: '#1E1E1B',  // settings rows, modals
  separator: '#2A2A26',        // more visible hairlines
  text: '#F2EDE4',             // warm cream (keep)
  textSecondary: '#9B958C',    // runner text — BRIGHTER for readability
  textTertiary: '#5A5650',     // timestamps — BRIGHTER for visibility
  accent: '#8B3A3A',           // garnet (keep)
  accentSubtle: 'rgba(139,58,58,0.15)',
  destructive: '#C0544F',
  success: '#5B8C6A',
  // NEW semantic colors for running metrics
  metricPace: '#7AADCF',       // cool blue for pace values
  metricHr: '#CF7A7A',         // warm red for heart rate
  metricDistance: '#7ACF8C',    // green for distance
} as const;
```

## 2. Coach Screen Polish (index.tsx styles)

### Typography scale
- greeting: 28pt → feels like a Large Title
- subheading: 15pt (keep)
- coachHeadlineText: 16.5pt, semibold, lineHeight 26 — slightly smaller, more refined
- coachBodyText: 16pt, regular, lineHeight 27 — generous leading for CJK  
- runnerMessageText: 15.5pt, lineHeight 23
- dayLabel: 12pt, letterspacing 1.2, uppercase

### Coach message container
Add a subtle left border accent to coach messages for visual structure:
```
coachRow: {
  marginTop: 20,
  paddingHorizontal: 20,
  paddingLeft: 24,           // extra left padding
  borderLeftWidth: 2,
  borderLeftColor: 'rgba(139,58,58,0.25)',  // subtle garnet accent
}
```

### Runner message polish
Add a very subtle background to runner messages:
```
runnerRow: {
  alignItems: 'flex-end',
  marginTop: 14,
  paddingHorizontal: 20,
}
runnerMessageText: {
  color: colors.textSecondary,
  fontFamily: fonts.ui,
  fontSize: 15.5,
  lineHeight: 23,
  maxWidth: '75%',
  textAlign: 'right',
  backgroundColor: 'rgba(255,255,255,0.03)',  // barely visible background
  paddingHorizontal: 14,
  paddingVertical: 8,
  borderRadius: 16,
  overflow: 'hidden',
}
```

### Header refinement
- greeting fontSize: 28
- Make the greeting weight lighter (fontWeight: '400' instead of '500')
- Add letterSpacing: -0.5 to greeting for that iOS Large Title feel
- subheading: add marginTop: 2 (tighter to greeting)

### Composer refinement
- input background should be `colors.surface` 
- input borderRadius: 22 (rounder, more iOS-like)
- Add blur/vibrancy feel: input borderColor should be 'rgba(255,255,255,0.06)' 
- Placeholder color: colors.textTertiary

### Day separator refinement
- dayLabel: fontSize 12, letterSpacing 1.5, fontWeight '500'
- Increase marginVertical to 28 for breathing room
- dayLine color: 'rgba(255,255,255,0.04)' — even more subtle

### Data reference styling
Change `inlineMono` to use the semantic metric colors:
When rendering data references in `createInlineRuns`, detect the type:
- Pace patterns (X:XX/km, X:XX/mi) → metricPace color
- HR patterns (XXX bpm, XX次/分) → metricHr color  
- Distance patterns (XXkm, XX公里) → metricDistance color

Update the `createInlineRuns` function to apply these colors to `isDataRef` tokens.

### Typing indicator
Make it more refined — use 3 small circles with a subtle breathing animation instead of just dots. Style:
```
typingDot: {
  width: 6,
  height: 6,
  borderRadius: 3,
  backgroundColor: colors.textTertiary,
}
```

## 3. Data Tab Polish (data.tsx)

Make the data tab feel like an editorial sports page:
- Section headers: 12pt, uppercase, letterSpacing 2, color textTertiary, fontWeight '600'
- Data values: 28pt for primary metrics (weekly km, goal countdown), fontWeight '300' (light)
- Data labels: 13pt, color textSecondary
- Each metric should have generous padding (20px vertical between items)
- Add a subtle card background to each section: backgroundColor surface, borderRadius 16, padding 20
- Recent runs list: each run is a row with date (textTertiary), distance (text), pace (metricPace)

## 4. Settings Polish (settings.tsx)

- Group headers: 12pt, uppercase, letterSpacing 2, color textTertiary
- Row height: 52pt minimum (iOS standard)
- Row separators: inset from left by 16pt
- Chevron: Ionicons chevron-forward, size 16, color textTertiary
- Destructive text: use colors.destructive
- Auto-save haptic: ImpactFeedbackStyle.Light

## 5. Login Polish (login.tsx)

- Logo centered with 80pt top margin from safe area
- "pei·pei" wordmark: 24pt, Jura, letterSpacing 4, color textSecondary, marginTop 12
- Input fields: height 52, borderRadius 14, backgroundColor surface
- "Sign in" button: height 52, borderRadius 14, backgroundColor accent
- Generous spacing between elements (24pt gaps)
- Move "Need an account?" to bottom with 32pt top margin

## VALIDATION
After all changes, run `npx tsc --noEmit` to verify. Fix any type errors.
The app must not crash — all existing functionality must be preserved.
