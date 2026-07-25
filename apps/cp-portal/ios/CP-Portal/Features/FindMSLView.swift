//
//  FindMSLView.swift
//  CP-Portal
//
//  MSL directory with meeting requests. A booking can pick a published slot or
//  just state a preferred date — mirroring the web's two paths.
//

import SwiftUI

struct MSL: Decodable, Identifiable {
    let id: Int
    let name: String
    let title: String?
    let specialty: String?
    let territory: String?
    let region: String?
    let email: String?
}

struct MSLSlot: Decodable, Identifiable {
    let id: Int
    let startsAt: Date?
    let endsAt: Date?
}

struct FindMSLView: View {
    @Environment(Session.self) private var session
    @State private var query = ""
    @State private var bookingTarget: MSL?

    var body: some View {
        LoadableList(
            title: "MSLs",
            emptyIcon: "person.2",
            emptyText: "No MSLs listed",
            load: { try await PortalAPI.shared.msls(clientCode: session.clientCode) }
        ) { msls in
            List(filtered(msls)) { msl in
                VStack(alignment: .leading, spacing: 4) {
                    Text(msl.name).font(.callout.weight(.semibold))
                    if let title = msl.title { Text(title).font(.caption).foregroundStyle(.secondary) }
                    HStack(spacing: 8) {
                        if let specialty = msl.specialty {
                            Text(specialty).font(.caption).foregroundStyle(Theme.brand)
                        }
                        if let territory = msl.territory {
                            Text(territory).font(.caption).foregroundStyle(.secondary)
                        }
                    }
                    Button("Request Meeting") { bookingTarget = msl }
                        .font(.caption.weight(.semibold))
                        .buttonStyle(.bordered)
                        .tint(Theme.brand)
                        .padding(.top, 2)
                }
                .padding(.vertical, 4)
            }
            .listStyle(.insetGrouped)
            .searchable(text: $query, prompt: "Name, specialty or territory")
        }
        .navigationTitle("Find an MSL")
        .sheet(item: $bookingTarget) { msl in
            BookingSheet(msl: msl)
                .presentationDetents([.large])
        }
    }

    private func filtered(_ msls: [MSL]) -> [MSL] {
        let trimmed = query.trimmingCharacters(in: .whitespaces)
        guard !trimmed.isEmpty else { return msls }
        return msls.filter { msl in
            [msl.name, msl.specialty, msl.territory, msl.region]
                .compactMap { $0 }
                .contains { $0.localizedCaseInsensitiveContains(trimmed) }
        }
    }
}

struct BookingSheet: View {
    @Environment(Session.self) private var session
    @Environment(\.dismiss) private var dismiss
    let msl: MSL

    @State private var slots: [MSLSlot] = []
    @State private var selectedSlot: Int?
    @State private var preferredDate = Date()
    @State private var usePreferredDate = false
    @State private var name = ""
    @State private var email = ""
    @State private var topic = ""
    @State private var message = ""
    @State private var isSending = false
    @State private var sendError: String?
    @State private var confirmed = false

    var body: some View {
        NavigationStack {
            Group {
                if confirmed {
                    VStack(spacing: 14) {
                        Image(systemName: "checkmark.circle.fill")
                            .font(.system(size: 48))
                            .foregroundStyle(Theme.brand)
                        Text("Request sent").font(.title3.weight(.semibold))
                        Text("\(msl.name) will be in touch to confirm.")
                            .font(.callout).foregroundStyle(.secondary)
                        Button("Done") { dismiss() }
                            .buttonStyle(.borderedProminent)
                            .tint(Theme.brand)
                    }
                    .padding()
                } else {
                    form
                }
            }
            .navigationTitle("Request a Meeting")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
            }
        }
        .task {
            slots = (try? await PortalAPI.shared.slots(
                clientCode: session.clientCode, mslID: msl.id
            )) ?? []
            name = session.user?.displayName ?? ""
            email = session.user?.email ?? ""
        }
    }

    private var form: some View {
        Form {
            Section("With") {
                LabeledContent("MSL", value: msl.name)
                if let specialty = msl.specialty { LabeledContent("Specialty", value: specialty) }
            }

            Section("When") {
                if !slots.isEmpty && !usePreferredDate {
                    Picker("Available slot", selection: $selectedSlot) {
                        Text("Choose…").tag(Int?.none)
                        ForEach(slots) { slot in
                            if let start = slot.startsAt {
                                Text(start.formatted(date: .abbreviated, time: .shortened))
                                    .tag(Int?.some(slot.id))
                            }
                        }
                    }
                }
                if slots.isEmpty || usePreferredDate {
                    DatePicker("Preferred date", selection: $preferredDate,
                               in: Date()..., displayedComponents: .date)
                }
                if !slots.isEmpty {
                    Toggle("Suggest my own date instead", isOn: $usePreferredDate)
                        .tint(Theme.brand)
                }
            }

            Section("Your details") {
                TextField("Name", text: $name)
                TextField("Email", text: $email)
                    .keyboardType(.emailAddress)
                    .textInputAutocapitalization(.never)
                TextField("Topic", text: $topic)
                TextField("Message (optional)", text: $message, axis: .vertical)
                    .lineLimit(2...5)
            }

            if let sendError {
                Section { Text(sendError).font(.caption).foregroundStyle(.red) }
            }

            Section {
                Button {
                    Task { await send() }
                } label: {
                    HStack {
                        Spacer()
                        if isSending { ProgressView().tint(.white) }
                        else { Text("Send Request").fontWeight(.semibold) }
                        Spacer()
                    }
                }
                .disabled(isSending || name.isEmpty || email.isEmpty)
                .listRowBackground(name.isEmpty || email.isEmpty ? Color.gray.opacity(0.4) : Theme.brand)
                .foregroundStyle(.white)
            }
        }
    }

    private func send() async {
        isSending = true
        sendError = nil
        defer { isSending = false }
        do {
            try await PortalAPI.shared.requestBooking(
                clientCode: session.clientCode,
                mslID: msl.id,
                name: name,
                email: email,
                topic: topic.isEmpty ? nil : topic,
                message: message.isEmpty ? nil : message,
                slotID: usePreferredDate ? nil : selectedSlot,
                preferredDate: usePreferredDate || slots.isEmpty
                    ? preferredDate.formatted(.iso8601.year().month().day())
                    : nil
            )
            confirmed = true
        } catch {
            sendError = error.localizedDescription
        }
    }
}
