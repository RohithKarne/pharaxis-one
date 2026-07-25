//
//  LoginView.swift
//  CP-Portal
//

import SwiftUI

struct LoginView: View {
    @Environment(Session.self) private var session

    @State private var email = ""
    @State private var password = ""
    @FocusState private var focusedField: Field?

    private enum Field { case clientCode, email, password }

    private var canSubmit: Bool {
        !email.isEmpty && !password.isEmpty && !session.clientCode.isEmpty && !session.isWorking
    }

    var body: some View {
        @Bindable var session = session

        NavigationStack {
            Form {
                Section {
                    TextField("Client code", text: $session.clientCode)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .focused($focusedField, equals: .clientCode)
                        .submitLabel(.next)
                        .onSubmit { focusedField = .email }
                } header: {
                    Text("Portal")
                } footer: {
                    Text("Each client has its own portal and user list.")
                }

                Section("Sign in") {
                    TextField("Email", text: $email)
                        .textContentType(.username)
                        .keyboardType(.emailAddress)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .focused($focusedField, equals: .email)
                        .submitLabel(.next)
                        .onSubmit { focusedField = .password }

                    SecureField("Password", text: $password)
                        .textContentType(.password)
                        .focused($focusedField, equals: .password)
                        .submitLabel(.go)
                        .onSubmit { if canSubmit { submit() } }
                }

                if let errorMessage = session.errorMessage {
                    Section {
                        Label(errorMessage, systemImage: "exclamationmark.triangle.fill")
                            .foregroundStyle(.red)
                            .font(.callout)
                    }
                }

                Section {
                    Button(action: submit) {
                        HStack {
                            Spacer()
                            if session.isWorking {
                                ProgressView().tint(.white)
                            } else {
                                Text("Sign In").fontWeight(.semibold)
                            }
                            Spacer()
                        }
                    }
                    .disabled(!canSubmit)
                    .listRowBackground(canSubmit ? Theme.brand : Color.gray.opacity(0.4))
                    .foregroundStyle(.white)
                }
            }
            .navigationTitle("Pharaxis CP")
        }
    }

    private func submit() {
        focusedField = nil
        Task { await session.signIn(email: email, password: password) }
    }
}
