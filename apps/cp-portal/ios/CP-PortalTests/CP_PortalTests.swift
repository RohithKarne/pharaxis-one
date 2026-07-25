//
//  CP_PortalTests.swift
//  CP-PortalTests
//
//  Unit tests for the app's pure logic. Fixtures mirror real backend responses
//  captured from the running dev server — including the quirks that caused live
//  defects (tinyint 0/1 flags, mixed body-key casing, millisecond ISO dates).
//

import XCTest
@testable import CP_Portal

// Decodes the way PortalAPI's snake_case decoder does, so fixture tests exercise
// the same configuration the app uses on the wire.
private func appDecoder() -> JSONDecoder {
    let decoder = JSONDecoder()
    decoder.keyDecodingStrategy = .convertFromSnakeCase
    decoder.dateDecodingStrategy = .custom { decoder in
        let raw = try decoder.singleValueContainer().decode(String.self)
        let withMillis = ISO8601DateFormatter()
        withMillis.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let date = withMillis.date(from: raw) { return date }
        let plain = ISO8601DateFormatter()
        if let date = plain.date(from: raw) { return date }
        throw DecodingError.dataCorruptedError(
            in: try decoder.singleValueContainer(),
            debugDescription: "Unrecognised date format: \(raw)"
        )
    }
    return decoder
}

// MARK: - Dynamic form options parsing

final class FormFieldOptionTests: XCTestCase {

    private func field(options: String?) -> FormField {
        FormField(id: 1, fieldKey: "k", label: "L", fieldType: "select",
                  options: options, placeholder: nil, helpText: nil,
                  isRequired: 1, displayOrder: 1)
    }

    func testParsesJSONArrayOptions() {
        // The admin UI stores options as a JSON array for the seeded forms.
        let parsed = field(options: #"["HCP","Patient","Caregiver"]"#).parsedOptions
        XCTAssertEqual(parsed, ["HCP", "Patient", "Caregiver"])
    }

    func testParsesNewlineSeparatedOptions() {
        // The web renderer also accepts newline-separated text; so must we.
        let parsed = field(options: "HCP\nPatient\n  Caregiver  \n\n").parsedOptions
        XCTAssertEqual(parsed, ["HCP", "Patient", "Caregiver"])
    }

    func testEmptyAndNilOptions() {
        XCTAssertEqual(field(options: nil).parsedOptions, [])
        XCTAssertEqual(field(options: "").parsedOptions, [])
    }

    func testRequiredFlagIsTinyint() {
        XCTAssertTrue(field(options: nil).required)
        let optional = FormField(id: 2, fieldKey: "k2", label: "L", fieldType: "text",
                                 options: nil, placeholder: nil, helpText: nil,
                                 isRequired: 0, displayOrder: 2)
        XCTAssertFalse(optional.required)
    }
}

// MARK: - Field validation

final class FieldValidatorTests: XCTestCase {

    private func field(_ type: String, required: Bool = true) -> FormField {
        FormField(id: 1, fieldKey: "k", label: "Email Address", fieldType: type,
                  options: nil, placeholder: nil, helpText: nil,
                  isRequired: required ? 1 : 0, displayOrder: 1)
    }

    func testRequiredFieldRejectsEmptyAndWhitespace() {
        XCTAssertNotNil(FieldValidator.problem(for: field("text"), value: ""))
        XCTAssertNotNil(FieldValidator.problem(for: field("text"), value: "   "))
    }

    func testOptionalFieldAcceptsEmpty() {
        XCTAssertNil(FieldValidator.problem(for: field("text", required: false), value: ""))
    }

    func testEmailShape() {
        XCTAssertNotNil(FieldValidator.problem(for: field("email"), value: "not-an-email"))
        XCTAssertNil(FieldValidator.problem(for: field("email"), value: "qa.test@novartis-demo.com"))
    }

    func testPhoneNeedsADigit() {
        XCTAssertNotNil(FieldValidator.problem(for: field("phone"), value: "call me"))
        XCTAssertNil(FieldValidator.problem(for: field("phone"), value: "+44 20 7946 0000"))
    }
}

// MARK: - Config feature gating

final class PortalConfigTests: XCTestCase {

