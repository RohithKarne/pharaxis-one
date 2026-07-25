//
//  CP_PortalApp.swift
//  CP-Portal
//
//  Created by Rohith Karne on 23/07/26.
//

import SwiftUI

@main
struct CP_PortalApp: App {
    @State private var session = Session()

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(session)
                .tint(Theme.brand)
        }
    }
}
