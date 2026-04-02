# PeiPei iOS — Professional Redesign V2

Apply Apple HIG principles + iOS 26 Liquid Glass to make PeiPei look like a professional, modern iOS app — not a toy.

## CRITICAL: Read these skill files first
- `~/.openclaw/workspace/skills/apple-hig/SKILL.md` — Full Apple HIG reference
- `~/.openclaw/workspace/skills/swiftui-liquid-glass/SKILL.md` — Liquid Glass API
- `~/.openclaw/workspace/skills/swiftui-ui-patterns/SKILL.md` — SwiftUI patterns

## Problems to Fix
The current app looks like a toy because:
1. Custom colors/fonts that don't use Apple's system → feels homebrew
2. Oversized greeting that wastes space
3. Cards with wrong corner radius and padding
4. No glass materials — flat surfaces with no depth
5. Tab bar looks custom, not native iOS
6. Typography scale is random, not Apple's standard sizes
7. Spacing is inconsistent — no 8pt grid

## Design System Changes

### Colors: Use Apple System Semantic Colors
Stop using custom named colors. Use SwiftUI's built-in semantic system:

```swift
// PRIMARY TEXT: .primary (auto dark/light)
// SECONDARY TEXT: .secondary
// TERTIARY TEXT: Color(.tertiaryLabel)
// BACKGROUND: Color(.systemBackground)  // #000000 in dark OLED
// SECONDARY BG: Color(.secondarySystemBackground) // #1C1C1E dark
// GROUPED BG: Color(.systemGroupedBackground)
// CARD BG: Color(.secondarySystemGroupedBackground)
// SEPARATOR: Color(.separator)
// ACCENT: keep Garnet #8B3A3A as app tint
// METRIC ACCENT: keep Amber #B8956A for data values
```

### Typography: Use Apple's Dynamic Type
Stop using `.system(size: XX)`. Use semantic styles:

```swift
.font(.largeTitle)     // 34pt bold — page titles
.font(.title2)         // 22pt — section headers  
.font(.headline)       // 17pt semibold — card headlines
.font(.body)           // 17pt regular — coach text
.font(.subheadline)    // 15pt — runner messages
.font(.footnote)       // 13pt — metadata, dates
.font(.caption)        // 12pt — timestamps
.font(.caption2)       // 11pt — metric labels
```

For serif coach text, use: `.font(.system(.body, design: .serif))`

### Spacing: 8pt Grid
```swift
// Use these consistently:
.padding(4)   // xs
.padding(8)   // sm  
.padding(12)  // md
.padding(16)  // standard
.padding(20)  // lg
.padding(24)  // section gap
.padding(32)  // xl
```

## Files to Modify

### 1. PeiPeiApp.swift
- Keep `.preferredColorScheme(.dark)`
- Tab bar: use standard `Label` with SF Symbols, NOT text-only
  - Coach: `Label("Coach", systemImage: "bubble.left.fill")`
  - Data: `Label("Data", systemImage: "chart.xyaxis.line")`
- Remove custom `.tint(Color("Cream"))` — use `.tint(Color("Garnet"))` for accent only

### 2. CoachJournalView.swift  
- NavigationStack with `.navigationTitle("Coach")` and `.navigationBarTitleDisplayMode(.large)` — use Apple's large title
- Remove custom GreetingHeader — the large title IS the header
- Toolbar: gear icon using `.toolbar { ToolbarItem(placement: .topBarTrailing) { NavigationLink... } }`
- ScrollView content: use `Color(.systemBackground)` as background
- `.safeAreaInset(edge: .bottom)` for composer — this is correct, keep it
- `.refreshable` — keep

### 3. CoachEntry.swift — Coach Message Cards
Use iOS 26 Liquid Glass for cards:

```swift
VStack(alignment: .leading, spacing: 8) {
    // Metric chips
    // Headline  
    // Body
    // Timestamp
}
.padding(16)
.if(available: iOS 26) {
    .glassEffect(.regular, in: .rect(cornerRadius: 16))
} else: {
    .background(Color(.secondarySystemGroupedBackground), in: .rect(cornerRadius: 16))
}
```

- Headline: `.font(.headline)` with `.foregroundStyle(.primary)`
- Body: `.font(.system(.subheadline, design: .serif))` with `.foregroundStyle(.secondary)`
- Timestamp: `.font(.caption2)` with `.foregroundStyle(Color(.tertiaryLabel))`
- Truncation: keep the 80-char collapse with gradient fade

### 4. MetricChip.swift
Glass chips on iOS 26:

```swift
Text(metric.value)
    .font(.system(.caption, design: .monospaced).weight(.medium))
    .foregroundStyle(Color("Amber"))
    .padding(.horizontal, 8)
    .padding(.vertical, 4)
    .glassEffect(.regular, in: .capsule) // iOS 26
    // fallback: .background(Color(.tertiarySystemFill), in: .capsule)
```

### 5. RunnerNote.swift
Runner messages should be clearly differentiated:

```swift
HStack {
    Spacer(minLength: 60)
    Text(message.content)
        .font(.subheadline)
        .foregroundStyle(.primary)
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
        .background(Color("Garnet").opacity(0.25), in: .rect(cornerRadius: 18, style: .continuous))
}
```

### 6. ComposerView.swift
Use glass material for the composer:

```swift
HStack(spacing: 12) {
    // camera icon (when keyboard showing)
    TextField("Message", text: $text, axis: .vertical)
        .lineLimit(1...4)
    // send/mic button
}
.padding(.horizontal, 16)
.padding(.vertical, 10)
.background(.regularMaterial) // system material, not custom
```

### 7. DataView.swift
- Use `List { }` with `.listStyle(.insetGrouped)` for native iOS look
- Section headers use system styling (don't override)
- Cards should use system grouped background, not custom colors

### 8. SettingsView.swift
- Must be a standard `Form` — this should already be correct
- Use system colors throughout

### 9. GreetingHeader.swift
DELETE this file. The greeting is replaced by the navigation large title "Coach" which is the standard iOS pattern. If you want a subtitle, use `.toolbar { ToolbarItem(placement: .principal) { ... } }` but only in .inline mode.

Actually, keep a minimal greeting but make it part of the scroll content, not a fixed header:
```swift
VStack(alignment: .leading, spacing: 4) {
    Text(greetingLine)
        .font(.title2)
        .foregroundStyle(.primary)
    Text("Your coach is listening.")
        .font(.subheadline)
        .foregroundStyle(.secondary)
}
```

## iOS 26 Liquid Glass Adoption

Gate ALL glass effects with availability:

```swift
extension View {
    @ViewBuilder
    func cardGlass(cornerRadius: CGFloat = 16) -> some View {
        if #available(iOS 26, *) {
            self.glassEffect(.regular, in: .rect(cornerRadius: cornerRadius))
        } else {
            self.background(Color(.secondarySystemGroupedBackground), in: .rect(cornerRadius: cornerRadius))
        }
    }
}
```

## VALIDATION
After making changes:
1. `xcodebuild -scheme PeiPei -sdk iphonesimulator build` must succeed
2. The app must look professional — like Apple Health or Apple Fitness
3. No custom colors where system colors exist
4. Consistent 8pt spacing grid
5. Standard iOS tab bar with SF Symbol icons
6. Glass materials on cards and composer