    // Shape matches GET /api/portal/config/novartis (rawDecoder: keys as sent).
    private let fixture = Data("""
    {
      "client": {"name": "Novartis Pharmaceuticals", "code": "novartis"},
      "branding": {"primary_color": "#6B3FA0", "tagline": "Advancing Medicine."},
      "features": {"document_library": true, "find_msl": false, "chatbox": true},
      "gate": {
        "gate_title": "Welcome",
        "gate_subtitle": null,
        "disclaimer_text": "I confirm.",
        "require_disclaimer": true,
        "userTypes": [{"type_key": "hcp", "label": "HCP", "description": null}],
        "accessMap": {"chatbox": {"patient": false, "hcp": true}}
      },
      "has_active_safety_alert": true,
      "compliance": {"jurisdictions": ["gdpr"], "version": "v1.1", "require_reconsent": true}
    }
    """.utf8)

    private func decode() throws -> PortalConfig {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return try decoder.decode(PortalConfig.self, from: fixture)
    }

    func testFeatureKeysSurviveDecoding() throws {
        // The whole reason for rawDecoder: snake_case conversion would have turned
        // document_library into documentLibrary and broken every lookup.
        let config = try decode()
        XCTAssertTrue(config.isEnabled("document_library"))
        XCTAssertFalse(config.isEnabled("find_msl"))
        XCTAssertFalse(config.isEnabled("never_heard_of_it"))
    }

    func testAccessMapGatesByUserType() throws {
        let config = try decode()
        XCTAssertTrue(config.allows("chatbox", for: "hcp"))
        XCTAssertFalse(config.allows("chatbox", for: "patient"))
        // A type absent from the map is unrestricted — matches the backend,
        // where an empty visibility list means visible to all.
        XCTAssertTrue(config.allows("chatbox", for: "other"))
        // No map entry at all → gated only by the feature toggle.
        XCTAssertTrue(config.allows("document_library", for: "patient"))
        // Disabled feature is closed to everyone regardless of the map.
        XCTAssertFalse(config.allows("find_msl", for: "hcp"))
    }

    func testComplianceVersionIsVerbatim() throws {
        // v1.1 vs 1.1 is a live web defect — the app must not strip the prefix.
        XCTAssertEqual(try decode().compliance?.version, "v1.1")
    }
}

// MARK: - Model decoding against captured backend JSON

final class ModelDecodingTests: XCTestCase {

    func testNewsPostDecodesTinyintAndMillisecondDates() throws {
        // Captured from GET /api/portal/news — is_pinned is tinyint 0/1 and the
        // date carries milliseconds. Both broke the first build; locked in here.
        let json = Data("""
        {"id": 6, "title": "Cosentyx Receives FDA Approval",
         "body_html": "<h2>Regulatory Milestone</h2>", "category": "Regulatory Approval",
         "publish_at": "2026-03-13T08:00:00.000Z", "is_pinned": 0, "view_count": 858}
        """.utf8)
        let post = try appDecoder().decode(NewsPost.self, from: json)
        XCTAssertFalse(post.pinned)
        XCTAssertNotNil(post.publishAt)
    }

    func testUserDecodesConfirmationFlag() throws {
        let json = Data("""
        {"id": 33, "first_name": "QA", "last_name": "Test",
         "email": "qa.test@novartis-demo.com", "user_type": "hcp",
         "user_type_confirmed": 1, "specialty": "Cardiology", "country": "United Kingdom"}
        """.utf8)
        let user = try appDecoder().decode(PortalUser.self, from: json)
        XCTAssertTrue(user.hasConfirmedUserType)
        XCTAssertEqual(user.displayName, "QA Test")
    }

    func testSubmissionReferenceFormatMatchesBackend(){
        // Backend: `CP-${String(id).padStart(6, '0')}` — verified as CP-000082.
        let submission = Submission(id: 82, submissionType: "medical_inquiry",
                                    status: "synced", externalRef: nil, submittedAt: nil)
        XCTAssertEqual(submission.reference, "CP-000082")
        XCTAssertEqual(submission.typeLabel, "Medical Inquiry")
    }

    func testEventPastAndLocationLogic() throws {
        let json = Data("""
        {"id": 1, "title": "Past Congress", "description": null, "event_type": "congress",
         "venue": "ExCeL", "city": "London", "country": "UK",
         "start_date": "2020-01-01T09:00:00.000Z", "end_date": "2020-01-02T17:00:00.000Z",
         "registration_url": null, "image_url": null, "is_featured": 1}
        """.utf8)
        let event = try appDecoder().decode(PortalEvent.self, from: json)
        XCTAssertTrue(event.isPast)
        XCTAssertTrue(event.featured)
        XCTAssertEqual(event.location, "ExCeL, London, UK")
    }

