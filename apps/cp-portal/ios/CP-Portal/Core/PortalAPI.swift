//
//  PortalAPI.swift
//  CP-Portal
//
//  Talks to the CP Portal Express backend (apps/cp-portal/backend, port 4000).
//

import Foundation

// MARK: - Models

/// A portal user as returned by `/api/portal/auth/login` and `/auth/me`.
/// MySQL hands back tinyint flags, so the confirmation flag arrives as 0/1.
struct PortalUser: Decodable, Identifiable {
    let id: Int
    let firstName: String
    let lastName: String
    let email: String
    let userType: String?
    let specialty: String?
    let country: String?
    /// mysql2 returns `tinyint(1)` as 0/1 rather than a JSON boolean, so this is an Int.
    let userTypeConfirmed: Int?

    var displayName: String { "\(firstName) \(lastName)" }
    var hasConfirmedUserType: Bool { userTypeConfirmed == 1 }
}

/// A row from `cp_documents`, already filtered server-side by the caller's user_type.
struct PortalDocument: Decodable, Identifiable {
    let id: Int
    let title: String
    let category: String?
    let docType: String?
    let fileName: String?
    let fileSize: Int?
    let mimeType: String?
    let version: String?
    let downloadCount: Int?
    let createdAt: Date?
}

struct DocumentCategory: Decodable, Identifiable {
    let id: Int
    let name: String
}

/// A row from `cp_saved_items`. The list endpoint enriches each row with the
/// referenced record, but the app only needs the pointer to reconcile save state.
struct SavedItem: Decodable, Identifiable {
    let id: Int
    let itemType: String
    let itemId: Int
}

/// A published post from `cp_news_posts`, already filtered by the caller's user_type.
struct NewsPost: Decodable, Identifiable {
    let id: Int
    let title: String
    let bodyHtml: String?
    let category: String?
    let publishAt: Date?
    /// `tinyint(1)`, so it arrives as 0/1 rather than a JSON boolean.
    let isPinned: Int?
    let viewCount: Int?

    var pinned: Bool { isPinned == 1 }
}

/// One hit from the unified search endpoint, which spans every enabled content type.
struct SearchHit: Decodable, Identifiable {
    let type: String
    let label: String
    let id: Int
    let title: String
    let snippet: String?

    /// `id` alone collides across content types — two rows can both be id 3.
    var hitID: String { "\(type)-\(id)" }
}

/// An in-app notification from `cp_notifications`. The row carries no body — only a
/// type, the content title, and the id of the item it points at.
struct PortalNotification: Decodable, Identifiable {
    let id: Int
    let type: String
    let title: String
    let itemId: Int
    /// `tinyint(1)`, so 0/1 rather than a JSON boolean. Mutable so the store can
    /// flip read state locally without refetching the feed.
    var isRead: Int
    let createdAt: Date?

    var read: Bool { isRead == 1 }

    var icon: String {
        switch type {
        case "safety":   return "exclamationmark.shield.fill"
        case "document": return "doc.text.fill"
        default:         return "newspaper.fill"
        }
    }

    var label: String {
        switch type {
        case "safety":   return "Safety alert"
        case "document": return "New document"
        default:         return "News"
        }
    }
}

/// The client's active consent notice. `version` is what a recorded acceptance is
/// keyed on, so a version bump invalidates prior consent.
struct ConsentNotice: Decodable {
    let required: Bool
    let version: String?
    let strictest: String?
    let jurisdictions: [String]?
    let requireReconsent: Bool?
}

// MARK: - Errors

/// The backend's uniform failure shape: `{ "error": "..." }`.
private struct APIErrorBody: Decodable { let error: String }

/// For endpoints whose body carries nothing the app needs.
struct EmptyResponse: Decodable {}

enum APIError: LocalizedError {
    case badResponse
    case unauthorized
    case server(String)

    var errorDescription: String? {
        switch self {
        case .badResponse:        return "The server returned a response the app could not read."
        case .unauthorized:       return "Your session has expired. Please sign in again."
        case .server(let detail): return detail
        }
    }
}

// MARK: - Client

/// The backend authenticates with an httpOnly `cp_portal_token` cookie rather than a
/// bearer token — login deliberately does not echo the JWT in its response body
/// (see routes/portal/auth.js). URLSession's cookie storage round-trips it for us,
/// so the app needs no token handling and the server keeps its existing security model.
final class PortalAPI {
    static let shared = PortalAPI()

