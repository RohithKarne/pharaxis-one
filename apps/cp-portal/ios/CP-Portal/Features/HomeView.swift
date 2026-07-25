//
//  HomeView.swift
//  CP-Portal
//

import SwiftUI

/// The portal landing screen. Everything on it is driven by the client config, so a
/// feature switched off in the web admin simply stops appearing here.
struct HomeView: View {
    @Environment(Session.self) private var session
    @Binding var selectedTab: MainTabView.Tab
    @State private var showSpecialtyPrompt = false

    private var config: PortalConfig? { session.config }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    if config?.hasActiveSafetyAlert == true {
                        safetyBanner
                    }

                    greeting

                    if !quickLinks.isEmpty {
                        VStack(alignment: .leading, spacing: 10) {
                            Text("Quick links")
                                .font(.headline)
                            ForEach(quickLinks, id: \.tab) { link in
                                Button {
                                    selectedTab = link.tab
                                } label: {
                                    HStack(spacing: 12) {
                                        Image(systemName: link.icon)
                                            .foregroundStyle(Theme.brand)
                                            .frame(width: 24)
                                        Text(link.title)
                                            .foregroundStyle(.primary)
                                        Spacer()
                                        Image(systemName: "chevron.right")
                                            .font(.caption)
                                            .foregroundStyle(.tertiary)
                                    }
                                    .padding(14)
                                    .background(Color(.secondarySystemBackground), in: .rect(cornerRadius: 12))
                                }
                                .buttonStyle(.plain)
                            }
                        }
                    }

                    assurances
                }
                .padding(20)
            }
            .navigationTitle(config?.client.name ?? "Portal")
            .onAppear {
                if session.shouldPromptSpecialty { showSpecialtyPrompt = true }
            }
            .sheet(isPresented: $showSpecialtyPrompt) {
                SpecialtyPromptView()
                    .presentationDetents([.medium, .large])
            }
        }
    }

    private var greeting: some View {
        VStack(alignment: .leading, spacing: 4) {
            if let user = session.user {
                Text("Welcome, \(user.firstName)")
                    .font(.title2.weight(.semibold))
            }
            if let tagline = config?.branding?.tagline, !tagline.isEmpty {
                Text(tagline)
                    .font(.callout)
                    .foregroundStyle(Theme.brand)
            }
        }
    }

    private var safetyBanner: some View {
        HStack(alignment: .top, spacing: 10) {
            Image(systemName: "exclamationmark.shield.fill")
                .foregroundStyle(.red)
            VStack(alignment: .leading, spacing: 2) {
                Text("Important Safety Information")
                    .font(.subheadline.weight(.semibold))
                Text("Review current safety alerts and prescribing information.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            Spacer(minLength: 0)
        }
        .padding(14)
        .background(Color.red.opacity(0.08), in: .rect(cornerRadius: 12))
    }

    private var assurances: some View {
        VStack(alignment: .leading, spacing: 12) {
            assurance("checkmark.seal.fill", "Reviewed and approved",
                      "Every document and answer is vetted by the medical affairs team.")
            assurance("person.2.fill", "Relevant to your practice",
                      "Content is tailored to your confirmed role.")
        }
        .padding(.top, 4)
    }

    private func assurance(_ icon: String, _ title: String, _ body: String) -> some View {
        HStack(alignment: .top, spacing: 12) {
            Image(systemName: icon)
                .foregroundStyle(Theme.brand)
                .frame(width: 24)
            VStack(alignment: .leading, spacing: 2) {
                Text(title).font(.subheadline.weight(.medium))
                Text(body).font(.caption).foregroundStyle(.secondary)
            }
        }
    }

    private var quickLinks: [(tab: MainTabView.Tab, title: String, icon: String)] {
        var links: [(MainTabView.Tab, String, String)] = []
        if session.canSee("document_library") || session.canSee("news_announcements") {
            links.append((.browse, "Browse the library", "square.grid.2x2.fill"))
        }
        if ["medical_inquiry", "product_complaint", "other_inquiry"].contains(where: session.canSee) {
            links.append((.submit, "Submit a request", "paperplane.fill"))
        }
        return links
    }
}
