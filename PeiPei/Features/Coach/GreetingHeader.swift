import SwiftUI

struct GreetingHeader: View {
    let userName: String

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(greetingLine)
                .font(.system(size: 26, weight: .light))
                .foregroundStyle(Color("Cream"))

            Text("Your coach is listening.")
                .font(.subheadline)
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.bottom, 12)
    }

    private var greetingLine: String {
        let hour = Calendar.current.component(.hour, from: .now)
        let name = userName.isEmpty ? "runner" : userName
        switch hour {
        case 5..<12:  return "Good morning, \(name)."
        case 12..<17: return "Good afternoon, \(name)."
        case 17..<22: return "Good evening, \(name)."
        default:      return "Good night, \(name)."
        }
    }
}
