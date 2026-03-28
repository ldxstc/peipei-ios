# PeiPei iOS Redesign — Phase 1 Build Task

You are redesigning the PeiPei iOS app from a web-chat-style interface to a native iOS journal-style coaching app with two tabs.

## CRITICAL CONSTRAINTS
- Do NOT delete or modify files in `src/lib/` (api.ts, auth-storage.ts, offline-queue.ts, social-sharing.ts, onboarding-storage.ts) — these are shared utilities
- Do NOT delete or modify `src/providers/auth-provider.tsx` — auth logic stays
- Do NOT delete or modify `src/components/branding/peipei-logo.tsx` — logo stays
- Do NOT add any new npm dependencies — use what's already installed
- Keep ALL existing API calls and auth patterns (X-Session-Token header, XHR streaming, etc.)
- The app must compile and run on iOS simulator after changes

## NEW DESIGN SYSTEM

### Colors (update `src/design/tokens.ts`)
```typescript
export const colors = {
  background: '#0A0A08',      // warm near-black (NOT pure black)
  surface: '#141412',          // settings groups, input fields
  surfaceElevated: '#1C1C19',  // modals, sheets, setting rows
  separator: '#1F1F1C',        // hairline dividers
  text: '#F2EDE4',             // primary text (coach, titles)
  textSecondary: '#8A857C',    // runner text, labels
  textTertiary: '#4A4843',     // timestamps, hints, placeholders
  accent: '#8B3A3A',           // garnet — send button, CTA
  accentSubtle: 'rgba(139,58,58,0.15)', // pressed states
  destructive: '#C0544F',      // sign out, delete, errors
  success: '#5B8C6A',          // connected, sync success
} as const;

export const fonts = {
  coach: 'NewYork-Regular',        // iOS system serif (New York)
  coachBold: 'NewYork-Semibold',   // coach headline
  ui: 'System',                     // SF Pro (React Native default)
  mono: 'Menlo',
  brand: 'Jura_300Light',
} as const;
```

**IMPORTANT about New York font:** React Native on iOS supports `fontFamily: 'NewYork-Regular'` and `'NewYork-Semibold'` natively via `UIFont`. If this doesn't work, fall back to `Georgia` for serif. Test by checking if text renders in serif vs sans.

### Tab Structure

Change `app/(app)/_layout.tsx` from a Stack to a **Tab navigator** with 2 tabs:
- "Coach" tab → `app/(app)/index.tsx` (the journal/conversation screen)
- "Data" tab → `app/(app)/data.tsx` (new file — training data view)

Tab bar styling:
- Background: `#0A0A08`
- Top border: 1px `#1F1F1C`
- Labels only (no icons). Active: `#F2EDE4`, inactive: `#4A4843`
- Use `@react-navigation/bottom-tabs` (already available via expo-router)

### Coach Tab — Journal Redesign (rewrite `app/(app)/index.tsx`)

**This is the main rewrite.** The current file is 1800+ lines. The new version should be ~600-800 lines.

#### Header
Replace the current complex header (COACH eyebrow, PEIPEI title, daily view button, settings icon, scroll-to-bottom, sticky date pill) with a **contextual greeting header**:

```
┌──────────────────────────┐
│                     ⚙    │  ← gear icon, right-aligned
│ Good evening, Will.      │  ← SF Pro Display, 22pt, medium, #F2EDE4
│ Your coach is listening.  │  ← SF Pro, 15pt, #8A857C
└──────────────────────────┘
```

- Greeting is time-based: "Good morning" (6-12), "Good afternoon" (12-17), "Good evening" (17-22), "Good night" (22-6)
- Second line: "Your coach is listening." (static for now — will be data-driven later)
- Gear icon → navigates to settings
- Header collapses when scrolling (just show "PeiPei" + gear when scrolled)

#### Messages — Coach (full-width, serif, authoritative)
```tsx
<View style={{ paddingHorizontal: 20, marginTop: 16 }}>
  <Text style={{
    fontFamily: 'NewYork-Semibold', // bold first line
    fontSize: 17,
    color: '#F2EDE4',
    lineHeight: 26,
  }}>
    {firstLine}
  </Text>
  <Text style={{
    fontFamily: 'NewYork-Regular',
    fontSize: 17,
    color: '#F2EDE4', 
    lineHeight: 26,
    marginTop: 4,
  }}>
    {restOfMessage}
  </Text>
</View>
```

- **NO bubbles.** Coach text sits directly on the background.
- Full width (with 20px horizontal padding)
- First line of each message is semibold (headline-first rule)
- Rest of message is regular weight
- **Bold** markdown → semibold, *italic* → italic
- Data references (e.g. `5:30/km`, `145bpm`, `12K`) in monospace

#### Messages — Runner (right-aligned, quiet)
```tsx
<View style={{ paddingHorizontal: 20, marginTop: 12, alignItems: 'flex-end' }}>
  <Text style={{
    fontFamily: 'System',
    fontSize: 16,
    color: '#8A857C',
    lineHeight: 24,
    maxWidth: '75%',
    textAlign: 'right',
  }}>
    {message.content}
  </Text>
</View>
```

- **NO bubbles.** Runner text is right-aligned, quieter color.
- Max width 75% of screen
- Pending messages: 0.6 opacity

#### Day Separators
```tsx
<View style={{ flexDirection: 'row', alignItems: 'center', marginVertical: 24, paddingHorizontal: 20 }}>
  <View style={{ flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: '#1F1F1C' }} />
  <Text style={{ color: '#4A4843', fontSize: 11, marginHorizontal: 12 }}>Saturday, March 28</Text>
  <View style={{ flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: '#1F1F1C' }} />
</View>
```

