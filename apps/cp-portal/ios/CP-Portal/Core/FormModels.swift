//
//  FormModels.swift
//  CP-Portal
//
//  The admin-defined dynamic form system. Field definitions come from
//  GET /api/portal/content/:clientCode/forms/:formType (cp_form_config), so the
//  web admin controls every field the app renders — no form is hardcoded here.
//

import Foundation

struct FormField: Decodable, Identifiable {
    let id: Int
    let fieldKey: String
    let label: String
    let fieldType: String
    /// Options for selects: the admin UI stores either a JSON array or
    /// newline-separated text. `parsedOptions` accepts both.
    let options: String?
    let placeholder: String?
    let helpText: String?
    /// tinyint(1) — 0/1.
    let isRequired: Int?
    let displayOrder: Int?

    var required: Bool { isRequired == 1 }

    var parsedOptions: [String] {
        guard let options, !options.isEmpty else { return [] }
        if let data = options.data(using: .utf8),
           let array = try? JSONDecoder().decode([String].self, from: data) {
            return array
        }
        return options
            .split(whereSeparator: \.isNewline)
            .map { $0.trimmingCharacters(in: .whitespaces) }
            .filter { !$0.isEmpty }
    }
}

/// One attachment queued for a submission. Data is held in memory — the backend
/// caps uploads at 10 MB each and 5 per submission, so the worst case is bounded.
struct PendingAttachment: Identifiable {
    let id = UUID()
    let fileName: String
    let mimeType: String
    let data: Data
}

enum SubmissionRules {
    static let maxAttachments = 5
    static let maxAttachmentBytes = 10 * 1024 * 1024
    /// Mirrors ATT_ALLOWED in backend/routes/portal/submit.js. The backend
    /// verifies real magic bytes, so lying about the type only moves the failure.
    static let allowedMimeTypes: Set<String> = [
        "application/pdf", "image/jpeg", "image/png",
        "application/msword",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ]
}

/// Validates one field's current value the way the web form does.
enum FieldValidator {
    static func problem(for field: FormField, value: String) -> String? {
        let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
        if trimmed.isEmpty {
            return field.required ? "\(field.label) is required." : nil
        }
        switch field.fieldType {
        case "email":
            // Same permissive shape the web uses — real validation is the
            // backend's job; this just catches obvious typos.
            if !trimmed.contains("@") || !trimmed.contains(".") {
                return "Enter a valid email address."
            }
        case "phone":
            if trimmed.rangeOfCharacter(from: .decimalDigits) == nil {
                return "Enter a valid phone number."
            }
        default:
            break
        }
        return nil
    }
}
