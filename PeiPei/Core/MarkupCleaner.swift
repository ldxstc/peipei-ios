import Foundation

enum MarkupCleaner {
    static func clean(_ value: String) -> String {
        var result = value
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

        // Strip streaming protocol JSON chunks: {"type":"start"}, {"type":"text-start","id":"0"}, etc.
        result = result.replacingOccurrences(
            of: #"\{"type"\s*:\s*"[^"]*"(?:\s*,\s*"[^"]*"\s*:\s*"[^"]*")*\}\s*\.?"#,
            with: "",
            options: .regularExpression
        )

        // Strip any remaining concatenated JSON objects that leaked into display text
        result = result.replacingOccurrences(
            of: #"(?:\{"[^"]+":"[^"]*"(?:,"[^"]+":"[^"]*")*\})+"#,
            with: "",
            options: .regularExpression
        )

        return result
            .replacingOccurrences(of: "```[\\s\\S]*?```", with: "", options: .regularExpression)
            .replacingOccurrences(of: "`", with: "")
            .replacingOccurrences(of: "▍", with: "")
            .replacingOccurrences(of: "█", with: "")
            .replacingOccurrences(of: "**", with: "")
            .replacingOccurrences(of: "\\n{3,}", with: "\n\n", options: .regularExpression)
            .trimmingCharacters(in: .whitespacesAndNewlines)
    }
}