#### Composer (simplified)
Replace the entire current composer with:
- Single TextInput with pill border, background `#141412`, border `#1F1F1C`
- When empty + keyboard down: mic icon inside right side of input (SF Symbol via Ionicons: `mic-outline`)
- When text entered: send button (Ionicons: `arrow-up-circle`) in garnet
- When keyboard showing: camera icon (Ionicons: `camera-outline`) to the LEFT of input
- Long-press input → context menu with "Take Photo" / "Choose from Library" (use Alert.alert for now)
- Input grows to max 4 lines
- Return key inserts newline

#### Empty State
```tsx
<View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
  <PeiPeiLogoMark size={48} />
  <Text style={{ fontFamily: 'System', fontSize: 17, color: '#8A857C', marginTop: 16 }}>
    Your coach is ready.
  </Text>
</View>
```

#### What to DELETE from current index.tsx
- `CoachDataSidebar` import and all sidebar logic
- `CoachContentModel`, `getCoachContentModel`, semantic cards, mini cards, floating headlines
- `CoachIndicator` gradient component
- `SessionContinuityRow`, `SessionContinuitySlot`
- `ClosingCeremonyRow` (replace with simple text below last message)
- `DayLabelRow` (replace with new separator)
- All 5 `LinearGradient` components (topStatusFade, headerGradient, contentTopFade, listEdgeGradient, messageFade)
- `buildChatItems` cascade logic (splitDisplayParagraphs, hasMultipleDisplayParagraphs, getCascadeTimestamp)
- Time-aware UI color shifting (getTimeAwareUi)
- Custom scroll indicator
- Settings hint tooltip
- Session summary bar
- Reply pan responder (keep reply functionality but simplify)

#### What to KEEP
- FlatList inverted pattern
- `streamCoachChat` XHR streaming
- Offline queue logic
- Haptic feedback (send, receive)
- Typing indicator (simplify visual)
- Pull-to-refresh
- Error boundary

### Data Tab — New File `app/(app)/data.tsx`

Create a new data view that shows training information. Use the existing `getCoachSidebar` API.

Layout:
```
┌──────────────────────────┐
│ Training Data            │  ← SF Pro Display, 22pt, #F2EDE4
│                          │
│ THIS WEEK                │  ← section header, 13pt, uppercase, #4A4843
│ Total: 42km              │
│ Runs: 4                  │
│ Avg Pace: 5:15/km        │
│                          │
│ TODAY'S PLAN              │
│ Recovery day              │
│ Easy 8km if legs feel good│
│                          │
│ GOAL                      │
│ Boston Marathon           │
│ 29 days away              │
│                          │
│ RECENT RUNS               │
│ Mar 27 — 15km — 5:02/km  │
│ Mar 25 — 8km — 5:18/km   │
│ Mar 23 — 12km — 5:10/km  │
└──────────────────────────┘
```

- Same warm near-black background
- Same typography system (serif for data values, sans for labels)
- Pull-to-refresh triggers `syncGarmin` + refetch
- Empty state: "Connect Garmin in Settings to see your data"
- No charts in Phase 1 — just text-based data display
- ScrollView, not FlatList

### Settings — Redesign `app/(app)/settings.tsx`

Convert from bottom-sheet modal to a **pushed screen** with native iOS grouped table:

- Use `router.push('/(app)/settings')` from gear icon
- Layout: grouped sections with rows
- Section header: uppercase, letterspaced, `#4A4843`
- Row: `#1C1C19` background, `#F2EDE4` label, chevron for navigable rows
- Auto-save on change (debounce 500ms) with light haptic
- Remove the "Save Changes" button
- Keep all existing mutation logic

Sections:
1. PROFILE: Display Name (editable), Units (metric/imperial), Coach Language (en/zh-Hans)
2. GARMIN: Status, Sync Now, Disconnect
3. COACH: Instructions (tap → push to edit)
4. BILLING: Tier display
5. ACCOUNT: Email, Sign Out, Delete Account

### Login — Simplify `app/(auth)/login.tsx`

- Remove the card wrapper (no `.card` style with border)
- Logo + wordmark centered at top
- Inputs float on background
- "Sign in" button full-width, garnet
- Social buttons side by side
- Same color system as rest of app
- Remove the "hero" section with title/subtitle

### File Changes Summary

**Modified files:**
- `src/design/tokens.ts` — new color/typography system
- `app/(app)/_layout.tsx` — Stack → Tab navigator
- `app/(app)/index.tsx` — complete rewrite (journal style)
- `app/(app)/settings.tsx` — redesign as grouped table
- `app/(auth)/login.tsx` — simplify, remove card wrapper

**New files:**
- `app/(app)/data.tsx` — training data tab

**Unchanged files (do NOT touch):**
- `src/lib/api.ts`
- `src/lib/auth-storage.ts`
- `src/lib/offline-queue.ts`
- `src/lib/social-sharing.ts`
- `src/lib/onboarding-storage.ts`
- `src/providers/auth-provider.tsx`
- `src/components/branding/peipei-logo.tsx`
- `src/components/notifications/push-notification-bridge.tsx`
- `app/_layout.tsx` (root layout)
- `app/(auth)/_layout.tsx`
- `app/(auth)/register.tsx`
- `app/(app)/onboarding.tsx`

## VALIDATION
After making all changes, run:
```bash
npx expo start --ios
```
Fix any TypeScript or runtime errors. The app must:
1. Launch without crash
2. Show login screen with new design
3. Login successfully
4. Show two tabs (Coach + Data)
5. Coach tab shows messages in journal format (no bubbles)
6. Data tab shows training data
7. Settings accessible via gear icon
