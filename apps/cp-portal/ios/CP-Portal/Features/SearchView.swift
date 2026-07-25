//
//  SearchView.swift
//  CP-Portal
//

import SwiftUI

/// Unified search. The backend already restricts results to content types whose
/// feature is enabled for this client, so the app does not filter again.
struct SearchView: View {
    @Environment(Session.self) private var session

    @State private var query = ""
    @State private var hits: [SearchHit] = []
    @State private var isSearching = false
    @State private var hasSearched = false
    @State private var searchError: String?

    var body: some View {
        NavigationStack {
            Group {
                if isSearching {
                    ProgressView()
                } else if let searchError {
                    ContentUnavailableView {
                        Label("Search failed", systemImage: "exclamationmark.triangle")
                    } description: {
                        Text(searchError)
                    }
                } else if hasSearched && hits.isEmpty {
                    ContentUnavailableView.search(text: query)
                } else if hits.isEmpty {
                    ContentUnavailableView(
                        "Search the portal",
                        systemImage: "magnifyingglass",
                        description: Text("Find documents, news, safety alerts and more.")
                    )
                } else {
                    List(hits, id: \.hitID) { hit in
                        // The route mapper: search returns web paths; each result
                        // type resolves to its native destination here, once.
                        NavigationLink {
                            destination(for: hit)
                        } label: {
                            VStack(alignment: .leading, spacing: 4) {
                                Text(hit.label)
                                    .font(.caption)
                                    .foregroundStyle(Theme.brand)
                                Text(hit.title)
                                    .font(.body)
                                if let snippet = hit.snippet, !snippet.isEmpty {
                                    Text(snippet)
                                        .font(.caption)
                                        .foregroundStyle(.secondary)
                                        .lineLimit(3)
                                }
                            }
                            .padding(.vertical, 2)
                        }
                    }
                    .listStyle(.insetGrouped)
                }
            }
            .navigationTitle("Search")
            .searchable(text: $query, prompt: "Documents, news, safety…")
            .onSubmit(of: .search) { Task { await runSearch() } }
            .onChange(of: query) { _, newValue in
                // The endpoint ignores anything shorter than 2 characters; clearing the
                // field should return to the idle prompt rather than a stale result set.
                if newValue.trimmingCharacters(in: .whitespaces).count < 2 {
                    hits = []
                    hasSearched = false
                    searchError = nil
                }
            }
        }
    }

    /// Maps a search hit's content type to its native screen. Detail-capable types
    /// load their record; the rest land on the relevant list.
    @ViewBuilder
    private func destination(for hit: SearchHit) -> some View {
        switch hit.type {
        case "news":
            NewsHitDetail(postID: hit.id)
        case "document":
            DocumentListView(embedded: true)
        case "safety":
            SafetyView()
        case "faq":
            FAQView()
        case "drug":
            DrugInfoView()
        case "ta":
            TherapeuticAreasView()
        case "resource":
            ResourcesView()
        default:
            ContentUnavailableView(
                "Open on the web portal",
                systemImage: "safari",
                description: Text("This result type isn't available in the app yet.")
            )
        }
    }

    private func runSearch() async {
        let trimmed = query.trimmingCharacters(in: .whitespaces)
        guard trimmed.count >= 2 else { return }

        isSearching = true
        searchError = nil
        defer { isSearching = false }

        do {
            hits = try await PortalAPI.shared.search(trimmed, clientCode: session.clientCode)
        } catch {
            searchError = error.localizedDescription
            hits = []
        }
        hasSearched = true
    }
}

/// Loads a news article by id for search navigation — the hit carries only the id.
private struct NewsHitDetail: View {
    @Environment(Session.self) private var session
    let postID: Int
    @State private var post: NewsPost?
    @State private var loadError: String?

    var body: some View {
        Group {
            if let post {
                NewsDetailView(post: post)
            } else if let loadError {
                ContentUnavailableView {
                    Label("Couldn't open the article", systemImage: "exclamationmark.triangle")
                } description: { Text(loadError) }
            } else {
                ProgressView()
            }
        }
        .task {
            do {
                post = try await PortalAPI.shared.newsPost(id: postID, clientCode: session.clientCode)
            } catch {
                loadError = error.localizedDescription
            }
        }
    }
}
