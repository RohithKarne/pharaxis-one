import { formatCurrency, statusClass } from './utils'
import ModuleSwitcher from './ModuleSwitcher'

export default function InternalDashboard({
  moduleKey,
  setModuleKey,
  modules,
  tasks,
  grants,
  iit,
  eap,
  notifications,
  grantOps,
  setGrantOps,
  iitOps,
  setIitOps,
  eapOps,
  setEapOps,
  integrationOps,
  setIntegrationOps,
  platformOps,
  setPlatformOps,
  runGrantCompleteness,
  runGrantCompliance,
  runIitTriage,
  runIitFmv,
  runEapIntakeReview,
  runEapPathway,
  runEapEmergency,
  runEapSupply,
  runEapSafety,
  runEapSafetyReport,
  runDmsSync,
  runClinicalTrialLink,
  runErpExport,
  runConvertIitToGrant,
  runAiSummary,
  runAiScore,
  runOverlayEvaluate,
  runSavePolicyRule,
  runEvaluatePolicy,
  runAnalyticsSnapshot,
  refreshInternalData
}) {
  return (
    <main className="dashboard-shell">
      <ModuleSwitcher
        moduleKey={moduleKey}
        setModuleKey={setModuleKey}
        modules={modules}
        refreshInternalData={refreshInternalData}
      />

      <div className="content-grid">
        <section className="panel reveal-up delay-2">
          <div className="panel-head">
            <h2>Operations Studio</h2>
            <span className="muted">Run Sprint 1 + Sprint 2 operations from one control center.</span>
          </div>

          <div className="ops-block">
            <h3>Grant Workflow Controls</h3>
            <div className="form-grid three">
              <div>
                <label>Grant Application ID</label>
                <input
                  placeholder="e.g. 104"
                  value={grantOps.id}
                  onChange={(e) => setGrantOps((prev) => ({ ...prev, id: e.target.value }))}
                />
              </div>
              <div>
                <label>Completeness Outcome</label>
                <select
                  value={String(grantOps.isComplete)}
                  onChange={(e) => setGrantOps((prev) => ({ ...prev, isComplete: e.target.value === 'true' }))}
                >
                  <option value="true">Complete</option>
                  <option value="false">Return for correction</option>
                </select>
              </div>
              <div>
                <label>COI Declaration</label>
                <select
                  value={String(grantOps.coiDeclared)}
                  onChange={(e) => setGrantOps((prev) => ({ ...prev, coiDeclared: e.target.value === 'true' }))}
                >
                  <option value="false">No COI</option>
                  <option value="true">COI Declared</option>
                </select>
              </div>
            </div>
            <label>Completeness Comments</label>
            <textarea
              placeholder="Add review feedback..."
              value={grantOps.comments}
              onChange={(e) => setGrantOps((prev) => ({ ...prev, comments: e.target.value }))}
            />
            <div className="action-row">
              <button onClick={runGrantCompleteness}>Submit Completeness Check</button>
              <button className="ghost" onClick={runGrantCompliance}>Run COI / Compliance Screening</button>
            </div>
          </div>

          <div className="ops-block">
            <h3>IIT Workflow Controls</h3>
            <div className="form-grid three">
              <div>
                <label>IIT Proposal ID</label>
                <input
                  placeholder="e.g. 208"
                  value={iitOps.id}
                  onChange={(e) => setIitOps((prev) => ({ ...prev, id: e.target.value }))}
                />
              </div>
              <div>
                <label>Triage Decision</label>
                <select
                  value={iitOps.triageDecision}
                  onChange={(e) => setIitOps((prev) => ({ ...prev, triageDecision: e.target.value }))}
                >
                  <option value="proceed">Proceed</option>
                  <option value="defer">Defer</option>
                  <option value="reject">Reject</option>
                </select>
              </div>
              <div>
                <label>FMV Reference Value</label>
                <input
                  placeholder="e.g. 100000"
                  value={iitOps.fmvReferenceValue}
                  onChange={(e) => setIitOps((prev) => ({ ...prev, fmvReferenceValue: e.target.value }))}
                />
              </div>
            </div>
            <div className="action-row">
              <button onClick={runIitTriage}>Submit IIT Triage</button>
              <button className="ghost" onClick={runIitFmv}>Execute FMV Review</button>
            </div>
          </div>

          <div className="ops-block">
            <h3>EAP Lifecycle Controls</h3>
            <div className="form-grid three">
              <div>
                <label>EAP Request ID</label>
                <input
                  placeholder="e.g. 301"
                  value={eapOps.id}
                  onChange={(e) => setEapOps((prev) => ({ ...prev, id: e.target.value }))}
                />
              </div>
              <div>
                <label>Intake Decision</label>
                <select
                  value={eapOps.intakeDecision}
                  onChange={(e) => setEapOps((prev) => ({ ...prev, intakeDecision: e.target.value }))}
                >
                  <option value="eligible">Eligible</option>
                  <option value="need_more_info">Need More Info</option>
                  <option value="ineligible">Ineligible</option>
                </select>
              </div>
              <div>
                <label>Regulatory Pathway</label>
                <select
                  value={eapOps.pathway}
                  onChange={(e) => setEapOps((prev) => ({ ...prev, pathway: e.target.value }))}
                >
                  <option value="individual_patient_ind">Individual Patient IND</option>
                  <option value="intermediate_size_ind">Intermediate-size IND</option>
                  <option value="treatment_ind">Treatment IND</option>
                </select>
              </div>
            </div>
            <div className="form-grid three">
              <div>
                <label>Supply State</label>
                <select
                  value={eapOps.supplyState}
                  onChange={(e) => setEapOps((prev) => ({ ...prev, supplyState: e.target.value }))}
                >
                  <option value="allocated">Allocated</option>
                  <option value="in_transit">In Transit</option>
                  <option value="delivered">Delivered</option>
                  <option value="cancelled">Cancelled</option>
                </select>
              </div>
              <div>
                <label>Safety Event Type</label>
                <input
                  placeholder="sae"
                  value={eapOps.safetyType}
                  onChange={(e) => setEapOps((prev) => ({ ...prev, safetyType: e.target.value }))}
                />
              </div>
              <div>
                <label>Safety Seriousness</label>
                <select
                  value={eapOps.seriousness}
                  onChange={(e) => setEapOps((prev) => ({ ...prev, seriousness: e.target.value }))}
                >
                  <option value="serious">Serious</option>
                  <option value="non_serious">Non-serious</option>
                </select>
              </div>
            </div>
            <label>EAP Comments</label>
            <textarea
              placeholder="Review notes, pathway rationale, safety context..."
              value={eapOps.comments}
              onChange={(e) => setEapOps((prev) => ({ ...prev, comments: e.target.value }))}
            />
            <div className="action-row">
              <button onClick={runEapIntakeReview}>Submit Intake Review</button>
              <button className="ghost" onClick={runEapPathway}>Set Regulatory Pathway</button>
              <button className="secondary" onClick={runEapEmergency}>Activate Emergency</button>
              <button className="ghost" onClick={runEapSupply}>Record Supply Event</button>
              <button className="ghost" onClick={runEapSafety}>Log Safety Event</button>
              <button className="secondary" onClick={runEapSafetyReport}>Generate Safety Report</button>
            </div>
          </div>

          <div className="ops-block">
            <h3>Integrations Hub</h3>
            <div className="form-grid three">
              <div>
                <label>DMS Provider</label>
                <select
                  value={integrationOps.provider}
                  onChange={(e) => setIntegrationOps((prev) => ({ ...prev, provider: e.target.value }))}
                >
                  <option value="veeva">Veeva</option>
                  <option value="sharepoint">SharePoint</option>
                </select>
              </div>
              <div>
                <label>Integration Entity ID</label>
                <input
                  placeholder="entity id"
                  value={integrationOps.entityId}
                  onChange={(e) => setIntegrationOps((prev) => ({ ...prev, entityId: e.target.value }))}
                />
              </div>
              <div>
                <label>ClinicalTrials NCT ID</label>
                <input
                  placeholder="NCT01234567"
                  value={integrationOps.nctId}
                  onChange={(e) => setIntegrationOps((prev) => ({ ...prev, nctId: e.target.value }))}
                />
              </div>
            </div>
            <div className="form-grid three">
              <div>
                <label>IIT Proposal ID (Registry Link)</label>
                <input
                  placeholder="iit id"
                  value={integrationOps.iitProposalId}
                  onChange={(e) => setIntegrationOps((prev) => ({ ...prev, iitProposalId: e.target.value }))}
                />
              </div>
              <div>
                <label>ERP Client Code</label>
                <input
                  placeholder="CLIENT_US_01"
                  value={integrationOps.clientCode}
                  onChange={(e) => setIntegrationOps((prev) => ({ ...prev, clientCode: e.target.value }))}
                />
              </div>
              <div>
                <label>ERP Module</label>
                <select
                  value={integrationOps.erpModuleKey}
                  onChange={(e) => setIntegrationOps((prev) => ({ ...prev, erpModuleKey: e.target.value }))}
                >
                  <option value="grants">Grants</option>
                  <option value="iit">IIT</option>
                  <option value="eap">EAP</option>
                </select>
              </div>
            </div>
            <div className="action-row">
              <button onClick={runDmsSync}>Queue DMS Sync</button>
              <button className="ghost" onClick={runClinicalTrialLink}>Link ClinicalTrials.gov</button>
              <button className="secondary" onClick={runErpExport}>Generate ERP Export</button>
            </div>
          </div>

          <div className="ops-block">
            <h3>Platform Intelligence</h3>
            <div className="form-grid three">
              <div>
                <label>Convert IIT ID</label>
                <input
                  placeholder="iit id"
                  value={platformOps.convertIitId}
                  onChange={(e) => setPlatformOps((prev) => ({ ...prev, convertIitId: e.target.value }))}
                />
              </div>
              <div>
                <label>AI Module</label>
                <select
                  value={platformOps.aiModuleKey}
                  onChange={(e) => setPlatformOps((prev) => ({ ...prev, aiModuleKey: e.target.value }))}
                >
                  <option value="grants">Grants</option>
                  <option value="iit">IIT</option>
                  <option value="eap">EAP</option>
                </select>
              </div>
              <div>
                <label>AI Entity ID</label>
                <input
                  placeholder="entity id"
                  value={platformOps.aiEntityId}
                  onChange={(e) => setPlatformOps((prev) => ({ ...prev, aiEntityId: e.target.value }))}
                />
              </div>
            </div>
            <div className="form-grid three">
              <div>
                <label>Overlay Jurisdiction</label>
                <input
                  placeholder="US or EU"
                  value={platformOps.overlayJurisdiction}
                  onChange={(e) => setPlatformOps((prev) => ({ ...prev, overlayJurisdiction: e.target.value }))}
                />
              </div>
              <div>
                <label>Overlay Amount</label>
                <input
                  placeholder="requested amount"
                  value={platformOps.overlayAmount}
                  onChange={(e) => setPlatformOps((prev) => ({ ...prev, overlayAmount: e.target.value }))}
                />
              </div>
              <div>
                <label>Policy Signal Value</label>
                <input
                  placeholder="e.g. 85"
                  value={platformOps.policySignalValue}
                  onChange={(e) => setPlatformOps((prev) => ({ ...prev, policySignalValue: e.target.value }))}
                />
              </div>
            </div>
            <label>Conversion / Policy Notes</label>
            <textarea
              placeholder="Reason for conversion or policy update"
              value={platformOps.reason}
              onChange={(e) => setPlatformOps((prev) => ({ ...prev, reason: e.target.value }))}
            />
            <div className="action-row">
              <button onClick={runConvertIitToGrant}>Convert IIT to Grant</button>
              <button className="ghost" onClick={runAiSummary}>Generate AI Summary</button>
              <button className="ghost" onClick={runAiScore}>Generate AI Score</button>
              <button className="ghost" onClick={runOverlayEvaluate}>Evaluate Compliance Overlay</button>
              <button className="secondary" onClick={runSavePolicyRule}>Save Policy Rule</button>
              <button className="secondary" onClick={runEvaluatePolicy}>Evaluate Policy Event</button>
              <button className="secondary" onClick={runAnalyticsSnapshot}>Create Analytics Snapshot</button>
            </div>
          </div>
        </section>

        <aside className="side-stack reveal-up delay-3">
          <section className="panel">
            <div className="panel-head compact">
              <h2>Task Queue</h2>
              <span className="badge-value">{tasks.length}</span>
            </div>
            <div className="list-scroll">
              {tasks.length === 0 ? <p className="muted">No tasks found for this module.</p> : null}
              {tasks.map((task) => (
                <article className="list-item" key={task.id}>
                  <div className="list-top">
                    <strong>{task.action_type}</strong>
                    <span className={statusClass(task.status)}>{task.status}</span>
                  </div>
                  <div className="muted small">{task.entity_type} #{task.entity_id}</div>
                </article>
              ))}
            </div>
          </section>

          <section className="panel">
            <div className="panel-head compact">
              <h2>Grants Snapshot</h2>
              <span className="badge-value">{grants.length}</span>
            </div>
            <div className="list-scroll">
              {grants.slice(0, 8).map((entry) => (
                <article className="list-item" key={entry.id}>
                  <div className="list-top">
                    <strong>{entry.application_code}</strong>
                    <span className={statusClass(entry.status)}>{entry.status}</span>
                  </div>
                  <div className="muted small">{entry.current_stage} • {formatCurrency(entry.requested_amount)}</div>
                </article>
              ))}
            </div>
          </section>

          <section className="panel">
            <div className="panel-head compact">
              <h2>IIT Snapshot</h2>
              <span className="badge-value">{iit.length}</span>
            </div>
            <div className="list-scroll">
              {iit.slice(0, 8).map((entry) => (
                <article className="list-item" key={entry.id}>
                  <div className="list-top">
                    <strong>{entry.proposal_code}</strong>
                    <span className={statusClass(entry.status)}>{entry.status}</span>
                  </div>
                  <div className="muted small">{entry.current_stage} • {formatCurrency(entry.requested_amount)}</div>
                </article>
              ))}
            </div>
          </section>

          <section className="panel">
            <div className="panel-head compact">
              <h2>EAP Snapshot</h2>
              <span className="badge-value">{eap.length}</span>
            </div>
            <div className="list-scroll">
              {eap.slice(0, 8).map((entry) => (
                <article className="list-item" key={entry.id}>
                  <div className="list-top">
                    <strong>{entry.request_code}</strong>
                    <span className={statusClass(entry.status)}>{entry.status}</span>
                  </div>
                  <div className="muted small">{entry.current_stage} • {entry.urgency_level}</div>
                </article>
              ))}
            </div>
          </section>

          <section className="panel">
            <div className="panel-head compact">
              <h2>Notifications</h2>
              <span className="badge-value">{notifications.length}</span>
            </div>
            <div className="list-scroll">
              {notifications.slice(0, 10).map((notification) => (
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
