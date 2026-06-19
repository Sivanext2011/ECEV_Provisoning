import React, { useState } from 'react'

const API = '/api/v1'

function App() {
  const [tab, setTab] = useState<'wizard' | 'search' | 'catalog' | 'operations' | 'settings' | 'logs'>('wizard')
  return (
    <div style={{ fontFamily: 'system-ui', maxWidth: 960, margin: '0 auto', padding: 20 }}>
      <h1>Ericsson BAE Provisioning Tool</h1>
      <nav style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
        <button onClick={() => setTab('wizard')} style={{ fontWeight: tab === 'wizard' ? 'bold' : 'normal' }}>Provision Subscriber</button>
        <button onClick={() => setTab('catalog')} style={{ fontWeight: tab === 'catalog' ? 'bold' : 'normal' }}>📦 Catalog</button>
        <button onClick={() => setTab('operations')} style={{ fontWeight: tab === 'operations' ? 'bold' : 'normal' }}>🔧 Operations</button>
        <button onClick={() => setTab('search')} style={{ fontWeight: tab === 'search' ? 'bold' : 'normal' }}>Search</button>
        <button onClick={() => setTab('settings')} style={{ fontWeight: tab === 'settings' ? 'bold' : 'normal' }}>⚙ Settings</button>
        <button onClick={() => setTab('logs')} style={{ fontWeight: tab === 'logs' ? 'bold' : 'normal' }}>📋 API Logs</button>
      </nav>
      {tab === 'wizard' && <ProvisionWizard />}
      {tab === 'catalog' && <CatalogPanel />}
      {tab === 'operations' && <OperationsPanel />}
      {tab === 'search' && <SearchPanel />}
      {tab === 'settings' && <SettingsPanel />}
      {tab === 'logs' && <ApiLogsPanel />}
    </div>
  )
}

