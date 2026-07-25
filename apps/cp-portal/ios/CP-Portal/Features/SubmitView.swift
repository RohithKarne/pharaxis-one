//
//  SubmitView.swift
//  CP-Portal
//
//  The dynamic submission flow. Field definitions come from the admin's form
//  config at runtime — adding a field in the web admin changes this screen with
//  no app release.
//
//  Adverse events are included but handled as a safety report rather than an
//  enquiry: separate section, distinct treatment, and the ICH E2D minimum-criteria
//  check in AEReportRules before submission.
//

import SwiftUI
import PhotosUI
import UniformTypeIdentifiers

struct SubmitView: View {
    @Environment(Session.self) private var session

    private let enquiryTypes: [(key: String, label: String, icon: String)] = [
        ("medical_inquiry",   "Medical Inquiry",   "stethoscope"),
        ("product_complaint", "Product Complaint", "shippingbox"),
        ("other_inquiry",     "Other Inquiry",     "questionmark.bubble"),
    ]

    var body: some View {
        NavigationStack {
            List {
                Section {
                    ForEach(enquiryTypes.filter { session.canSee($0.key) }, id: \.key) { type in
                        NavigationLink {
                            DynamicFormView(formType: type.key, title: type.label)
                        } label: {
                            Label(type.label, systemImage: type.icon)
                                .padding(.vertical, 4)
                        }
                    }
                } footer: {
                    Text("Your submission receives a reference number and appears under My Submissions.")
                }

                // Safety reporting is separated from enquiries on purpose: it carries
                // expedited regulatory timelines and should never read as one more
                // support option in a list.
                if session.canSee("adverse_event") {
                    Section {
                        NavigationLink {
                            DynamicFormView(formType: "adverse_event", title: "Report an Adverse Event")
                        } label: {
                            HStack(spacing: 12) {
                                Image(systemName: "exclamationmark.shield.fill")
                                    .font(.title3)
                                    .foregroundStyle(.red)
                                    .frame(width: 28)
                                VStack(alignment: .leading, spacing: 2) {
                                    Text("Report an Adverse Event")
                                    Text("Side effects, reactions, or safety concerns")
                                        .font(.caption)
                                        .foregroundStyle(.secondary)
                                }
                            }
                            .padding(.vertical, 4)
                        }
                    } header: {
                        Text("Patient safety")
                    } footer: {
                        Text("Report as soon as you can, even if you do not have every detail. Missing information can be followed up — an unreported event cannot.")
                    }
                }
            }
            .navigationTitle("Submit a Request")
        }
    }
}

// MARK: - Adverse event reporting rules

/// The four minimum criteria for a valid adverse event report (ICH E2D): an
/// identifiable reporter, an identifiable patient, a suspect product, and an event.
///
/// Reporter, product and event are enforced as hard requirements — without them
/// there is no case to open. Patient identifiability is prompted but never blocks
/// submission: refusing an otherwise-valid safety report because an age is missing
/// suppresses the report entirely, and a suppressed report cannot be followed up.
/// The form flags the gap instead, so the safety team knows to chase it.
enum AEReportRules {
    /// Field keys that, if present in the client's configured form, identify a patient.
    static let patientFieldKeys: Set<String> = [
        "patient_age", "patient_initials", "patient_sex", "patient_gender",
        "patient_identifier", "patient_dob",
    ]

    /// True when the form collects patient detail but none was supplied.
    static func isMissingPatientDetail(fields: [FormField], values: [String: String]) -> Bool {
        let present = fields.filter { patientFieldKeys.contains($0.fieldKey) }
        guard !present.isEmpty else { return false }
        return present.allSatisfy {
            (values[$0.fieldKey] ?? "").trimmingCharacters(in: .whitespaces).isEmpty
        }
    }
}

struct DynamicFormView: View {
    @Environment(Session.self) private var session
    @Environment(\.dismiss) private var dismiss
    let formType: String
    let title: String

    @State private var fields: [FormField] = []
    @State private var values: [String: String] = [:]
    @State private var problems: [String: String] = [:]
    @State private var attachments: [PendingAttachment] = []
    @State private var photoSelection: [PhotosPickerItem] = []
    @State private var showFileImporter = false
    @State private var loadError: String?
    @State private var submitError: String?
    @State private var isSubmitting = false
    @State private var reference: String?
    @State private var showPatientDetailPrompt = false

    private var isAdverseEvent: Bool { formType == "adverse_event" }

    var body: some View {
        Group {
            if let reference {
                successView(reference)
            } else if fields.isEmpty && loadError == nil {
                ProgressView()
            } else if let loadError {
                ContentUnavailableView {
                    Label("Couldn't load the form", systemImage: "exclamationmark.triangle")
                } description: {
                    Text(loadError)
                } actions: {
                    Button("Try Again") { Task { await loadFields() } }
                }
            } else {
                form
            }
        }
        .navigationTitle(title)
        .navigationBarTitleDisplayMode(.inline)
        .task { await loadFields() }
    }

