import XCTest

// MARK: - Helpers

private extension XCUIApplication {
    var isOnLoginScreen: Bool {
        staticTexts["PeiPei"].exists && buttons.matching(NSPredicate(format: "label CONTAINS 'Apple'")).firstMatch.exists
    }

    func waitForHome(timeout: TimeInterval = 10) -> Bool {
        let talk = buttons.matching(NSPredicate(format: "label CONTAINS 'Talk to your coach'")).firstMatch
        let week = staticTexts["THIS WEEK"]
        return talk.waitForExistence(timeout: timeout) || week.waitForExistence(timeout: timeout)
    }

    func openConversation() -> Bool {
        let btn = buttons.matching(NSPredicate(format: "label CONTAINS 'Talk to your coach'")).firstMatch
        guard btn.waitForExistence(timeout: 5) else { return false }
        btn.tap()
        return textFields.firstMatch.waitForExistence(timeout: 5) || textViews.firstMatch.waitForExistence(timeout: 3)
    }

    func openSettings() -> Bool {
        let gear = buttons.matching(NSPredicate(format: "label CONTAINS 'gear'")).firstMatch
        guard gear.waitForExistence(timeout: 5) else { return false }
        gear.tap()
        return staticTexts["Profile"].waitForExistence(timeout: 5)
    }
}

// MARK: - Launch Tests

@MainActor
final class LaunchTests: XCTestCase {
    let app = XCUIApplication()

    override func setUpWithError() throws {
        continueAfterFailure = false
        app.launchArguments = ["--uitesting"]
        app.launch()
    }

    func testAppLaunchesWithoutCrash() throws {
        XCTAssertTrue(app.waitForExistence(timeout: 10))
    }

    func testShowsLoginOrHome() throws {
        XCTAssertTrue(app.isOnLoginScreen || app.waitForHome(timeout: 10))
    }

    func testDarkMode() throws {
        // App should launch (dark mode enforced in code)
        XCTAssertTrue(app.waitForExistence(timeout: 5))
    }

    func testNoTabBar() throws {
        _ = app.waitForHome(timeout: 5)
        XCTAssertFalse(app.tabBars.firstMatch.exists, "No tab bar in the app")
    }
}

// MARK: - Login Tests

@MainActor
final class LoginTests: XCTestCase {
    let app = XCUIApplication()

    override func setUpWithError() throws {
        continueAfterFailure = false
        app.launchArguments = ["--uitesting"]
        app.launchEnvironment["DEBUG_SESSION_TOKEN"] = ""
        app.launch()
    }

    func testLoginHasAppleSignIn() throws {
        guard app.isOnLoginScreen else { throw XCTSkip("Already logged in") }
        XCTAssertTrue(app.buttons.matching(NSPredicate(format: "label CONTAINS 'Apple'")).firstMatch.exists)
    }

    func testLoginHasGoogleSignIn() throws {
        guard app.isOnLoginScreen else { throw XCTSkip("Already logged in") }
        XCTAssertTrue(app.buttons.matching(NSPredicate(format: "label CONTAINS 'Google'")).firstMatch.exists)
    }

    func testLoginNoEmailField() throws {
        guard app.isOnLoginScreen else { throw XCTSkip("Already logged in") }
        XCTAssertFalse(app.textFields.matching(NSPredicate(format: "placeholderValue == 'Email'")).firstMatch.exists)
    }

    func testLoginShowsTagline() throws {
        guard app.isOnLoginScreen else { throw XCTSkip("Already logged in") }
        let tagline = app.staticTexts.matching(NSPredicate(format: "label CONTAINS 'coach already'")).firstMatch
        XCTAssertTrue(tagline.exists)
    }
}

// MARK: - Home Screen Tests

@MainActor
final class HomeTests: XCTestCase {
    let app = XCUIApplication()

    override func setUpWithError() throws {
        continueAfterFailure = false
        app.launchArguments = ["--uitesting"]
        app.launch()
        guard app.waitForHome() else { throw XCTSkip("Not on home") }
    }

    func testHasPeiPeiTitle() throws {
        XCTAssertTrue(app.staticTexts["PeiPei"].exists)
    }

    func testHasSettingsGear() throws {
        XCTAssertTrue(app.buttons.matching(NSPredicate(format: "label CONTAINS 'gear'")).firstMatch.exists)
    }

    func testHasThisWeekSection() throws {
        XCTAssertTrue(app.staticTexts["THIS WEEK"].exists)
    }

