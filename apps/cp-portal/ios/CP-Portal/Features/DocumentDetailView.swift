//
//  DocumentDetailView.swift
//  CP-Portal
//

import SwiftUI

struct DocumentDetailView: View {
    let document: PortalDocument
    let store: DocumentStore

    private var isSaved: Bool { store.isSaved(document) }

    var body: some View {
        List {
            Section {
                VStack(alignment: .leading, spacing: 8) {
                    Text(document.title)
                        .font(.title3.weight(.semibold))
                    if let category = document.category {
                        Text(category)
                            .font(.subheadline)
                            .foregroundStyle(Theme.brand)
                    }
                }
                .padding(.vertical, 4)
            }

            Section("Details") {
                if let fileName = document.fileName {
                    detailRow("File", fileName)
                }
                if let docType = document.docType {
                    detailRow("Type", docType.uppercased())
                }
                if let fileSize = document.fileSize {
                    detailRow("Size", ByteCountFormatter.string(
                        fromByteCount: Int64(fileSize), countStyle: .file
                    ))
                }
                if let version = document.version {
                    detailRow("Version", version)
                }
                if let createdAt = document.createdAt {
                    detailRow("Published", createdAt.formatted(date: .abbreviated, time: .omitted))
                }
                if let downloadCount = document.downloadCount {
                    detailRow("Downloads", "\(downloadCount)")
                }
            }

            Section {
                if let fileName = document.fileName {
                    NavigationLink {
                        DocumentViewer(documentID: document.id, fileName: fileName)
                    } label: {
                        Label("Open Document", systemImage: "doc.text.magnifyingglass")
                            .foregroundStyle(Theme.brand)
                    }
                }
                Button {
                    Task { await store.toggleSaved(document) }
                } label: {
                    Label(
                        isSaved ? "Saved" : "Save for Later",
                        systemImage: isSaved ? "bookmark.fill" : "bookmark"
                    )
                    .foregroundStyle(Theme.brand)
                }
            } footer: {
                Text("Saved documents appear in your portal account on any device.")
            }
        }
        .navigationTitle("Document")
        .navigationBarTitleDisplayMode(.inline)
    }

    private func detailRow(_ label: String, _ value: String) -> some View {
        HStack(alignment: .firstTextBaseline) {
            Text(label)
                .foregroundStyle(.secondary)
            Spacer(minLength: 12)
            Text(value)
                .multilineTextAlignment(.trailing)
        }
        .font(.callout)
    }
}