    private var form: some View {
        Form {
            if isAdverseEvent {
                Section {
                    Label {
                        Text("This report goes to the safety team and is handled under pharmacovigilance timelines. Submit what you know — you do not need every field.")
                            .font(.caption)
                    } icon: {
                        Image(systemName: "cross.case.fill").foregroundStyle(.red)
                    }
                }
            }

            ForEach(fields) { field in
                Section {
                    fieldControl(field)
                    if let problem = problems[field.fieldKey] {
                        Text(problem)
                            .font(.caption)
                            .foregroundStyle(.red)
                    }
                } header: {
                    HStack(spacing: 2) {
                        Text(field.label)
                        if field.required { Text("*").foregroundStyle(.red) }
                    }
                } footer: {
                    if let help = field.helpText, !help.isEmpty { Text(help) }
                }
            }

            attachmentSection

            if let submitError {
                Section {
                    Label(submitError, systemImage: "exclamationmark.triangle.fill")
                        .font(.callout)
                        .foregroundStyle(.red)
                }
            }

            Section {
                Button {
                    // For an AE, check the patient criterion before sending. This
                    // prompts, it does not block — see AEReportRules.
                    if isAdverseEvent,
                       AEReportRules.isMissingPatientDetail(fields: fields, values: values) {
                        showPatientDetailPrompt = true
                    } else {
                        Task { await submit() }
                    }
                } label: {
                    HStack {
                        Spacer()
                        if isSubmitting { ProgressView().tint(.white) }
                        else {
                            Text(isAdverseEvent ? "Submit Safety Report" : "Submit")
                                .fontWeight(.semibold)
                        }
                        Spacer()
                    }
                }
                .disabled(isSubmitting)
                .listRowBackground(isAdverseEvent ? Color.red : Theme.brand)
                .foregroundStyle(.white)
            }
        }
        .confirmationDialog(
            "No patient details given",
            isPresented: $showPatientDetailPrompt,
            titleVisibility: .visible
        ) {
            Button("Add patient details") { showPatientDetailPrompt = false }
            Button("Submit anyway") { Task { await submit() } }
            Button("Cancel", role: .cancel) { }
        } message: {
            Text("Patient details help the safety team assess this report. You can still submit without them — the team will follow up.")
        }
    }

    // MARK: Field rendering — all 7 admin-configurable types

    @ViewBuilder
    private func fieldControl(_ field: FormField) -> some View {
        let binding = Binding(
            get: { values[field.fieldKey] ?? "" },
            set: { values[field.fieldKey] = $0; problems[field.fieldKey] = nil }
        )
        switch field.fieldType {
        case "textarea":
            // Autocorrect is off here too. It reads as prose, but the content is
            // clinical narrative full of drug names and medical terms iOS does not
            // know: QA saw "the second dose" rewritten to "wind dose" in an adverse
            // event description. A corrupted safety narrative is worse than a typo,
            // and the web form applies no correction either.
            TextEditor(text: binding)
                .frame(minHeight: 96)
                .autocorrectionDisabled()
        case "select":
            Picker(field.label, selection: binding) {
                Text("Select…").tag("")
                ForEach(field.parsedOptions, id: \.self) { Text($0).tag($0) }
            }
            .labelsHidden()
        case "checkbox":
            Toggle(field.label, isOn: Binding(
                get: { values[field.fieldKey] == "true" },
                set: { values[field.fieldKey] = $0 ? "true" : "false" }
            ))
            .tint(Theme.brand)
            .labelsHidden()
        case "date":
            DatePicker(
                field.label,
                selection: Binding(
                    get: { Self.dateFormatter.date(from: values[field.fieldKey] ?? "") ?? Date() },
                    set: { values[field.fieldKey] = Self.dateFormatter.string(from: $0) }
                ),
                in: ...Date(),
                displayedComponents: .date
            )
            .labelsHidden()
        case "email":
            TextField(field.placeholder ?? "", text: binding)
                .keyboardType(.emailAddress)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
        case "phone":
            TextField(field.placeholder ?? "", text: binding)
                .keyboardType(.phonePad)
        default: // "text"
            // FN-1: single-line text fields hold identifiers — product names, lot
            // numbers, people's names. Autocorrect rewrote "Cosentyx" to "Cosmetic"
            // in QA; prose lives in textarea, which keeps correction enabled.
            TextField(field.placeholder ?? "", text: binding)
                .autocorrectionDisabled()
        }
    }

