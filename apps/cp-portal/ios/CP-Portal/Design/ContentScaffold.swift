//
//  ContentScaffold.swift
//  CP-Portal
//
//  The shared list/detail machinery. Every content screen loads the same way, so
//  the load-state handling lives here once instead of in eight views.
//

import SwiftUI

/// Wraps a screen's async load: progress while loading, retryable error state,
/// custom empty state, and pull-to-refresh once loaded.
struct LoadableList<Item, Content: View>: View {
    let title: String
    let emptyIcon: String
    let emptyText: String
    let load: () async throws -> [Item]
    @ViewBuilder let content: ([Item]) -> Content

    @State private var items: [Item] = []
    @State private var loadError: String?
    @State private var hasLoaded = false

    var body: some View {
        Group {
            if !hasLoaded {
                ProgressView()
            } else if let loadError, items.isEmpty {
                ContentUnavailableView {
                    Label("Couldn't load \(title.lowercased())", systemImage: "exclamationmark.triangle")
                } description: {
                    Text(loadError)
                } actions: {
                    Button("Try Again") { Task { await run() } }
                }
            } else if items.isEmpty {
                ContentUnavailableView(emptyText, systemImage: emptyIcon)
            } else {
                content(items)
                    .refreshable { await run() }
            }
        }
        .task {
            guard !hasLoaded else { return }
            await run()
        }
    }

    private func run() async {
        loadError = nil
        do {
            items = try await load()
        } catch {
            loadError = error.localizedDescription
        }
        hasLoaded = true
    }
}

/// Renders admin-authored HTML (news bodies, safety alerts) as native text.
/// NSAttributedString's HTML importer must run on the main thread; bodies are
/// small (mediumtext authored in the admin's editor), so this stays responsive.
struct HTMLText: View {
    let html: String
    @Environment(\.colorScheme) private var colorScheme

    var body: some View {
        if let attributed = Self.attributed(from: html, dark: colorScheme == .dark) {
            Text(attributed)
        } else {
            Text(NewsDetailView.plainText(from: html))
        }
    }

    private static func attributed(from html: String, dark: Bool) -> AttributedString? {
        let styled = """
        <style>
        body { font-family: -apple-system; font-size: 16px; color: \(dark ? "#EEEEEE" : "#111111"); }
        </style>
        \(html)
        """
        guard let data = styled.data(using: .utf8),
              let ns = try? NSAttributedString(
                data: data,
                options: [.documentType: NSAttributedString.DocumentType.html,
                          .characterEncoding: String.Encoding.utf8.rawValue],
                documentAttributes: nil
              ) else { return nil }
        return AttributedString(ns)
    }
}

/// Severity chip for safety alerts, mapping the backend's severity strings.
struct SeverityBadge: View {
    let severity: String?

    private var color: Color {
        switch severity {
        case "critical": return .red
        case "high", "warning": return .orange
        default: return .secondary
        }
    }

    var body: some View {
        Text((severity ?? "info").uppercased())
            .font(.caption2.weight(.semibold))
            .padding(.horizontal, 7)
            .padding(.vertical, 2.5)
            .background(color.opacity(0.14), in: .capsule)
            .foregroundStyle(color)
    }
}
