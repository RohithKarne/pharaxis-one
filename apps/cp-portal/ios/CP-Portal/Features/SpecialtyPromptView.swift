//
//  SpecialtyPromptView.swift
//  CP-Portal
//
//  One-time, skippable prompt for area of practice — feeds the home screen's
//  personalization. Mirrors the web's SpecialtyPrompt in PortalLayout.
//

import SwiftUI

struct SpecialtyPromptView: View {
    @Environment(Session.self) private var session
    @Environment(\.dismiss) private var dismiss

    private static let specialties = [
        "Cardiology", "Oncology", "Neurology", "Endocrinology", "Immunology",
        "Rheumatology", "Dermatology", "Gastroenterology", "Respiratory",
        "Nephrology", "Hematology", "Infectious Disease", "General Practice",
        "Pharmacist", "Nurse", "Other",
    ]

    @State private var isSaving = false

    private let columns = [GridItem(.adaptive(minimum: 140), spacing: 10)]

    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            VStack(alignment: .leading, spacing: 6) {
                Text("Personalize your experience")
                    .font(.title3.weight(.semibold))
                Text("What's your area of practice? We'll tailor content and recommendations to your specialty.")
                    .font(.callout)
                    .foregroundStyle(.secondary)
            }

            ScrollView {
                LazyVGrid(columns: columns, spacing: 10) {
                    ForEach(Self.specialties, id: \.self) { specialty in
                        Button {
                            Task { await choose(specialty) }
                        } label: {
                            Text(specialty)
                                .font(.callout)
                                .frame(maxWidth: .infinity)
                                .padding(.vertical, 10)
                                .background(
                                    RoundedRectangle(cornerRadius: 10)
                                        .strokeBorder(Color(.separator))
                                )
                        }
                        .buttonStyle(.plain)
                        .disabled(isSaving)
                    }
                }
            }

            Button("Skip for now") {
                session.markSpecialtyPrompted()
                dismiss()
            }
            .font(.callout)
            .foregroundStyle(Theme.brand)
        }
        .padding(22)
        .interactiveDismissDisabled(isSaving)
    }

    private func choose(_ specialty: String) async {
        isSaving = true
        defer { isSaving = false }
        // Best-effort: a failure here should not trap the user in an onboarding
        // modal — the same choice is available any time under Profile.
        if let updated = try? await PortalAPI.shared.updateProfile(
            firstName: nil, lastName: nil, country: nil, specialty: specialty
        ) {
            session.userDidUpdate(updated)
        }
        session.markSpecialtyPrompted()
        dismiss()
    }
}
