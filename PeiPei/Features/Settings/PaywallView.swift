import StoreKit
import SwiftUI

struct PaywallView: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(AppModel.self) private var app
    @State private var store = StoreManager.shared
    @State private var hasLoaded = false

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 32) {
                // Header
                VStack(alignment: .leading, spacing: 8) {
                    Text("PeiPei Pro")
                        .font(.system(size: 32, weight: .light))
                        .foregroundStyle(.white)

                    Text("Your coach, fully unlocked.")
                        .font(.system(.body, design: .serif))
                        .foregroundStyle(DesignTokens.textSecondary)
                }

                // Current status
                if store.isProSubscriber {
                    HStack(spacing: 8) {
                        Image(systemName: "checkmark.circle.fill")
                            .foregroundStyle(.green)
                        Text("You're on Pro")
                            .font(.system(size: 15, weight: .medium))
                            .foregroundStyle(.white)
                    }
                    .padding(16)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(Color.white.opacity(0.04))
                    .clipShape(RoundedRectangle(cornerRadius: 8))
                }

                // Benefits
                VStack(alignment: .leading, spacing: 16) {
                    benefitRow(icon: "brain.head.profile", title: "Advanced AI Coach", description: "Powered by Opus — deeper analysis, better judgment")
                    benefitRow(icon: "chart.line.uptrend.xyaxis", title: "Training Intelligence", description: "Similar workout comparison, trend analysis, phase detection")
                    benefitRow(icon: "bell.badge", title: "Proactive Coaching", description: "Coach reaches out when it matters — not just when you ask")
                    benefitRow(icon: "figure.run", title: "Race Strategy", description: "Personalized race plans with pacing, fueling, and taper guidance")
                    benefitRow(icon: "globe", title: "Multilingual Coach", description: "Full coaching in English, 中文, 한국어, and more")
                }

                // Price + Purchase
                if !store.isProSubscriber {
                    VStack(spacing: 16) {
                        if let product = store.products.first {
                            Button {
                                Task { await store.purchase() }
                            } label: {
                                VStack(spacing: 4) {
                                    Text("Subscribe")
                                        .font(.system(size: 17, weight: .semibold))
                                    Text("\(product.displayPrice)/month")
                                        .font(.system(size: 13))
                                        .opacity(0.8)
                                }
                                .foregroundStyle(.white)
                                .frame(maxWidth: .infinity)
                                .padding(.vertical, 16)
                                .background(DesignTokens.garnet)
                                .clipShape(RoundedRectangle(cornerRadius: 12))
                            }
                            .disabled(store.purchaseState == .purchasing)
                        } else {
                            // Product not loaded yet — show fallback subscribe button
                            VStack(spacing: 12) {
                                Button {
                                    Task {
                                        await store.loadProducts()
                                        if !store.products.isEmpty {
                                            await store.purchase()
                                        }
                                    }
                                } label: {
                                    VStack(spacing: 4) {
                                        Text("Subscribe")
                                            .font(.system(size: 17, weight: .semibold))
                                        Text("$19.99/month")
                                            .font(.system(size: 13))
                                            .opacity(0.8)
                                    }
                                    .foregroundStyle(.white)
                                    .frame(maxWidth: .infinity)
                                    .padding(.vertical, 16)
                                    .background(DesignTokens.garnet)
                                    .clipShape(RoundedRectangle(cornerRadius: 12))
                                }

                                if let error = store.loadError {
                                    Text(error)
                                        .font(.system(size: 11))
                                        .foregroundStyle(DesignTokens.textMuted)
                                        .multilineTextAlignment(.center)
                                }
                            }
                        }

                        // Restore
                        Button {
                            Task { await store.restore() }
                        } label: {
                            Text("Restore Purchases")
                                .font(.system(size: 13))
                                .foregroundStyle(DesignTokens.textSecondary)
                        }

                        // Status messages
                        switch store.purchaseState {
                        case .purchasing:
                            HStack(spacing: 8) {
                                ProgressView().tint(.white)
                                Text("Processing...")
                                    .font(.caption)
                                    .foregroundStyle(DesignTokens.textSecondary)
                            }
                        case .purchased:
                            Text("Welcome to Pro! 🎉")
                                .font(.caption)
                                .foregroundStyle(.green)
                        case .restored:
                            Text("Subscription restored!")
                                .font(.caption)
                                .foregroundStyle(.green)
                        case .failed(let message):
                            Text(message)
                                .font(.caption)
                                .foregroundStyle(.red)
                        case .idle:
                            EmptyView()
                        }
                    }

                    // Legal
                    VStack(spacing: 6) {
                        Text("Subscription auto-renews monthly. Cancel anytime in Settings → Apple ID → Subscriptions.")
                            .font(.system(size: 11))
                            .foregroundStyle(DesignTokens.textMuted)

                        HStack(spacing: 16) {
                            Link("Terms", destination: URL(string: "https://www.peipei-run.com/terms")!)
                            Link("Privacy", destination: URL(string: "https://www.peipei-run.com/privacy")!)
                        }
                        .font(.system(size: 11))
                        .foregroundStyle(DesignTokens.textSecondary)
                    }
                }
            }
            .padding(24)
        }
        .background(DesignTokens.background)
        .preferredColorScheme(.dark)
        .toolbar {
            ToolbarItem(placement: .topBarLeading) {
                Button("Close") { dismiss() }
                    .foregroundStyle(DesignTokens.textSecondary)
            }
        }
        .task {
            guard !hasLoaded else { return }
            hasLoaded = true
            await store.loadProducts()
            await store.checkSubscriptionStatus()
        }
    }

    private func benefitRow(icon: String, title: String, description: String) -> some View {
        HStack(alignment: .top, spacing: 14) {
            Image(systemName: icon)
                .font(.system(size: 18))
                .foregroundStyle(DesignTokens.garnet)
                .frame(width: 24)

            VStack(alignment: .leading, spacing: 3) {
                Text(title)
                    .font(.system(size: 15, weight: .medium))
                    .foregroundStyle(.white)
                Text(description)
                    .font(.system(size: 13))
                    .foregroundStyle(DesignTokens.textSecondary)
                    .lineSpacing(2)
            }
        }
    }
}
