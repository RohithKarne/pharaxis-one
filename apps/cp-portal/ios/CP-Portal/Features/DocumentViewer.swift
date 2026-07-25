//
//  DocumentViewer.swift
//  CP-Portal
//
//  Native document viewing via QuickLook — replaces the web's blob-into-iframe
//  approach. Handles PDF and Office types alike, with the share sheet built in.
//

import SwiftUI
import QuickLook

struct DocumentViewer: View {
    let documentID: Int
    let fileName: String

    @State private var localURL: URL?
    @State private var loadError: String?

    var body: some View {
        Group {
            if let localURL {
                QuickLookView(url: localURL)
                    .ignoresSafeArea(edges: .bottom)
            } else if let loadError {
                ContentUnavailableView {
                    Label("Couldn't open the document", systemImage: "exclamationmark.triangle")
                } description: {
                    Text(loadError)
                } actions: {
                    Button("Try Again") { Task { await download() } }
                }
            } else {
                ProgressView("Downloading…")
            }
        }
        .navigationTitle(fileName)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            if let localURL {
                ToolbarItem(placement: .topBarTrailing) {
                    ShareLink(item: localURL)
                }
            }
        }
        .task { await download() }
    }

    private func download() async {
        loadError = nil
        do {
            localURL = try await PortalAPI.shared.downloadDocument(id: documentID, fileName: fileName)
        } catch {
            loadError = error.localizedDescription
        }
    }
}

private struct QuickLookView: UIViewControllerRepresentable {
    let url: URL

    func makeUIViewController(context: Context) -> QLPreviewController {
        let controller = QLPreviewController()
        controller.dataSource = context.coordinator
        return controller
    }

    func updateUIViewController(_ controller: QLPreviewController, context: Context) {}

    func makeCoordinator() -> Coordinator { Coordinator(url: url) }

    final class Coordinator: NSObject, QLPreviewControllerDataSource {
        let url: URL
        init(url: URL) { self.url = url }
        func numberOfPreviewItems(in controller: QLPreviewController) -> Int { 1 }
        func previewController(_ controller: QLPreviewController, previewItemAt index: Int) -> QLPreviewItem {
            url as NSURL
        }
    }
}