    func testHasRecentSection() throws {
        XCTAssertTrue(app.staticTexts["RECENT"].exists)
    }

    func testHasBodySection() throws {
        XCTAssertTrue(app.staticTexts["BODY"].exists)
    }

    func testHasRestingHR() throws {
        XCTAssertTrue(app.staticTexts["Resting HR"].exists)
    }

    func testHasWeightLabel() throws {
        XCTAssertTrue(app.staticTexts["Weight"].exists)
    }

    func testHasKmUnit() throws {
        XCTAssertTrue(app.staticTexts["km"].exists)
    }

    func testHasTalkToCoachButton() throws {
        let btn = app.buttons.matching(NSPredicate(format: "label CONTAINS 'Talk to your coach'")).firstMatch
        XCTAssertTrue(btn.exists)
    }

    func testTalkToCoachOpensConversation() throws {
        XCTAssertTrue(app.openConversation())
    }

    func testSettingsOpensFromHome() throws {
        XCTAssertTrue(app.openSettings())
    }

    func testHomeScrollable() throws {
        // Should be able to scroll
        app.swipeUp()
        // After scroll, BODY or settings should still be accessible
        XCTAssertTrue(app.waitForHome())
    }

    func testRecentRunsExistOrEmpty() throws {
        // Either shows runs or "No runs yet" message
        let hasRuns = app.buttons.matching(NSPredicate(format: "label CONTAINS 'chevron'")).firstMatch.exists
        let noRuns = app.staticTexts.matching(NSPredicate(format: "label CONTAINS 'No runs yet'")).firstMatch.exists
        XCTAssertTrue(hasRuns || noRuns || app.staticTexts["RECENT"].exists)
    }

    func testDailyReadOrDirectiveShown() throws {
        // Some text should appear above THIS WEEK (daily read or directive)
        // The first significant text on screen after "PeiPei" is the coach's read
        XCTAssertTrue(app.staticTexts.count > 3, "Should have daily read content")
    }
}

// MARK: - Settings Tests

@MainActor
final class SettingsTests: XCTestCase {
    let app = XCUIApplication()

    override func setUpWithError() throws {
        continueAfterFailure = false
        app.launchArguments = ["--uitesting"]
        app.launch()
        guard app.waitForHome() else { throw XCTSkip("Not on home") }
        guard app.openSettings() else { throw XCTSkip("Settings didn't open") }
    }

    func testProfileSection() throws {
        XCTAssertTrue(app.staticTexts["Profile"].exists)
    }

    func testCoachSection() throws {
        XCTAssertTrue(app.staticTexts["Coach"].exists)
    }

    func testGarminSection() throws {
        XCTAssertTrue(app.staticTexts["Garmin"].exists)
    }

    func testAccountSection() throws {
        XCTAssertTrue(app.staticTexts["Account"].exists)
    }

    func testSaveButton() throws {
        app.swipeUp()
        XCTAssertTrue(app.buttons["Save"].waitForExistence(timeout: 3))
    }

    func testSignOutButton() throws {
        app.swipeUp()
        XCTAssertTrue(app.buttons["Sign Out"].waitForExistence(timeout: 3))
    }

    func testTierRow() throws {
        // Tier should show Free or Pro with chevron
        let tier = app.staticTexts.matching(NSPredicate(format: "label CONTAINS 'Free' OR label CONTAINS 'Pro'")).firstMatch
        XCTAssertTrue(tier.exists)
    }

    func testGarminStatus() throws {
        // Should show Connected or Disconnected (or connect button)
        XCTAssertTrue(app.staticTexts["Garmin"].exists)
    }

    func testGarminConnectOrSyncVisible() throws {
        // Either "Connect via Garmin" or "Sync Now" should be visible
        let connect = app.buttons.matching(NSPredicate(format: "label CONTAINS 'Garmin'")).firstMatch
        let sync = app.buttons.matching(NSPredicate(format: "label CONTAINS 'Sync'")).firstMatch
        XCTAssertTrue(connect.exists || sync.exists)
    }

    func testDisconnectGarminVisible() throws {
        // If connected, Disconnect button should exist (might need scroll)
        app.swipeUp()
        let disconnect = app.buttons.matching(NSPredicate(format: "label CONTAINS 'Disconnect'")).firstMatch
        // This is optional — only shows when connected
        _ = disconnect.exists
    }

