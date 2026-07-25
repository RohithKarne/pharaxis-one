//
//  ConsentGateView.swift
//  CP-Portal
//

import SwiftUI

/// Blocks entry until the current consent version is answered. Sits ahead of sign-in
/// because the notice governs the whole portal, not just the authenticated part.
struct ConsentGateView: View {
    @Environment(Session.self) private var session
    let notice: ConsentNotice

    var body: some View {
        VStack(spacing: 0) {
            Spacer()

            VStack(alignment: .leading, spacing: 16) {
                Image(systemName: "hand.raised.fill")
                    .font(.largeTitle)
                    .foregroundStyle(Theme.brand)

                Text("Your privacy")
                    .font(.title2.weight(.semibold))

                Text("We use necessary cookies to run this portal. With your permission we also use analytics to understand how it is used.")
                    .font(.callout)
                    .foregroundStyle(.secondary)

                if let jurisdictions = notice.jurisdictions, !jurisdictions.isEmpty {
                    Text("Applies under \(jurisdictions.map { $0.uppercased() }.joined(separator: ", "))")
                        .font(.caption)
                        .foregroundStyle(.tertiary)
                }

                VStack(spacing: 10) {
                    Button {
                        Task { await session.acceptConsent(notice, acceptAll: true) }
                    } label: {
                        Text("Accept All")
                            .fontWeight(.semibold)
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(Theme.brand)

                    Button {
                        Task { await session.acceptConsent(notice, acceptAll: false) }
                    } label: {
                        Text("Necessary Only")
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.bordered)
                }
                .disabled(session.isWorking)
                .padding(.top, 4)
            }
            .padding(24)
            .background(.background, in: .rect(cornerRadius: 20))
            .padding(.horizontal, 20)

            Spacer()
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color(.secondarySystemBackground))
    }
}
