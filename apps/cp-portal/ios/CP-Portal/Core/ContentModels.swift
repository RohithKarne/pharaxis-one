//
//  ContentModels.swift
//  CP-Portal
//
//  Models for the portal's content and account endpoints. Field names mirror the
//  backend SELECTs; `tinyint(1)` columns arrive as 0/1 rather than JSON booleans,
//  so those are Int with a computed accessor.
//

import Foundation

struct SafetyAlert: Decodable, Identifiable {
    let id: Int
    let title: String
    let alertType: String?
    let severity: String?
    let productName: String?
    let refNumber: String?
    let bodyHtml: String?
    let effectiveDate: Date?
    let attachmentName: String?
    let status: String?
    let viewCount: Int?

    var isResolved: Bool { status == "resolved" }
}

struct FAQItem: Decodable, Identifiable {
    let id: Int
    let question: String
    let answer: String?
    let category: String?
}

struct PortalEvent: Decodable, Identifiable {
    let id: Int
    let title: String
    let description: String?
    let eventType: String?
    let venue: String?
    let city: String?
    let country: String?
    let startDate: Date?
    let endDate: Date?
    let registrationUrl: String?
    let isFeatured: Int?

    var featured: Bool { isFeatured == 1 }

    var location: String? {
        let parts = [venue, city, country].compactMap { $0 }.filter { !$0.isEmpty }
        return parts.isEmpty ? nil : parts.joined(separator: ", ")
    }

    /// An event counts as past once its end date — or start date, when there is no
    /// end — has gone by, matching the web portal's Upcoming/Past split.
    var isPast: Bool {
        guard let reference = endDate ?? startDate else { return false }
        return reference < Date()
    }
}

struct PortalResource: Decodable, Identifiable {
    let id: Int
    let title: String
    let description: String?
    let resourceType: String?
    let url: String?
    let filePath: String?
    let category: String?
}

struct Drug: Decodable, Identifiable {
    let id: Int
    let brandName: String?
    let genericName: String?
    let indication: String?
    let dosageInfo: String?
    let contraindications: String?
    let sideEffects: String?
    let prescribingInfoUrl: String?
    let storageConditions: String?
    let therapeuticAreaId: Int?

    var displayName: String { brandName ?? genericName ?? "Untitled" }
}

struct TherapeuticArea: Decodable, Identifiable {
    let id: Int
    let name: String
    let slug: String?
    let description: String?
    let overview: String?
}

/// Which notification types the user wants. The backend coerces these with `!!`,
/// so unlike most flags they really do arrive as JSON booleans.
struct NotificationPrefs: Codable {
    var news: Bool
    var documents: Bool
    var safety: Bool
    var digest: Bool
}

struct ActivitySummary: Decodable {
    struct Submissions: Decodable {
        struct StatusCount: Decodable { let status: String; let c: Int }
        let total: Int
        let byStatus: [StatusCount]
    }
    let submissions: Submissions
    let saved: Int
    let following: Int
    let memberSince: Date?
    let specialty: String?
}

/// A saved bookmark with the referenced record attached by the list endpoint.
struct SavedEntry: Decodable, Identifiable {
    struct Detail: Decodable {
        let id: Int
        let title: String?
        let category: String?
    }
    let id: Int
    let itemType: String
    let itemId: Int
    let detail: Detail?

    var typeLabel: String { itemType == "news" ? "News" : "Document" }
}

/// A followed therapeutic area, same shape as a saved item.
struct FollowEntry: Decodable, Identifiable {
    struct Detail: Decodable {
        let id: Int
        let name: String?
    }
    let id: Int
    let itemId: Int
    let detail: Detail?
}

struct Submission: Decodable, Identifiable {
    let id: Int
    let submissionType: String
    let status: String
    let externalRef: String?
    let submittedAt: Date?

    /// Matches the reference format the web portal shows.
    var reference: String { String(format: "CP-%06d", id) }

    var typeLabel: String {
        switch submissionType {
        case "medical_inquiry":   return "Medical Inquiry"
        case "adverse_event":     return "Adverse Event"
        case "product_complaint": return "Product Complaint"
        case "other_inquiry":     return "Other Inquiry"
        default:                  return submissionType
        }
    }
}
