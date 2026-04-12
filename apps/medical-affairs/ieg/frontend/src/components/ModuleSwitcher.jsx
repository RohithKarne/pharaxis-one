export default function ModuleSwitcher({ moduleKey, setModuleKey, modules, refreshInternalData }) {
  const options = modules.length ? modules : ['grants', 'iit', 'eap']

  return (
    <div className="switcher-row reveal-up delay-2">
      <div>
        <label>Active Module</label>
        <select value={moduleKey} onChange={(e) => setModuleKey(e.target.value)}>
          {options.map((module) => (
            <option key={module} value={module}>{module.toUpperCase()}</option>
          ))}
        </select>
      </div>
      <button className="secondary" onClick={refreshInternalData}>Refresh Workspace</button>
    </div>
  )
}
