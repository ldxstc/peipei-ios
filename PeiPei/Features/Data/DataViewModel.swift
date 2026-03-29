import Foundation
import Observation

@MainActor
@Observable
final class DataViewModel {
    var sidebarData: SidebarData?
    var isLoading = false
    var errorMessage: String?

    private let client = APIClient()

    func load(token: String) async {
        isLoading = true
        defer { isLoading = false }

        do {
            sidebarData = try await client.fetchSidebarData(token: token)
            errorMessage = nil
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func syncAndReload(token: String) async {
        isLoading = true
        defer { isLoading = false }

        do {
            try await client.syncGarmin(token: token)
            sidebarData = try await client.fetchSidebarData(token: token)
            errorMessage = nil
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}