function ProvisionWizard() {
  const [specs, setSpecs] = useState<any>(null)
  const [step, setStep] = useState(0)
  const [selectedPartySpec, setSelectedPartySpec] = useState('')
  const [selectedCustSpec, setSelectedCustSpec] = useState('')
  const [selectedContractSpec, setSelectedContractSpec] = useState('')
  const [selectedPO, setSelectedPO] = useState('')
  const [formValues, setFormValues] = useState<any>({ party: {}, customer: {}, contract: {} })
  const [msisdn, setMsisdn] = useState('')
  const [givenName, setGivenName] = useState('')
  const [familyName, setFamilyName] = useState('')
  const [result, setResult] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  React.useEffect(() => {
    fetch(`${API}/specs`).then(r => r.ok ? r.json() : null).then(setSpecs).catch(() => {})
  }, [])

  if (!specs) return (
    <div>
      <h2>Provision Subscriber</h2>
      <p style={{ color: '#c00' }}>No specs loaded. Go to <b>📦 Catalog</b> tab and upload a BusinessConfig zip first.</p>
    </div>
  )

  const partySpecs = specs.partySpecifications || []
  const custSpecs = specs.customerSpecifications || []
  const contractSpecs = specs.contractSpecifications || []
  const poList = specs.productOfferings || []

  const getPersonalizableChars = (chars: any[]) =>
    chars.filter((c: any) => c.valueRegulator === 'canBePersonalized' || c.valueRegulator === 'mustBePersonalized')

  const submit = async () => {
    setLoading(true); setError(''); setResult(null)
    try {
      const payload = {
        givenName, familyName, msisdn,
        partySpecId: selectedPartySpec,
        customerSpecId: selectedCustSpec,
        contractSpecId: selectedContractSpec,
        productOfferingId: selectedPO,
        partyCharacteristics: formValues.party,
        customerCharacteristics: formValues.customer,
        contractCharacteristics: formValues.contract,
      }
      const r = await fetch(`${API}/subscribers/provision`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      if (!r.ok) throw new Error((await r.json()).detail)
      setResult(await r.json())
    } catch (e: any) { setError(e.message) }
    setLoading(false)
  }

  return (
    <div>
      <h2>Provision Subscriber (Spec-Driven)</h2>

      {step === 0 && (
        <div style={{ display: 'grid', gap: 12, maxWidth: 500 }}>
          <h3 style={{ margin: 0 }}>Step 1: Select Specifications</h3>
          <label>Party Specification
            <select style={{ width: '100%' }} value={selectedPartySpec} onChange={e => setSelectedPartySpec(e.target.value)}>
              <option value="">-- Select --</option>
              {partySpecs.map((s: any) => <option key={s.id} value={s.id}>{s.name} ({s.externalId})</option>)}
            </select>
          </label>
          <label>Customer Specification
            <select style={{ width: '100%' }} value={selectedCustSpec} onChange={e => setSelectedCustSpec(e.target.value)}>
              <option value="">-- Select --</option>
              {custSpecs.map((s: any) => <option key={s.id} value={s.id}>{s.name} ({s.externalId})</option>)}
            </select>
          </label>
          <label>Contract Specification
            <select style={{ width: '100%' }} value={selectedContractSpec} onChange={e => setSelectedContractSpec(e.target.value)}>
              <option value="">-- Select --</option>
              {contractSpecs.map((s: any) => <option key={s.id} value={s.id}>{s.name} - {s.paymentContext} ({s.externalId})</option>)}
            </select>
          </label>
          <label>Product Offering
            <select style={{ width: '100%' }} value={selectedPO} onChange={e => setSelectedPO(e.target.value)}>
              <option value="">-- Select --</option>
              {poList.map((p: any) => <option key={p.id} value={p.externalId}>{p.name} ({p.externalId})</option>)}
            </select>
          </label>
          <button disabled={!selectedPartySpec || !selectedCustSpec || !selectedContractSpec || !selectedPO} onClick={() => setStep(1)}>Next →</button>
        </div>
      )}

      {step === 1 && (
        <div style={{ display: 'grid', gap: 12, maxWidth: 500 }}>
          <h3 style={{ margin: 0 }}>Step 2: Subscriber Details</h3>
          <input placeholder="Given Name *" value={givenName} onChange={e => setGivenName(e.target.value)} />
          <input placeholder="Family Name *" value={familyName} onChange={e => setFamilyName(e.target.value)} />
          <input placeholder="MSISDN *" value={msisdn} onChange={e => setMsisdn(e.target.value)} />

          {(() => {
            const ps = partySpecs.find((s: any) => s.id === selectedPartySpec)
            const chars = ps ? getPersonalizableChars(ps.characteristics) : []
            return chars.length > 0 && (
              <fieldset><legend>Party Characteristics</legend>
                {chars.map((c: any) => (
                  <label key={c.id} style={{ display: 'block', marginBottom: 6 }}>
                    {c.name} {c.required && '*'}
                    <input style={{ width: '100%' }} placeholder={c.defaultValue || ''}
                      value={formValues.party[c.id] || ''}
                      onChange={e => setFormValues({ ...formValues, party: { ...formValues.party, [c.id]: e.target.value } })} />
                  </label>
                ))}
              </fieldset>
            )
          })()}

          {(() => {
            const cs = contractSpecs.find((s: any) => s.id === selectedContractSpec)
            const chars = cs ? getPersonalizableChars(cs.characteristics) : []
            return chars.length > 0 && (
              <fieldset><legend>Contract Characteristics</legend>
                {chars.map((c: any) => (
                  <label key={c.id} style={{ display: 'block', marginBottom: 6 }}>
                    {c.name} {c.required && '*'}
                    <input style={{ width: '100%' }} placeholder={c.defaultValue || ''}
                      value={formValues.contract[c.id] || ''}
                      onChange={e => setFormValues({ ...formValues, contract: { ...formValues.contract, [c.id]: e.target.value } })} />
                  </label>
                ))}
              </fieldset>
            )
          })()}

          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={() => setStep(0)}>← Back</button>
            <button disabled={!givenName || !familyName || !msisdn || loading} onClick={submit}>
              {loading ? 'Provisioning...' : 'Provision'}
            </button>
          </div>
        </div>
      )}

      {error && <p style={{ color: 'red' }}>{error}</p>}
      {result && <pre style={{ background: '#f5f5f5', padding: 10, maxHeight: 400, overflow: 'auto' }}>{JSON.stringify(result, null, 2)}</pre>}
    </div>
  )
}

function CatalogPanel() {
  const [uploading, setUploading] = useState(false)
  const [uploadResult, setUploadResult] = useState<any>(null)
  const [specs, setSpecs] = useState<any>(null)
  const [error, setError] = useState('')

  const loadSpecs = () => {
    fetch(`${API}/specs`).then(r => r.ok ? r.json() : null).then(setSpecs).catch(() => {})
  }

  React.useEffect(() => { loadSpecs() }, [])

  const upload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true); setError(''); setUploadResult(null)
    const formData = new FormData()
    formData.append('file', file)
    try {
      const r = await fetch(`${API}/specs/upload`, { method: 'POST', body: formData })
      if (!r.ok) throw new Error((await r.json()).detail)
      setUploadResult(await r.json())
      loadSpecs()
    } catch (err: any) { setError(err.message) }
    setUploading(false)
  }

  return (
    <div>
      <h2>📦 Catalog - RMCA Specs</h2>

      <fieldset style={{ marginBottom: 16 }}>
        <legend><b>Upload BusinessConfig</b></legend>
        <p style={{ fontSize: 13, color: '#666', margin: '0 0 8px' }}>Export from RMCA and upload the BusinessConfig .zip file</p>
        <input type="file" accept=".zip" onChange={upload} disabled={uploading} />
        {uploading && <p>Parsing...</p>}
        {error && <p style={{ color: 'red' }}>{error}</p>}
        {uploadResult && <p style={{ color: 'green' }}>✓ Parsed: {uploadResult.partySpecs} party specs, {uploadResult.customerSpecs} customer specs, {uploadResult.contractSpecs} contract specs, {uploadResult.productOfferings} product offerings</p>}
      </fieldset>

      {specs && (
        <div>
          <h3>Loaded Specifications</h3>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead><tr style={{ background: '#eee', textAlign: 'left' }}>
              <th style={{ padding: 6 }}>Type</th><th style={{ padding: 6 }}>Name</th><th style={{ padding: 6 }}>External ID</th>
            </tr></thead>
            <tbody>
              {(specs.partySpecifications || []).map((s: any) => (
                <tr key={s.id} style={{ borderBottom: '1px solid #ddd' }}>
                  <td style={{ padding: 6 }}>Party</td><td style={{ padding: 6 }}>{s.name}</td><td style={{ padding: 6 }}>{s.externalId}</td>
                </tr>
              ))}
              {(specs.customerSpecifications || []).map((s: any) => (
                <tr key={s.id} style={{ borderBottom: '1px solid #ddd' }}>
                  <td style={{ padding: 6 }}>Customer</td><td style={{ padding: 6 }}>{s.name}</td><td style={{ padding: 6 }}>{s.externalId}</td>
                </tr>
              ))}
              {(specs.contractSpecifications || []).map((s: any) => (
                <tr key={s.id} style={{ borderBottom: '1px solid #ddd' }}>
                  <td style={{ padding: 6 }}>Contract</td><td style={{ padding: 6 }}>{s.name} ({s.paymentContext})</td><td style={{ padding: 6 }}>{s.externalId}</td>
                </tr>
              ))}
              {(specs.billingAccountSpecifications || []).map((s: any) => (
                <tr key={s.id} style={{ borderBottom: '1px solid #ddd' }}>
                  <td style={{ padding: 6 }}>Billing Account</td><td style={{ padding: 6 }}>{s.name}</td><td style={{ padding: 6 }}>{s.externalId}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <h3 style={{ marginTop: 16 }}>Product Offerings ({(specs.productOfferings || []).length})</h3>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead><tr style={{ background: '#eee', textAlign: 'left' }}>
              <th style={{ padding: 6 }}>Name</th><th style={{ padding: 6 }}>External ID</th><th style={{ padding: 6 }}>Types</th>
            </tr></thead>
            <tbody>
              {(specs.productOfferings || []).map((p: any) => (
                <tr key={p.id} style={{ borderBottom: '1px solid #ddd' }}>
                  <td style={{ padding: 6 }}>{p.name}</td><td style={{ padding: 6 }}>{p.externalId}</td><td style={{ padding: 6 }}>{(p.offeringTypes || []).join(', ')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function OperationsPanel() {
  const [op, setOp] = useState('read_party')
  const [params, setParams] = useState<any>({})
  const [body, setBody] = useState('')
  const [result, setResult] = useState<any>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const operations: Record<string, { label: string; method: string; path: string; fields: string[]; queryParams?: string[] }> = {
    read_party: { label: 'Read Party', method: 'GET', path: '/party', fields: ['id'], queryParams: ['id'] },
    delete_party: { label: 'Delete Party', method: 'DELETE', path: '/party/{externalId}', fields: ['externalId'] },
    read_customer: { label: 'Read Customer', method: 'GET', path: '/customer', fields: ['id'], queryParams: ['id'] },
    read_customer_msisdn: { label: 'Read Customer (MSISDN)', method: 'GET', path: '/customer', fields: ['msisdn'], queryParams: ['msisdn'] },
    delete_customer: { label: 'Delete Customer', method: 'DELETE', path: '/customer/{externalId}', fields: ['externalId'] },
    read_contract: { label: 'Read Contract', method: 'GET', path: '/contract', fields: ['customerId', 'contractId'], queryParams: ['customerId', 'contractId'] },
    read_contract_msisdn: { label: 'Read Contract (MSISDN)', method: 'GET', path: '/contract', fields: ['msisdn'], queryParams: ['msisdn'] },
    delete_contract_msisdn: { label: 'Delete Contract (MSISDN)', method: 'DELETE', path: '/contract', fields: ['msisdn'], queryParams: ['msisdn'] },
    balance_enquiry: { label: 'Balance Enquiry (MSISDN)', method: 'GET', path: '/balance', fields: ['msisdn'], queryParams: ['msisdn'] },
    balance_adj: { label: 'Balance Adjustment', method: 'POST', path: '/balance/adjust', fields: [] },
    recurrence: { label: 'Recurrence Enquiry', method: 'GET', path: '/recurrence', fields: ['msisdn'], queryParams: ['msisdn'] },
  }

  const exec = async () => {
    setLoading(true); setError(''); setResult(null)
    const cfg = operations[op]
    let url = `${API}${cfg.path}`
    // Replace path params
    for (const f of cfg.fields) {
      url = url.replace(`{${f}}`, params[f] || '')
    }
    // Add query params
    if (cfg.queryParams?.length) {
      const qp = cfg.queryParams.filter(f => params[f]).map(f => `${f}=${encodeURIComponent(params[f])}`).join('&')
      if (qp) url += `?${qp}`
    }
    try {
      const opts: any = { method: cfg.method, headers: { 'Content-Type': 'application/json' } }
      if (cfg.method === 'POST' || cfg.method === 'PUT') {
        opts.body = JSON.stringify(params)
      }
      const r = await fetch(url, opts)
      const text = await r.text()
      let data: any
      try { data = JSON.parse(text) } catch { data = { raw: text } }
      if (!r.ok) throw new Error(data.detail || data.raw || `HTTP ${r.status}`)
      setResult(data)
    } catch (e: any) { setError(e.message) }
    setLoading(false)
  }

  const cfg = operations[op]

  return (
    <div>
      <h2>Individual Operations</h2>
      <div style={{ display: 'flex', gap: 10, marginBottom: 15, flexWrap: 'wrap' }}>
        <select value={op} onChange={e => { setOp(e.target.value); setParams({}); setResult(null); setError('') }}>
          {Object.entries(operations).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <span style={{ fontSize: 12, color: '#888', alignSelf: 'center' }}>{cfg.method} {cfg.path}</span>
      </div>
      <div style={{ display: 'grid', gap: 8, maxWidth: 400, marginBottom: 10 }}>
        {cfg.fields.map(f => (
          <input key={f} placeholder={f} value={params[f] || ''} onChange={e => setParams({ ...params, [f]: e.target.value })} />
        ))}
      </div>
      <button onClick={exec} disabled={loading}>{loading ? 'Executing...' : 'Execute'}</button>
      {error && <p style={{ color: 'red', wordBreak: 'break-all' }}>{error}</p>}
      {result && <pre style={{ background: '#f5f5f5', padding: 10, maxHeight: 400, overflow: 'auto' }}>{JSON.stringify(result, null, 2)}</pre>}
    </div>
  )
}

function SearchPanel() {
  const [msisdn, setMsisdn] = useState('')
  const [data, setData] = useState<any>(null)
  const [error, setError] = useState('')

  const search = async () => {
    setError(''); setData(null)
    try {
      const r = await fetch(`${API}/subscribers/${msisdn}`)
      if (!r.ok) throw new Error('Not found')
      setData(await r.json())
    } catch (e: any) { setError(e.message) }
  }

  return (
    <div>
      <h2>Search Subscriber (Local DB)</h2>
      <div style={{ display: 'flex', gap: 10 }}>
        <input placeholder="MSISDN" value={msisdn} onChange={e => setMsisdn(e.target.value)} />
        <button onClick={search}>Search</button>
      </div>
      {error && <p style={{ color: 'red' }}>{error}</p>}
      {data && <pre style={{ background: '#f5f5f5', padding: 10 }}>{JSON.stringify(data, null, 2)}</pre>}
    </div>
  )
}

function ApiLogsPanel() {
  const [logs, setLogs] = useState<any[]>([])

  const load = async () => {
    const r = await fetch(`${API}/logs`)
    setLogs(await r.json())
  }

  React.useEffect(() => { load() }, [])

  return (
    <div>
      <h2>API Request Logs</h2>
      <button onClick={load}>Refresh</button>
      <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 10, fontSize: 13 }}>
        <thead>
          <tr style={{ background: '#eee', textAlign: 'left' }}>
            <th style={{ padding: 6 }}>Time</th>
            <th style={{ padding: 6 }}>Method</th>
            <th style={{ padding: 6 }}>URL</th>
            <th style={{ padding: 6 }}>Status</th>
          </tr>
        </thead>
        <tbody>
          {logs.map((l, i) => (
            <tr key={i} style={{ borderBottom: '1px solid #ddd' }}>
              <td style={{ padding: 6 }}>{l.timestamp}</td>
              <td style={{ padding: 6 }}>{l.method}</td>
              <td style={{ padding: 6, wordBreak: 'break-all' }}>{l.url}</td>
              <td style={{ padding: 6, color: l.status >= 400 ? 'red' : 'green' }}>{l.status}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {logs.length === 0 && <p>No API calls recorded yet.</p>}
    </div>
  )
}

function CertUpload({ value, onChange, name }: { value: string; onChange: (v: string) => void; name: string }) {
  const [uploading, setUploading] = useState(false)

  const upload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    const formData = new FormData()
    formData.append('file', file)
    formData.append('name', name)
    try {
      const r = await fetch(`${API}/certs/upload`, { method: 'POST', body: formData })
      if (!r.ok) throw new Error('Upload failed')
      const data = await r.json()
      onChange(data.path)
    } catch (err) { alert('Failed to upload cert file') }
    setUploading(false)
  }

  return (
    <div style={{ display: 'flex', gap: 6, alignItems: 'center', width: '100%' }}>
      <input style={{ flex: 1 }} placeholder="Path to cert/key file" value={value} onChange={e => onChange(e.target.value)} />
      <label style={{ cursor: 'pointer', padding: '4px 8px', background: '#eee', borderRadius: 4, fontSize: 12, whiteSpace: 'nowrap' }}>
        {uploading ? '...' : '📁 Browse'}
        <input type="file" accept=".crt,.pem,.key,.cer" style={{ display: 'none' }} onChange={upload} />
      </label>
    </div>
  )
}

function SettingsPanel() {
  const [config, setConfig] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState('')
  const [loadError, setLoadError] = useState('')

  const load = async () => {
    setLoadError('')
    try {
      const r = await fetch(`${API}/settings`)
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      setConfig(await r.json())
    } catch (e: any) { setLoadError(`Failed to load settings: ${e.message}`) }
  }

  const save = async () => {
    setLoading(true); setMsg('')
    try {
      const r = await fetch(`${API}/settings`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(config) })
      if (!r.ok) throw new Error((await r.json()).detail)
      setMsg('Saved!')
    } catch (e: any) { setMsg(`Error: ${e.message}`) }
    setLoading(false)
  }

  React.useEffect(() => { load() }, [])

  if (loadError) return <p style={{ color: 'red' }}>{loadError}</p>
  if (!config) return <p>Loading config...</p>

  const updateEnv = (k: string, v: string) => setConfig({ ...config, environment: { ...config.environment, [k]: v } })
  const updateAuth = (k: string, v: any) => setConfig({ ...config, auth: { ...config.auth, [k]: v } })
  const updateTls = (k: string, v: any) => setConfig({ ...config, tls: { ...config.tls, [k]: v } })
  const updateNet = (k: string, v: any) => setConfig({ ...config, network: { ...config.network, [k]: v } })

  return (
    <div>
      <h2>Settings</h2>
      <div style={{ display: 'grid', gap: 16, maxWidth: 550 }}>
        <fieldset>
          <legend><b>Environment URLs</b></legend>
          <div style={{ display: 'grid', gap: 8 }}>
            {Object.keys(config.environment || {}).map(k => (
              <label key={k}>{k}<input style={{ width: '100%' }} value={config.environment[k] || ''} onChange={e => updateEnv(k, e.target.value)} /></label>
            ))}
          </div>
        </fieldset>

        <fieldset>
          <legend><b>Authentication (Keycloak OAuth2)</b></legend>
          <div style={{ display: 'grid', gap: 8 }}>
            <label>Username<input style={{ width: '100%' }} value={config.auth?.username || ''} onChange={e => updateAuth('username', e.target.value)} /></label>
            <label>Password<input style={{ width: '100%' }} type="password" value={config.auth?.password || ''} onChange={e => updateAuth('password', e.target.value)} /></label>
            <label>Client ID<input style={{ width: '100%' }} value={config.auth?.client_id || ''} onChange={e => updateAuth('client_id', e.target.value)} /></label>
            <label>Token Endpoint<input style={{ width: '100%' }} value={config.auth?.token_endpoint || ''} onChange={e => updateAuth('token_endpoint', e.target.value)} /></label>
          </div>
        </fieldset>

        <fieldset>
          <legend><b>TLS / mTLS</b></legend>
          <div style={{ display: 'grid', gap: 8 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}><input type="checkbox" checked={config.tls?.ssl_verify || false} onChange={e => updateTls('ssl_verify', e.target.checked)} />Verify SSL</label>
            <label>CA Certificate<CertUpload value={config.tls?.ca_cert_path || ''} onChange={v => updateTls('ca_cert_path', v)} name="ca" /></label>
            <label>Client Certificate<CertUpload value={config.tls?.client_cert_path || ''} onChange={v => updateTls('client_cert_path', v)} name="client_cert" /></label>
            <label>Client Key<CertUpload value={config.tls?.client_key_path || ''} onChange={v => updateTls('client_key_path', v)} name="client_key" /></label>
          </div>
        </fieldset>

        <fieldset>
          <legend><b>Network</b></legend>
          <div style={{ display: 'grid', gap: 8 }}>
            <label>SOCKS5 Proxy<input style={{ width: '100%' }} placeholder="socks5://127.0.0.1:1080" value={config.network?.socks5_proxy || ''} onChange={e => updateNet('socks5_proxy', e.target.value)} /></label>
            <label>Timeout (s)<input style={{ width: '100%' }} type="number" value={config.network?.timeout_seconds || 30} onChange={e => updateNet('timeout_seconds', Number(e.target.value))} /></label>
            <label>Retry Attempts<input style={{ width: '100%' }} type="number" value={config.network?.retry_attempts || 3} onChange={e => updateNet('retry_attempts', Number(e.target.value))} /></label>
          </div>
        </fieldset>

        <button onClick={save} disabled={loading}>{loading ? 'Saving...' : 'Save Configuration'}</button>
        {msg && <p style={{ color: msg.startsWith('Error') ? 'red' : 'green' }}>{msg}</p>}
      </div>
    </div>
  )
}

export default App
