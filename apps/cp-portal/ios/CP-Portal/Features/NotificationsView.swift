//
//  NotificationsView.swift
//  CP-Portal
//
//  The in-app notification centre. Preferences already let a user choose which
//  notifications they receive; this is where those notifications actually arrive.
//  It is also the screen a push notification will open once APNs is in place.
//

import SwiftUI

/// Notification state, shared so the Account badge and the list agree.
@Observable
final class NotificationStore {
    var items: [PortalNotification] = []
    var unreadCount = 0
    var loadError: String?
    var hasLoaded = false

    private let clientCode: String

    init(clientCode: String) {
        self.clientCode = clientCode
    }

    func load() async {
        loadError = nil
        do {
            let feed = try await PortalAPI.shared.notifications(clientCode: clientCode)
            items = feed.notifications
            unreadCount = feed.unreadCount
        } catch {
            loadError = error.localizedDescription
        }
        hasLoaded = true
    }

    func markAllRead() async {
        // Optimistic — the badge should clear the instant it is tapped.
        let previous = items
        let previousCount = unreadCount
        for index in items.indices { items[index].isRead = 1 }
        unreadCount = 0
        do {
            try await PortalAPI.shared.markAllNotificationsRead(clientCode: clientCode)
        } catch {
            items = previous
            unreadCount = previousCount
            loadError = error.localizedDescription
        }
    }

    func markRead(_ notification: PortalNotification) async {
        guard !notification.read else { return }
        try? await PortalAPI.shared.markNotificationRead(id: notification.id)
        if let index = items.firstIndex(where: { $0.id == notification.id }) {
            items[index].isRead = 1
            unreadCount = max(0, unreadCount - 1)
        }
    }
}

struct NotificationsView: View {
    @Environment(Session.self) private var session
    @State private var store: NotificationStore?

    var body: some View {
        Group {
            if let store {
                content(for: store)
            } else {
                ProgressView()
            }
        }
        .navigationTitle("Notifications")
        .task {
            guard store == nil else { return }
            let store = NotificationStore(clientCode: session.clientCode)
            self.store = store
            await store.load()
        }
    }

    @ViewBuilder
    private func content(for store: NotificationStore) -> some View {
        Group {
            if !store.hasLoaded {
                ProgressView()
            } else if let loadError = store.loadError, store.items.isEmpty {
                ContentUnavailableView {
                    Label("Couldn't load notifications", systemImage: "exclamationmark.triangle")
                } description: {
                    Text(loadError)
                } actions: {
                    Button("Try Again") { Task { await store.load() } }
                }
            } else if store.items.isEmpty {
                ContentUnavailableView(
                    "You're all caught up",
                    systemImage: "bell.slash",
                    description: Text("New announcements, documents and safety alerts will appear here. Choose which ones you receive under Preferences.")
                )
            } else {
                List {
                    ForEach(store.items) { item in
                        NavigationLink {
                            destination(for: item)
                                .task { await store.markRead(item) }
                        } label: {
                            row(for: item)
                        }
                    }
                }
                .listStyle(.insetGrouped)
                .refreshable { await store.load() }
            }
        }
        .toolbar {
            if store.unreadCount > 0 {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Mark all read") { Task { await store.markAllRead() } }
                        .font(.subheadline)
                }
            }
        }
    }

    private func row(for item: PortalNotification) -> some View {
        HStack(alignment: .top, spacing: 12) {
            Image(systemName: item.icon)
                .foregroundStyle(item.type == "safety" ? .red : Theme.brand)
                .frame(width: 24)

            VStack(alignment: .leading, spacing: 3) {
                Text(item.label)
                    .font(.caption)
                    .foregroundStyle(item.type == "safety" ? .red : Theme.brand)
                Text(item.title)
                    .font(.body)
                    .fontWeight(item.read ? .regular : .semibold)
                    .lineLimit(2)
                if let createdAt = item.createdAt {
                    Text(createdAt.formatted(.relative(presentation: .named)))
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }

            Spacer(minLength: 4)

            if !item.read {
                Circle()
                    .fill(Theme.brand)
                    .frame(width: 8, height: 8)
                    .padding(.top, 6)
            }
        }
        .padding(.vertical, 2)
    }

    /// Notifications carry a type and the id of the item they point at — the same
    /// mapping problem search has, solved the same way.
    @ViewBuilder
    private func destination(for item: PortalNotification) -> some View {
        switch item.type {
        case "safety":
            SafetyView()
        case "document":
            DocumentListView(embedded: true)
        default:
            NewsNotificationDetail(postID: item.itemId)
        }
    }
}

/// Loads the article a news notification points at.
private struct NewsNotificationDetail: View {
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
                    Label("Couldn't open the announcement", systemImage: "exclamationmark.triangle")
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
