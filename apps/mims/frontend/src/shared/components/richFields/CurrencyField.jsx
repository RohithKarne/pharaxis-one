/**
 * CurrencyField — Theme 1 Rich Field (Wave 3).
 *
 * Value shape: { amount, currency_code, rate_to_usd, captured_at }
 *
 * Displays formatted amount in the chosen currency and (optionally) the USD
 * equivalent at the snapshot rate. Currency list is the ISO short subset most
 * commonly used by PV teams; add more in CURRENCIES below if needed.
 */

const CURRENCIES = ['USD','EUR','GBP','JPY','CAD','AUD','CHF','INR','CNY','BRL','MXN','ZAR']

export default function CurrencyField({ value = {}, onChange, label, readOnly }) {
  const code = value.currency_code || 'USD'
  const amount = value.amount ?? ''
  const display = amount === ''
    ? ''
    : new Intl.NumberFormat(undefined, { style: 'currency', currency: code, maximumFractionDigits: 2 })
        .format(Number(amount) || 0)

  function set(patch) { onChange?.({ ...value, ...patch }) }

  return (
    <div>
      {label && <div style={lbl}>{label}</div>}
      <div style={{ display: 'flex', gap: 6 }}>
        <select value={code} onChange={e => set({ currency_code: e.target.value })} disabled={readOnly}
          style={{ ...ipt, width: 90 }}>
          {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <input type="number" inputMode="decimal" step="0.01"
          placeholder="0.00" value={amount}
          onChange={e => set({ amount: e.target.value })} disabled={readOnly}
          style={{ ...ipt, flex: 1, textAlign: 'right' }} />
      </div>
      {amount !== '' && (
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3 }}>
          {display}
          {value.rate_to_usd && code !== 'USD' && (
            <> · ≈ {new Intl.NumberFormat(undefined,{ style: 'currency', currency: 'USD' }).format(amount * value.rate_to_usd)}</>
          )}
        </div>
      )}
    </div>
  )
}

const lbl = { display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 }
const ipt = { padding: '7px 10px', fontSize: 13, border: '1px solid var(--border)', borderRadius: 6 }
