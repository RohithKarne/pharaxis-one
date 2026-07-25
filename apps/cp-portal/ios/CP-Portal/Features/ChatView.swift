//
//  ChatView.swift
//  CP-Portal
//
//  The AI medical assistant. The provider key never reaches the device — the
//  backend decrypts it server-side and proxies the model call. Mirrors the web
//  widget's rules: last 8 messages as history, 500-character cap, send cooldown.
//

import SwiftUI

struct ChatMessage: Identifiable {
    let id = UUID()
    let role: String // "user" | "assistant"
    let text: String
    var sources: [String] = []
}

struct ChatView: View {
    @Environment(Session.self) private var session

    @State private var messages: [ChatMessage] = []
    @State private var draft = ""
    @State private var isSending = false
    @State private var sendError: String?

    private let characterCap = 500

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                ScrollViewReader { proxy in
                    ScrollView {
                        LazyVStack(alignment: .leading, spacing: 12) {
                            disclaimer
                            ForEach(messages) { message in
                                bubble(message)
                            }
                            if isSending {
                                HStack {
                                    ProgressView()
                                    Text("Thinking…").font(.caption).foregroundStyle(.secondary)
                                }
                                .id("typing")
                            }
                        }
                        .padding(16)
                    }
                    .onChange(of: messages.count) {
                        if let last = messages.last {
                            withAnimation { proxy.scrollTo(last.id, anchor: .bottom) }
                        }
                    }
                }

                if let sendError {
                    Text(sendError)
                        .font(.caption)
                        .foregroundStyle(.red)
                        .padding(.horizontal, 16)
                        .padding(.bottom, 4)
                }

                composer
            }
            .navigationTitle("Medical Assistant")
            .navigationBarTitleDisplayMode(.inline)
        }
    }

    private var disclaimer: some View {
        Text("This assistant provides general information from approved content only. Always consult a healthcare provider for medical decisions.")
            .font(.caption)
            .foregroundStyle(.secondary)
            .padding(12)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Color(.secondarySystemBackground), in: .rect(cornerRadius: 10))
    }

    private func bubble(_ message: ChatMessage) -> some View {
        VStack(alignment: message.role == "user" ? .trailing : .leading, spacing: 4) {
            Text(message.text)
                .padding(12)
                .background(
                    message.role == "user" ? Theme.brand : Color(.secondarySystemBackground),
                    in: .rect(cornerRadius: 14)
                )
                .foregroundStyle(message.role == "user" ? .white : .primary)
            if !message.sources.isEmpty {
                Text("Sources: \(message.sources.joined(separator: " · "))")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }
        }
        .frame(maxWidth: .infinity, alignment: message.role == "user" ? .trailing : .leading)
        .id(message.id)
    }

    private var composer: some View {
        HStack(spacing: 10) {
            TextField("Ask about approved content…", text: $draft, axis: .vertical)
                .lineLimit(1...4)
                .textFieldStyle(.roundedBorder)
                .onChange(of: draft) { _, newValue in
                    if newValue.count > characterCap { draft = String(newValue.prefix(characterCap)) }
                }
            Button {
                Task { await send() }
            } label: {
                Image(systemName: "arrow.up.circle.fill")
                    .font(.title2)
                    .foregroundStyle(canSend ? Theme.brand : .secondary)
            }
            .disabled(!canSend)
        }
        .padding(12)
        .background(.bar)
    }

    private var canSend: Bool {
        !draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && !isSending
    }

    private func send() async {
        let text = draft.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { return }
        draft = ""
        sendError = nil
        messages.append(ChatMessage(role: "user", text: text))
        isSending = true
        defer { isSending = false }

        // Web sends the last 8 turns as context.
        let history = messages.suffix(8).map { ["role": $0.role, "content": $0.text] }
        do {
            let result = try await PortalAPI.shared.chat(
                message: text, history: Array(history), clientCode: session.clientCode
            )
            messages.append(ChatMessage(role: "assistant", text: result.reply, sources: result.sources))
        } catch {
            sendError = error.localizedDescription
        }
    }
}
