//
//  Session.swift
//  CP-Portal
//

import Foundation

/// Auth, configuration, and consent state for the portal.
///
/// The `cp_portal_token` cookie is persisted by `HTTPCookieStorage` and lives for 24h,
/// so a relaunch inside that window can restore the session by simply asking the
/// backend who we are — there is no token for the app to store itself.
@Observable
final class Session {
    /// Where the user is in the entry sequence. Consent comes before sign-in, matching
    /// the web portal, where the banner blocks the page the login form sits on.
    enum Phase {
        case loading
        case unavailable(String)
        case needsConsent(ConsentNotice)
        case signedOut
        case needsUserType
        case ready
    }

    private(set) var phase: Phase = .loading
    private(set) var config: PortalConfig?
    private(set) var user: PortalUser?

    var errorMessage: String?
    var isWorking = false

    /// Which white-label portal to sign in to. Each client has its own user pool,
    /// so this is part of the credentials, not a display preference.
    var clientCode: String {
        didSet { UserDefaults.standard.set(clientCode, forKey: Self.clientCodeKey) }
    }

    private static let clientCodeKey = "cp.clientCode"

    init() {
        clientCode = UserDefaults.standard.string(forKey: Self.clientCodeKey) ?? "novartis"
    }

    // MARK: Entry sequence

    /// Loads config, then resolves consent → auth → user-type in that order.
    func start() async {
        phase = .loading
        do {
            config = try await PortalAPI.shared.config(clientCode: clientCode)
        } catch {
            phase = .unavailable(error.localizedDescription)
            return
        }

        if let notice = try? await PortalAPI.shared.consentNotice(clientCode: clientCode),
           notice.required, let version = notice.version,
           !hasAcceptedConsent(version: version) {
            phase = .needsConsent(notice)
            return
        }

        await resolveAuth()
    }

    private func resolveAuth() async {
        do {
            let user = try await PortalAPI.shared.currentUser()
            self.user = user
            phase = needsUserTypeConfirmation(for: user) ? .needsUserType : .ready
        } catch {
            // No cookie, or it expired — start at sign-in. This is the normal cold
            // launch, so it is deliberately not surfaced as an error.
            user = nil
            phase = .signedOut
        }
    }

    /// The gate is only meaningful when the client has one configured and the user
    /// has not already confirmed a type.
    private func needsUserTypeConfirmation(for user: PortalUser) -> Bool {
        guard let gate = config?.gate, !gate.userTypes.isEmpty else { return false }
        return !user.hasConfirmedUserType
    }

    // MARK: Consent

    /// Consent acceptance is tracked locally per version.
    ///
    /// The server cannot answer this for us: `/api/portal/consent/check` reads the JWT
    /// only from an `Authorization: Bearer` header, but portal login issues an httpOnly
    /// cookie and deliberately never echoes the token. So the endpoint sees every caller
    /// as anonymous and always replies `consented: false`. Tracking the accepted version
    /// on-device keeps the gate correct for the user; server-side attribution is a
    /// backend fix raised separately.
    private func consentKey(_ version: String) -> String { "cp.consent.\(clientCode).\(version)" }

    func hasAcceptedConsent(version: String) -> Bool {
        UserDefaults.standard.bool(forKey: consentKey(version))
    }

    func acceptConsent(_ notice: ConsentNotice, acceptAll: Bool) async {
        guard let version = notice.version else { return }
        isWorking = true
        defer { isWorking = false }

        // All four categories the web banner records. Recording a different set here
        // would leave the two clients writing incomparable consent records for the
        // same notice version — necessary stays true because the portal cannot run
        // without it, and it is the one category the banner does not offer to refuse.
        let choices = [
            "necessary": true,
            "functional": acceptAll,
            "analytics": acceptAll,
            "marketing": acceptAll,
        ]
        // Record the choice locally first so a network failure cannot trap the user
        // behind a gate they have already answered.
        UserDefaults.standard.set(true, forKey: consentKey(version))
        do {
            try await PortalAPI.shared.recordConsent(
                clientCode: clientCode, version: version, choices: choices
            )
        } catch {
            // Surface rather than swallow: a silently dropped consent POST is exactly
            // the failure that leaves the audit trail short of what the user actually
            // agreed to. The user still proceeds — the local record stands.
            errorMessage = "Your choice was saved on this device but could not be recorded with the portal."
        }
        await resolveAuth()
    }

    // MARK: Auth actions

    func signIn(email: String, password: String) async {
        isWorking = true
        errorMessage = nil
        defer { isWorking = false }

        do {
            var user = try await PortalAPI.shared.login(
                clientCode: clientCode, email: email, password: password
            )
            // The login response is a trimmed "safe" object without specialty or
            // country; /me returns the full profile. Hydrate so downstream logic
            // (e.g. the specialty prompt) sees what the server actually has.
            if let full = try? await PortalAPI.shared.currentUser() { user = full }
            self.user = user
            phase = needsUserTypeConfirmation(for: user) ? .needsUserType : .ready
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func confirmUserType(_ userType: String) async {
        isWorking = true
        errorMessage = nil
        defer { isWorking = false }

        do {
            user = try await PortalAPI.shared.confirmUserType(userType)
            phase = .ready
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func signOut() async {
        try? await PortalAPI.shared.logout()
        user = nil
        phase = .signedOut
    }

    /// Applied after a profile edit so the whole app sees the new values.
    func userDidUpdate(_ updated: PortalUser) {
        user = updated
    }

    /// The specialty prompt appears once per signed-in user without a specialty.
    var shouldPromptSpecialty: Bool {
        guard case .ready = phase, let user else { return false }
        let key = "cp.specialtyPrompted.\(user.id)"
        return (user.specialty ?? "").isEmpty && !UserDefaults.standard.bool(forKey: key)
    }

    func markSpecialtyPrompted() {
        guard let user else { return }
        UserDefaults.standard.set(true, forKey: "cp.specialtyPrompted.\(user.id)")
    }

    // MARK: Feature visibility

    /// Drives which tabs exist. Combines the client's feature toggles with the gate's
    /// per-user-type access map, so the web admin alone decides what the app shows.
    func canSee(_ featureKey: String) -> Bool {
        config?.allows(featureKey, for: user?.userType) ?? false
    }
}
