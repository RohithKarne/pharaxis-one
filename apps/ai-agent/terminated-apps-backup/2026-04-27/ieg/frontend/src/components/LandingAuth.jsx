export default function LandingAuth({ authForm, setAuthForm, loginInternal, loginExternal, registerExternal, error, ok }) {
  return (
    <div className="auth-shell">
      <section className="auth-hero reveal-up">
        <div className="brand-mark">IEG</div>
        <h1>Investigator Engagement & Grants</h1>
        <p>
          Premium workflow workspace for medical affairs teams. Manage grants, IIT operations, EAP pathways,
          compliance decisions, and external collaborations in one controlled platform.
        </p>
        <div className="hero-pill-row">
          <span className="hero-pill">US Compliance First</span>
          <span className="hero-pill">Audit-Ready</span>
          <span className="hero-pill">Sprint 2 Live</span>
        </div>
      </section>

      <section className="auth-card reveal-up delay-1">
        <h2>Secure Access</h2>
        <p className="muted">Use internal sign-in or register on external grants/IIT/EAP portal.</p>

        <label>Email</label>
        <input
          placeholder="you@company.com"
          value={authForm.email}
          onChange={(e) => setAuthForm((prev) => ({ ...prev, email: e.target.value }))}
        />

        <label>Password</label>
        <input
          type="password"
          placeholder="Your password"
          value={authForm.password}
          onChange={(e) => setAuthForm((prev) => ({ ...prev, password: e.target.value }))}
        />

        <div className="action-row">
          <button onClick={loginInternal}>Internal Login</button>
          <button className="ghost" onClick={loginExternal}>External Login</button>
        </div>

        <div className="divider">External registration</div>

        <label>Display Name</label>
        <input
          placeholder="Dr. Jane Doe"
          value={authForm.displayName}
          onChange={(e) => setAuthForm((prev) => ({ ...prev, displayName: e.target.value }))}
        />

        <label>User Type</label>
        <select
          value={authForm.userType}
          onChange={(e) => setAuthForm((prev) => ({ ...prev, userType: e.target.value }))}
        >
          <option value="grants_applicant">Grants Applicant</option>
          <option value="iit_investigator">IIT Investigator</option>
          <option value="eap_physician">EAP Physician</option>
          <option value="institution">Institution</option>
        </select>

        <button className="secondary" onClick={registerExternal}>Create External Account</button>

        {error ? <div className="banner error">{error}</div> : null}
        {ok ? <div className="banner success">{ok}</div> : null}
      </section>
    </div>
  )
}