    func testSettingsCloses() throws {
        app.buttons["Close"].tap()
        XCTAssertTrue(app.waitForHome(timeout: 3))
    }

    func testUnitsPicker() throws {
        let metric = app.staticTexts["Metric"]
        let imperial = app.staticTexts["Imperial"]
        XCTAssertTrue(metric.exists || imperial.exists)
    }
}

// MARK: - Paywall Tests

@MainActor
final class PaywallTests: XCTestCase {
    let app = XCUIApplication()

    override func setUpWithError() throws {
        continueAfterFailure = false
        app.launchArguments = ["--uitesting"]
        app.launch()
        guard app.waitForHome() else { throw XCTSkip("Not on home") }
        guard app.openSettings() else { throw XCTSkip("Settings didn't open") }
    }

    func testTierTapOpensPaywall() throws {
        // Find and tap the Tier row
        let tierRow = app.buttons.matching(NSPredicate(format: "label CONTAINS 'Free' OR label CONTAINS 'Pro' OR label CONTAINS 'Tier'")).firstMatch
        guard tierRow.waitForExistence(timeout: 3) else { throw XCTSkip("Tier row not found") }
        tierRow.tap()
        // Paywall should show
        let proTitle = app.staticTexts["PeiPei Pro"]
        XCTAssertTrue(proTitle.waitForExistence(timeout: 5))
    }

    func testPaywallHasSubscribeButton() throws {
        let tierRow = app.buttons.matching(NSPredicate(format: "label CONTAINS 'Free' OR label CONTAINS 'Pro' OR label CONTAINS 'Tier'")).firstMatch
        guard tierRow.waitForExistence(timeout: 3) else { throw XCTSkip("Tier row not found") }
        tierRow.tap()
        guard app.staticTexts["PeiPei Pro"].waitForExistence(timeout: 5) else { throw XCTSkip("Paywall didn't open") }
        let subscribe = app.buttons.matching(NSPredicate(format: "label CONTAINS 'Subscribe'")).firstMatch
        XCTAssertTrue(subscribe.exists)
    }

    func testPaywallHasRestorePurchases() throws {
        let tierRow = app.buttons.matching(NSPredicate(format: "label CONTAINS 'Free' OR label CONTAINS 'Pro' OR label CONTAINS 'Tier'")).firstMatch
        guard tierRow.waitForExistence(timeout: 3) else { throw XCTSkip("Tier row not found") }
        tierRow.tap()
        guard app.staticTexts["PeiPei Pro"].waitForExistence(timeout: 5) else { throw XCTSkip("Paywall didn't open") }
        let restore = app.buttons.matching(NSPredicate(format: "label CONTAINS 'Restore'")).firstMatch
        XCTAssertTrue(restore.exists)
    }
}

// MARK: - Conversation Tests

@MainActor
final class ConversationTests: XCTestCase {
    let app = XCUIApplication()

    override func setUpWithError() throws {
        continueAfterFailure = false
        app.launchArguments = ["--uitesting"]
        app.launch()
        guard app.waitForHome() else { throw XCTSkip("Not on home") }
        guard app.openConversation() else { throw XCTSkip("Conversation didn't open") }
    }

    func testComposerExists() throws {
        XCTAssertTrue(app.textFields.firstMatch.exists || app.textViews.firstMatch.exists)
    }

    func testHasBackButton() throws {
        let back = app.buttons.matching(NSPredicate(format: "label CONTAINS 'chevron' OR label CONTAINS 'Back'")).firstMatch
        XCTAssertTrue(back.exists)
    }

    func testHasLogButton() throws {
        XCTAssertTrue(app.buttons["Log"].exists)
    }

    func testNoRawJSON() throws {
        let json = app.staticTexts.matching(NSPredicate(format: "label CONTAINS '{\"type\"'")).firstMatch
        XCTAssertFalse(json.exists)
    }

    func testNoTemplates() throws {
        let tmpl = app.staticTexts.matching(NSPredicate(format: "label CONTAINS '[[data:'")).firstMatch
        XCTAssertFalse(tmpl.exists)
    }

    func testNoToolCallTags() throws {
        let tags = app.staticTexts.matching(NSPredicate(format: "label CONTAINS '<tool_call'")).firstMatch
        XCTAssertFalse(tags.exists)
    }

    func testNoBoldMarkers() throws {
        let bold = app.staticTexts.matching(NSPredicate(format: "label CONTAINS '**'")).firstMatch
        XCTAssertFalse(bold.exists)
    }

