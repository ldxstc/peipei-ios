import Foundation

enum MarkupCleaner {
    static func clean(_ text: String) -> String {
        var output = text

        // Strip tool call XML
        let xmlPatterns = [
            "<tool_call>[\\s\\S]*?</tool_call>",
            "<tool_calls>[\\s\\S]*?</tool_calls>",
            "</?tool_calls?\\s*/?>",
        ]
        for pattern in xmlPatterns {
            output = output.replacingOccurrences(of: pattern, with: "", options: .regularExpression)
        }

        // Strip data references
        output = output.replacingOccurrences(of: "\\[\\[data:.*?\\]\\]", with: "", options: .regularExpression)

        // Strip markdown headers
        output = output.split(separator: "\n", omittingEmptySubsequences: false)
            .map { line in
                line.replacingOccurrences(of: "^\\s{0,3}#{1,6}\\s*", with: "", options: .regularExpression)
            }
            .joined(separator: "\n")

        // Strip block characters (sparklines)
        output = output.replacingOccurrences(of: "[▬▮▐█▌▍▎▏▓▒░▇▆▅▄▃▂▁]+", with: "", options: .regularExpression)

        // Strip markdown bold **text** → text
        output = output.replacingOccurrences(of: "\\*\\*(.+?)\\*\\*", with: "$1", options: .regularExpression)
        
        // Strip markdown italic *text* → text
        output = output.replacingOccurrences(of: "\\*(.+?)\\*", with: "$1", options: .regularExpression)

        // Strip inline code `text` → text
        output = output.replacingOccurrences(of: "`([^`]+)`", with: "$1", options: .regularExpression)

        // Collapse excessive newlines
        output = output.replacingOccurrences(of: "\n{3,}", with: "\n\n", options: .regularExpression)

        return output.trimmingCharacters(in: .whitespacesAndNewlines)
    }
}
