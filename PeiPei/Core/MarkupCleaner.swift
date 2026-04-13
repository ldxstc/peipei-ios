import Foundation

enum MarkupCleaner {
    static func clean(_ value: String) -> String {
        var result = value

        // Strip XML tool call tags and their contents
        result = result.replacingOccurrences(
            of: "<tool_calls>[\\s\\S]*?<\\/tool_calls>",
            with: "", options: .regularExpression
        )
        result = result.replacingOccurrences(
            of: "<tool_call>[\\s\\S]*?<\\/tool_call>",
            with: "", options: .regularExpression
        )
        result = result.replacingOccurrences(
            of: "</?tool_calls?\\s*\\/?>",
            with: "", options: .regularExpression
        )

        // Strip Vercel AI SDK streaming protocol chunks
        // These look like: {"type":"tool-input-available","toolCallId":"toolu_...","toolName":"read_notebook","input":{},...}
        // They're concatenated JSON objects with "type":"tool-*" patterns
        result = result.replacingOccurrences(
            of: #"\{"type":"tool-[^}]*(?:\{[^}]*\}[^}]*)*\}"#,
            with: "", options: .regularExpression
        )

        // Strip streaming start/end markers
        result = result.replacingOccurrences(
            of: #"\{"type":"(?:start|finish|text-start|text-delta|step-start|step-finish)"[^}]*\}"#,
            with: "", options: .regularExpression
        )

        // Nuclear option: strip any JSON object that contains "type":"tool or "toolCallId" or "toolName"
        // This catches all tool protocol variants
        result = stripToolJSON(result)

        // Strip markdown
        result = result.replacingOccurrences(of: "```[\\s\\S]*?```", with: "", options: .regularExpression)
        result = result.replacingOccurrences(of: "`", with: "")
        result = result.replacingOccurrences(of: "▍", with: "")
        result = result.replacingOccurrences(of: "█", with: "")
        result = result.replacingOccurrences(of: "**", with: "")
        result = result.replacingOccurrences(of: "\\n{3,}", with: "\n\n", options: .regularExpression)

        return result.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    /// Strip JSON objects that contain tool protocol markers.
    /// Handles nested braces by counting { and }.
    private static func stripToolJSON(_ input: String) -> String {
        let toolMarkers = ["\"type\":\"tool-", "\"toolCallId\":", "\"toolName\":", "\"providerMetadata\":", "\"type\":\"start\"", "\"type\":\"finish\"", "\"type\":\"text-delta\"", "\"type\":\"step-"]
        var result = input

        // Find and remove JSON objects containing tool markers
        for marker in toolMarkers {
            while let markerRange = result.range(of: marker) {
                // Walk backwards from marker to find opening {
                var braceCount = 0
                var startIdx = markerRange.lowerBound
                var foundStart = false
                var idx = markerRange.lowerBound
                while idx > result.startIndex {
                    idx = result.index(before: idx)
                    let ch = result[idx]
                    if ch == "}" { braceCount += 1 }
                    if ch == "{" {
                        if braceCount == 0 {
                            startIdx = idx
                            foundStart = true
                            break
                        }
                        braceCount -= 1
                    }
                }

                guard foundStart else { break }

                // Walk forward from startIdx to find matching closing }
                braceCount = 0
                var endIdx = startIdx
                var foundEnd = false
                var fwdIdx = startIdx
                while fwdIdx < result.endIndex {
                    let ch = result[fwdIdx]
                    if ch == "{" { braceCount += 1 }
                    if ch == "}" {
                        braceCount -= 1
                        if braceCount == 0 {
                            endIdx = result.index(after: fwdIdx)
                            foundEnd = true
                            break
                        }
                    }
                    fwdIdx = result.index(after: fwdIdx)
                }

                guard foundEnd else { break }

                result.removeSubrange(startIdx..<endIdx)
            }
        }

        return result
    }
}
