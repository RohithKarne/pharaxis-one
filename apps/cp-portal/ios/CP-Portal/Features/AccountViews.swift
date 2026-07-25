//
//  AccountViews.swift
//  CP-Portal
//
//  The signed-in account area: profile, submissions, saved items, activity,
//  and notification preferences.
//

import SwiftUI

// MARK: - Profile

struct ProfileView: View {
    @Environment(Session.self) private var session

    // Mirrors the fixed specialty list the web profile offers.
    private static let specialties = [
        "Cardiology", "Oncology", "Neurology", "Endocrinology", "Immunology",
        "Rheumatology", "Dermatology", "Gastroenterology", "Respiratory",
        "Nephrology", "Hematology", "Infectious Disease", "General Practice",
        "Pharmacist", "Nurse", "Other",
    ]

    @State private var firstName = ""
    @State private var lastName = ""
    @State private var country = ""
    @State private var specialty = ""
    @State private var saveMessage: String?
    @State private var saveFailed = false
    @State private var isSaving = false

    @State private var currentPassword = ""
    @State private var newPassword = ""
    @State private var confirmPassword = ""
    @State private var passwordMessage: String?
    @State private var passwordFailed = false
    @State private var isChangingPassword = false

    var body: some View {
        Form {
            Section("Profile") {
                TextField("First name", text: $firstName)
                TextField("Last name", text: $lastName)
                TextField("Country", text: $country)
                Picker("Specialty", selection: $specialty) {
                    Text("Not set").tag("")
                    ForEach(Self.specialties, id: \.self) { Text($0).tag($0) }
                }
                LabeledContent("Email", value: session.user?.email ?? "")
            }

            Section {
                Button(isSaving ? "Saving…" : "Save Profile") {
                    Task { await saveProfile() }
                }
                .disabled(isSaving)
                if let saveMessage {
                    Text(saveMessage)
                        .font(.caption)
                        .foregroundStyle(saveFailed ? .red : Theme.brand)
                }
            }

            Section("Change password") {
                SecureField("Current password", text: $currentPassword)
                SecureField("New password (min 8 characters)", text: $newPassword)
                SecureField("Confirm new password", text: $confirmPassword)
                Button(isChangingPassword ? "Updating…" : "Update Password") {
                    Task { await changePassword() }
                }
                .disabled(isChangingPassword || currentPassword.isEmpty || newPassword.isEmpty)
                if let passwordMessage {
                    Text(passwordMessage)
                        .font(.caption)
                        .foregroundStyle(passwordFailed ? .red : Theme.brand)
                }
            }
        }
        .navigationTitle("Profile")
        .onAppear {
            let user = session.user
            firstName = user?.firstName ?? ""
            lastName = user?.lastName ?? ""
            country = user?.country ?? ""
            specialty = user?.specialty ?? ""
        }
    }

    private func saveProfile() async {
        isSaving = true
        saveMessage = nil
        defer { isSaving = false }
        do {
            let updated = try await PortalAPI.shared.updateProfile(
                firstName: firstName, lastName: lastName,
                country: country.isEmpty ? nil : country,
                specialty: specialty.isEmpty ? nil : specialty
            )
            session.userDidUpdate(updated)
            saveFailed = false
            saveMessage = "Profile updated."
        } catch {
            saveFailed = true
            saveMessage = error.localizedDescription
        }
    }

    private func changePassword() async {
        guard newPassword == confirmPassword else {
            passwordFailed = true
            passwordMessage = "New passwords do not match."
            return
        }
        guard newPassword.count >= 8 else {
            passwordFailed = true
            passwordMessage = "New password must be at least 8 characters."
            return
        }
        isChangingPassword = true
        passwordMessage = nil
        defer { isChangingPassword = false }
        do {
            try await PortalAPI.shared.changePassword(current: currentPassword, new: newPassword)
            // The backend bumps token_version on password change, which revokes the
            // current cookie. Treat it as an ordinary sign-out rather than letting the
            // next request fail confusingly.
            passwordFailed = false
            passwordMessage = "Password updated. Please sign in again."
            try? await Task.sleep(for: .seconds(1.5))
            await session.signOut()
        } catch {
            passwordFailed = true
            passwordMessage = error.localizedDescription
        }
    }
}

// MARK: - My submissions

struct MySubmissionsView: View {
    @Environment(Session.self) private var session

    var body: some View {
        LoadableList(
            title: "Submissions",
            emptyIcon: "tray",
            emptyText: "No submissions yet",
            load: { try await PortalAPI.shared.submissions() }
        ) { submissions in
            List {
                ForEach(submissions) { submission in
                    VStack(alignment: .leading, spacing: 4) {
                        HStack {
                            Text(submission.reference).font(.callout.monospaced().weight(.semibold))
                            Spacer()
                            statusBadge(submission.status)
                        }
                        Text(submission.typeLabel).font(.caption).foregroundStyle(.secondary)
                        if let date = submission.submittedAt {
                            Text(date.formatted(date: .abbreviated, time: .shortened))
                                .font(.caption2).foregroundStyle(.tertiary)
                        }
                    }
                    .padding(.vertical, 3)
                }

                Section {
                    ShareLink(item: csv(submissions)) {
                        Label("Export Summary", systemImage: "square.and.arrow.up")
                    }
                }
            }
            .listStyle(.insetGrouped)
        }
        .navigationTitle("My Submissions")
    }

    private func statusBadge(_ status: String) -> some View {
        let color: Color = switch status {
        case "closed": .secondary
        case "synced": Theme.brand
        default: .orange
        }
        return Text(status.capitalized)
            .font(.caption2.weight(.semibold))
            .padding(.horizontal, 7).padding(.vertical, 2.5)
            .background(color.opacity(0.14), in: .capsule)
            .foregroundStyle(color)
    }

