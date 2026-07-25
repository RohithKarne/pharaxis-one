//
//  ContentViews.swift
//  CP-Portal
//
//  The content browse screens. All ride on LoadableList, so each is little more
//  than its row and detail layout.
//

import SwiftUI

// MARK: - Safety alerts

struct SafetyView: View {
    @Environment(Session.self) private var session
    @State private var showResolved = false

    var body: some View {
        NavigationStack {
            LoadableList(
                title: "Safety alerts",
                emptyIcon: "shield",
                emptyText: "No safety alerts",
                load: { try await PortalAPI.shared.safetyAlerts(clientCode: session.clientCode) }
            ) { alerts in
                List {
                    let active = alerts.filter { !$0.isResolved }
                    let resolved = alerts.filter(\.isResolved)

                    Section("Active") {
                        ForEach(active) { alert in
                            NavigationLink { SafetyDetailView(alert: alert) } label: { row(alert) }
                        }
                    }
                    if !resolved.isEmpty {
                        Section {
                            DisclosureGroup("Resolved (\(resolved.count))", isExpanded: $showResolved) {
                                ForEach(resolved) { alert in
                                    NavigationLink { SafetyDetailView(alert: alert) } label: { row(alert) }
                                }
                            }
                        }
                    }
                }
                .listStyle(.insetGrouped)
            }
            .navigationTitle("Safety")
        }
    }

    private func row(_ alert: SafetyAlert) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(alert.title).lineLimit(2)
            HStack(spacing: 8) {
                SeverityBadge(severity: alert.severity)
                if let product = alert.productName, !product.isEmpty {
                    Text(product).font(.caption).foregroundStyle(.secondary)
                }
            }
        }
        .padding(.vertical, 2)
    }
}

struct SafetyDetailView: View {
    @Environment(Session.self) private var session
    let alert: SafetyAlert

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                Text(alert.title).font(.title3.weight(.semibold))
                HStack(spacing: 8) {
                    SeverityBadge(severity: alert.severity)
                    if let ref = alert.refNumber { Text(ref).font(.caption.monospaced()).foregroundStyle(.secondary) }
                    if let date = alert.effectiveDate {
                        Text(date.formatted(date: .abbreviated, time: .omitted))
                            .font(.caption).foregroundStyle(.secondary)
                    }
                }
                Divider()
                if let html = alert.bodyHtml { HTMLText(html: html) }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(20)
        }
        .navigationTitle("Safety Alert")
        .navigationBarTitleDisplayMode(.inline)
        .onAppear {
            // Feeds "top safety alerts by views" in the admin analytics dashboard.
            PortalAPI.shared.recordSafetyAlertView(
                alertID: alert.id, clientCode: session.clientCode
            )
        }
    }
}

// MARK: - Drug information

struct DrugInfoView: View {
    @Environment(Session.self) private var session
    @State private var query = ""

    var body: some View {
        NavigationStack {
            LoadableList(
                title: "Products",
                emptyIcon: "pills",
                emptyText: "No products published",
                load: { try await PortalAPI.shared.drugs(clientCode: session.clientCode) }
            ) { drugs in
                List(filtered(drugs)) { drug in
                    NavigationLink { DrugDetailView(drug: drug) } label: {
                        VStack(alignment: .leading, spacing: 3) {
                            Text(drug.displayName)
                            if let generic = drug.genericName, drug.brandName != nil {
                                Text(generic).font(.caption).foregroundStyle(.secondary)
                            }
                        }
                        .padding(.vertical, 2)
                    }
                }
                .listStyle(.insetGrouped)
                .searchable(text: $query, prompt: "Brand or generic name")
                .overlay {
                    if filtered(drugs).isEmpty { ContentUnavailableView.search(text: query) }
                }
            }
            .navigationTitle("Drug Information")
        }
    }

    private func filtered(_ drugs: [Drug]) -> [Drug] {
        let trimmed = query.trimmingCharacters(in: .whitespaces)
        guard !trimmed.isEmpty else { return drugs }
        return drugs.filter {
            ($0.brandName?.localizedCaseInsensitiveContains(trimmed) ?? false)
                || ($0.genericName?.localizedCaseInsensitiveContains(trimmed) ?? false)
        }
    }
}

struct DrugDetailView: View {
    let drug: Drug

