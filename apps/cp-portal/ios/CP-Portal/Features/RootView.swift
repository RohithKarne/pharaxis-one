//
//  RootView.swift
//  CP-Portal
//

import SwiftUI

/// Drives the entry sequence: config → consent → sign-in → role gate → portal.
struct RootView: View {
    @Environment(Session.self) private var session

    var body: some View {
        switch session.phase {
        case .loading:
            ProgressView()
                .task { await session.start() }

        case .unavailable(let message):
            ContentUnavailableView {
                Label("Portal unavailable", systemImage: "wifi.exclamationmark")
            } description: {
                Text(message)
            } actions: {
                Button("Try Again") { Task { await session.start() } }
            }

        case .needsConsent(let notice):
            ConsentGateView(notice: notice)

        case .signedOut:
            LoginView()

        case .needsUserType:
            if let gate = session.config?.gate {
                UserTypeGateView(gate: gate)
            } else {
                // Config said a gate was required but none came back — fail open to
                // the portal rather than trapping the user on a screen we cannot draw.
                MainTabView()
            }

        case .ready:
            MainTabView()
        }
    }
}