    func testSafetyAlertResolvedFlag() throws {
        let json = Data("""
        {"id": 21, "title": "Translator Test", "alert_type": "recall", "severity": "high",
         "product_name": null, "ref_number": "NVS-1", "body_html": "<p>x</p>",
         "effective_date": null, "attachment_name": null, "status": "resolved", "view_count": 3}
        """.utf8)
        let alert = try appDecoder().decode(SafetyAlert.self, from: json)
        XCTAssertTrue(alert.isResolved)
    }
}

// MARK: - Submission rules

final class SubmissionRulesTests: XCTestCase {

    func testAttachmentAllowlistMirrorsBackend() {
        // Must stay in lockstep with ATT_ALLOWED in routes/portal/submit.js.
        for mime in ["application/pdf", "image/jpeg", "image/png",
                     "application/msword",
                     "application/vnd.openxmlformats-officedocument.wordprocessingml.document"] {
            XCTAssertTrue(SubmissionRules.allowedMimeTypes.contains(mime), mime)
        }
        XCTAssertFalse(SubmissionRules.allowedMimeTypes.contains("image/svg+xml"))
        XCTAssertFalse(SubmissionRules.allowedMimeTypes.contains("text/html"))
        XCTAssertEqual(SubmissionRules.maxAttachments, 5)
        XCTAssertEqual(SubmissionRules.maxAttachmentBytes, 10 * 1024 * 1024)
    }
}

// MARK: - Adverse event minimum criteria

final class AEReportRulesTests: XCTestCase {

    private func field(_ key: String) -> FormField {
        FormField(id: 1, fieldKey: key, label: key, fieldType: "text",
                  options: nil, placeholder: nil, helpText: nil,
                  isRequired: 0, displayOrder: 1)
    }

    /// Mirrors the seeded Novartis AE form: patient_age is the only patient field
    /// and the admin has it optional.
    private let novartisAEFields = ["reporter_name", "reporter_email", "reporter_type",
                                    "product_name", "lot_number", "event_date",
                                    "description", "patient_age", "outcome"]

    func testFlagsMissingPatientDetail() {
        let fields = novartisAEFields.map(field)
        let values = ["reporter_name": "Dr Rao", "product_name": "Cosentyx",
                      "description": "Rash after second dose"]
        XCTAssertTrue(AEReportRules.isMissingPatientDetail(fields: fields, values: values))
    }

    func testSuppliedPatientDetailClearsTheFlag() {
        let fields = novartisAEFields.map(field)
        let values = ["patient_age": "47"]
        XCTAssertFalse(AEReportRules.isMissingPatientDetail(fields: fields, values: values))
    }

    func testWhitespaceIsNotPatientDetail() {
        let fields = novartisAEFields.map(field)
        XCTAssertTrue(AEReportRules.isMissingPatientDetail(
            fields: fields, values: ["patient_age": "   "]
        ))
    }

    func testFormWithNoPatientFieldsIsNotFlagged() {
        // A client whose AE form collects no patient field at all cannot be
        // failing the criterion — there is nothing to prompt for.
        let fields = ["reporter_name", "product_name", "description"].map(field)
        XCTAssertFalse(AEReportRules.isMissingPatientDetail(fields: fields, values: [:]))
    }

    func testAnyOnePatientFieldSatisfiesTheCriterion() {
        let fields = ["patient_age", "patient_initials", "patient_sex"].map(field)
        XCTAssertFalse(AEReportRules.isMissingPatientDetail(
            fields: fields, values: ["patient_initials": "J.D."]
        ))
    }
}

// MARK: - HTML fallback stripping

final class HTMLStrippingTests: XCTestCase {

    func testStripsTagsAndDecodesEntities() {
        let html = "<h2>Title</h2><p>Q&amp;A rocks&nbsp;now</p>"
        let text = NewsDetailView.plainText(from: html)
        // Tags gone, content and decoded entities remain.
        XCTAssertFalse(text.contains("<h2>"))
        XCTAssertFalse(text.contains("<p>"))
        XCTAssertTrue(text.contains("Title"))
        XCTAssertTrue(text.contains("Q&A rocks now"))
    }

    func testNilHTMLIsEmpty() {
        XCTAssertEqual(NewsDetailView.plainText(from: nil), "")
    }
}
