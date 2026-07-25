//
//  NewsView.swift
//  CP-Portal
//

import SwiftUI

struct NewsListView: View {
    @Environment(Session.self) private var session
    /// True when pushed inside an existing NavigationStack (the Browse tab).
    var embedded = false

    @State private var posts: [NewsPost] = []
    @State private var categories: [String] = []
    @State private var selectedCategory: String?
    @State private var searchText = ""
    @State private var total = 0
    @State private var nextPage = 1
    @State private var isLoadingMore = false
    @State private var loadError: String?
    @State private var hasLoaded = false

    var body: some View {
        if embedded {
            inner
        } else {
            NavigationStack { inner }
        }
    }

    private var inner: some View {
        Group {
            if !hasLoaded {
                ProgressView()
            } else if let loadError, posts.isEmpty {
                ContentUnavailableView {
                    Label("Couldn't load news", systemImage: "exclamationmark.triangle")
                } description: {
                    Text(loadError)
                } actions: {
                    Button("Try Again") { Task { await reload() } }
                }
            } else {
                List {
                    if !categories.isEmpty {
                        categoryChips
                            .listRowInsets(EdgeInsets())
                            .listRowBackground(Color.clear)
                    }

                    if posts.isEmpty {
                        ContentUnavailableView(
                            searchText.isEmpty && selectedCategory == nil
                                ? "No announcements" : "Nothing matches",
                            systemImage: "newspaper",
                            description: Text(
                                searchText.isEmpty && selectedCategory == nil
                                    ? "There is nothing published for your account type yet."
                                    : "Try a different category or search term."
                            )
                        )
                        .listRowBackground(Color.clear)
                    }

                    ForEach(posts) { post in
                        NavigationLink {
                            NewsDetailView(post: post)
                        } label: {
                            row(for: post)
                        }
                    }

                    if posts.count < total {
                        HStack {
                            Spacer()
                            if isLoadingMore { ProgressView() } else {
                                Text("\(posts.count) of \(total)")
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }
                            Spacer()
                        }
                        .onAppear { Task { await loadMore() } }
                    }
                }
                .listStyle(.insetGrouped)
                .refreshable { await reload() }
            }
        }
        .navigationTitle("News")
        .searchable(text: $searchText, prompt: "Search news")
        .onSubmit(of: .search) { Task { await reload() } }
        .onChange(of: searchText) { _, newValue in
            // Match the web: clearing the field resets the list without a submit.
            if newValue.isEmpty { Task { await reload() } }
        }
        .task {
            guard !hasLoaded else { return }
            await reload()
        }
    }

    private var categoryChips: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                chip("All", isOn: selectedCategory == nil) {
                    selectedCategory = nil
                }
                ForEach(categories, id: \.self) { category in
                    chip(category, isOn: selectedCategory == category) {
                        selectedCategory = selectedCategory == category ? nil : category
                    }
                }
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 6)
        }
    }

    private func chip(_ label: String, isOn: Bool, action: @escaping () -> Void) -> some View {
        Button {
            action()
            Task { await reload() }
        } label: {
            Text(label)
                .font(.footnote.weight(isOn ? .semibold : .regular))
                .padding(.horizontal, 12)
                .padding(.vertical, 6)
                .background(isOn ? Theme.brand : Color(.secondarySystemBackground),
                            in: .capsule)
                .foregroundStyle(isOn ? .white : .primary)
        }
        .buttonStyle(.plain)
    }

    private func row(for post: NewsPost) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack(spacing: 6) {
                if post.pinned {
                    Image(systemName: "pin.fill")
                        .font(.caption2)
                        .foregroundStyle(Theme.brand)
                }
                Text(post.title)
                    .font(.body)
                    .lineLimit(2)
            }
            HStack(spacing: 8) {
                if let category = post.category, !category.isEmpty {
                    Text(category)
                        .font(.caption)
                        .foregroundStyle(Theme.brand)
                }
                if let publishAt = post.publishAt {
                    Text(publishAt.formatted(date: .abbreviated, time: .omitted))
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
        }
        .padding(.vertical, 2)
    }

    private func reload() async {
        loadError = nil
        do {
            let page = try await PortalAPI.shared.news(
                clientCode: session.clientCode, page: 1,
                category: selectedCategory, search: searchText
            )
            posts = page.posts
            total = page.total
            categories = page.allCategories
            nextPage = 2
        } catch {
            loadError = error.localizedDescription
        }
        hasLoaded = true
    }

    private func loadMore() async {
        guard !isLoadingMore, posts.count < total else { return }
        isLoadingMore = true
        defer { isLoadingMore = false }
        do {
            let page = try await PortalAPI.shared.news(
                clientCode: session.clientCode, page: nextPage,
                category: selectedCategory, search: searchText
            )
            // Pinned posts repeat their ordering server-side; dedupe on id so a
            // shifting result set cannot produce duplicate rows mid-scroll.
            let known = Set(posts.map(\.id))
            posts.append(contentsOf: page.posts.filter { !known.contains($0.id) })
            total = page.total
            nextPage += 1
        } catch {
            loadError = error.localizedDescription
        }
    }
}

struct NewsDetailView: View {
    @Environment(Session.self) private var session
    let post: NewsPost

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                Text(post.title)
                    .font(.title3.weight(.semibold))

                HStack(spacing: 8) {
                    if let category = post.category, !category.isEmpty {
                        Text(category)
                            .font(.caption)
                            .foregroundStyle(Theme.brand)
                    }
                    if let publishAt = post.publishAt {
                        Text(publishAt.formatted(date: .abbreviated, time: .omitted))
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }

                Divider()

                if let html = post.bodyHtml {
                    HTMLText(html: html)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(20)
        }
        .navigationTitle("Announcement")
        .navigationBarTitleDisplayMode(.inline)
        .onAppear {
            // Counts this read toward the admin analytics dashboard, as the web does.
            PortalAPI.shared.recordNewsView(
                postID: post.id, clientCode: session.clientCode
            )
        }
    }

    /// Posts are authored as HTML in the web admin. Rendering it properly is a later
    /// task; for now strip tags and decode the few entities that actually show up so
    /// the text reads correctly rather than leaking markup.
    static func plainText(from html: String?) -> String {
        guard let html else { return "" }
        var text = html.replacingOccurrences(
            of: "<[^>]+>", with: "", options: .regularExpression
        )
        let entities = ["&nbsp;": " ", "&amp;": "&", "&lt;": "<",
                        "&gt;": ">", "&quot;": "\"", "&#39;": "'"]
        for (entity, replacement) in entities {
            text = text.replacingOccurrences(of: entity, with: replacement)
        }
        return text.trimmingCharacters(in: .whitespacesAndNewlines)
    }
}
