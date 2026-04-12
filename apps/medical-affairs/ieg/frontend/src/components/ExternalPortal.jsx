import { statusClass } from './utils'

export default function ExternalPortal({
  grantSubmission,
  setGrantSubmission,
  iitSubmission,
  setIitSubmission,
  eapSubmission,
  setEapSubmission,
  submitExternalGrant,
  submitExternalIit,
  submitExternalEap,
  refreshExternalData,
  submissions,
  notifications,
  externalModules
}) {
  const has = (moduleKey) => externalModules.includes(moduleKey)

  return (
    <main className="dashboard-shell external">
      <div className="content-grid external-grid">
        <section className="panel reveal-up delay-2">
          <div className="panel-head">
            <h2>Applicant Portal</h2>
            <span className="muted">Submit requests with full traceability and live notification feedback.</span>
          </div>

          {has('grants') ? (
            <div className="ops-block">
              <h3>Grant Application</h3>
              <div className="form-grid three">
                <div>
                  <label>Applicant Name</label>
                  <input
                    placeholder="Name"
                    value={grantSubmission.applicantName}
                    onChange={(e) => setGrantSubmission((prev) => ({ ...prev, applicantName: e.target.value }))}
                  />
                </div>
                <div>
                  <label>Applicant Type</label>
                  <select
                    value={grantSubmission.applicantType}
                    onChange={(e) => setGrantSubmission((prev) => ({ ...prev, applicantType: e.target.value }))}
                  >
                    <option value="hcp">HCP</option>
                    <option value="institution">Institution</option>
                    <option value="cme_provider">CME Provider</option>
                  </select>
                </div>
                <div>
                  <label>Requested Amount (USD)</label>
                  <input
                    placeholder="e.g. 180000"
                    value={grantSubmission.requestedAmount}
                    onChange={(e) => setGrantSubmission((prev) => ({ ...prev, requestedAmount: e.target.value }))}
                  />
                </div>
              </div>
              <button onClick={submitExternalGrant}>Submit Grant Request</button>
            </div>
          ) : null}

          {has('iit') ? (
            <div className="ops-block">
              <h3>IIT Proposal</h3>
              <div className="form-grid three">
                <div>
                  <label>Investigator Name</label>
                  <input
                    placeholder="Principal investigator"
                    value={iitSubmission.investigatorName}
                    onChange={(e) => setIitSubmission((prev) => ({ ...prev, investigatorName: e.target.value }))}
                  />
                </div>
                <div>
                  <label>Support Type</label>
                  <select
                    value={iitSubmission.supportType}
                    onChange={(e) => setIitSubmission((prev) => ({ ...prev, supportType: e.target.value }))}
                  >
                    <option value="funding">Funding</option>
                    <option value="drug_supply">Drug Supply</option>
                    <option value="both">Both</option>
                  </select>
                </div>
                <div>
                  <label>Requested Amount (USD)</label>
                  <input
                    placeholder="e.g. 220000"
                    value={iitSubmission.requestedAmount}
                    onChange={(e) => setIitSubmission((prev) => ({ ...prev, requestedAmount: e.target.value }))}
                  />
                </div>
              </div>
              <button className="secondary" onClick={submitExternalIit}>Submit IIT Proposal</button>
            </div>
          ) : null}

          {has('eap') ? (
            <div className="ops-block">
              <h3>EAP Request</h3>
              <div className="form-grid three">
                <div>
                  <label>Physician Name</label>
                  <input
                    placeholder="Dr. Jane Doe"
                    value={eapSubmission.physicianName}
                    onChange={(e) => setEapSubmission((prev) => ({ ...prev, physicianName: e.target.value }))}
                  />
                </div>
                <div>
                  <label>Physician Email</label>
                  <input
                    placeholder="physician@hospital.org"
                    value={eapSubmission.physicianEmail}
                    onChange={(e) => setEapSubmission((prev) => ({ ...prev, physicianEmail: e.target.value }))}
                  />
                </div>
                <div>
                  <label>Requested Drug</label>
                  <input
                    placeholder="Investigational drug"
                    value={eapSubmission.requestedDrug}
                    onChange={(e) => setEapSubmission((prev) => ({ ...prev, requestedDrug: e.target.value }))}
                  />
                </div>
              </div>
              <div className="form-grid three">
                <div>
                  <label>Condition Category</label>
                  <select
                    value={eapSubmission.conditionCategory}
                    onChange={(e) => setEapSubmission((prev) => ({ ...prev, conditionCategory: e.target.value }))}
                  >
                    <option value="oncology">Oncology</option>
                    <option value="rare_disease">Rare Disease</option>
                    <option value="neurology">Neurology</option>
                    <option value="other">Other</option>
                  </select>
                </div>
                <div>
                  <label>Urgency</label>
                  <select
                    value={eapSubmission.urgencyLevel}
                    onChange={(e) => setEapSubmission((prev) => ({ ...prev, urgencyLevel: e.target.value }))}
                  >
                    <option value="standard">Standard</option>
                    <option value="urgent">Urgent</option>
                    <option value="emergency">Emergency</option>
                  </select>
                </div>
                <div>
                  <label>Emergency Fast Track</label>
                  <select
                    value={String(eapSubmission.emergencyFlag)}
                    onChange={(e) => setEapSubmission((prev) => ({ ...prev, emergencyFlag: e.target.value === 'true' }))}
                  >
                    <option value="false">No</option>
                    <option value="true">Yes</option>
                  </select>
                </div>
              </div>
              <button className="secondary" onClick={submitExternalEap}>Submit EAP Request</button>
            </div>
          ) : null}

          <button className="ghost" onClick={refreshExternalData}>Refresh My Dashboard</button>
        </section>

        <aside className="side-stack reveal-up delay-3">
          <section className="panel">
            <div className="panel-head compact">
              <h2>My Submissions</h2>
              <span className="badge-value">{submissions.length}</span>
            </div>
            <div className="list-scroll">
              {submissions.length === 0 ? <p className="muted">No submissions yet.</p> : null}
              {submissions.map((submission) => (
                <article className="list-item" key={`${submission.module_key}-${submission.id}`}>
                  <div className="list-top">
                    <strong>{submission.module_key.toUpperCase()} · {submission.code}</strong>
                    <span className={statusClass(submission.status)}>{submission.status}</span>
                  </div>
                  <div className="muted small">{submission.current_stage}</div>
                </article>
              ))}
            </div>
          </section>

          <section className="panel">
            <div className="panel-head compact">
              <h2>Notification Feed</h2>
              <span className="badge-value">{notifications.length}</span>
            </div>
            <div className="list-scroll">
              {notifications.map((notification) => (
                <article className="list-item" key={notification.id}>
                  <div className="list-top">
                    <strong>{notification.title}</strong>
                    <span className={statusClass(notification.status)}>{notification.status}</span>
                  </div>
                  <div className="muted small">{notification.channel}</div>
                </article>
              ))}
            </div>
          </section>
        </aside>
      </div>
    </main>
  )
}
