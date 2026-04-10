import PhotosUI
import SwiftUI

struct ComposerView: View {
    @Binding var text: String
    let onSend: () -> Void
    let onSendWithImage: (UIImage) -> Void

    @State private var showImagePicker = false
    @State private var showCamera = false
    @State private var selectedItem: PhotosPickerItem?
    @State private var attachedImage: UIImage?

    private var hasContent: Bool {
        !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || attachedImage != nil
    }

    var body: some View {
        VStack(spacing: 0) {
            // Image preview
            if let image = attachedImage {
                HStack {
                    Image(uiImage: image)
                        .resizable()
                        .scaledToFill()
                        .frame(width: 60, height: 60)
                        .clipShape(RoundedRectangle(cornerRadius: 8))

                    Spacer()

                    Button {
                        attachedImage = nil
                    } label: {
                        Image(systemName: "xmark.circle.fill")
                            .font(.title3)
                            .foregroundStyle(DesignTokens.textSecondary)
                    }
                }
                .padding(.horizontal, 16)
                .padding(.top, 10)
                .padding(.bottom, 6)
            }

            // Composer bar
            HStack(spacing: 10) {
                // Attachment menu
                Menu {
                    Button {
                        showImagePicker = true
                    } label: {
                        Label("Photo Library", systemImage: "photo")
                    }
                    Button {
                        showCamera = true
                    } label: {
                        Label("Take Photo", systemImage: "camera")
                    }
                } label: {
                    Image(systemName: "plus.circle")
                        .font(.system(size: 22))
                        .foregroundStyle(DesignTokens.textSecondary)
                }

                TextField("Talk to your coach...", text: $text, axis: .vertical)
                    .lineLimit(1...4)
                    .foregroundStyle(.white)
                    .font(.body)

                if hasContent {
                    Button {
                        if let image = attachedImage {
                            attachedImage = nil
                            onSendWithImage(image)
                        } else {
                            onSend()
                        }
                    } label: {
                        Image(systemName: "arrow.up.circle.fill")
                            .font(.title2)
                            .foregroundStyle(DesignTokens.garnet)
                    }
                }
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 12)
        }
        .background(
            Rectangle()
                .fill(Color.clear)
                .overlay(alignment: .top) {
                    Rectangle()
                        .fill(DesignTokens.separator)
                        .frame(height: 0.5)
                }
        )
        .photosPicker(isPresented: $showImagePicker, selection: $selectedItem, matching: .images)
        .fullScreenCover(isPresented: $showCamera) {
            CameraView { image in
                attachedImage = image
                showCamera = false
            }
            .ignoresSafeArea()
        }
        .onChange(of: selectedItem) {
            Task {
                if let item = selectedItem,
                   let data = try? await item.loadTransferable(type: Data.self),
                   let image = UIImage(data: data) {
                    attachedImage = image
                }
                selectedItem = nil
            }
        }
    }
}

// MARK: - Camera View

struct CameraView: UIViewControllerRepresentable {
    let onCapture: (UIImage) -> Void

    func makeUIViewController(context: Context) -> UIImagePickerController {
        let picker = UIImagePickerController()
        picker.sourceType = .camera
        picker.delegate = context.coordinator
        return picker
    }

    func updateUIViewController(_: UIImagePickerController, context _: Context) {}

    func makeCoordinator() -> Coordinator {
        Coordinator(onCapture: onCapture)
    }

    class Coordinator: NSObject, UIImagePickerControllerDelegate, UINavigationControllerDelegate {
        let onCapture: (UIImage) -> Void

        init(onCapture: @escaping (UIImage) -> Void) {
            self.onCapture = onCapture
        }

        func imagePickerController(_ picker: UIImagePickerController, didFinishPickingMediaWithInfo info: [UIImagePickerController.InfoKey: Any]) {
            if let image = info[.originalImage] as? UIImage {
                onCapture(image)
            }
            picker.dismiss(animated: true)
        }

        func imagePickerControllerDidCancel(_ picker: UIImagePickerController) {
            picker.dismiss(animated: true)
        }
    }
}
