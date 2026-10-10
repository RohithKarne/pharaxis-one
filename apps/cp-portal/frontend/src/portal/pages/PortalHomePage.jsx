import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { usePortal } from '../context/PortalContext'
import usePageTitle from '../hooks/usePageTitle'
import Icon from '../../shared/components/Icon'
import { formatLongDate } from '../../shared/utils/datetime'

export default function PortalHomePage() {
  const { portalConfig, isFeatureEnabled, clientCode, user, portalHeaders, t } = usePortal()
  const navigate  = useNavigate()
  const branding  = portalConfig?.branding || {}
  const client    = portalConfig?.client   || {}
  const base      = `/portal/${clientCode}`
  const [homeSearch, setHomeSearch] = useState('')
  const [suggestions, setSuggestions] = useState([])
  const [showSuggest, setShowSuggest] = useState(false)
  const [activeIdx, setActiveIdx] = useState(-1)

  usePageTitle(t('Home'))

  // CP-12: debounced typeahead suggestions for the hero search.
  useEffect(() => {
    const q = homeSearch.trim()
    // CPPM-25: suggestions need a signed-in user; signed-out visitors get none.
    if (!user || q.length < 2) { setSuggestions([]); setActiveIdx(-1); return }
    const t = setTimeout(() => {
      fetch(`/api/portal/search/suggest?clientCode=${clientCode}&q=${encodeURIComponent(q)}`)
        .then(r => r.ok ? r.json() : null)
        .then(d => { setSuggestions(d?.suggestions || []); setActiveIdx(-1) })
        .catch(() => {})
    }, 250)
    return () => clearTimeout(t)
  }, [homeSearch, clientCode, user])

  // CP-16: keyboard navigation for the typeahead (↑/↓/Enter/Esc).
  function onSearchKeyDown(e) {
    if (!showSuggest || suggestions.length === 0) return
    if (e.key === 'ArrowDown')      { e.preventDefault(); setActiveIdx(i => Math.min(i + 1, suggestions.length - 1)) }
    else if (e.key === 'ArrowUp')   { e.preventDefault(); setActiveIdx(i => Math.max(i - 1, -1)) }
    else if (e.key === 'Enter' && activeIdx >= 0) { e.preventDefault(); navigate(`${base}/${suggestions[activeIdx].path}`); setShowSuggest(false) }
    else if (e.key === 'Escape')    { setShowSuggest(false) }
  }

  // CPPM-116: "For you" — news, documents and events for this doctor's specialty
  // and what they follow, chosen by the server (S4-9 showed everyone the same three).
  const [forYou, setForYou] = useState(null)
  const [followedTopics, setFollowedTopics] = useState([])
  useEffect(() => {
    if (!clientCode || !user) return
    fetch(`/api/portal/personal/follows?clientCode=${clientCode}`, { headers: portalHeaders() })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.follows) setFollowedTopics(d.follows.filter(f => f.item_type === 'therapeutic_area')) })
      .catch(() => {})
    fetch(`/api/portal/personal/for-you?clientCode=${clientCode}`, { headers: portalHeaders() })
      .then(r => r.ok ? r.json() : null)
      .then(d => setForYou(d))
      .catch(() => {})
  }, [clientCode, user])

  // LOW-16: fetch upcoming events from API
  const [upcomingEvents, setUpcomingEvents] = useState([])
  const [productTerm, setProductTerm] = useState(null)
  // Popular-search chip for this client's own lead product (was a hard-coded "PX-104").
  useEffect(() => {
    if (!clientCode) return
    fetch(`/api/portal/content/${clientCode}/drugs`)
      .then(r => r.ok ? r.json() : null)
      .then(d => setProductTerm(d?.items?.[0]?.brand_name?.split(/\s+/)[0] || null))
      .catch(() => {})
  }, [clientCode])
  const [latestNews, setLatestNews] = useState([])
  useEffect(() => {
    if (!clientCode) return
    fetch(`/api/portal/content/${clientCode}/events`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.items?.length) {
          const now = new Date()
          const seen = new Set()
          const upcoming = data.items
            .filter(e => new Date(e.event_date || e.start_date) >= now)
            .sort((a, b) => new Date(a.event_date || a.start_date) - new Date(b.event_date || b.start_date))
            // de-dupe events that share the same title + date (prevents the same
            // conference showing twice on the home page)
            .filter(e => {
              const key = `${e.title}|${e.event_date || e.start_date}`
              if (seen.has(key)) return false
              seen.add(key)
              return true
            })
            .slice(0, 3)
          setUpcomingEvents(upcoming)
        }
      })
      .catch(() => {})
  }, [clientCode, portalHeaders])

  useEffect(() => {
    if (!clientCode) return
    fetch(`/api/portal/news?clientCode=${clientCode}&limit=4`, { headers: portalHeaders() })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.posts) setLatestNews(d.posts.slice(0, 4)) })
      .catch(() => {})
  }, [clientCode])

  // The home page repeated the same links three to five times (Go to, Quick Links, Common
  // requests, More information, the closing banner). It is now one search, three tasks,
  // the doctor's own feed and safety (CP ease-of-use plan, phase 2 row 9). Everything
  // else is one click away in the menu.
  const topTasks = [
    {
      key:   'medical_inquiry',
      icon:  'send',
      title: t('Ask a question'),
      desc: t('Ask our medical team about a product, dosing or a clinical situation.'),
      path:  'submit?type=medical_inquiry',
      action: t('Start a question'),
      tone: 'primary',
    },
    {
      key:   'adverse_event',
      icon:  'shield',
      title: t('Report a side effect'),
      desc: t('Tell us about anyone who became unwell after using one of our products.'),
      path:  'submit?type=adverse_event',
      action: t('Start a report'),
      tone: 'primary',
    },
    {
      key:   'document_library',
      icon:  'file',
      title: t('Find documents'),
      desc: t('Prescribing information, safety materials and approved resources.'),
      path:  'documents',
      action: t('Browse documents'),
      tone: 'teal',
    },
  ].filter(c => isFeatureEnabled(c.key))

  const quickSearches = [productTerm, t('Dosing'), t('Clinical trials'), t('Prescribing information'), t('Safety')].filter(Boolean)

  const heroTitle    = portalConfig?.welcome_title || t('Medical Information')
  const heroSubtitle = portalConfig?.welcome_message || branding.tagline || t('Ask a question about our products, report a side effect, or find approved documents.')

  const formatEventDate = (str) => (str ? formatLongDate(str) : '')

  function runSearch(term) {
    const query = term.trim()
    if (query.length >= 2) navigate(`${base}/search?q=${encodeURIComponent(query)}`)
  }

  function submitHomeSearch(e) {
    e.preventDefault()
    runSearch(homeSearch)
  }

  return (
    <div className="pp-home">
      <section className="pp-hero">
        <div className="pp-hero-inner">
          <div className="pp-hero-copy">
            <h1 className="pp-hero-title">{heroTitle}</h1>
            <p className="pp-hero-subtitle">{heroSubtitle}</p>
            <div className="pp-hero-search-wrap">
              <form className="pp-hero-search" onSubmit={submitHomeSearch}>
                <Icon name="search" size={20} />
                <input
                  value={homeSearch}
                  onChange={e => setHomeSearch(e.target.value)}
                  onFocus={() => setShowSuggest(true)}
                  onBlur={() => setTimeout(() => setShowSuggest(false), 150)}
                  onKeyDown={onSearchKeyDown}
                  placeholder={t('Search medical information, documents, events...')}
                  aria-label={t('Search the portal')}
                  role="combobox"
                  aria-expanded={showSuggest && suggestions.length > 0}
                  aria-controls="pp-suggest-list"
                  aria-activedescendant={activeIdx >= 0 ? `pp-suggest-${activeIdx}` : undefined}
                  aria-autocomplete="list"
                />
                <button type="submit" className="pp-hero-search-btn">{t('Search')}</button>
              </form>
              {showSuggest && suggestions.length > 0 && (
                <ul className="pp-suggest-dropdown" role="listbox" id="pp-suggest-list">
                  {suggestions.map((s, i) => (
                    <li key={i} id={`pp-suggest-${i}`} role="option" aria-selected={i === activeIdx}>
                      <button type="button" className={`pp-suggest-item ${i === activeIdx ? 'active' : ''}`}
                        onMouseEnter={() => setActiveIdx(i)}
                        onMouseDown={() => navigate(`${base}/${s.path}`)}>
                        <span className="pp-suggest-type">{s.type}</span>
                        <span className="pp-suggest-title">{s.title}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="pp-search-suggestions" aria-label={t('Popular searches')}>
              <span>{t('Popular searches:')}</span>
              {quickSearches.map(term => (
                <button key={term} type="button" onClick={() => runSearch(term)}>{term}</button>
              ))}
            </div>
          </div>
          <aside className="pp-hero-panel" aria-label={t('Portal shortcuts')}>
            <div className="pp-safety-card">
              <div className="pp-safety-card-icon"><Icon name="shield" size={20} /></div>
              <div>
                <div className="pp-safety-card-title">{t('Safety Update')}</div>
                <p>{t('Review the latest safety information before using approved content.')}</p>
                <Link to={`${base}/safety`}>{t('View Safety Alerts')}</Link>
              </div>
            </div>
          </aside>
        </div>
      </section>

      {topTasks.length > 0 && <section className="pp-top-tasks-section">
        <div className="pp-container">
          <div className="pp-section-heading">
            <h2>{t('What would you like to do?')}</h2>
          </div>
          <div className="pp-top-task-grid">
            {topTasks.map(card => (
              <Link key={card.key} to={`${base}/${card.path}`} className={`pp-top-task-card ${card.tone === 'teal' ? 'teal' : ''}`}>
                <div className="pp-top-task-icon"><Icon name={card.icon} size={30} /></div>
                <div className="pp-top-task-body">
                  <h3>{card.title}</h3>
                  <p>{card.desc}</p>
                  <span>{card.action}</span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>}

      {/* S4-9: Personalised greeting + For You section (signed-in users only) */}
      {user && (
        <section style={{ background: '#F8F9FF', borderBottom: '1px solid #E5E7EB', padding: '20px 0' }}>
          <div className="pp-container">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: forYou ? 20 : 0 }}>
              <div>
                <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: '#1A1A2E' }}>
                  {t('Signed in as')} {user.first_name}
                </h2>
              </div>
              <div style={{ display: 'flex', gap: 16 }}>
                <Link to={`${base}/my-activity`} style={{ fontSize: 13, color: '#4B5563', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', minHeight: 32 }}>{t('My activity')}</Link>
                <Link to={`${base}/preferences`} style={{ fontSize: 13, color: '#4B5563', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', minHeight: 32 }}>{t('Notification preferences')}</Link>
              </div>
            </div>

            {followedTopics.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#4B5563', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>{t('Topics you follow')}</div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {followedTopics.map(f => (
                    <Link key={f.id} to={`${base}/therapeutic-areas`} className="pp-chip" style={{ textDecoration: 'none', color: 'var(--pp-primary)' }}>
                      {f.detail?.name}
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {forYou && (
              <div>
                <h3 style={{ margin: '0 0 4px', fontSize: 16, fontWeight: 700, color: '#1A1A2E' }}>{t('For you')}</h3>
                <p style={{ margin: '0 0 10px', fontSize: 13, color: '#4B5563' }}>
                  {forYou.basis === 'latest'
                    ? t('The latest from this portal. Choose your specialty or follow an area to see what matches you.')
                    : `${t('Matched to')} ${forYou.words.join(', ')}.`}
                </p>
                {forYou.items.length === 0 ? (
                  <div className="pp-update-empty">{t('Nothing new yet for')} {forYou.words.join(', ')}.</div>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12 }}>
                    {forYou.items.map(it => {
                      const kind = { news: ['News', '#2563EB', `${base}/news/${it.id}`], document: ['Document', '#7C3AED', `${base}/documents?doc=${it.id}`], event: ['Event', '#047857', `${base}/events/${it.id}`] }[it.type]
                      return (
                        <Link key={`${it.type}-${it.id}`} to={kind[2]}
                          style={{ display: 'block', background: '#fff', border: '1px solid #E5E7EB', borderRadius: 'var(--pp-radius, 2px)', padding: '12px 14px', textDecoration: 'none', color: 'inherit' }}>
                          <div style={{ fontSize: 10, fontWeight: 700, color: kind[1], textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>{kind[0]}</div>
                          <div style={{ fontWeight: 600, fontSize: 14, color: '#1A1A2E', lineHeight: 1.4 }}>{it.title}</div>
                          <div style={{ fontSize: 12, color: '#4B5563', marginTop: 4 }}>
                            {it.type === 'event' ? formatLongDate(it.at) : it.because ? `Matches ${it.because}` : formatLongDate(it.at)}
                          </div>
                        </Link>
                      )
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        </section>
      )}

      {/* A signed-in doctor gets these through "For you" above. */}
      {!user && (isFeatureEnabled('events') || isFeatureEnabled('news_announcements')) && <section className="pp-updates-section">
        <div className="pp-container">
          <div className="pp-updates-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }}>
            {isFeatureEnabled('events') && (
              <section className="pp-update-panel">
                <div className="pp-update-panel-head">
                  <h2>{t('Upcoming Events')}</h2>
                  <Link to={`${base}/events`}>{t('View all')}</Link>
                </div>
                <div className="pp-update-list">
                  {upcomingEvents.length > 0 ? upcomingEvents.map(ev => (
                    <Link key={ev.id} to={`${base}/events/${ev.id}`} className="pp-update-row pp-event-row">
                      <span className="pp-date-chip">{formatEventDate(ev.event_date || ev.start_date)}</span>
                      <span>
                        <b>{ev.title}</b>
                        {ev.event_type && <small>{ev.event_type}</small>}
                      </span>
                      <span aria-hidden="true">›</span>
                    </Link>
                  )) : (
                    <div className="pp-update-empty">{t('No upcoming events are published yet.')}</div>
                  )}
                </div>
              </section>
            )}
            {isFeatureEnabled('news_announcements') && (
              <section className="pp-update-panel">
                <div className="pp-update-panel-head">
                  <h2>{t('Latest News')}</h2>
                  <Link to={`${base}/news`}>{t('View all')}</Link>
                </div>
                <div className="pp-update-list">
                  {latestNews.length > 0 ? latestNews.map(post => (
                    <Link key={post.id} to={`${base}/news/${post.id}`} className="pp-update-row">
                      <span className="pp-dot" />
                      <span>
                        <b>{post.title}</b>
                        {post.category && <small>{post.category}</small>}
                      </span>
                      <span aria-hidden="true">›</span>
                    </Link>
                  )) : (
                    <div className="pp-update-empty">{t('No news has been published yet.')}</div>
                  )}
                </div>
              </section>
            )}
          </div>
        </div>
      </section>}
    </div>
  )
}
