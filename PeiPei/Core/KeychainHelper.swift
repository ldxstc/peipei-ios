import Foundation
import Security

enum KeychainHelper {
    private static let service = "com.peipei.app"
    private static let tokenAccount = "session-token"
    private static let appleUserAccount = "apple-user-id"

    static func saveSessionToken(_ token: String) throws {
        try save(value: token, account: tokenAccount)
    }

    static func readSessionToken() -> String? {
        read(account: tokenAccount)
    }

    static func deleteSessionToken() {
        delete(account: tokenAccount)
    }

    static func saveAppleUserID(_ userID: String) throws {
        try save(value: userID, account: appleUserAccount)
    }

    static func readAppleUserID() -> String? {
        read(account: appleUserAccount)
    }

    private static func save(value: String, account: String) throws {
        let data = Data(value.utf8)
        delete(account: account)

        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
            kSecValueData as String: data
        ]

        let status = SecItemAdd(query as CFDictionary, nil)
        guard status == errSecSuccess else {
            throw KeychainError.unhandled(status)
        }
    }

    private static func read(account: String) -> String? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne
        ]

        var result: AnyObject?
        let status = SecItemCopyMatching(query as CFDictionary, &result)

        guard status == errSecSuccess,
              let data = result as? Data,
              let value = String(data: data, encoding: .utf8) else {
            return nil
        }

        return value
    }

    private static func delete(account: String) {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account
        ]

        SecItemDelete(query as CFDictionary)
    }
}

enum KeychainError: Error {
    case unhandled(OSStatus)
}
