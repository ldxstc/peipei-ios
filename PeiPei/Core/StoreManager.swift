import Foundation
import StoreKit

@Observable
@MainActor
final class StoreManager {
    static let shared = StoreManager()

    private(set) var products: [Product] = []
    private(set) var purchaseState: PurchaseState = .idle
    private(set) var isProSubscriber = false
    private(set) var currentSubscription: StoreKit.Transaction?

    private var transactionListener: Task<Void, Never>?

    enum PurchaseState: Equatable {
        case idle
        case purchasing
        case purchased
        case failed(String)
        case restored
    }

    static let proMonthlyID = "com.peipei.pro.monthly"
    // static let proYearlyID = "com.peipei.pro.yearly" // Future

    private init() {
        transactionListener = listenForTransactions()
        Task { await checkSubscriptionStatus() }
    }

    // Note: deinit can't access MainActor-isolated properties
    // The task will be cancelled when the instance is deallocated

    // MARK: - Load Products

    func loadProducts() async {
        do {
            products = try await Product.products(for: [Self.proMonthlyID])
        } catch {
            print("[StoreManager] Failed to load products: \(error)")
        }
    }

    // MARK: - Purchase

    func purchase() async {
        guard let product = products.first else {
            await loadProducts()
            guard let product = products.first else {
                purchaseState = .failed("Product not available.")
                return
            }
            await doPurchase(product)
            return
        }
        await doPurchase(product)
    }

    private func doPurchase(_ product: Product) async {
        purchaseState = .purchasing
        do {
            let result = try await product.purchase()
            switch result {
            case .success(let verification):
                let transaction = try checkVerified(verification)
                await transaction.finish()
                currentSubscription = transaction
                isProSubscriber = true
                purchaseState = .purchased
                await syncWithServer(transaction: transaction)

            case .pending:
                purchaseState = .idle // Waiting for approval (Ask to Buy, etc.)

            case .userCancelled:
                purchaseState = .idle

            @unknown default:
                purchaseState = .idle
            }
        } catch {
            purchaseState = .failed(error.localizedDescription)
        }
    }

    // MARK: - Restore

    func restore() async {
        try? await AppStore.sync()
        await checkSubscriptionStatus()
        if isProSubscriber {
            purchaseState = .restored
        }
    }

    // MARK: - Check Status

    func checkSubscriptionStatus() async {
        var foundActive = false
        for await result in StoreKit.Transaction.currentEntitlements {
            if let transaction = try? checkVerified(result) {
                if transaction.productID == Self.proMonthlyID {
                    currentSubscription = transaction
                    foundActive = true
                }
            }
        }
        isProSubscriber = foundActive
    }

    // MARK: - Transaction Listener

    private func listenForTransactions() -> Task<Void, Never> {
        Task { [weak self] in
            for await result in StoreKit.Transaction.updates {
                guard let self else { return }
                if case .verified(let transaction) = result {
                    await transaction.finish()
                    self.currentSubscription = transaction
                    self.isProSubscriber = true
                    await self.syncWithServer(transaction: transaction)
                }
            }
        }
    }

    // MARK: - Verification

    private func checkVerified<T>(_ result: VerificationResult<T>) throws -> T {
        switch result {
        case .unverified:
            throw StoreError.verificationFailed
        case .verified(let value):
            return value
        }
    }

    // MARK: - Server Sync

    private func syncWithServer(transaction: StoreKit.Transaction) async {
        guard let token = await MainActor.run(body: { AppModel.shared?.sessionToken }) else { return }

        do {
            try await APIClient.shared.syncAppleSubscription(
                token: token,
                originalTransactionId: String(transaction.originalID),
                productId: transaction.productID,
                environment: transaction.environment == .production ? "Production" : "Sandbox"
            )
        } catch {
            print("[StoreManager] Server sync failed: \(error)")
        }
    }

    enum StoreError: LocalizedError {
        case verificationFailed
        var errorDescription: String? { "Transaction verification failed." }
    }
}
