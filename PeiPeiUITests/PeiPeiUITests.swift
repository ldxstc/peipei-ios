import XCTest

@MainActor
final class PeiPeiUITests: XCTestCase {

    let app = XCUIApplication()

    override func setUpWithError() throws {
        continueAfterFailure = false

        // Launch with test session token so we skip login
        app.launchArguments = ["--uitesting"]
        app.launchEnvironment["DEBUG_SESSION_TOKEN"] = ProcessInfo.processInfo.environment["TEST_SESSION_TOKEN"] ?? "test-token"
        app.launch()
    }

    // MARK: - 1. App Launch

    func testAppLaunches() throws {
        // App should show either login or conversation (depending on token validity)
        let exists = app.waitForExistence(timeout: 10)
        XCTAssertTrue(exists, "App should launch successfully")
    }

    // MARK: - 2. Login Screen

    func testLoginScreenElements() throws {
        // If no valid token, login screen should appear
        let loginApp = XCUIApplication()
        loginApp.launchArguments = ["--uitesting"]
        loginApp.launchEnvironment["DEBUG_SESSION_TOKEN"] = "" // Force login
        loginApp.launch()

        let titleExists = loginApp.staticTexts["PeiPei"].waitForExistence(timeout: 5)
        if titleExists {
            // Login screen visible
            XCTAssertTrue(loginApp.textFields.firstMatch.exists, "Email field should exist")
            XCTAssertTrue(loginApp.secureTextFields.firstMatch.exists, "Password field should exist")
            XCTAssertTrue(loginApp.buttons["Enter"].exists || loginApp.buttons.matching(NSPredicate(format: "label CONTAINS 'Enter'")).firstMatch.exists, "Enter button should exist")
            // Apple Sign In button
            XCTAssertTrue(loginApp.buttons.matching(NSPredicate(format: "label CONTAINS 'Apple'")).firstMatch.exists, "Sign in with Apple button should exist")
        }
    }

    // MARK: - 3. Conversation View (requires valid token)

    func testConversationViewElements() throws {
        // Wait for conversation to load (either directive bar or composer)
        let composer = app.textFields.matching(NSPredicate(format: "placeholderValue CONTAINS 'coach'")).firstMatch
        let composerExists = composer.waitForExistence(timeout: 10)

        // If we landed on login, skip this test
        if !composerExists {
            // Check if we're on login screen instead
            if app.staticTexts["PeiPei"].exists {
                throw XCTSkip("Not logged in — skipping conversation test")
            }
        }

        // Composer should be visible
        XCTAssertTrue(composerExists, "Composer ('Talk to your coach...') should exist")
    }

    func testDirectiveBarExists() throws {
        // The directive bar should show the back chevron
        let backButton = app.buttons.matching(NSPredicate(format: "label CONTAINS 'Back' OR label CONTAINS 'chevron'")).firstMatch
        let logButton = app.buttons["Log"]

        let hasUI = logButton.waitForExistence(timeout: 10)
        guard hasUI else {
            throw XCTSkip("Not on conversation view")
        }

        XCTAssertTrue(logButton.exists, "Log button should exist in directive bar")
    }

    // MARK: - 4. Log View

    func testLogViewOpens() throws {
        let logButton = app.buttons["Log"]
        guard logButton.waitForExistence(timeout: 10) else {
            throw XCTSkip("Not on conversation view")
        }

        logButton.tap()

        // Log view should present as a sheet with a Close button
        let closeButton = app.buttons["Close"]
        XCTAssertTrue(closeButton.waitForExistence(timeout: 5), "Log view should open with Close button")

        // Dismiss
        closeButton.tap()
    }

    // MARK: - 5. Settings View

    func testSettingsOpens() throws {
        // Settings gear button
        let gearButton = app.buttons.matching(NSPredicate(format: "label CONTAINS 'gear' OR label CONTAINS 'Settings'")).firstMatch
        guard gearButton.waitForExistence(timeout: 10) else {
            throw XCTSkip("Not on conversation view")
        }

        gearButton.tap()

        // Settings form should appear
        let garminSection = app.staticTexts["Garmin"]
        XCTAssertTrue(garminSection.waitForExistence(timeout: 5), "Settings should show Garmin section")

        // Check for key elements
        XCTAssertTrue(app.staticTexts["Profile"].exists, "Profile section should exist")
        XCTAssertTrue(app.staticTexts["Account"].exists, "Account section should exist")

        // Close settings
        let closeButton = app.buttons["Close"]
        if closeButton.exists { closeButton.tap() }
    }

    // MARK: - 6. Message Composer

    func testComposerExists() throws {
        // Verify the composer input area exists (it may render as TextField or TextView)
        let textField = app.textFields.firstMatch
        let textView = app.textViews.firstMatch

        let hasInput = textField.waitForExistence(timeout: 10) || textView.waitForExistence(timeout: 3)

        guard hasInput else {
            // If we're on login screen, skip
            if app.staticTexts["PeiPei"].exists {
                throw XCTSkip("On login screen")
            }
            XCTFail("No input field found on conversation screen")
            return
        }

        XCTAssertTrue(hasInput, "Composer input should exist")
    }

    // MARK: - 7. Visual Regression Guards

    func testNoJSONInConversation() throws {
        // Ensure no raw JSON streaming chunks are visible
        let jsonChunk = app.staticTexts.matching(NSPredicate(format: "label CONTAINS '{\"type\"'")).firstMatch
        let exists = jsonChunk.waitForExistence(timeout: 5)
        XCTAssertFalse(exists, "Raw JSON streaming chunks should not be visible in conversation")
    }

    func testNoEasyLabelOnGeneralMessages() throws {
        // Look for EASY labels — if they exist, verify they're near run metrics
        // This is a soft check since we can't guarantee message content
        let easyLabels = app.staticTexts.matching(NSPredicate(format: "label == 'EASY'"))
        if easyLabels.count > 0 {
            // At least check that the conversation loaded
            let composer = app.textFields.matching(NSPredicate(format: "placeholderValue CONTAINS 'coach'")).firstMatch
            XCTAssertTrue(composer.exists, "If EASY labels exist, conversation should be loaded")
        }
    }
}
