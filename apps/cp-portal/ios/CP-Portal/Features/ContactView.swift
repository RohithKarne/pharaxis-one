//
//  ContactView.swift
//  CP-Portal
//
//  Contact routing plus a free-text message. The message submits as an
//  `other_inquiry`, exactly as the web page does, so it lands in My Submissions
//  with a reference like any other request.
//
//  Contact email/phone are deliberately not shown: the portal config endpoint
//  exposes only `{name, code}` for the client, so those details never reach the
//  client app. The web page has the same gap and renders "Contact information not
//  available" in both slots. Raised as a backend item rather than mirrored here.
//

import SwiftUI

struct ContactView: View {
    @Environment(Session.self) private var session

    @State private var name = ""
    @State private var email = ""
    @State private var message = ""
    @State private var isSending = false
    @State private var reference: String?
    @State private var sendError: String?

    private var canSend: Bool {
        let trimmedEmail = email.trimmingCharacters(in: .whitespaces)
        return !name.trimmingCharacters(in: .whitespaces).isEmpty
            // Same permissive shape the dynamic form applies — the backend is the
            // real authority; this only catches obvious typos.
            && trimmedEmail.contains("@") && trimmedEmail.contains(".")
            && !message.trimmingCharacters(in: .whitespaces).isEmpty
            && !isSending
    }

    var body: some View {
        Group {
            if let reference {
                sent(reference)
            } else {
                form
            }
        }
        .navigationTitle("Contact Us")
        .navigationBarTitleDisplayMode(.inline)
        .onAppear {
            if let user = session.user {
                if name.isEmpty { name = user.displayName }
                if email.isEmpty { email = user.email }
            }
        }
    }

    private var form: some View {
        Form {
            Section {
                routeRow("stethoscope", "Medical information",
                         "Clinical questions about a product.", Theme.brand)
                routeRow("exclamationmark.shield.fill", "Report a side effect",
                         "Use the adverse event form so it reaches the safety team.", .red)
            } header: {
                Text("Looking for something specific?")
            } footer: {
                Text("Submit those from the Submit tab so they are tracked and routed correctly.")
            }

            Section("Your details") {
                TextField("Name", text: $name)
                    .autocorrectionDisabled()
                TextField("Email", text: $email)
                    .keyboardType(.emailAddress)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
            }

            Section {
                TextEditor(text: $message)
                    .frame(minHeight: 120)
                    .autocorrectionDisabled()
            } header: {
                Text("Message")
            } footer: {
                Text("General enquiries only. You'll get a reference number and can track it under My Submissions.")
            }

            if let sendError {
                Section {
                    Label(sendError, systemImage: "exclamationmark.triangle.fill")
                        .font(.callout)
                        .foregroundStyle(.red)
                }
            }

            Section {
                Button {
                    Task { await send() }
                } label: {
                    HStack {
                        Spacer()
                        if isSending { ProgressView().tint(.white) }
                        else { Text("Send Message").fontWeight(.semibold) }
                        Spacer()
                    }
                }
                .disabled(!canSend)
                .listRowBackground(canSend ? Theme.brand : Color.gray.opacity(0.4))
                .foregroundStyle(.white)
            }
        }
    }

    private func routeRow(_ icon: String, _ title: String,
                          _ subtitle: String, _ tint: Color) -> some View {
        HStack(alignment: .top, spacing: 12) {
            Image(systemName: icon)
                .foregroundStyle(tint)
                .frame(width: 24)
            VStack(alignment: .leading, spacing: 2) {
                Text(title).font(.subheadline.weight(.medium))
                Text(subtitle).font(.caption).foregroundStyle(.secondary)
            }
        }
        .padding(.vertical, 2)
    }

    private func sent(_ reference: String) -> some View {
        VStack(spacing: 14) {
            Image(systemName: "checkmark.circle.fill")
                .font(.system(size: 52))
                .foregroundStyle(Theme.brand)
            Text("Message sent").font(.title3.weight(.semibold))
            Text("Your reference number is").foregroundStyle(.secondary)
            Text(reference)
                .font(.system(.title3, design: .monospaced))
                .fontWeight(.semibold)
            Text("You can track this under My Submissions.")
                .font(.callout)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
        }
        .padding(28)
    }

    private func send() async {
        isSending = true
        sendError = nil
        defer { isSending = false }

        do {
            reference = try await PortalAPI.shared.submit(
                clientCode: session.clientCode,
                formType: "other_inquiry",
                formData: ["name": name, "email": email, "message": message],
                submitterName: name,
                submitterEmail: email,
                attachments: []
            )
        } catch {
            sendError = error.localizedDescription
        }
    }
}
