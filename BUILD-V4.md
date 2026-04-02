# PeiPei iOS V4 — "The Signal" Build Task

Read V4-DESIGN.md for the full design spec. Implement the entire app from scratch.

## CRITICAL RULES
- Swift 6, iOS 17+, SwiftUI only
- Bundle ID: com.peipei.app, Team: MNB3V4MHFJ
- Use xcodegen (project.yml exists) to generate the Xcode project
- ALL API calls go to https://www.peipei-run.com
- ALL requests MUST include Origin and Referer headers: "https://www.peipei-run.com"
- Auth: X-Session-Token header + Cookie header with peipei.session_token=<token>
- Login endpoint: POST /api/auth/sign-in/email → returns { token, user }
- Chat endpoint: GET /api/coach/chat → returns { messages: [...], hasMore: bool }
- Sidebar endpoint: GET /api/coach/sidebar → returns training data
- Stream endpoint: POST /api/coach/chat → chunked text response
- Settings: GET /api/settings/panel, PATCH /api/settings
- Dark mode ONLY (.preferredColorScheme(.dark))
- Add ITSAppUsesNonExemptEncryption=NO to Info.plist

## APP ARCHITECTURE

```
PeiPeiApp.swift          — @main, auth state, dark mode
PeiPei/Core/
  APIClient.swift        — all network calls with Origin/Referer headers
  Models.swift           — Codable types matching actual API response
  KeychainHelper.swift   — session token storage
  MetricExtractor.swift  — extract pace/HR/distance from text
  MarkupCleaner.swift    — strip tool_call tags, markdown artifacts, block chars
PeiPei/Features/Signal/
  SignalView.swift        — Layer 0: the full-screen directive
PeiPei/Features/Conversation/
  ConversationView.swift  — Layer 1: coach conversation feed
  CoachEntry.swift        — single coach message with effort border
  RunnerNote.swift        — runner's right-aligned message
  ComposerView.swift      — input bar
PeiPei/Features/Data/
  RunDetailView.swift     — Layer 2: single run deep dive
  PlanView.swift          — Layer 2: training plan overview
PeiPei/Features/Auth/
  LoginView.swift         — email/password + Apple Sign-In
PeiPei/Features/Settings/
  SettingsView.swift      — Form with profile, garmin, coach, account
```

## LAYER 0 — THE SIGNAL (SignalView.swift)