    private func csv(_ submissions: [Submission]) -> String {
        var lines = ["Reference,Type,Status,Submitted"]
        for s in submissions {
            let date = s.submittedAt?.formatted(.iso8601) ?? ""
            lines.append("\(s.reference),\(s.typeLabel),\(s.status),\(date)")
        }
        return lines.joined(separator: "\n")
    }
}

// MARK: - Saved items

struct SavedItemsView: View {
    @Environment(Session.self) private var session
    @State private var entries: [SavedEntry] = []
    @State private var hasLoaded = false
    @State private var loadError: String?

    var body: some View {
        Group {
            if !hasLoaded {
                ProgressView()
            } else if let loadError, entries.isEmpty {
                ContentUnavailableView {
                    Label("Couldn't load saved items", systemImage: "exclamationmark.triangle")
                } description: { Text(loadError) } actions: {
                    Button("Try Again") { Task { await load() } }
                }
            } else if entries.isEmpty {
                ContentUnavailableView(
                    "Nothing saved yet",
                    systemImage: "bookmark",
                    description: Text("Bookmark news and documents to find them here.")
                )
            } else {
                List {
                    ForEach(entries) { entry in
                        HStack(spacing: 12) {
                            Image(systemName: entry.itemType == "news" ? "newspaper" : "doc.text")
                                .foregroundStyle(Theme.brand)
                            VStack(alignment: .leading, spacing: 2) {
                                Text(entry.detail?.title ?? entry.detail?.category ?? "Untitled")
                                    .lineLimit(2)
                                Text(entry.typeLabel).font(.caption).foregroundStyle(.secondary)
                            }
                        }
                        .padding(.vertical, 2)
                        .swipeActions {
                            Button("Remove", role: .destructive) {
                                Task { await unsave(entry) }
                            }
                        }
                    }
                }
                .listStyle(.insetGrouped)
                .refreshable { await load() }
            }
        }
        .navigationTitle("Saved")
        .task {
            guard !hasLoaded else { return }
            await load()
        }
    }

    private func load() async {
        loadError = nil
        do {
            entries = try await PortalAPI.shared.savedEntries(clientCode: session.clientCode)
        } catch {
            loadError = error.localizedDescription
        }
        hasLoaded = true
    }

    private func unsave(_ entry: SavedEntry) async {
        let removed = entries
        entries.removeAll { $0.id == entry.id }
        do {
            try await PortalAPI.shared.setSaved(
                false, documentID: entry.itemId, clientCode: session.clientCode,
                itemType: entry.itemType
            )
        } catch {
            entries = removed
        }
    }
}

// MARK: - Activity

struct MyActivityView: View {
    @Environment(Session.self) private var session
    @State private var summary: ActivitySummary?
    @State private var loadError: String?

    var body: some View {
        Group {
            if let summary {
                List {
                    Section("Overview") {
                        LabeledContent("Submissions", value: "\(summary.submissions.total)")
                        LabeledContent("Saved items", value: "\(summary.saved)")
                        LabeledContent("Following", value: "\(summary.following)")
                    }
                    if !summary.submissions.byStatus.isEmpty {
                        Section("Submissions by status") {
                            ForEach(summary.submissions.byStatus, id: \.status) { row in
                                LabeledContent(row.status.capitalized, value: "\(row.c)")
                            }
                        }
                    }
                    Section("Account") {
                        if let since = summary.memberSince {
                            LabeledContent("Member since", value: since.formatted(date: .abbreviated, time: .omitted))
                        }
                        if let specialty = summary.specialty {
                            LabeledContent("Specialty", value: specialty)
                        }
                    }
                }
            } else if let loadError {
                ContentUnavailableView {
                    Label("Couldn't load activity", systemImage: "exclamationmark.triangle")
                } description: { Text(loadError) }
            } else {
                ProgressView()
            }
        }
        .navigationTitle("My Activity")
        .task {
            do {
                summary = try await PortalAPI.shared.activity(clientCode: session.clientCode)
            } catch {
                loadError = error.localizedDescription
            }
        }
    }
}

// MARK: - Preferences

struct PreferencesView: View {
    @State private var prefs: NotificationPrefs?
    @State private var message: String?
    @State private var failed = false

    var body: some View {
        Group {
            if var current = prefs {
                Form {
                    Section {
                        Toggle("News and announcements", isOn: binding(\.news))
                        Toggle("New documents", isOn: binding(\.documents))
                        Toggle("Safety alerts", isOn: binding(\.safety))
                    } footer: {
                        Text("Controls which notifications you receive in the app and by email.")
                    }
                    Section {
                        Toggle("Weekly digest email", isOn: binding(\.digest))
                    }
                    if let message {
                        Section {
                            Text(message).font(.caption)
                                .foregroundStyle(failed ? .red : Theme.brand)
                        }
                    }
                }
                .tint(Theme.brand)
            } else {
                ProgressView()
            }
        }
        .navigationTitle("Preferences")
        .task {
            prefs = try? await PortalAPI.shared.preferences()
        }
    }

    private func binding(_ keyPath: WritableKeyPath<NotificationPrefs, Bool>) -> Binding<Bool> {
        Binding(
            get: { prefs?[keyPath: keyPath] ?? false },
            set: { newValue in
                guard var updated = prefs else { return }
                updated[keyPath: keyPath] = newValue
                let previous = prefs
                prefs = updated
                message = nil
                Task {
                    do {
                        try await PortalAPI.shared.updatePreferences(updated)
                    } catch {
                        prefs = previous
                        failed = true
                        message = "Could not save that change."
                    }
                }
            }
        )
    }
}