    private static let dateFormatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter
    }()

    // MARK: Attachments

    private var attachmentSection: some View {
        Section {
            ForEach(attachments) { attachment in
                HStack {
                    Image(systemName: "paperclip")
                        .foregroundStyle(Theme.brand)
                    VStack(alignment: .leading, spacing: 1) {
                        Text(attachment.fileName).font(.callout).lineLimit(1)
                        Text(ByteCountFormatter.string(fromByteCount: Int64(attachment.data.count), countStyle: .file))
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                    }
                    Spacer()
                    Button(role: .destructive) {
                        attachments.removeAll { $0.id == attachment.id }
                    } label: {
                        Image(systemName: "xmark.circle.fill")
                            .foregroundStyle(.secondary)
                    }
                }
            }

            if attachments.count < SubmissionRules.maxAttachments {
                PhotosPicker(selection: $photoSelection, maxSelectionCount: SubmissionRules.maxAttachments - attachments.count, matching: .images) {
                    Label("Add Photo", systemImage: "photo")
                }
                .onChange(of: photoSelection) { _, items in
                    Task { await importPhotos(items) }
                }

                Button {
                    showFileImporter = true
                } label: {
                    Label("Add File", systemImage: "doc")
                }
                .fileImporter(
                    isPresented: $showFileImporter,
                    allowedContentTypes: [.pdf, .jpeg, .png, UTType("com.microsoft.word.doc") ?? .data,
                                          UTType("org.openxmlformats.wordprocessingml.document") ?? .data],
                    allowsMultipleSelection: true
                ) { result in
                    importFiles(result)
                }
            }
        } header: {
            Text("Attachments")
        } footer: {
            Text("Up to \(SubmissionRules.maxAttachments) files — PDF, JPG, PNG, DOC, DOCX, 10 MB each.")
        }
    }

    private func importPhotos(_ items: [PhotosPickerItem]) async {
        for item in items {
            guard attachments.count < SubmissionRules.maxAttachments else { break }
            guard let data = try? await item.loadTransferable(type: Data.self) else { continue }
            guard data.count <= SubmissionRules.maxAttachmentBytes else {
                submitError = "One photo was over 10 MB and was not added."
                continue
            }
            attachments.append(PendingAttachment(
                fileName: "photo-\(attachments.count + 1).jpg",
                mimeType: "image/jpeg",
                data: data
            ))
        }
        photoSelection = []
    }

    private func importFiles(_ result: Result<[URL], Error>) {
        guard case .success(let urls) = result else { return }
        for url in urls {
            guard attachments.count < SubmissionRules.maxAttachments else { break }
            guard url.startAccessingSecurityScopedResource() else { continue }
            defer { url.stopAccessingSecurityScopedResource() }
            guard let data = try? Data(contentsOf: url) else { continue }
            guard data.count <= SubmissionRules.maxAttachmentBytes else {
                submitError = "\(url.lastPathComponent) is over 10 MB and was not added."
                continue
            }
            let mime = Self.mimeType(for: url)
            guard SubmissionRules.allowedMimeTypes.contains(mime) else {
                submitError = "\(url.lastPathComponent) is not a permitted file type."
                continue
            }
            attachments.append(PendingAttachment(fileName: url.lastPathComponent, mimeType: mime, data: data))
        }
    }

    private static func mimeType(for url: URL) -> String {
        switch url.pathExtension.lowercased() {
        case "pdf":  return "application/pdf"
        case "jpg", "jpeg": return "image/jpeg"
        case "png":  return "image/png"
        case "doc":  return "application/msword"
        case "docx": return "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        default:     return "application/octet-stream"
        }
    }

    // MARK: Load & submit

    private func loadFields() async {
        loadError = nil
        do {
            fields = try await PortalAPI.shared.formFields(
                clientCode: session.clientCode, formType: formType
            )
            // A DatePicker always draws a date, so an unedited date field looked
            // filled while its stored value was still empty — a required date then
            // failed validation with a date visible on screen. Seed the value to
            // match what is displayed.
            let today = Self.dateFormatter.string(from: Date())
            for field in fields where field.fieldType == "date" {
                if values[field.fieldKey] == nil { values[field.fieldKey] = today }
            }
        } catch {
            loadError = error.localizedDescription
        }
    }

    private func submit() async {
        // Client-side pass of the same rules the web form applies.
        var found: [String: String] = [:]
        for field in fields {
            if let problem = FieldValidator.problem(for: field, value: values[field.fieldKey] ?? "") {
                found[field.fieldKey] = problem
            }
        }
        problems = found
        guard found.isEmpty else { return }

        isSubmitting = true
        submitError = nil
        defer { isSubmitting = false }

        do {
            reference = try await PortalAPI.shared.submit(
                clientCode: session.clientCode,
                formType: formType,
                formData: values,
                submitterName: session.user?.displayName,
                submitterEmail: session.user?.email,
                attachments: attachments
            )
        } catch {
            submitError = error.localizedDescription
        }
    }

    private func successView(_ reference: String) -> some View {
        VStack(spacing: 16) {
            Image(systemName: "checkmark.circle.fill")
                .font(.system(size: 52))
                .foregroundStyle(Theme.brand)
            Text("Submitted")
                .font(.title2.weight(.semibold))
            Text("Your reference number is")
                .foregroundStyle(.secondary)
            Text(reference)
                .font(.title3.monospaced().weight(.semibold))
            Text("A confirmation email is on its way. You can track this under My Submissions.")
                .font(.footnote)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 32)
            Button("Done") { dismiss() }
                .buttonStyle(.borderedProminent)
                .tint(Theme.brand)
                .padding(.top, 8)
        }
        .padding()
    }
}
