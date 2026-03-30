import SwiftUI

struct RunDetailView: View {
    let run: RecentRun

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                // Hero section
                VStack(alignment: .leading, spacing: 8) {
                    Text(run.title)
                        .font(.system(.title2, design: .serif).weight(.semibold))
                        .foregroundStyle(Color("Cream"))

                    if let date = run.activityDate {
                        Text(formatFullDate(date))
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                    }
                }

                // Primary metrics
                HStack(spacing: 0) {
                    metricBlock(label: "Distance", value: run.subtitle, icon: "figure.run")
                    metricBlock(label: "Pace", value: run.detail, icon: "timer")
                    if let hr = run.avgHr {
                        metricBlock(label: "Avg HR", value: "\(hr) bpm", icon: "heart.fill")
                    }
                }

                // Metric detail cards
                VStack(spacing: 12) {
                    if let km = run.distanceKm {
                        detailRow(label: "Distance", value: String(format: "%.2f km", km))
                    }
                    if let pace = run.pacePerKmSeconds, pace > 0 {
                        let min = pace / 60
                        let sec = pace % 60
                        detailRow(label: "Average Pace", value: "\(min):\(String(format: "%02d", sec)) /km")
                    }
                    if let hr = run.avgHr {
                        detailRow(label: "Average Heart Rate", value: "\(hr) bpm")
                    }
                    if let type = run.workoutType {
                        detailRow(label: "Workout Type", value: type.replacingOccurrences(of: "_", with: " ").capitalized)
                    }

                    // Duration estimate
                    if let km = run.distanceKm, let pace = run.pacePerKmSeconds, pace > 0 {
                        let totalSeconds = Int(km * Double(pace))
                        let hours = totalSeconds / 3600
                        let mins = (totalSeconds % 3600) / 60
                        let secs = totalSeconds % 60
                        let duration = hours > 0
                            ? "\(hours)h \(mins)m"
                            : "\(mins)m \(secs)s"
                        detailRow(label: "Est. Duration", value: duration)
                    }
                }
                .padding(16)
                .background(Color("Surface"), in: .rect(cornerRadius: 16, style: .continuous))
            }
            .padding(.horizontal, 20)
            .padding(.top, 8)
            .padding(.bottom, 40)
        }
        .background(Color("Background"))
        .navigationTitle("Run Detail")
        .navigationBarTitleDisplayMode(.inline)
    }

    private func metricBlock(label: String, value: String, icon: String) -> some View {
        VStack(spacing: 6) {
            Image(systemName: icon)
                .font(.system(size: 16))
                .foregroundStyle(Color("Amber"))
            Text(value)
                .font(.system(size: 18, weight: .semibold, design: .monospaced))
                .foregroundStyle(Color("Cream"))
            Text(label.uppercased())
                .font(.system(size: 10, weight: .medium))
                .foregroundStyle(.tertiary)
                .tracking(0.8)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 16)
        .background(Color("Surface"), in: .rect(cornerRadius: 14, style: .continuous))
    }

    private func detailRow(label: String, value: String) -> some View {
        HStack {
            Text(label)
                .font(.subheadline)
                .foregroundStyle(.secondary)
            Spacer()
            Text(value)
                .font(.system(.subheadline, design: .monospaced).weight(.medium))
                .foregroundStyle(Color("Cream"))
        }
        .padding(.vertical, 4)
    }

    private func formatFullDate(_ dateStr: String) -> String {
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd"
        guard let date = formatter.date(from: dateStr) else { return dateStr }
        formatter.dateStyle = .long
        return formatter.string(from: date)
    }
}
