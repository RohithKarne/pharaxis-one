//
//  DocumentListView.swift
//  CP-Portal
//

import SwiftUI

/// Shared document + bookmark state, so the list and the detail screen stay in sync
/// after a save without either refetching.
@Observable
final class DocumentStore {
    var documents: [PortalDocument] = []
    var savedIDs: Set<Int> = []
    var loadError: String?
    var hasLoaded = false

    private let clientCode: String

    init(clientCode: String) {
        self.clientCode = clientCode
    }

    func load() async {
        loadError = nil
        do {
            documents = try await PortalAPI.shared.documents(clientCode: clientCode).documents
            // A failure here should not blank the library, so bookmarks degrade quietly.
            savedIDs = (try? await PortalAPI.shared.savedDocumentIDs(clientCode: clientCode)) ?? []
        } catch {
            loadError = error.localizedDescription
        }
        hasLoaded = true
    }

    func isSaved(_ document: PortalDocument) -> Bool { savedIDs.contains(document.id) }

    func toggleSaved(_ document: PortalDocument) async {
        let shouldSave = !isSaved(document)
        // Optimistic: flip immediately, roll back if the server disagrees.
        if shouldSave { savedIDs.insert(document.id) } else { savedIDs.remove(document.id) }
        do {
            try await PortalAPI.shared.setSaved(
                shouldSave, documentID: document.id, clientCode: clientCode
            )
        } catch {
            if shouldSave { savedIDs.remove(document.id) } else { savedIDs.insert(document.id) }
            loadError = error.localizedDescription
        }
    }
}

struct DocumentListView: View {
    @Environment(Session.self) private var session
    /// True when pushed inside an existing NavigationStack (the Browse tab);
    /// false when standing alone.
    var embedded = false
    @State private var store: DocumentStore?
    @State private var searchText = ""

    // AI semantic search: an alternate results set over the same library, entered
    // explicitly and cleared back to plain filtering. Mirrors the web's AI toggle.
    @State private var aiMode = false
    @State private var aiHits: [PortalAPI.AISearchHit]?
    @State private var aiRunning = false
    @State private var aiUnavailable = false

    var body: some View {
        Group {
            if embedded {
                body_
            } else {
                NavigationStack { body_ }
            }
        }
        .task {
            guard store == nil else { return }
            let store = DocumentStore(clientCode: session.clientCode)
            self.store = store
            await store.load()
        }
    }

    private var body_: some View {
        Group {
            if let store {
                content(for: store)
            } else {
                ProgressView()
            }
        }
        .navigationTitle("Documents")
    }

    @ViewBuilder
    private func content(for store: DocumentStore) -> some View {
        if !store.hasLoaded {
            ProgressView()
        } else if let loadError = store.loadError, store.documents.isEmpty {
            ContentUnavailableView {
                Label("Couldn't load documents", systemImage: "exclamationmark.triangle")
            } description: {
                Text(loadError)
            } actions: {
                Button("Try Again") { Task { await store.load() } }
            }
        } else if store.documents.isEmpty {
            ContentUnavailableView(
                "No documents",
                systemImage: "doc.text",
                description: Text("This portal has no published documents for your account type.")
            )
        } else {
            List {
                if aiMode {
                    aiSection(store: store)
                } else {
                    ForEach(filtered(store.documents)) { document in
                        NavigationLink {
                            DocumentDetailView(document: document, store: store)
                        } label: {
                            row(for: document, in: store)
                        }
                    }
                }
            }
            .listStyle(.insetGrouped)
            .searchable(text: $searchText,
                        prompt: aiMode ? "Ask about the documents…" : "Search documents")
            .onSubmit(of: .search) {
                if aiMode { Task { await runAISearch() } }
            }
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        aiMode.toggle()
                        aiHits = nil
                        aiUnavailable = false
                    } label: {
                        Label("AI Search", systemImage: aiMode ? "sparkles" : "sparkle")
                            .foregroundStyle(aiMode ? Theme.brand : Color.secondary)
                    }
                }
            }
            .refreshable { await store.load() }
            .overlay {
                if !aiMode && filtered(store.documents).isEmpty {
                    ContentUnavailableView.search(text: searchText)
                }
            }
        }
    }

    @ViewBuilder
    private func aiSection(store: DocumentStore) -> some View {
        if aiRunning {
            HStack { Spacer(); ProgressView("Searching…"); Spacer() }
                .listRowBackground(Color.clear)
        } else if aiUnavailable {
            // "Unavailable" is a valid server answer, not an error: the portal has
            // no AI provider configured. Fall back rather than dead-end.
            ContentUnavailableView(
                "AI search isn't available",
                systemImage: "sparkles.slash",
                description: Text("This portal has no AI provider configured. Use plain search instead.")
            )
            .listRowBackground(Color.clear)
        } else if let aiHits {
            if aiHits.isEmpty {
                ContentUnavailableView.search(text: searchText)
                    .listRowBackground(Color.clear)
            } else {
                ForEach(aiHits) { hit in
                    // Resolve back to the full document so detail/save still work.
                    if let document = store.documents.first(where: { $0.id == hit.id }) {
                        NavigationLink {
                            DocumentDetailView(document: document, store: store)
                        } label: {
                            aiRow(for: hit)
                        }
                    }
                }
            }
        } else {
            ContentUnavailableView(
                "Ask in your own words",
                systemImage: "sparkles",
                description: Text("Describe what you need — dosing guidance, storage conditions, a form — and the portal finds the closest documents.")
            )
            .listRowBackground(Color.clear)
        }
    }

    private func aiRow(for hit: PortalAPI.AISearchHit) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack {
                Text(hit.title).font(.body).lineLimit(2)
                Spacer(minLength: 4)
                if let score = hit.relevanceScore {
                    Text("\(Int(score.rounded()))%")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(Theme.brand)
                }
            }
            if let reason = hit.reason, !reason.isEmpty {
                Text(reason)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .lineLimit(3)
            }
        }
        .padding(.vertical, 2)
    }

    private func runAISearch() async {
        let query = searchText.trimmingCharacters(in: .whitespaces)
        guard !query.isEmpty else { return }
        aiRunning = true
        defer { aiRunning = false }
        do {
            let result = try await PortalAPI.shared.aiSearchDocuments(
                query, clientCode: session.clientCode
            )
            aiUnavailable = result.aiUnavailable == true
            aiHits = result.results
        } catch {
            // A transport failure degrades the same way as "unavailable".
            aiUnavailable = true
            aiHits = []
        }
    }

    private func row(for document: PortalDocument, in store: DocumentStore) -> some View {
        HStack(spacing: 12) {
            Image(systemName: "doc.text.fill")
                .font(.title3)
                .foregroundStyle(Theme.brand)
                .frame(width: 28)

            VStack(alignment: .leading, spacing: 3) {
                Text(document.title)
                    .font(.body)
                    .lineLimit(2)
                if let category = document.category {
                    Text(category)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }

            Spacer(minLength: 4)

            if store.isSaved(document) {
                Image(systemName: "bookmark.fill")
                    .font(.footnote)
                    .foregroundStyle(Theme.brand)
            }
        }
        .padding(.vertical, 2)
    }

    private func filtered(_ documents: [PortalDocument]) -> [PortalDocument] {
        let query = searchText.trimmingCharacters(in: .whitespaces)
        guard !query.isEmpty else { return documents }
        return documents.filter {
            $0.title.localizedCaseInsensitiveContains(query)
                || ($0.category?.localizedCaseInsensitiveContains(query) ?? false)
        }
    }
}
