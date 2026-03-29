import SwiftUI

struct MetricChip: View {
    let metric: MetricValue

    var body: some View {
        // Combine number+unit with thin space
        let display = metric.unit.isEmpty
            ? metric.number
            : metric.number + "\u{2009}" + metric.unit  // thin space
        
        Text(display)
            .font(.system(size: 12, weight: .medium, design: .monospaced))
            .foregroundStyle(Color("Amber"))
            .padding(.horizontal, 8)
            .padding(.vertical, 4)
            .background(Color("Amber").opacity(0.10), in: .capsule)
    }
}
