import SwiftUI

struct MetricChip: View {
    let metric: MetricValue

    var body: some View {
        Text(metric.value)
            .font(.system(.caption2, design: .rounded).weight(.semibold))
            .foregroundStyle(.primary)
            .padding(.horizontal, 10)
            .padding(.vertical, 5)
            .background(Color(.tertiarySystemFill), in: .capsule)
    }
}