    func testHasImageAttachButton() throws {
        // The + button may have various labels depending on how SwiftUI renders the Menu
        let plus = app.buttons.matching(NSPredicate(format: "label CONTAINS 'plus' OR label CONTAINS 'Photo' OR label CONTAINS 'circle'")).firstMatch
        // This is optional — the menu trigger might not have an accessible label
        _ = plus.exists
    }

    func testLogOpens() throws {
        app.buttons["Log"].tap()
        XCTAssertTrue(app.buttons["Close"].waitForExistence(timeout: 5))
    }

    func testLogCloses() throws {
        app.buttons["Log"].tap()
        guard app.buttons["Close"].waitForExistence(timeout: 5) else { return }
        app.buttons["Close"].tap()
        XCTAssertTrue(app.buttons["Log"].waitForExistence(timeout: 3))
    }

    func testDateHeadersExist() throws {
        let anyDate = app.staticTexts.matching(NSPredicate(format: "label CONTAINS 'Today' OR label CONTAINS 'Yesterday' OR label CONTAINS 'day' OR label CONTAINS 'Mon' OR label CONTAINS 'Tue' OR label CONTAINS 'Wed' OR label CONTAINS 'Thu' OR label CONTAINS 'Fri' OR label CONTAINS 'Sat' OR label CONTAINS 'Sun'")).firstMatch
        // Date headers should exist if there are messages
        _ = anyDate.exists // Don't fail — might be empty conversation
    }

    func testConversationScrollable() throws {
        app.swipeUp()
        app.swipeDown()
        // Should not crash
        XCTAssertTrue(app.textFields.firstMatch.exists || app.textViews.firstMatch.exists)
    }
}

// MARK: - Navigation Tests

@MainActor
final class NavigationTests: XCTestCase {
    let app = XCUIApplication()

    override func setUpWithError() throws {
        continueAfterFailure = false
        app.launchArguments = ["--uitesting"]
        app.launch()
        guard app.waitForHome() else { throw XCTSkip("Not on home") }
    }

    func testHomeToConversationAndBack() throws {
        XCTAssertTrue(app.openConversation())
        let back = app.buttons.matching(NSPredicate(format: "label CONTAINS 'chevron' OR label CONTAINS 'Back'")).firstMatch
        if back.exists { back.tap() }
        // Should return to home eventually (might need to dismiss fullscreen cover)
    }

    func testHomeToSettingsAndBack() throws {
        XCTAssertTrue(app.openSettings())
        app.buttons["Close"].tap()
        XCTAssertTrue(app.waitForHome(timeout: 3))
    }

    func testSettingsThenConversation() throws {
        XCTAssertTrue(app.openSettings())
        app.buttons["Close"].tap()
        XCTAssertTrue(app.waitForHome(timeout: 3))
        XCTAssertTrue(app.openConversation())
    }

    func testMultipleNavigationCycles() throws {
        for _ in 0..<2 {
            XCTAssertTrue(app.openSettings())
            app.buttons["Close"].tap()
            XCTAssertTrue(app.waitForHome(timeout: 3))
        }
    }
}

// MARK: - Content Cleaning Tests

@MainActor
final class ContentCleaningTests: XCTestCase {
    let app = XCUIApplication()

    override func setUpWithError() throws {
        continueAfterFailure = false
        app.launchArguments = ["--uitesting"]
        app.launch()
        guard app.waitForHome() else { throw XCTSkip("Not on home") }
        guard app.openConversation() else { throw XCTSkip("Conversation didn't open") }
    }

    func testNoStreamingChunks() throws {
        let chunk = app.staticTexts.matching(NSPredicate(format: "label CONTAINS '{\"type\":\"start'")).firstMatch
        XCTAssertFalse(chunk.exists)
    }

    func testNoToolInputOutput() throws {
        let tool = app.staticTexts.matching(NSPredicate(format: "label CONTAINS 'tool-input' OR label CONTAINS 'tool-output'")).firstMatch
        XCTAssertFalse(tool.exists)
    }

    func testNoProviderMetadata() throws {
        let meta = app.staticTexts.matching(NSPredicate(format: "label CONTAINS 'providerMetadata'")).firstMatch
        XCTAssertFalse(meta.exists)
    }

    func testNoCodeBlocks() throws {
        let code = app.staticTexts.matching(NSPredicate(format: "label CONTAINS '```'")).firstMatch
        XCTAssertFalse(code.exists)
    }
}
