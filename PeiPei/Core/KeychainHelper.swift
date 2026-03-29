import Foundation
import Security

enum KeychainKey {
    static let sessionToken = "sessionToken"
    static let userEmail = "userEmail"
    static let userName = "userName"
}

enum KeychainHelper {
    @discardableResult
    static func save(_ value: String, forKey key: String) -> Bool {
        let data = Data(value.utf8)
        let query = baseQuery(forKey: key)
        SecItemDelete(query as CFDictionary)

        var attributes = query
        attributes[kSecValueData as String] = data

        return SecItemAdd(attributes as CFDictionary, nil) == errSecSuccess
    }

    static func loadString(forKey key: String) -> String? {
        var query = baseQuery(forKey: key)
        query[kSecReturnData as String] = true
        query[kSecMatchLimit as String] = kSecMatchLimitOne

        var result: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &result)
        guard status == errSecSuccess,
              let data = result as? Data,
              let string = String(data: data, encoding: .utf8) else {
            return nil
        }
        return string
    }

    @discardableResult
    static func deleteValue(forKey key: String) -> Bool {
        SecItemDelete(baseQuery(forKey: key) as CFDictionary) == errSecSuccess
    }

    private static func baseQuery(forKey key: String) -> [String: Any] {
        [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: Bundle.main.bundleIdentifier ?? "com.peipei.app",
            kSecAttrAccount as String: key
        ]
    }
}
