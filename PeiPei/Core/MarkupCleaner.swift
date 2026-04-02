import Foundation

enum MarkupCleaner {
    static func clean(_ value: String) -> String {
        value
            .replacingOccurrences(
                of: "<tool_calls>[\\s\\S]*?<\\/tool_calls>",
                with: "",
                options: .regularExpression
            )
            .replacingOccurrences(
                of: "<tool_call>[\\s\\S]*?<\\/tool_call>",
                with: "",
                options: .regularExpression
            )
            .replacingOccurrences(of: "</?tool_calls\\s*\\/?>", with: "", options: .regularExpression)
            .replacingOccurrences(of: "</?tool_call\\s*\\/?>", with: "", options: .regularExpression)
            .replacingOccurrences(of: "```[\\s\\S]*?```", with: "", options: .regularExpression)
            .replacingOccurrences(of: "`", with: "")
            .replacingOccurrences(of: "▍", with: "")
            .replacingOccurrences(of: "█", with: "")
            .replacingOccurrences(of: "\\n{3,}", with: "\n\n", options: .regularExpression)
            .trimmingCharacters(in: .whitespacesAndNewlines)
    }
}
