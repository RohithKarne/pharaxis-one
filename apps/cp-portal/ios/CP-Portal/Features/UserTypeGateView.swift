//
//  UserTypeGateView.swift
//  CP-Portal
//

import SwiftUI

/// The HCP gate. A one-time confirmation of who the user is, which the backend's
/// access map then uses to decide what they may open. Types come from the client's
/// configuration — never hardcoded — so each portal can define its own.
struct UserTypeGateView: View {
    @Environment(Session.self) private var session
    let gate: PortalConfig.Gate

    @State private var selected: String?
    @State private var disclaimerAccepted = false

    private var canContinue: Bool {
        selected != nil && (!gate.requireDisclaimer || disclaimerAccepted) && !session.isWorking
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    if let subtitle = gate.subtitle {
                        Text(subtitle)
                            .font(.callout)
                            .foregroundStyle(.secondary)
                    }

                    VStack(spacing: 10) {
                        ForEach(gate.userTypes) { type in
                            typeButton(type)
                        }
                    }

                    if gate.requireDisclaimer, let disclaimer = gate.disclaimerText {
                        Toggle(isOn: $disclaimerAccepted) {
                            Text(disclaimer)
                                .font(.footnote)
                                .foregroundStyle(.secondary)
                        }
                        .tint(Theme.brand)
                    }

                    if let errorMessage = session.errorMessage {
                        Label(errorMessage, systemImage: "exclamationmark.triangle.fill")
                            .font(.callout)
                            .foregroundStyle(.red)
                    }

                    Button {
                        guard let selected else { return }
                        Task { await session.confirmUserType(selected) }
                    } label: {
                        HStack {
                            Spacer()
                            if session.isWorking {
                                ProgressView().tint(.white)
                            } else {
                                Text("Continue").fontWeight(.semibold)
                            }
                            Spacer()
                        }
                        .padding(.vertical, 4)
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(Theme.brand)
                    .disabled(!canContinue)
                }
                .padding(20)
            }
            .navigationTitle(gate.title ?? "Confirm your role")
        }
    }

    private func typeButton(_ type: PortalConfig.UserType) -> some View {
        Button {
            selected = type.key
        } label: {
            HStack(alignment: .top, spacing: 12) {
                Image(systemName: selected == type.key ? "largecircle.fill.circle" : "circle")
                    .foregroundStyle(selected == type.key ? Theme.brand : .secondary)

                VStack(alignment: .leading, spacing: 2) {
                    Text(type.label)
                        .foregroundStyle(.primary)
                    if let description = type.description, !description.isEmpty {
                        Text(description)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }
                Spacer(minLength: 0)
            }
            .multilineTextAlignment(.leading)
            .padding(14)
            .background(
                RoundedRectangle(cornerRadius: 12)
                    .strokeBorder(selected == type.key ? Theme.brand : Color(.separator))
            )
        }
        .buttonStyle(.plain)
    }
}
