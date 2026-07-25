//
//  MainTabView.swift
//  CP-Portal
//
//  The signed-in shell. Which tabs and rows exist is decided by the client
//  configuration — this is what makes "operate it from the web admin, no separate
//  iOS admin" true: switching a feature off in the admin panel removes it here.
//

import SwiftUI

struct MainTabView: View {
    enum Tab: Hashable {
        case home, browse, submit, search, account
    }

    @Environment(Session.self) private var session
    @State private var selectedTab: Tab = .home

    private var canSubmit: Bool {
        ["medical_inquiry", "product_complaint", "other_inquiry"].contains(where: session.canSee)
    }

    var body: some View {
        TabView(selection: $selectedTab) {
            HomeView(selectedTab: $selectedTab)
                .tabItem { Label("Home", systemImage: "house.fill") }
                .tag(Tab.home)

            BrowseView()
                .tabItem { Label("Browse", systemImage: "square.grid.2x2.fill") }
                .tag(Tab.browse)

            if canSubmit {
                SubmitView()
                    .tabItem { Label("Submit", systemImage: "paperplane.fill") }
                    .tag(Tab.submit)
            }

            SearchView()
                .tabItem { Label("Search", systemImage: "magnifyingglass") }
                .tag(Tab.search)

            AccountView()
                .tabItem { Label("Account", systemImage: "person.crop.circle") }
                .tag(Tab.account)
        }
    }
}

// MARK: - Browse hub

/// Content areas in one grid, mirroring the web's nav dropdowns. Every row is
/// feature-gated; safety and FAQ are always-on, matching the web (no feature key).
struct BrowseView: View {
    @Environment(Session.self) private var session

    var body: some View {
        NavigationStack {
            List {
                Section("Content") {
                    if session.canSee("document_library") {
                        NavigationLink { DocumentListView(embedded: true) } label: {
                            Label("Documents", systemImage: "doc.text.fill")
                        }
                    }
                    if session.canSee("news_announcements") {
                        NavigationLink { NewsListView(embedded: true) } label: {
                            Label("News", systemImage: "newspaper.fill")
                        }
                    }
                    NavigationLink { SafetyView() } label: {
                        Label("Safety Alerts", systemImage: "shield.lefthalf.filled")
                    }
                    if session.canSee("drug_info") {
                        NavigationLink { DrugInfoView() } label: {
                            Label("Drug Information", systemImage: "pills.fill")
                        }
                    }
                    if session.canSee("therapeutic_areas") {
                        NavigationLink { TherapeuticAreasView() } label: {
                            Label("Therapeutic Areas", systemImage: "cross.case.fill")
                        }
                    }
                    if session.canSee("resources") {
                        NavigationLink { ResourcesView() } label: {
                            Label("Resources", systemImage: "folder.fill")
                        }
                    }
                    if session.canSee("events") {
                        NavigationLink { EventsView() } label: {
                            Label("Events", systemImage: "calendar")
                        }
                    }
                }

                Section("Support") {
                    if session.canSee("find_msl") {
                        NavigationLink { FindMSLView() } label: {
                            Label("Find an MSL", systemImage: "person.2.fill")
                        }
                    }
                    if session.canSee("chatbox") {
                        NavigationLink { ChatView() } label: {
                            Label("Medical Assistant", systemImage: "bubble.left.and.text.bubble.right.fill")
                        }
                    }
                    NavigationLink { FAQView() } label: {
                        Label("FAQ", systemImage: "questionmark.circle.fill")
                    }
                    NavigationLink { ContactView() } label: {
                        Label("Contact Us", systemImage: "envelope.fill")
                    }
                }
            }
            .navigationTitle("Browse")
        }
    }
}

// MARK: - Account

struct AccountView: View {
    @Environment(Session.self) private var session
    @State private var showFeedback = false

    var body: some View {
        NavigationStack {
            List {
                if let user = session.user {
                    Section {
                        HStack(spacing: 14) {
                            Circle()
                                .fill(Theme.brand.opacity(0.15))
                                .frame(width: 46, height: 46)
                                .overlay {
                                    Text(String(user.firstName.prefix(1)) + String(user.lastName.prefix(1)))
                                        .font(.headline)
                                        .foregroundStyle(Theme.brand)
                                }
                            VStack(alignment: .leading, spacing: 2) {
                                Text(user.displayName).font(.headline)
                                Text(user.email).font(.caption).foregroundStyle(.secondary)
                            }
                        }
                        .padding(.vertical, 4)
                    }
                }

                Section("Your account") {
                    NavigationLink { NotificationsView() } label: {
                        Label("Notifications", systemImage: "bell.fill")
                    }
                    NavigationLink { ProfileView() } label: {
                        Label("Profile", systemImage: "person.fill")
                    }
                    NavigationLink { MySubmissionsView() } label: {
                        Label("My Submissions", systemImage: "tray.full.fill")
                    }
                    NavigationLink { SavedItemsView() } label: {
                        Label("Saved", systemImage: "bookmark.fill")
                    }
                    NavigationLink { MyActivityView() } label: {
                        Label("My Activity", systemImage: "chart.bar.fill")
                    }
                    NavigationLink { PreferencesView() } label: {
                        Label("Preferences", systemImage: "bell.badge.fill")
                    }
                }

                Section {
                    Button {
                        showFeedback = true
                    } label: {
                        Label("Give Feedback", systemImage: "star.fill")
                            .foregroundStyle(Theme.brand)
                    }
                }

                if let config = session.config {
                    Section("Portal") {
                        LabeledContent("Client", value: config.client.name)
                        if let compliance = config.compliance {
                            LabeledContent("Consent version", value: compliance.version)
                        }
                    }
                }

                Section {
                    Button("Sign Out", role: .destructive) {
                        Task { await session.signOut() }
                    }
                }
            }
            .navigationTitle("Account")
            .sheet(isPresented: $showFeedback) {
                FeedbackSheet()
                    .presentationDetents([.medium])
            }
        }
    }
}

// MARK: - Feedback

struct FeedbackSheet: View {
    @Environment(Session.self) private var session
    @Environment(\.dismiss) private var dismiss

    @State private var rating = 0
    @State private var comment = ""
    @State private var isSending = false
    @State private var sendError: String?

    var body: some View {
        NavigationStack {
            Form {
                Section("How is the app working for you?") {
                    HStack(spacing: 8) {
                        ForEach(1...5, id: \.self) { star in
                            Button {
                                rating = star
                            } label: {
                                Image(systemName: star <= rating ? "star.fill" : "star")
                                    .font(.title2)
                                    .foregroundStyle(Theme.brand)
                            }
                            .buttonStyle(.plain)
                        }
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 6)
                }
                Section {
                    TextEditor(text: $comment)
                        .frame(minHeight: 90)
                } header: {
                    Text("Anything to add?")
                }
                if let sendError {
                    Section { Text(sendError).font(.caption).foregroundStyle(.red) }
                }
            }
            .navigationTitle("Feedback")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(isSending ? "Sending…" : "Send") {
                        Task { await send() }
                    }
                    .disabled(rating == 0 || isSending)
                }
            }
        }
    }

    private func send() async {
        isSending = true
        sendError = nil
        defer { isSending = false }
        do {
            try await PortalAPI.shared.sendFeedback(
                rating: rating, comment: comment, screen: "ios-app",
                clientCode: session.clientCode
            )
            dismiss()
        } catch {
            sendError = error.localizedDescription
        }
    }
}