    private let baseURL: URL
    private let session: URLSession
    /// Converts snake_case keys — used for every endpoint with a fixed schema.
    private let decoder: JSONDecoder
    /// Leaves keys exactly as sent. Required wherever the JSON contains a *map*
    /// whose keys are data (feature keys, user types) rather than field names.
    private let rawDecoder: JSONDecoder

    private init() {
        let configured = Bundle.main.object(forInfoDictionaryKey: "CPPortalBaseURL") as? String
        baseURL = URL(string: configured ?? "http://localhost:4000") ?? URL(string: "http://localhost:4000")!

        let config = URLSessionConfiguration.default
        config.httpCookieAcceptPolicy = .always
        config.httpShouldSetCookies = true
        config.httpCookieStorage = .shared
        session = URLSession(configuration: config)

        decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .convertFromSnakeCase
        decoder.dateDecodingStrategy = Self.mysqlDateStrategy

        rawDecoder = JSONDecoder()
        rawDecoder.dateDecodingStrategy = Self.mysqlDateStrategy
    }

    /// mysql2 serialises DATETIME columns as ISO-8601 *with* milliseconds, which the
    /// stock `.iso8601` strategy rejects — accept both shapes.
    private static let mysqlDateStrategy: JSONDecoder.DateDecodingStrategy = .custom { decoder in
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

    // MARK: Endpoints

    func login(clientCode: String, email: String, password: String) async throws -> PortalUser {
        struct Body: Encodable {
            let clientCode: String
            let email: String
            let password: String
            enum CodingKeys: String, CodingKey {
                case clientCode = "client_code"
                case email, password
            }
        }
        struct Response: Decodable { let user: PortalUser }
        let response: Response = try await send(
            "POST", "/api/portal/auth/login",
            body: Body(clientCode: clientCode, email: email, password: password)
        )
        return response.user
    }

    /// Restores the signed-in user from the persisted cookie, or throws `.unauthorized`.
    func currentUser() async throws -> PortalUser {
        struct Response: Decodable { let user: PortalUser }
        let response: Response = try await send("GET", "/api/portal/auth/me")
        return response.user
    }

    /// The portal's public configuration. Decoded with the raw decoder so the
    /// `features` and `accessMap` dictionary keys survive as sent — snake_case
    /// conversion would rewrite `document_library` into `documentLibrary` and
    /// silently break every feature lookup.
    func config(clientCode: String) async throws -> PortalConfig {
        try await send("GET", "/api/portal/config/\(clientCode)", decoder: rawDecoder)
    }

    /// Confirms the user's type once, which sets `user_type_confirmed` and decides
    /// what the gate's access map will let them open.
    func confirmUserType(_ userType: String) async throws -> PortalUser {
        struct Body: Encodable {
            let userType: String
            enum CodingKeys: String, CodingKey { case userType = "user_type" }
        }
        struct Response: Decodable { let user: PortalUser }
        let response: Response = try await send(
            "PATCH", "/api/portal/auth/confirm-type", body: Body(userType: userType)
        )
        return response.user
    }

    func consentNotice(clientCode: String) async throws -> ConsentNotice {
        try await send("GET", "/api/portal/consent/current", query: ["clientCode": clientCode])
    }

    func recordConsent(clientCode: String, version: String, choices: [String: Bool]) async throws {
        // NB: this endpoint reads `clientCode` in camelCase, unlike /auth/login which
        // reads `client_code`. The keys below are literal, not derived.
        struct Body: Encodable {
            let clientCode: String
            let version: String
            let choices: [String: Bool]
        }
        let _: EmptyResponse = try await send(
            "POST", "/api/portal/consent",
            body: Body(clientCode: clientCode, version: version, choices: choices)
        )
    }

    struct NewsPage: Decodable {
        let posts: [NewsPost]
        let total: Int
        let page: Int
        let limit: Int
        let allCategories: [String]
    }

    /// One page of news, matching the web's server-side pagination, category filter
    /// and search. `allCategories` always reflects the full visible set, so the
    /// filter chips stay stable while a category or search filter is applied.
    func news(
        clientCode: String, page: Int = 1, category: String? = nil, search: String? = nil
    ) async throws -> NewsPage {
        var query = ["clientCode": clientCode, "page": String(page), "limit": "10"]
        if let category, !category.isEmpty { query["category"] = category }
        if let search, !search.isEmpty { query["search"] = search }
        return try await send("GET", "/api/portal/news", query: query)
    }

    func newsPost(id: Int, clientCode: String) async throws -> NewsPost {
        struct Response: Decodable { let post: NewsPost }
        let response: Response = try await send(
            "GET", "/api/portal/news/\(id)", query: ["clientCode": clientCode]
        )
        return response.post
    }

    struct AISearchHit: Decodable, Identifiable {
        let id: Int
        let title: String
        let category: String?
        let docType: String?
        let relevanceScore: Double?
        let reason: String?
    }

    struct AISearchResult: Decodable {
        let results: [AISearchHit]
        /// Present and true when the portal has no AI provider configured or the
        /// provider call failed — the caller falls back to plain filtering.
        let aiUnavailable: Bool?
    }

    /// Semantic document search. Unlike most endpoints this one reads camelCase
    /// `clientCode` in the body and can answer "unavailable" as a *successful*
    /// response, so availability is data here, not an error.
    func aiSearchDocuments(_ query: String, clientCode: String) async throws -> AISearchResult {
        struct Body: Encodable { let clientCode: String; let query: String }
        return try await send(
            "POST", "/api/portal/documents/ai-search",
            body: Body(clientCode: clientCode, query: query)
        )
    }

    // MARK: Notifications

    struct NotificationFeed: Decodable {
        let notifications: [PortalNotification]
        let unreadCount: Int
    }

    func notifications(clientCode: String) async throws -> NotificationFeed {
        try await send("GET", "/api/portal/notifications", query: ["clientCode": clientCode])
    }

    func markAllNotificationsRead(clientCode: String) async throws {
        // NB: this endpoint reads `clientCode` from the BODY, not the query string.
        struct Body: Encodable { let clientCode: String }
        let _: EmptyResponse = try await send(
            "PATCH", "/api/portal/notifications/read-all", body: Body(clientCode: clientCode)
        )
    }

    func markNotificationRead(id: Int) async throws {
        let _: EmptyResponse = try await send("PATCH", "/api/portal/notifications/\(id)/read")
    }

    // MARK: Engagement pings

    private struct OKResponse: Decodable { let ok: Bool? }

    /// Records a read against the item's `view_count`. That column feeds the admin
    /// analytics dashboard ("top safety alerts by views"), so without these the
    /// client's engagement figures silently exclude every app reader.
    ///
    /// Detached on purpose: a plain `.task` is cancelled the moment the reader
    /// navigates back, which for a short article is often before the request
    /// completes — the ping then never lands. Analytics must never interrupt or
    /// depend on reading, so failures are ignored but cancellation is not inherited.
    func recordNewsView(postID: Int, clientCode: String) {
        Task.detached { [weak self] in
            let _: OKResponse? = try? await self?.send(
                "POST", "/api/portal/news/\(clientCode)/posts/\(postID)/view"
            )
        }
    }

    func recordSafetyAlertView(alertID: Int, clientCode: String) {
        Task.detached { [weak self] in
            let _: OKResponse? = try? await self?.send(
                "POST", "/api/portal/safety/\(clientCode)/alerts/\(alertID)/view"
            )
        }
    }

    func search(_ query: String, clientCode: String) async throws -> [SearchHit] {
        struct Response: Decodable { let results: [SearchHit] }
        let response: Response = try await send(
            "GET", "/api/portal/search", query: ["clientCode": clientCode, "q": query]
        )
        return response.results
    }

    /// Resolves a backend-relative path (e.g. an uploads file) against the base URL.
    func absoluteURL(_ path: String) -> String {
        path.hasPrefix("http") ? path : baseURL.appending(path: path).absoluteString
    }

    // MARK: Content

    func safetyAlerts(clientCode: String) async throws -> [SafetyAlert] {
        struct Response: Decodable { let alerts: [SafetyAlert] }
        let response: Response = try await send(
            "GET", "/api/portal/safety", query: ["clientCode": clientCode]
        )
        return response.alerts
    }

    func faqs(clientCode: String) async throws -> [FAQItem] {
        struct Response: Decodable { let faqs: [FAQItem] }
        let response: Response = try await send("GET", "/api/portal/faq/\(clientCode)")
        return response.faqs
    }

    func events(clientCode: String) async throws -> [PortalEvent] {
        struct Response: Decodable { let items: [PortalEvent] }
        let response: Response = try await send(
            "GET", "/api/portal/content/\(clientCode)/events"
        )
        return response.items
    }

    func resources(clientCode: String) async throws -> [PortalResource] {
        struct Response: Decodable { let items: [PortalResource] }
        let response: Response = try await send(
            "GET", "/api/portal/content/\(clientCode)/resources"
        )
        return response.items
    }

    func drugs(clientCode: String, therapeuticAreaID: Int? = nil) async throws -> [Drug] {
        struct Response: Decodable { let items: [Drug] }
        var query: [String: String] = [:]
        if let therapeuticAreaID { query["therapeutic_area_id"] = String(therapeuticAreaID) }
        let response: Response = try await send(
            "GET", "/api/portal/content/\(clientCode)/drugs", query: query
        )
        return response.items
    }

    func therapeuticAreas(clientCode: String) async throws -> [TherapeuticArea] {
        struct Response: Decodable { let items: [TherapeuticArea] }
        let response: Response = try await send(
            "GET", "/api/portal/content/\(clientCode)/therapeutic-areas"
        )
        return response.items
    }

    /// Downloads a document for in-app viewing. `disposition=inline` matches how
    /// the web viewer fetches; the bytes land in a temporary file for PDFKit.
    func downloadDocument(id: Int, fileName: String) async throws -> URL {
        let url = baseURL.appending(path: "/api/portal/documents/\(id)/download")
            .appending(queryItems: [URLQueryItem(name: "disposition", value: "inline")])
        let (data, response) = try await session.data(from: url)
        guard let http = response as? HTTPURLResponse, http.statusCode == 200 else {
            throw APIError.server("Could not download the document.")
        }
        let destination = FileManager.default.temporaryDirectory
            .appending(path: "\(id)-\(fileName)")
        try data.write(to: destination)
        return destination
    }

    // MARK: Dynamic forms & submission

    func formFields(clientCode: String, formType: String) async throws -> [FormField] {
        struct Response: Decodable { let fields: [FormField] }
        let response: Response = try await send(
            "GET", "/api/portal/content/\(clientCode)/forms/\(formType)"
        )
        return response.fields
    }

    /// Multipart submit, matching the web's FormData shape: a `form_data` JSON part
    /// plus one `attachments` part per file.
    func submit(
        clientCode: String,
        formType: String,
        formData: [String: String],
        submitterName: String?,
        submitterEmail: String?,
        attachments: [PendingAttachment]
    ) async throws -> String? {
        struct Response: Decodable {
            let message: String?
            let reference: String?
        }

        let boundary = "cp-portal-\(UUID().uuidString)"
        var body = Data()
        func addField(_ name: String, _ value: String) {
            body.append(Data("--\(boundary)\r\n".utf8))
            body.append(Data("Content-Disposition: form-data; name=\"\(name)\"\r\n\r\n".utf8))
            body.append(Data("\(value)\r\n".utf8))
        }

        let json = try JSONSerialization.data(withJSONObject: formData)
        addField("form_data", String(decoding: json, as: UTF8.self))
        if let submitterName { addField("submitter_name", submitterName) }
        if let submitterEmail { addField("submitter_email", submitterEmail) }

        for attachment in attachments {
            body.append(Data("--\(boundary)\r\n".utf8))
            body.append(Data(
                "Content-Disposition: form-data; name=\"attachments\"; filename=\"\(attachment.fileName)\"\r\n".utf8))
            body.append(Data("Content-Type: \(attachment.mimeType)\r\n\r\n".utf8))
            body.append(attachment.data)
            body.append(Data("\r\n".utf8))
        }
        body.append(Data("--\(boundary)--\r\n".utf8))

        var request = URLRequest(url: baseURL.appending(path: "/api/portal/submit/\(clientCode)/\(formType)"))
        request.httpMethod = "POST"
        request.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")
        request.httpBody = body

        let (data, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
            if let parsed = try? JSONDecoder().decode(APIErrorBody.self, from: data) {
                throw APIError.server(parsed.error)
            }
            throw APIError.server("Submission failed.")
        }
        return (try? decoder.decode(Response.self, from: data))?.reference
    }

    // MARK: Account

    func updateProfile(firstName: String?, lastName: String?, country: String?, specialty: String?) async throws -> PortalUser {
        struct Body: Encodable {
            let firstName: String?
            let lastName: String?
            let country: String?
            let specialty: String?
            enum CodingKeys: String, CodingKey {
                case firstName = "first_name"
                case lastName = "last_name"
                case country, specialty
            }
        }
        struct Response: Decodable { let user: PortalUser }
        let response: Response = try await send(
            "PATCH", "/api/portal/auth/profile",
            body: Body(firstName: firstName, lastName: lastName, country: country, specialty: specialty)
        )
        return response.user
    }

    func changePassword(current: String, new: String) async throws {
        struct Body: Encodable {
            let currentPassword: String
            let newPassword: String
            enum CodingKeys: String, CodingKey {
                case currentPassword = "current_password"
                case newPassword = "new_password"
            }
        }
        let _: EmptyResponse = try await send(
            "PATCH", "/api/portal/auth/password", body: Body(currentPassword: current, newPassword: new)
        )
    }

    func submissions() async throws -> [Submission] {
        struct Response: Decodable { let submissions: [Submission] }
        let response: Response = try await send("GET", "/api/portal/auth/me")
        return response.submissions
    }

    func preferences() async throws -> NotificationPrefs {
        struct Response: Decodable { let prefs: NotificationPrefs }
        let response: Response = try await send("GET", "/api/portal/preferences")
        return response.prefs
    }

    func updatePreferences(_ prefs: NotificationPrefs) async throws {
        let _: EmptyResponse = try await send("PATCH", "/api/portal/preferences", body: prefs)
    }

    func activity(clientCode: String) async throws -> ActivitySummary {
        try await send("GET", "/api/portal/personal/activity", query: ["clientCode": clientCode])
    }

    func savedEntries(clientCode: String) async throws -> [SavedEntry] {
        struct Response: Decodable { let saved: [SavedEntry] }
        let response: Response = try await send(
            "GET", "/api/portal/saved", query: ["clientCode": clientCode]
        )
        return response.saved
    }

    func follows(clientCode: String) async throws -> [FollowEntry] {
        struct Response: Decodable { let follows: [FollowEntry] }
        let response: Response = try await send(
            "GET", "/api/portal/personal/follows", query: ["clientCode": clientCode]
        )
        return response.follows
    }

    func setFollowing(_ following: Bool, therapeuticAreaID: Int, clientCode: String) async throws {
        // Same mixed-casing convention as /saved.
        struct Body: Encodable {
            let clientCode: String
            let itemType: String
            let itemId: Int
            enum CodingKeys: String, CodingKey {
                case clientCode
                case itemType = "item_type"
                case itemId = "item_id"
            }
        }
        let _: EmptyResponse = try await send(
            following ? "POST" : "DELETE", "/api/portal/personal/follows",
            body: Body(clientCode: clientCode, itemType: "therapeutic_area", itemId: therapeuticAreaID)
        )
    }

    // MARK: MSLs & bookings

    func msls(clientCode: String) async throws -> [MSL] {
        struct Response: Decodable { let items: [MSL] }
        let response: Response = try await send(
            "GET", "/api/portal/content/\(clientCode)/msls"
        )
        return response.items
    }

    func slots(clientCode: String, mslID: Int) async throws -> [MSLSlot] {
        struct Response: Decodable { let slots: [MSLSlot] }
        let response: Response = try await send(
            "GET", "/api/portal/bookings/\(clientCode)/\(mslID)/slots"
        )
        return response.slots
    }

    func requestBooking(
        clientCode: String, mslID: Int, name: String, email: String,
        topic: String?, message: String?, slotID: Int?, preferredDate: String?
    ) async throws {
        struct Body: Encodable {
            let requesterName: String
            let requesterEmail: String
            let topic: String?
            let message: String?
            let slotId: Int?
            let preferredDate: String?
            enum CodingKeys: String, CodingKey {
                case requesterName = "requester_name"
                case requesterEmail = "requester_email"
                case topic, message
                case slotId = "slot_id"
                case preferredDate = "preferred_date"
            }
        }
        let _: EmptyResponse = try await send(
            "POST", "/api/portal/bookings/\(clientCode)/\(mslID)",
            body: Body(requesterName: name, requesterEmail: email, topic: topic,
                       message: message, slotId: slotID, preferredDate: preferredDate)
        )
    }

    // MARK: Chat & feedback

    func chat(message: String, history: [[String: String]], clientCode: String) async throws -> (reply: String, sources: [String]) {
        struct Body: Encodable {
            let message: String
            let history: [[String: String]]
        }
        struct Response: Decodable {
            let reply: String?
            let sources: [String]?
        }
        let response: Response = try await send(
            "POST", "/api/portal/chatbox/\(clientCode)",
            body: Body(message: message, history: history)
        )
        return (response.reply ?? "", response.sources ?? [])
    }

    func sendFeedback(rating: Int, comment: String, screen: String, clientCode: String) async throws {
        struct Body: Encodable {
            let rating: Int
            let comment: String
            let pageUrl: String
            enum CodingKeys: String, CodingKey {
                case rating, comment
                case pageUrl = "page_url"
            }
        }
        let _: EmptyResponse = try await send(
            "POST", "/api/portal/feedback/\(clientCode)",
            body: Body(rating: rating, comment: comment, pageUrl: screen)
        )
    }

    func documents(clientCode: String) async throws -> (documents: [PortalDocument], categories: [DocumentCategory]) {
        struct Response: Decodable {
            let documents: [PortalDocument]
            let categories: [DocumentCategory]
        }
        let response: Response = try await send(
            "GET", "/api/portal/documents", query: ["clientCode": clientCode]
        )
        return (response.documents, response.categories)
    }

    /// Document IDs the signed-in user has saved, used to seed the bookmark toggles.
    func savedDocumentIDs(clientCode: String) async throws -> Set<Int> {
        struct Response: Decodable { let saved: [SavedItem] }
        let response: Response = try await send(
            "GET", "/api/portal/saved", query: ["clientCode": clientCode]
        )
        return Set(response.saved.filter { $0.itemType == "document" }.map(\.itemId))
    }

    func setSaved(_ saved: Bool, documentID: Int, clientCode: String, itemType: String = "document") async throws {
        // NB: this endpoint mixes casing in a single body — `clientCode` camelCase
        // alongside `item_type` / `item_id` snake_case. Keys are literal.
        struct Body: Encodable {
            let clientCode: String
            let itemType: String
            let itemId: Int
            enum CodingKeys: String, CodingKey {
                case clientCode
                case itemType = "item_type"
                case itemId = "item_id"
            }
        }
        struct Response: Decodable { let saved: Bool }
        let _: Response = try await send(
            saved ? "POST" : "DELETE", "/api/portal/saved",
            body: Body(clientCode: clientCode, itemType: itemType, itemId: documentID)
        )
    }

    func logout() async throws {
        struct Response: Decodable { let message: String }
        let _: Response = try await send("POST", "/api/portal/auth/logout")
        HTTPCookieStorage.shared.cookies?
            .filter { $0.name == "cp_portal_token" }
            .forEach(HTTPCookieStorage.shared.deleteCookie)
    }

    // MARK: Transport

    private func send<T: Decodable>(
        _ method: String,
        _ path: String,
        query: [String: String] = [:],
        body: (any Encodable)? = nil,
        decoder overrideDecoder: JSONDecoder? = nil
    ) async throws -> T {
        var components = URLComponents(url: baseURL.appending(path: path), resolvingAgainstBaseURL: false)
        if !query.isEmpty {
            components?.queryItems = query.map { URLQueryItem(name: $0.key, value: $0.value) }
        }
        guard let url = components?.url else { throw APIError.badResponse }

        var request = URLRequest(url: url)
        request.httpMethod = method
        if let body {
            // No key strategy on purpose. The backend is not consistent about request
            // body casing — /auth/login reads `client_code` while /consent reads
            // `clientCode`, and /saved mixes both in one body. A blanket conversion
            // silently sends the wrong key and the endpoint 400s on a missing field,
            // so every Body spells its wire keys out explicitly instead.
            request.httpBody = try JSONEncoder().encode(body)
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        }

        let (data, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse else { throw APIError.badResponse }

        guard (200..<300).contains(http.statusCode) else {
            // Prefer the backend's own wording. A 401 from /auth/login means the
            // credentials were wrong, not that a session lapsed — only fall back to
            // the generic "session expired" when there is no message to show.
            if let parsed = try? JSONDecoder().decode(APIErrorBody.self, from: data) {
                throw APIError.server(parsed.error)
            }
            if http.statusCode == 401 { throw APIError.unauthorized }
            throw APIError.server("Request failed (HTTP \(http.statusCode)).")
        }

        // An empty 200 body is valid for the write endpoints that return only a
        // message; decoding it into an empty struct would otherwise fail.
        if data.isEmpty, let empty = EmptyResponse() as? T { return empty }

        do {
            return try (overrideDecoder ?? decoder).decode(T.self, from: data)
        } catch {
            throw APIError.badResponse
        }
    }
}
