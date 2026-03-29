import Foundation

enum MetricExtractor {
    static func extract(from text: String) -> [MetricValue] {
        let patterns: [(String, String)] = [
            ("PACE", "(\\d{1,2}:\\d{2})\\s*/\\s*(km|mi)"),
            ("DIST", "(\\d+(?:\\.\\d+)?)\\s*(km|公里|K)"),
            ("HR", "(\\d{2,3})\\s*(bpm|次/分)")
        ]

        var results: [MetricValue] = []

        for (label, pattern) in patterns {
            guard let regex = try? NSRegularExpression(pattern: pattern, options: [.caseInsensitive]) else {
                continue
            }
            let range = NSRange(text.startIndex..., in: text)
            let matches = regex.matches(in: text, options: [], range: range)
            for match in matches {
                guard match.numberOfRanges > 2,
                      let firstRange = Range(match.range(at: 1), in: text),
                      let secondRange = Range(match.range(at: 2), in: text) else {
                    continue
                }
                let number = String(text[firstRange])
                let unit = String(text[secondRange])
                results.append(MetricValue(label: label, number: number, unit: unit))
                if results.count == 4 {
                    return results
                }
            }
        }

        return results
    }
}
