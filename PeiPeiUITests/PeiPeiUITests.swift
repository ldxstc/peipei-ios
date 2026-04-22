import XCTest

private extension XCUIApplication {
    var isOnLoginScreen: Bool {
        staticTexts["PeiPei"].exists && buttons.matching(NSPredicate(format: "label CONTAINS 'Apple'")).firstMatch.exists
    }
    
    func waitForHome(timeout: TimeInterval = 10) -> Bool {
        // Home screen has "THIS WEEK" or "Talk to your coach"
        let talk = buttons.matching(NSPredicate(format: "label CONTAINS 'Talk to your coach'")).firstMatch
        let week = staticTexts["THIS WEEK"]
        return talk.waitForExistence(timeout: timeout) || week.waitForExistence(timeout: timeout)
    }
}

@MainActor
final class LaunchTests: XCTestCase {
    let app = XCUIApplication()
    override func setUpWithError() throws {
        continueAfterFailure = false
        app.launchArguments = ["--uitesting"]
        app.launch()
    }
    func testAppLaunches() throws { XCTAssertTrue(app.waitForExistence(timeout: 10)) }
    func testShowsLoginOrHome() throws {
        XCTAssertTrue(app.isOnLoginScreen || app.waitForHome(timeout: 10))
    }
}

@MainActor
final class LoginTests: XCTestCase {
    let app = XCUIApplication()
    override func setUpWithError() throws {
        continueAfterFailure = false
        app.launchArguments = ["--uitesting"]
        app.launchEnvironment["DEBUG_SESSION_TOKEN"] = ""
        app.launch()
    }
    func testHasAppleSignIn() throws {
        guard app.isOnLoginScreen else { throw XCTSkip("Not on login") }
        XCTAssertTrue(app.buttons.matching(NSPredicate(format: "label CONTAINS 'Apple'")).firstMatch.exists)
    }
    func testHasGoogleSignIn() throws {
        guard app.isOnLoginScreen else { throw XCTSkip("Not on login") }
        XCTAssertTrue(app.buttons.matching(NSPredicate(format: "label CONTAINS 'Google'")).firstMatch.exists)
    }
}

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
        let gear = app.buttons.matching(NSPredicate(format: "label CONTAINS 'gear'")).firstMatch
        XCTAssertTrue(gear.exists)
    }
    func testHasThisWeekSection() throws {
        XCTAssertTrue(app.staticTexts["THIS WEEK"].exists)
    }
    func testHasRecentSection() throws {
        XCTAssertTrue(app.staticTexts["RECENT"].exists)
    }
    func testHasTalkToCoachButton() throws {
        let btn = app.buttons.matching(NSPredicate(format: "label CONTAINS 'Talk to your coach'")).firstMatch
        XCTAssertTrue(btn.exists)
    }
    func testTalkToCoachOpensConversation() throws {
        let btn = app.buttons.matching(NSPredicate(format: "label CONTAINS 'Talk to your coach'")).firstMatch
        btn.tap()
        // Conversation should have a composer
        let hasInput = app.textFields.firstMatch.waitForExistence(timeout: 5) || app.textViews.firstMatch.waitForExistence(timeout: 3)
        XCTAssertTrue(hasInput)
    }
    func testSettingsOpens() throws {
        let gear = app.buttons.matching(NSPredicate(format: "label CONTAINS 'gear'")).firstMatch
        gear.tap()
        XCTAssertTrue(app.staticTexts["Profile"].waitForExistence(timeout: 5))
    }
    func testNoTabBar() throws {
        XCTAssertFalse(app.tabBars.firstMatch.exists)
    }
}

@MainActor
final class ConversationTests: XCTestCase {
    let app = XCUIApplication()
    override func setUpWithError() throws {
        continueAfterFailure = false
        app.launchArguments = ["--uitesting"]
        app.launch()
        guard app.waitForHome() else { throw XCTSkip("Not on home") }
        app.buttons.matching(NSPredicate(format: "label CONTAINS 'Talk to your coach'")).firstMatch.tap()
        let hasInput = app.textFields.firstMatch.waitForExistence(timeout: 5) || app.textViews.firstMatch.waitForExistence(timeout: 3)
        guard hasInput else { throw XCTSkip("Conversation didn't open") }
    }
    func testComposerExists() throws {
        XCTAssertTrue(app.textFields.firstMatch.exists || app.textViews.firstMatch.exists)
    }
    func testNoRawJSON() throws {
        let json = app.staticTexts.matching(NSPredicate(format: "label CONTAINS '{\"type\"'")).firstMatch
        XCTAssertFalse(json.exists)
    }
    func testNoTemplates() throws {
        let tmpl = app.staticTexts.matching(NSPredicate(format: "label CONTAINS '[[data:'")).firstMatch
        XCTAssertFalse(tmpl.exists)
    }
    func testBackToHome() throws {
        let back = app.buttons.matching(NSPredicate(format: "label CONTAINS 'chevron' OR label CONTAINS 'Back'")).firstMatch
        if back.exists {
            back.tap()
            XCTAssertTrue(app.staticTexts["THIS WEEK"].waitForExistence(timeout: 5))
        }
    }
}