    var body: some View {
        List {
            Section {
                VStack(alignment: .leading, spacing: 4) {
                    Text(drug.displayName).font(.title3.weight(.semibold))
                    if let generic = drug.genericName { Text(generic).foregroundStyle(.secondary) }
                }
                .padding(.vertical, 4)
            }
            infoSection("Indication", drug.indication)
            infoSection("Dosage", drug.dosageInfo)
            infoSection("Contraindications", drug.contraindications)
            infoSection("Side Effects", drug.sideEffects)
            infoSection("Storage", drug.storageConditions)
            if let urlString = drug.prescribingInfoUrl, let url = URL(string: urlString) {
                Section {
                    Link(destination: url) {
                        Label("Full Prescribing Information", systemImage: "arrow.up.right.square")
                    }
                }
            }
        }
        .navigationTitle("Product")
        .navigationBarTitleDisplayMode(.inline)
    }

    @ViewBuilder
    private func infoSection(_ title: String, _ text: String?) -> some View {
        if let text, !text.isEmpty {
            Section(title) { Text(text).font(.callout) }
        }
    }
}

// MARK: - Therapeutic areas (with follows)

struct TherapeuticAreasView: View {
    @Environment(Session.self) private var session
    @State private var followedIDs: Set<Int> = []

    var body: some View {
        NavigationStack {
            LoadableList(
                title: "Therapeutic areas",
                emptyIcon: "cross.case",
                emptyText: "No therapeutic areas published",
                load: {
                    // Follows load alongside the areas; a failure degrades quietly.
                    if session.user != nil {
                        let follows = (try? await PortalAPI.shared.follows(clientCode: session.clientCode)) ?? []
                        followedIDs = Set(follows.map(\.itemId))
                    }
                    return try await PortalAPI.shared.therapeuticAreas(clientCode: session.clientCode)
                }
            ) { areas in
                List(areas) { area in
                    NavigationLink {
                        TherapeuticAreaDetailView(area: area, followedIDs: $followedIDs)
                    } label: {
                        HStack {
                            VStack(alignment: .leading, spacing: 3) {
                                Text(area.name)
                                if let description = area.description, !description.isEmpty {
                                    Text(description).font(.caption).foregroundStyle(.secondary).lineLimit(2)
                                }
                            }
                            Spacer(minLength: 4)
                            if followedIDs.contains(area.id) {
                                Image(systemName: "star.fill").font(.footnote).foregroundStyle(Theme.brand)
                            }
                        }
                        .padding(.vertical, 2)
                    }
                }
                .listStyle(.insetGrouped)
            }
            .navigationTitle("Therapeutic Areas")
        }
    }
}

struct TherapeuticAreaDetailView: View {
    @Environment(Session.self) private var session
    let area: TherapeuticArea
    @Binding var followedIDs: Set<Int>

    @State private var drugs: [Drug] = []
    @State private var followError: String?

    private var isFollowing: Bool { followedIDs.contains(area.id) }

    var body: some View {
        List {
            Section {
                VStack(alignment: .leading, spacing: 6) {
                    Text(area.name).font(.title3.weight(.semibold))
                    if let overview = area.overview, !overview.isEmpty {
                        Text(overview).font(.callout).foregroundStyle(.secondary)
                    }
                }
                .padding(.vertical, 4)
            }

            if session.user != nil {
                Section {
                    Button {
                        Task { await toggleFollow() }
                    } label: {
                        Label(isFollowing ? "Following" : "Follow this area",
                              systemImage: isFollowing ? "star.fill" : "star")
                            .foregroundStyle(Theme.brand)
                    }
                    if let followError {
                        Text(followError).font(.caption).foregroundStyle(.red)
                    }
                } footer: {
                    Text("Followed areas shape the recommendations on your home screen.")
                }
            }

            if !drugs.isEmpty {
                Section("Products") {
                    ForEach(drugs) { drug in
                        NavigationLink { DrugDetailView(drug: drug) } label: {
                            Text(drug.displayName)
                        }
                    }
                }
            }
        }
        .navigationTitle("Therapeutic Area")
        .navigationBarTitleDisplayMode(.inline)
        .task {
            drugs = (try? await PortalAPI.shared.drugs(
                clientCode: session.clientCode, therapeuticAreaID: area.id
            )) ?? []
        }
    }

    private func toggleFollow() async {
        let target = !isFollowing
        followError = nil
        // Optimistic, with rollback — same pattern as document saves.
        if target { followedIDs.insert(area.id) } else { followedIDs.remove(area.id) }
        do {
            try await PortalAPI.shared.setFollowing(
                target, therapeuticAreaID: area.id, clientCode: session.clientCode
            )
        } catch {
            if target { followedIDs.remove(area.id) } else { followedIDs.insert(area.id) }
            followError = error.localizedDescription
        }
    }
}

