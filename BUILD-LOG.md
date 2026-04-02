# PeiPei iOS — The Log ("The Stack") Build Task

Add The Log view to the existing V4 app. This is accessed by tapping "Log" in the collapsed directive bar in ConversationView.

## What to Build

A new file: `PeiPei/Features/Conversation/LogView.swift`

### Access Point
In ConversationView's directiveBar, add a "Log" toggle button between the directive text and the gear icon. Tapping it presents LogView as a sheet or replaces the conversation content.

Simplest approach: add a `@State var showLog = false` and a button in the directive bar. When tapped, show LogView as a `.fullScreenCover` or `.sheet`.

### LogView Structure

```swift
struct LogView: View {
    @Environment(AppModel.self) var app
    @Environment(\.dismiss) var dismiss
    @State var sidebarData: SidebarData?
    @State var loading = true
    
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                // Week sections
                // Body section
                // Race section
            }
            .padding(.horizontal, 16)
        }
        .background(Color.black)
        .task { await loadData() }
    }
}
```

### Week Section — "The Stack"

Each week is a section. Each run is TWO lines:
- Line 1: Day name (left) + Distance (right, large)
- Line 2: Workout type (left, effort-colored) + pace + HR + cadence (monospace, secondary)

Left border: 3pt, effort-colored, spanning both lines.

```
This Week                    93 km
═══════════════════▓░░░

▌ Saturday                  34 km
▌ long run      4:47  160  203

▌ Friday                   8.1 km
▌ easy          6:16  120  188

▌ Thursday                14.5 km
▌ recovery      6:22  125  191
```

### Visual Spec

```swift
// Week header
HStack {
    Text("This Week")
        .font(.system(size: 11, weight: .semibold, design: .monospaced))
        .foregroundStyle(Color(white: 0.42))
        .tracking(1.5)
        .textCase(.uppercase)
    Spacer()
    Text("\(weekKm) km")
        .font(.system(size: 15, weight: .medium, design: .monospaced))
        .foregroundStyle(.white)
}

// Progress bar
GeometryReader { geo in
    ZStack(alignment: .leading) {
        Rectangle().fill(Color.white.opacity(0.06)).frame(height: 3)
        Rectangle().fill(Color(red: 0.545, green: 0.227, blue: 0.227))
            .frame(width: geo.size.width * progress, height: 3)
    }
}
.frame(height: 3)
.clipShape(RoundedRectangle(cornerRadius: 1.5))

// Run entry — TWO lines with left border
HStack(alignment: .top, spacing: 0) {
    Rectangle()
        .fill(effortColor)
        .frame(width: 3)
    
    VStack(alignment: .leading, spacing: 4) {
        // Line 1: day + distance
        HStack {
            Text("Saturday")
                .font(.system(size: 15))
                .foregroundStyle(.white)
            Spacer()
            Text("34 km")
                .font(.system(size: 15, weight: .medium, design: .monospaced))
                .foregroundStyle(.white)
        }
        
        // Line 2: type + metrics
        HStack {
            Text("long run")
                .font(.system(size: 13))
                .foregroundStyle(effortColor)
            Spacer()
            Text("4:47  160  203")
                .font(.system(size: 13, design: .monospaced))
                .foregroundStyle(Color(white: 0.42))
        }
    }
    .padding(.leading, 12)
}
.padding(.vertical, 10)
```

### Body Section

```
── BODY ───────────────────────

RHR      50 bpm    ↓3    ▁▂▃▂▁
WEIGHT   79.4 kg          ▃▃▂▂▁
VDOT     46.1      Advanced
```

- Labels: 11pt mono uppercase tracked, #6B6B6B
- Values: 15pt mono white
- Delta: 13pt mono, green if improving (↓ for HR, ↓ for weight)
- Sparkline: Unicode block chars ▁▂▃▄▅▆▇█ in #6B6B6B

### Race Section

```
── 22 days to Boston ──────────
═══════════════▓░░░  Week 6/16
```

The countdown text is embedded IN the section separator line. The progress bar below. Monospace.

### Data Source

Use the existing `GET /api/coach/sidebar` endpoint which returns:
- `thisWeek.totalKm, runCount, avgPaceSeconds, weeklyVolumes`
- `recentRuns[]` with activityDate, workoutType, distanceKm, pacePerKmSeconds, avgHr
- `goalProgress` with raceName, daysToRace, currentWeek, totalWeeks
- `body` with latestWeightKg, restingHr, restingHrDelta, restingHrGlyph

### Effort Color Mapping

```swift
func effortColor(for type: String?) -> Color {
    switch type?.lowercased() {
    case "easy": return Color(red: 0.176, green: 0.478, blue: 0.294)     // green
    case "long_run", "long run": return Color(red: 0.176, green: 0.373, blue: 0.545)  // blue
    case "tempo", "threshold": return Color(red: 0.722, green: 0.361, blue: 0.165)    // orange
    case "interval", "speed": return Color(red: 0.420, green: 0.310, blue: 0.541)     // purple
    case "recovery": return Color(white: 0.35)                            // gray
    case "race": return Color(red: 0.545, green: 0.227, blue: 0.227)     // garnet
    default: return Color(white: 0.35)
    }
}
```

### Formatting Helpers

```swift
func formatPace(_ seconds: Int) -> String {
    "\(seconds / 60):\(String(format: "%02d", seconds % 60))"
}

func formatDistance(_ km: Double) -> String {
    km >= 10 ? String(format: "%.0f km", km) : String(format: "%.1f km", km)
}

func formatDay(_ dateStr: String) -> String {
    // "2026-03-28" → "Saturday"
    let formatter = DateFormatter()
    formatter.dateFormat = "yyyy-MM-dd"
    guard let date = formatter.date(from: dateStr) else { return dateStr }
    formatter.dateFormat = "EEEE"
    return formatter.string(from: date)
}
```

### Integration with ConversationView

Add to directiveBar in ConversationView:

```swift
Button("Log") {
    showLog = true
}
.font(.system(size: 13, weight: .medium))
.foregroundStyle(Color(white: 0.42))
```

And present:
```swift
.fullScreenCover(isPresented: $showLog) {
    LogView()
        .environment(app)
}
```

Add a close button at the top of LogView (or swipe down to dismiss).

### Tap Interaction

Each run row should be tappable → pushes to RunDetailView (existing Layer 2).

### VALIDATION
1. Build succeeds
2. "Log" button appears in directive bar
3. Tapping Log shows the training log with real data
4. Runs grouped by week with effort-colored borders
5. Body section shows RHR, weight, VDOT
6. Race countdown shows
7. Tapping a run opens detail view
