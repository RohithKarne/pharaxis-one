//
//  PortalConfig.swift
//  CP-Portal
//
//  Models for GET /api/portal/config/:clientCode — the single source of truth for
//  what this client's portal contains. Every screen reads from here rather than
//  hardcoding features, so toggling a feature in the web admin changes the app
//  with no redeploy and no separate iOS admin.
//

import Foundation

struct PortalConfig: Decodable {
    let client: Client
    let branding: Branding?
    /// Raw `feature_key -> enabled` map straight from `cp_features`.
    let features: [String: Bool]
    let gate: Gate?
    let hasActiveSafetyAlert: Bool
    let compliance: Compliance?

    enum CodingKeys: String, CodingKey {
        case client, branding, features, gate, compliance
        case hasActiveSafetyAlert = "has_active_safety_alert"
    }

    struct Client: Decodable {
        let name: String
        let code: String
    }

    struct Branding: Decodable {
        let primaryColor: String?
        let tagline: String?

        enum CodingKeys: String, CodingKey {
            case primaryColor = "primary_color"
            case tagline
        }
    }

    /// The HCP gate. `accessMap` is `feature_key -> user_type -> allowed`, so what a
    /// user may open depends on the type they confirmed.
    struct Gate: Decodable {
        let title: String?
        let subtitle: String?
        let disclaimerText: String?
        let requireDisclaimer: Bool
        let userTypes: [UserType]
        let accessMap: [String: [String: Bool]]?

        enum CodingKeys: String, CodingKey {
            case title = "gate_title"
            case subtitle = "gate_subtitle"
            case disclaimerText = "disclaimer_text"
            case requireDisclaimer = "require_disclaimer"
            case userTypes, accessMap
        }
    }

    struct UserType: Decodable, Identifiable {
        let key: String
        let label: String
        let description: String?

        var id: String { key }

        enum CodingKeys: String, CodingKey {
            case key = "type_key"
            case label, description
        }
    }

    struct Compliance: Decodable {
        let jurisdictions: [String]
        let version: String
        let requireReconsent: Bool

        enum CodingKeys: String, CodingKey {
            case jurisdictions, version
            case requireReconsent = "require_reconsent"
        }
    }

    // MARK: Lookups

    func isEnabled(_ featureKey: String) -> Bool { features[featureKey] == true }

    /// Whether `userType` may open `featureKey`. An absent entry means unrestricted —
    /// matching the backend, where an empty visibility list means visible to all.
    func allows(_ featureKey: String, for userType: String?) -> Bool {
        guard isEnabled(featureKey) else { return false }
        guard let accessMap = gate?.accessMap?[featureKey], let userType else { return true }
        return accessMap[userType] ?? true
    }
}
