# PeiPei iOS — V4: The Directive

## Core Concept

PeiPei is not an app you browse. It's an app you glance at and put down.

The entire experience is organized around **one question the runner asks every morning:**

> "What should I do today?"

Everything in the app exists to answer that question — instantly, then deeply if the runner wants.

---

## Three Layers of Depth

### Layer 0 — The Directive

This is what the runner sees when they open the app. Nothing else. Full screen. Black.

```
┌──────────────────────────────────┐
│                                  │
│                                  │
│                                  │
│                                  │
│                                  │
│       Easy 8 today.              │
│       Keep it under 140.         │
│                                  │
│                                  │
│                                  │
│                                  │
│                                  │
│       BOSTON · 22 DAYS            │
│                                  │
│                                  │
│                                  │
│                                  │
│                                  │
│       ↑ pull for more            │
│                                  │
└──────────────────────────────────┘
```

**Design rules:**
- Black background. No chrome. No navigation bar. No tab bar visible.
- One typeface: SF Pro Display, 28pt, light weight. White.
- The directive is max 2 lines. The coach distills everything into the shortest possible instruction.
- Below the directive: the race countdown in 11pt uppercase tracked monospace. Barely visible. A quiet reminder of why.
- "↑ pull for more" — a ghost hint at the bottom that fades after first use.
- This screen is generated fresh every morning by the AI. It considers: yesterday's training, sleep quality (if Garmin provides), the plan, the race timeline, body signals.

**Interactions:**
- Pull up → reveals Layer 1 (the conversation)
- Tap the directive → expands into the reasoning ("Why easy today?")
- Tap the race countdown → shows plan overview

**What this replaces:** The greeting header, the tab bar, the settings gear, the metric chips — all gone from the first screen. The runner gets the answer in 0.5 seconds.

---

### Layer 1 — The Conversation

Pull up from the Directive, and the coach's conversation slides up. This is where the depth lives. The Directive stays pinned at the top as a collapsed bar.

```
┌──────────────────────────────────┐
│ Easy 8 · 140 cap         ⚙  22d│  collapsed directive bar
├──────────────────────────────────┤
│                                  │
│ Yesterday                        │
│                                  │
│ LONG RUN                         │
│ ▌ 34 km · 4:47 · 160 bpm       │  left color bar = effort
│                                  │
│ Your negative split shows your   │
│ aerobic base is building. The    │
│ 4:51→4:44 progression is what    │
│ we want 22 days out.             │
│                                  │
│ But your HR drifted 6.7% in the  │
│ final 10K. That's the signal     │
│ for easy tomorrow.               │
│                     ▼ more       │
│                                  │
│ ─────────────────────────────── │
│                                  │
│         felt amazing honestly    │
│                                  │
│ Friday                           │
│                                  │
│ EASY                             │
│ ▌ 8.1 km · 6:16 · 120 bpm      │
│                                  │
│ Smartest run of the week. HR     │
│ 120 at 6:16 vs 137 at 5:41 last │
│ Sunday — your economy is         │
│ improving.                       │
│                                  │
├──────────────────────────────────┤
│ Talk to your coach...        ↑  │
└──────────────────────────────────┘
```

**Design rules:**
- The collapsed directive bar at top: directive text + gear icon + days countdown. Tappable to return to Layer 0.
- Coach entries: NO cards. NO containers. Text directly on black background.
- Each entry has:
  - Date header: "Yesterday" / "Friday" — plain text, #808080, 13pt
  - Workout type label: "LONG RUN" — 11pt uppercase tracked, color-coded by effort type
  - Metrics line: colored left bar (4px wide) + key numbers in monospace 15pt
  - Coach narrative: serif 16pt, #EBEBEB, line-height 1.6
  - Collapse at ~100 chars with "▼ more" in muted gray
- Runner messages: right-aligned, no background, #808080 text (the runner's voice is quieter than the coach's)
- Day separators: thin hairline + date text
- Input bar: transparent background, top hairline border, send arrow in garnet

**What this replaces:** The entire CoachJournalView from V1-V3. No metric chips floating separately — the metrics are a single dense line with a left border. No card backgrounds. No floating pills.

---

### Layer 2 — The Data

Accessible from:
- Tapping the race countdown → Plan view
- Tapping a metrics line → Run detail
- Swipe from right edge → Data drawer
- Long-press any number → Trend for that metric

```
┌──────────────────────────────────┐
│ ← 34 km Long Run                │
│   Saturday, March 29             │
├──────────────────────────────────┤
│                                  │
│   34.0                           │
│   km                             │
│   ─────────────────────────      │
│                                  │
│   4:47/km        2:41:32         │
│   AVG PACE       DURATION        │
│                                  │
│   160 bpm        203 spm         │
│   AVG HR         CADENCE         │
│                                  │
│   ─────────────────────────      │
│                                  │
│   Splits                         │
│   1  4:58  156  ████████░░       │
│   2  4:55  158  █████████░       │
│   3  4:51  160  █████████░       │
│   4  4:44  162  ██████████       │
│   5  4:41  165  ██████████       │
│                                  │
│   Coach's Take                   │
│   "Negative split, cadence       │
│    improved from 198 to 203.     │
│    HR drift 6.7% — acceptable    │
│    for this volume."             │
│                                  │
└──────────────────────────────────┘
```

**Plan overview (from tapping race countdown):**

