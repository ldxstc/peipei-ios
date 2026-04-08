# PeiPei iOS — Sprint 2: Similar Training, Streaming, Directive API, Ship Script

Implement all 4 features. Read existing code first — the V4 app is already built and working.

## Feature 1: Similar Training Comparison

Add to RunDetailView. When a runner taps into a run detail, show similar past workouts below.

### API
GET /api/training-log/similar?activityId=<id>
Headers: Origin, Referer, X-Session-Token, Cookie (same as all other endpoints)
Response: { activities: [{ id, activityDate, workoutType, workoutSubtype, distanceKm, pacePerKmSeconds, avgHr, cadence, strideLengthM, trainingPace, trainingHr, trainingCadence, trainingStride, trainingDistanceKm, phase, score, isCurrent }], trend, paceDeltaSeconds }

POST /api/coach/insights — Body: { refType: "activity", refId: activityId, insightType: "activity_comparison" } — Response: { insights: [{ id, content }] }

### UI — Timeline (NOT table)
New file: PeiPei/Features/Data/SimilarTrainingView.swift

Timeline with dots + connecting line. Current run = filled white circle, past = hollow. Each entry: date, pace delta (green if faster, red if slower), metrics line in monospace, phase badge. Trend bars at bottom (PACE/HR/CAD). AI insight text above timeline in serif.

Add SimilarActivity + SimilarTrainingsResult to Models.swift. Add fetch functions to APIClient.swift. Wire into RunDetailView via .task.

## Feature 2: Message Streaming

Verify/fix the streaming flow: ComposerView send button -> ConversationViewModel sendMessage -> APIClient.streamCoachReply -> URLSession.shared.bytes(for:) -> append chunks to streamingText -> show in conversation with pulsing border.

Request: POST /api/coach/chat, body: { messages: [...all messages...], contextType: "general" }. Response: raw text chunks (not SSE). Read via bytes.lines, append each to streaming content. All headers must be set (Origin, Referer, X-Session-Token, Cookie).

## Feature 3: Directive from Sidebar Data

Currently SignalView derives directive from last chat message. Change to: load sidebar data on app launch (GET /api/coach/sidebar), compute directive from todayPlan + goalProgress. Fallback to last message if no plan.

Add sidebarData property to AppModel. Load in .task of root view. Compute directive: if todayPlan exists, use its title as instruction. Race countdown from goalProgress.raceName + daysToRace.

## Feature 4: Ship Script

Replace the broken fastlane distribute step in scripts/ship.sh with scripts/distribute.py that uses ASC API (PyJWT + requests) to poll for build processing status. Internal test groups auto-get all builds so no group assignment needed — just wait for VALID state. Update ship.sh to call the python script after upload.

## VALIDATION
xcodebuild -scheme PeiPei -sdk iphonesimulator build must succeed. All new files compile. Existing features still work.