// MARK: - Events

struct EventsView: View {
    @Environment(Session.self) private var session
    @State private var tab = 0

    var body: some View {
        NavigationStack {
            LoadableList(
                title: "Events",
                emptyIcon: "calendar",
                emptyText: "No events scheduled",
                load: { try await PortalAPI.shared.events(clientCode: session.clientCode) }
            ) { events in
                VStack(spacing: 0) {
                    Picker("", selection: $tab) {
                        Text("Upcoming").tag(0)
                        Text("Past").tag(1)
                    }
                    .pickerStyle(.segmented)
                    .padding(.horizontal, 16)
                    .padding(.top, 8)

                    let shown = events.filter { tab == 0 ? !$0.isPast : $0.isPast }
                    if shown.isEmpty {
                        ContentUnavailableView(
                            tab == 0 ? "No upcoming events" : "No past events",
                            systemImage: "calendar"
                        )
                    } else {
                        List(shown) { event in row(event) }
                            .listStyle(.insetGrouped)
                    }
                }
            }
            .navigationTitle("Events")
        }
    }

    private func row(_ event: PortalEvent) -> some View {
        VStack(alignment: .leading, spacing: 5) {
            HStack(spacing: 6) {
                if event.featured {
                    Image(systemName: "star.fill").font(.caption2).foregroundStyle(Theme.brand)
                }
                Text(event.title).lineLimit(2)
            }
            if let start = event.startDate {
                Text(start.formatted(date: .abbreviated, time: .shortened))
                    .font(.caption).foregroundStyle(Theme.brand)
            }
            if let location = event.location {
                Text(location).font(.caption).foregroundStyle(.secondary)
            }
            if let urlString = event.registrationUrl, let url = URL(string: urlString) {
                Link("Register", destination: url)
                    .font(.caption.weight(.semibold))
            }
        }
        .padding(.vertical, 3)
    }
}

// MARK: - Resources

struct ResourcesView: View {
    @Environment(Session.self) private var session

    var body: some View {
        NavigationStack {
            LoadableList(
                title: "Resources",
                emptyIcon: "folder",
                emptyText: "No resources published",
                load: { try await PortalAPI.shared.resources(clientCode: session.clientCode) }
            ) { resources in
                List {
                    let grouped = Dictionary(grouping: resources) { $0.category ?? "General" }
                    ForEach(grouped.keys.sorted(), id: \.self) { category in
                        Section(category) {
                            ForEach(grouped[category] ?? []) { resource in
                                row(resource)
                            }
                        }
                    }
                }
                .listStyle(.insetGrouped)
            }
            .navigationTitle("Resources")
        }
    }

    @ViewBuilder
    private func row(_ resource: PortalResource) -> some View {
        let destination = resource.url ?? resource.filePath.map { PortalAPI.shared.absoluteURL($0) }
        if let destination, let url = URL(string: destination) {
            Link(destination: url) {
                VStack(alignment: .leading, spacing: 3) {
                    Text(resource.title).foregroundStyle(.primary)
                    if let description = resource.description, !description.isEmpty {
                        Text(description).font(.caption).foregroundStyle(.secondary).lineLimit(2)
                    }
                }
                .padding(.vertical, 2)
            }
        } else {
            Text(resource.title)
        }
    }
}

// MARK: - FAQ

struct FAQView: View {
    @Environment(Session.self) private var session
    @State private var expandedID: Int?

    var body: some View {
        NavigationStack {
            LoadableList(
                title: "FAQ",
                emptyIcon: "questionmark.circle",
                emptyText: "No questions published",
                load: { try await PortalAPI.shared.faqs(clientCode: session.clientCode) }
            ) { faqs in
                List {
                    let grouped = Dictionary(grouping: faqs) { $0.category ?? "General" }
                    ForEach(grouped.keys.sorted(), id: \.self) { category in
                        Section(category) {
                            ForEach(grouped[category] ?? []) { faq in
                                DisclosureGroup(
                                    isExpanded: Binding(
                                        get: { expandedID == faq.id },
                                        set: { expandedID = $0 ? faq.id : nil }
                                    )
                                ) {
                                    Text(faq.answer ?? "")
                                        .font(.callout)
                                        .foregroundStyle(.secondary)
                                } label: {
                                    Text(faq.question).font(.callout)
                                }
                            }
                        }
                    }
                }
                .listStyle(.insetGrouped)
            }
            .navigationTitle("FAQ")
        }
    }
}