```
┌──────────────────────────────────┐
│ ← Boston Marathon                │
│   April 21, 2026 · 22 days      │
├──────────────────────────────────┤
│                                  │
│   ════════════════▓░░░  Week 6   │
│                                  │
│   This Week         Target       │
│   93 km             105 km       │
│   ═════════════▓░░  89%          │
│                                  │
│   Mon  Easy 8km      ✓  8.1     │
│   Tue  Rest           ✓         │
│   Wed  Tempo 15km    △  14.5    │
│   Thu  Easy 5km      ✓  4.3     │
│   Fri  Easy 8km      ●  today   │
│   Sat  Long 32km                 │
│   Sun  Rest                      │
│                                  │
│   Fitness                        │
│   VDOT 46.1 · Advanced          │
│                                  │
│   Body                           │
│   Resting HR  50 bpm  ↓3        │
│   Weight      79.4 kg            │
│                                  │
└──────────────────────────────────┘
```

---

## No Tab Bar

The app has no persistent tab bar. Navigation is through layers:

- **Open app → Layer 0** (Directive)
- **Pull up → Layer 1** (Conversation)
- **Tap any data → Layer 2** (Detail)
- **Gear icon → Settings** (push)

This is radical but correct. The coach IS the interface. There's no "Activity" tab because the coach already tells you about your activities. There's no "Plan" tab because the directive IS the plan for today — and the full plan is one tap away from the race countdown.

**Two-tab compromise (if needed for App Store review):**
If Apple requires a tab bar for navigability:
- **Coach** (Layer 0 + Layer 1)
- **Training** (Layer 2 data: plan, history, body)

But ideally: no tabs.

---

## Visual System

### Color

```
Black:           #000000    background (true OLED black)
White:           #F0F0F0    primary text (slightly off-white)
Gray:            #6B6B6B    secondary text (runner messages, labels)
Muted:           #333333    timestamps, hints, borders
Garnet:          #8B3A3A    send button, CTA (the only brand color)

Effort:
  Green bar:     #2D7A4B    easy / recovery
  Blue bar:      #2D5F8B    long run
  Orange bar:    #B85C2A    tempo / threshold
  Purple bar:    #6B4F8A    interval / speed
  Red bar:       #8B3A3A    race pace
```

### Typography

```
THE DIRECTIVE:
  SF Pro Display · 28pt · Light · White
  The biggest text in the app. The coach's order.

RACE COUNTDOWN:
  SF Mono · 11pt · Regular · #333333 · Uppercase · Tracked
  "BOSTON · 22 DAYS" — barely visible, always present.

WORKOUT TYPE:
  SF Pro Text · 11pt · Semibold · Uppercase · Tracked 0.5pt
  Color matches effort bar. "LONG RUN" "EASY" "TEMPO"

METRICS LINE:
  SF Mono · 15pt · Medium · White
  "34 km · 4:47 · 160 bpm" — the numbers that matter.

COACH NARRATIVE:
  New York (serif) · 16pt · Regular · #F0F0F0 · Line-height 1.6
  The coach's voice. Warm, authoritative, human.

RUNNER MESSAGE:
  SF Pro Text · 15pt · Regular · #6B6B6B
  Right-aligned. Quiet. The runner's voice is softer.

DATE HEADERS:
  SF Pro Text · 13pt · Regular · #6B6B6B
  "Yesterday" "Friday" — simple, human time references.

INPUT PLACEHOLDER:
  SF Pro Text · 16pt · Regular · #333333
  "Talk to your coach..."
```

### Spacing

```
Layer 0 — The Directive:
  Vertical center of screen.
  64pt from bottom for race countdown.
  No horizontal padding needed — text is short.
  Horizontal center alignment.

Layer 1 — The Conversation:
  16pt horizontal padding.
  32pt between coach entries.
  8pt between workout label and metrics line.
  16pt between metrics line and narrative.
  24pt above each date header.
  Hairline separator: rgba(255,255,255,0.06)

Layer 2 — Data:
  Standard iOS push navigation.
  16pt horizontal padding.
  24pt between metric groups.
```

### The Left Border

Each coach entry has a 3pt left border indicating effort type:
- Extends from the workout type label to the end of the narrative
- Inset 16pt from screen edge
- The ONLY color in the conversation (besides garnet send button)
- Creates a visual "training log" effect when scrolling — you see the pattern of your week in the border colors

---

## Animations

**Layer 0 → Layer 1:**
Pull-up gesture. The directive text shrinks and slides into the collapsed bar at the top. The conversation slides up from below. Spring animation, 0.35s.

**Directive tap → Reasoning:**
The directive text stays in place. Below it, the reasoning fades in with a 0.25s ease. "Easy today because your HR drifted 6.7% yesterday. Your plan calls for recovery before Saturday's 32km."

**Message send:**
Runner text slides in from right. Typing indicator appears as a pulsing left border. Coach response fades in paragraph by paragraph.

**Number tap → Trend:**
The tapped number scales up slightly (1.05x), then a small chart/sparkline slides in below it. Tap again to dismiss.

---

## What This Design Says

"I'm not a dashboard. I'm not a tracker. I'm not a feed.
I'm your coach. I already looked at everything.
Here's what you need to know."

---

## Why This Beats Everyone

**vs. Whoop:** Whoop says "Recovery: 67%." PeiPei says "Easy 8 today. Keep it under 140." Whoop makes you think. PeiPei already thought.

**vs. Strava:** Strava says "Here's your run." PeiPei says "Here's what your run means for Saturday."

**vs. TrainingPeaks:** TrainingPeaks says "Here's your plan." PeiPei says "I adjusted your plan because of how yesterday went."

**vs. Nike Run Club:** NRC says "Here's a guided run." PeiPei says "Here's YOUR run, designed for YOUR body, today."

The design is the moat made visible.
