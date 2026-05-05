export default function VaultSectionNav({ sections }) {
  return (
    <aside className="vault-section-nav panel">
      {sections.map(group => (
        <div className="vault-section-nav-group" key={group.title}>
          <h3>{group.title}</h3>
          <nav>
            {group.items.map(item => (
              <a href={item.href} key={item.href}>
                <span>{item.label}</span>
                {item.count !== undefined ? <strong>{item.count}</strong> : null}
              </a>
            ))}
          </nav>
        </div>
      ))}
    </aside>
  )
}