The first screen. Full black (#000000). Centered text. No chrome.

```swift
struct SignalView: View {
    @Environment(AppModel.self) var app
    @State private var showConversation = false
    @State private var showReasoning = false
    @State var directive: DirectiveContent? // from API or derived from latest coach message
    
    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()
            
            VStack(spacing: 0) {
                Spacer()
                
                // The directive — 2 lines max
                VStack(spacing: 8) {
                    Text(directive?.instruction ?? "Preparing your plan...")
                        .font(.system(size: 28, weight: .light))
                        .foregroundStyle(.white)
                        .multilineTextAlignment(.center)
                    
                    if showReasoning, let reasoning = directive?.reasoning {
                        Text(reasoning)
                            .font(.system(.subheadline, design: .serif))
                            .foregroundStyle(Color(white: 0.6))
                            .multilineTextAlignment(.center)
                            .padding(.top, 8)
                            .transition(.opacity.combined(with: .move(edge: .bottom)))
                    }
                }
                .padding(.horizontal, 32)
                .onTapGesture {
                    withAnimation(.easeOut(duration: 0.25)) { showReasoning.toggle() }
                }
                
                Spacer()
                
                // Race countdown
                if let race = directive?.raceCountdown {
                    Text(race)
                        .font(.system(size: 11, weight: .regular, design: .monospaced))
                        .foregroundStyle(Color(white: 0.2))
                        .tracking(2)
                        .textCase(.uppercase)
                        .padding(.bottom, 64)
                }
            }
        }
        .gesture(
            DragGesture(minimumDistance: 50)
                .onEnded { value in
                    if value.translation.height < -50 {
                        showConversation = true
                    }
                }
        )
        .fullScreenCover(isPresented: $showConversation) {
            ConversationView()
        }
    }
}
```

### DirectiveContent Model
The directive is derived from the latest coach messages + sidebar data:
```swift
struct DirectiveContent {
    let instruction: String    // "Easy 8 today. Keep it under 140."
    let reasoning: String?     // "Your HR drifted 6.7% yesterday..."
    let raceCountdown: String? // "BOSTON · 22 DAYS"
}
```

For now, derive the directive from the LAST assistant message in the chat. Split on the first sentence or use the first 80 chars. The reasoning is the rest of that message. Race countdown comes from sidebar goalProgress.

## LAYER 1 — THE CONVERSATION (ConversationView.swift)

Presented as fullScreenCover from SignalView. Has a collapsed directive bar at top.

```swift
struct ConversationView: View {
    @Environment(AppModel.self) var app
    @Environment(\.dismiss) var dismiss
    @State var viewModel = ConversationViewModel()
    
    var body: some View {
        VStack(spacing: 0) {
            // Collapsed directive bar
            directiveBar
            
            // Messages
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 32) {
                    ForEach(viewModel.daySections) { section in
                        dayHeader(section.dateLabel)
                        ForEach(section.messages) { msg in
                            if msg.role == .assistant {
                                CoachEntry(message: msg)
                            } else {
                                RunnerNote(message: msg)
                            }
                        }
                    }
                }
                .padding(.horizontal, 16)
                .padding(.top, 12)
                .padding(.bottom, 80)
            }
            .refreshable { await viewModel.refresh(token: app.sessionToken ?? "") }
            
            ComposerView(...)
        }
        .background(Color.black)
    }
}
```

## COACH ENTRY (CoachEntry.swift)

NO cards. NO backgrounds. Text on black with a colored left border.

```swift
struct CoachEntry: View {
    let message: CoachMessage
    @State private var isExpanded = false
    
    // Extract workout type + metrics from message
    var workoutType: WorkoutType  // easy, tempo, long, interval, recovery
    var metricsLine: String       // "34 km · 4:47 · 160 bpm"
    var headline: String          // first sentence
    var body: String              // rest of text
    
    var body: some View {
        HStack(alignment: .top, spacing: 0) {
            // Effort color bar — 3pt wide
            Rectangle()
                .fill(workoutType.color)
                .frame(width: 3)
            
            VStack(alignment: .leading, spacing: 8) {
                // Workout type label
                Text(workoutType.label)
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundStyle(workoutType.color)
                    .tracking(0.5)
                    .textCase(.uppercase)
                
                // Metrics line — monospace, bright
                if !metricsLine.isEmpty {
                    Text(metricsLine)
                        .font(.system(size: 15, weight: .medium, design: .monospaced))
                        .foregroundStyle(.white)
                }
                
                // Coach narrative — serif
                Text(isExpanded ? headline + "\n\n" + body : headline)
                    .font(.system(.body, design: .serif))
                    .foregroundStyle(Color(white: 0.94))
                    .lineSpacing(5)
                
                if !body.isEmpty && !isExpanded {
                    Button("more") {
                        withAnimation { isExpanded = true }
                    }
                    .font(.system(size: 13))
                    .foregroundStyle(Color(white: 0.4))
                }
            }
            .padding(.leading, 12)
        }
    }
}
```

WorkoutType detection: scan the message for keywords (easy, tempo, long, interval, recovery, race, rest) and the metrics line for distance/pace/HR patterns.

## RUNNER NOTE (RunnerNote.swift)

Right-aligned, no background, lighter color:

```swift
struct RunnerNote: View {
    let message: CoachMessage
    var body: some View {
        HStack {
            Spacer(minLength: 80)
            Text(MarkupCleaner.clean(message.content))
                .font(.subheadline)
                .foregroundStyle(Color(white: 0.75))
                .multilineTextAlignment(.trailing)
        }
    }
}
```

## COMPOSER (ComposerView.swift)

Transparent, minimal:

```swift
struct ComposerView: View {
    @Binding var text: String
    let onSend: () -> Void
    
    var body: some View {
        HStack(spacing: 12) {
            TextField("Talk to your coach...", text: $text, axis: .vertical)
                .lineLimit(1...4)
                .foregroundStyle(.white)
                .font(.body)
            
            if !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                Button(action: onSend) {
                    Image(systemName: "arrow.up.circle.fill")
                        .font(.title2)
                        .foregroundStyle(Color(red: 0.545, green: 0.227, blue: 0.227)) // garnet
                }
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
        .background(
            Rectangle()
                .fill(Color.clear)
                .overlay(alignment: .top) {
                    Rectangle().fill(Color.white.opacity(0.06)).frame(height: 0.5)
                }
        )
    }
}
```

## MODELS

Match the ACTUAL API response format. CoachMessage:
```swift
struct CoachMessage: Codable, Identifiable, Hashable, Sendable {
    let id: String
    let role: Role
    var content: String
    let createdAt: Date
    // These may be missing in API response — use custom decoder
    let messageType: String?
    let attachments: [String]?
    
    enum Role: String, Codable, Sendable { case user, assistant }
}
```

SidebarData — match the real API (totalKm as Double, runCount as Int, avgPaceSeconds as Int, etc). See the previous implementation for the exact field mapping.

LoginResponse: { token: String, user: User, redirect: Bool? }

## API CLIENT

Every request MUST include:
```swift
request.setValue("https://www.peipei-run.com", forHTTPHeaderField: "Origin")
request.setValue("https://www.peipei-run.com", forHTTPHeaderField: "Referer")
if let token {
    request.setValue(token, forHTTPHeaderField: "X-Session-Token")
    request.setValue("peipei.session_token=\(token); __Secure-peipei.session_token=\(token)", forHTTPHeaderField: "Cookie")
}
```

## DEBUG MODE

Add DEBUGSessionToken support: if UserDefaults has a DEBUGSessionToken and Keychain has no token, use it to auto-login for simulator testing. ALWAYS overwrite keychain if DEBUGSessionToken exists.

## COLORS — NO ASSET CATALOG COLORS

Use inline SwiftUI colors only. No named colors. Everything is computed:

```swift
enum DesignTokens {
    static let background = Color.black
    static let textPrimary = Color(white: 0.94)       // #F0F0F0
    static let textSecondary = Color(white: 0.42)      // #6B6B6B
    static let textMuted = Color(white: 0.20)          // #333333
    static let garnet = Color(red: 0.545, green: 0.227, blue: 0.227)  // #8B3A3A
    static let separator = Color.white.opacity(0.06)
    
    // Effort colors
    static let effortEasy = Color(red: 0.176, green: 0.478, blue: 0.294)     // #2D7A4B
    static let effortLong = Color(red: 0.176, green: 0.373, blue: 0.545)     // #2D5F8B
    static let effortTempo = Color(red: 0.722, green: 0.361, blue: 0.165)    // #B85C2A
    static let effortInterval = Color(red: 0.420, green: 0.310, blue: 0.541) // #6B4F8A
    static let effortRace = Color(red: 0.545, green: 0.227, blue: 0.227)     // #8B3A3A
    static let effortRecovery = Color(white: 0.35)
}
```

## VALIDATION
1. xcodebuild must succeed
2. App launches to Layer 0 (The Signal) with directive text
3. Pull up reveals Layer 1 (Conversation) with coach entries showing effort borders
4. Messages load from API
5. Runner messages are right-aligned, lighter
6. No tab bar visible
7. True black background everywhere
8. Metrics in monospace, narrative in serif
