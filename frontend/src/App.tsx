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
  const [selectedBASpec, setSelectedBASpec] = useState('')
  const [selectedContractSpec, setSelectedContractSpec] = useState('')
  const [selectedPO, setSelectedPO] = useState('')
  const [formValues, setFormValues] = useState<any>({ party: {}, customer: {}, contract: {}, billingAccount: {} })
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
  const baSpecs = specs.billingAccountSpecifications || []
  const contractSpecs = specs.contractSpecifications || []
  const poList = specs.productOfferings || []

  const getPersonalizableChars = (chars: any[]) =>
    chars.filter((c: any) => {
      const reg = c.valueRegulator
      // Only show canBePersonalized and mustBePersonalized
      // selection type: only show if it has an externalId (otherwise it's internal)
      if (reg === 'canBePersonalized' || reg === 'mustBePersonalized') return true
      if (reg === 'selection' && (c.externalId || '').trim()) return true
      return false
    })

  const submit = async () => {
    setLoading(true); setError(''); setResult(null)
    try {
      const partyExtId = `extID-party-${msisdn}`
      const customerExtId = `extID-customer-${msisdn}`
      const baExtId = `extID_BA-${msisdn}`
      const contractExtId = `extID-contract-${msisdn}`

      // Build party body
      const partyBody: any = {
        externalId: partyExtId,
        givenName, familyName,
        individualSpecification: { externalId: selectedPartySpec },
        status: [{ status: 'PartyActive' }],
      }
      const partyChars = Object.entries(formValues.party).filter(([, v]) => v)
      if (partyChars.length) {
        partyBody.characteristic = partyChars.map(([k, v]) => ({ charSpecExternalId: k, value: [{ value: v }] }))
      }

      // Build customer body
      const customerBody: any = {
        externalId: customerExtId,
        customerSpecification: { externalId: selectedCustSpec },
        status: [{ status: 'CustomerActive' }],
        account: [{
          externalId: baExtId,
          billingAccountSpecExternalId: selectedBASpec,
          status: [{ status: 'BillingAccountActive' }],
        }],
        engagedParty: { externalId: partyExtId, '@referredType': 'Individual' },
      }
      const custChars = Object.entries(formValues.customer).filter(([, v]) => v)
      if (custChars.length) {
        customerBody.characteristic = custChars.map(([k, v]) => ({ charSpecExternalId: k, value: [{ value: v }] }))
      }
      const baChars = Object.entries(formValues.billingAccount).filter(([, v]) => v)
      if (baChars.length) {
        customerBody.account[0].characteristic = baChars.map(([k, v]) => ({ charSpecExternalId: k, value: [{ value: v }] }))
      }

      // Build contract body from spec
      const contractBody: any = {
        externalId: contractExtId,
        contractSpecification: { externalId: selectedContractSpec },
        status: [{ status: 'Active' }],
      }

      // Product from selected PO
      if (selectedPO) {
        const poProduct: any = {
          productOfferingExternalId: selectedPO,
          externalId: `${selectedPO}-${msisdn}`,
          name: selectedPO,
          billingAccountReference: {
            externalId: baExtId,
          },
        }
        // Add PO characteristics
        const poCharEntries = Object.entries(formValues.contract)
          .filter(([k, v]) => k.startsWith('_po_') && v && (v as string).trim())
          .map(([k, v]) => ({ charSpecExternalId: k.replace('_po_', ''), value: [{ value: v }] }))
        if (poCharEntries.length) {
          poProduct.characteristic = poCharEntries
        }
        contractBody.product = [poProduct]
      }

      // Resources from PO's linked resource specs (PO->PS->CFSS->RFSS->LRS chain)
      const po = specs?.productOfferings?.find((p: any) => p.externalId === selectedPO)
      const poResourceSpecs = po?.resourceSpecifications || []
      const resources: any[] = []
      for (const rs of poResourceSpecs) {
        const resKey = `_res_${rs.externalId || rs.id}`
        const resNumber = formValues.contract[resKey]
        if (resNumber && resNumber.trim()) {
          resources.push({
            externalId: `${rs.externalId}-${resNumber}`,
            resourceNumber: resNumber,
            resourceSpecificationExternalId: rs.externalId,
          })
        }
      }
      if (resources.length) {
        contractBody.resource = resources
      }

      // Contract characteristics (exclude _prefixed internal fields)
      const contractChars = Object.entries(formValues.contract)
        .filter(([k, v]) => !k.startsWith('_') && v && (v as string).trim())
      if (contractChars.length) {
        contractBody.characteristic = contractChars.map(([k, v]) => ({ charSpecExternalId: k, value: [{ value: v }] }))
      }

      const payload = {
        partyBody,
        customerBody,
        contractBody,
        customerExternalId: customerExtId,
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
              {partySpecs.map((s: any) => <option key={s.id} value={s.externalId}>{s.name} ({s.externalId})</option>)}
            </select>
          </label>
          <label>Customer Specification
            <select style={{ width: '100%' }} value={selectedCustSpec} onChange={e => setSelectedCustSpec(e.target.value)}>
              <option value="">-- Select --</option>
              {custSpecs.map((s: any) => <option key={s.id} value={s.externalId}>{s.name} ({s.externalId})</option>)}
            </select>
          </label>
          <label>Billing Account Specification
            <select style={{ width: '100%' }} value={selectedBASpec} onChange={e => setSelectedBASpec(e.target.value)}>
              <option value="">-- Select --</option>
              {baSpecs.map((s: any) => <option key={s.id} value={s.externalId}>{s.name} ({s.externalId})</option>)}
            </select>
          </label>
          <label>Contract Specification
            <select style={{ width: '100%' }} value={selectedContractSpec} onChange={e => setSelectedContractSpec(e.target.value)}>
              <option value="">-- Select --</option>
              {contractSpecs.map((s: any) => <option key={s.id} value={s.externalId}>{s.name} - {s.paymentContext} ({s.externalId})</option>)}
            </select>
          </label>
          <label>Product Offering
            <select style={{ width: '100%' }} value={selectedPO} onChange={e => setSelectedPO(e.target.value)}>
              <option value="">-- Select --</option>
              {poList.map((p: any) => <option key={p.id} value={p.externalId}>{p.name} ({p.externalId})</option>)}
            </select>
          </label>
          <button disabled={!selectedPartySpec || !selectedCustSpec || !selectedBASpec || !selectedContractSpec} onClick={() => setStep(1)}>Next →</button>
        </div>
      )}

      {step === 1 && (
        <div style={{ display: 'grid', gap: 12, maxWidth: 500 }}>
          <h3 style={{ margin: 0 }}>Step 2: Subscriber Details</h3>
          <input placeholder="Given Name *" value={givenName} onChange={e => setGivenName(e.target.value)} />
          <input placeholder="Family Name *" value={familyName} onChange={e => setFamilyName(e.target.value)} />
          <input placeholder="MSISDN *" value={msisdn} onChange={e => setMsisdn(e.target.value)} />

          {(() => {
            const ps = partySpecs.find((s: any) => s.externalId === selectedPartySpec)
            const chars = ps ? getPersonalizableChars(ps.characteristics) : []
            return chars.length > 0 && (
              <fieldset><legend>Party Characteristics</legend>
                {chars.map((c: any) => <CharInput key={c.id} char={c} value={formValues.party[c.externalId || c.id] || ''} onChange={v => setFormValues({ ...formValues, party: { ...formValues.party, [c.externalId || c.id]: v } })} />)}
              </fieldset>
            )
          })()}

          {(() => {
            const cs = custSpecs.find((s: any) => s.externalId === selectedCustSpec)
            const chars = cs ? getPersonalizableChars(cs.characteristics) : []
            return chars.length > 0 && (
              <fieldset><legend>Customer Characteristics</legend>
                {chars.map((c: any) => <CharInput key={c.id} char={c} value={formValues.customer[c.externalId || c.id] || ''} onChange={v => setFormValues({ ...formValues, customer: { ...formValues.customer, [c.externalId || c.id]: v } })} />)}
              </fieldset>
            )
          })()}

          {(() => {
            const bs = baSpecs.find((s: any) => s.externalId === selectedBASpec)
            const chars = bs ? getPersonalizableChars(bs.characteristics) : []
            return chars.length > 0 && (
              <fieldset><legend>Billing Account Characteristics</legend>
                {chars.map((c: any) => <CharInput key={c.id} char={c} value={formValues.billingAccount[c.externalId || c.id] || ''} onChange={v => setFormValues({ ...formValues, billingAccount: { ...formValues.billingAccount, [c.externalId || c.id]: v } })} />)}
              </fieldset>
            )
          })()}

          {(() => {
            const cs = contractSpecs.find((s: any) => s.externalId === selectedContractSpec)
            const po = poList.find((p: any) => p.externalId === selectedPO)
            const chars = cs ? getPersonalizableChars(cs.characteristics) : []
            const poChars = po ? getPersonalizableChars(po.characteristics || []) : []
            // Resource specs linked to the selected PO (via PO->PS->CFSS->RFSS->LRS chain)
            const poResourceSpecs = po?.resourceSpecifications || []
            return (
              <fieldset><legend>Contract & Product</legend>
                {poResourceSpecs.length > 0 && <>
                  <p style={{ fontSize: 12, color: '#555', margin: '0 0 6px' }}>Logical Resources (required by Product Offering):</p>
                  {poResourceSpecs.map((rs: any) => (
                    <label key={rs.id} style={{ display: 'block', marginBottom: 6 }}>
                      {rs.name} ({rs.externalId}) <span style={{ color: 'red' }}>*</span>
                      <input style={{ width: '100%' }} placeholder={`Enter ${rs.name} number`}
                        value={formValues.contract[`_res_${rs.externalId || rs.id}`] || ''}
                        onChange={e => setFormValues({ ...formValues, contract: { ...formValues.contract, [`_res_${rs.externalId || rs.id}`]: e.target.value } })} />
                    </label>
                  ))}
                </>}
                {selectedPO && poResourceSpecs.length === 0 && <p style={{ fontSize: 11, color: '#888' }}>No resource specs linked to this Product Offering. Re-upload BusinessConfig to refresh.</p>}
                {poChars.length > 0 && <>
                  <p style={{ fontSize: 12, color: '#555', margin: '8px 0 6px' }}>Product Characteristics:</p>
                  {poChars.map((c: any) => <CharInput key={c.id} char={c} value={formValues.contract[`_po_${c.externalId || c.id}`] || ''} onChange={v => setFormValues({ ...formValues, contract: { ...formValues.contract, [`_po_${c.externalId || c.id}`]: v } })} />)}
                </>}
                {chars.length > 0 && <>
                  <p style={{ fontSize: 12, color: '#555', margin: '8px 0 6px' }}>Contract Characteristics:</p>
                  {chars.map((c: any) => <CharInput key={c.id} char={c} value={formValues.contract[c.externalId || c.id] || ''} onChange={v => setFormValues({ ...formValues, contract: { ...formValues.contract, [c.externalId || c.id]: v } })} />)}
                </>}
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
  const [op, setOp] = useState('read_party_ext')
  const [params, setParams] = useState<any>({})
  const [body, setBody] = useState('')
  const [result, setResult] = useState<any>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const operations: Record<string, { label: string; method: string; path: string; fields: string[]; queryParams?: string[] }> = {
    // Party
    read_party_ext: { label: 'Get Party - ExternalId', method: 'GET', path: '/party', fields: ['externalId'], queryParams: ['externalId'] },
    read_party_id: { label: 'Get Party - Id', method: 'GET', path: '/party', fields: ['id'], queryParams: ['id'] },
    delete_party_ext: { label: 'Delete Party - ExternalId', method: 'DELETE', path: '/party/{externalId}', fields: ['externalId'] },
    delete_party_id: { label: 'Delete Party - Id', method: 'DELETE', path: '/party/{id}?by=id', fields: ['id'] },
    // Customer
    read_customer_ext: { label: 'Get Customer - ExternalId', method: 'GET', path: '/customer', fields: ['externalId'], queryParams: ['externalId'] },
    read_customer_id: { label: 'Get Customer - Id', method: 'GET', path: '/customer', fields: ['id'], queryParams: ['id'] },
    read_customer_msisdn: { label: 'Get Customer - MSISDN', method: 'GET', path: '/customer', fields: ['msisdn'], queryParams: ['msisdn'] },
    delete_customer_ext: { label: 'Delete Customer - ExternalId', method: 'DELETE', path: '/customer/{externalId}', fields: ['externalId'] },
    // Contract
    read_contract_ext: { label: 'Get Contract - ExternalId', method: 'GET', path: '/contract', fields: ['customerExternalId', 'contractExternalId'], queryParams: ['customerExternalId', 'contractExternalId'] },
    read_contract_id: { label: 'Get Contract - Id', method: 'GET', path: '/contract', fields: ['customerId', 'contractId'], queryParams: ['customerId', 'contractId'] },
    read_contract_msisdn: { label: 'Get Contract - MSISDN', method: 'GET', path: '/contract', fields: ['msisdn'], queryParams: ['msisdn'] },
    delete_contract_ext: { label: 'Delete Contract - ExternalId', method: 'DELETE', path: '/contract', fields: ['customerExternalId', 'contractExternalId'], queryParams: ['customerExternalId', 'contractExternalId'] },
    delete_contract_msisdn: { label: 'Delete Contract - MSISDN', method: 'DELETE', path: '/contract', fields: ['msisdn'], queryParams: ['msisdn'] },
    // Balance
    balance_customer: { label: 'Balance Enquiry - Customer', method: 'GET', path: '/balance', fields: ['customerExternalId'], queryParams: ['customerExternalId'] },
    balance_msisdn: { label: 'Balance Enquiry - MSISDN', method: 'GET', path: '/balance', fields: ['msisdn'], queryParams: ['msisdn'] },
    balance_adj: { label: 'Balance Adjustment', method: 'POST', path: '/balance/adjust', fields: [] },
    // Resource
    swap_resource: { label: 'Swap Logical Resource (MSISDN/IMSI)', method: 'POST', path: '/resource/swap', fields: [] },
    // Product
    replace_product: { label: 'Replace Product', method: 'POST', path: '/product/replace', fields: [] },
    // Sharing
    eligible_consumers: { label: 'Get Eligible Consumers', method: 'GET', path: '/sharing/eligible-consumers', fields: ['customerExternalId'], queryParams: ['customerExternalId'] },
    // Recurrence
    recurrence: { label: 'Recurrence Enquiry - MSISDN', method: 'GET', path: '/recurrence', fields: ['msisdn'], queryParams: ['msisdn'] },
    // Spec Enquiry
    spec_contract: { label: 'Read Contract Specification', method: 'GET', path: '/spec/contract', fields: ['externalId'], queryParams: ['externalId'] },
    spec_product: { label: 'Read Product Specification', method: 'GET', path: '/spec/product', fields: ['externalId'], queryParams: ['externalId'] },
    spec_offering: { label: 'Read Product Offering', method: 'GET', path: '/spec/product_offering', fields: ['externalId'], queryParams: ['externalId'] },
    spec_bucket: { label: 'Read Bucket Specification', method: 'GET', path: '/spec/bucket', fields: ['externalId'], queryParams: ['externalId'] },
    spec_billing: { label: 'Read Billing Account Spec', method: 'GET', path: '/spec/billing_account', fields: ['externalId'], queryParams: ['externalId'] },
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
        opts.body = body || JSON.stringify(params)
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
        {(cfg.method === 'POST' || cfg.method === 'PUT') && (
          <textarea placeholder='JSON body (for POST/PUT)' rows={6} style={{ fontFamily: 'monospace', fontSize: 12 }}
            value={body} onChange={e => setBody(e.target.value)} />
        )}
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
  const [expanded, setExpanded] = useState<number | null>(null)

  const load = async () => {
    const r = await fetch(`${API}/logs`)
    setLogs(await r.json())
  }

  React.useEffect(() => { load() }, [])

  return (
    <div>
      <h2>API Request/Response Logs</h2>
      <button onClick={load}>Refresh</button>
      <button onClick={() => fetch(`${API}/logs/clear`, { method: 'DELETE' }).then(load)} style={{ marginLeft: 8 }}>Clear</button>
      <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 10, fontSize: 12 }}>
        <thead>
          <tr style={{ background: '#eee', textAlign: 'left' }}>
            <th style={{ padding: 6 }}>Time</th>
            <th style={{ padding: 6 }}>Type</th>
            <th style={{ padding: 6 }}>Method</th>
            <th style={{ padding: 6 }}>URL</th>
            <th style={{ padding: 6 }}>Status</th>
          </tr>
        </thead>
        <tbody>
          {logs.map((l, i) => (
            <React.Fragment key={i}>
              <tr style={{ borderBottom: '1px solid #ddd', cursor: 'pointer', background: l.status === 'ERROR' ? '#fff0f0' : undefined }} onClick={() => setExpanded(expanded === i ? null : i)}>
                <td style={{ padding: 6 }}>{l.timestamp?.split('T')[1]?.slice(0,8)}</td>
                <td style={{ padding: 6 }}>{l.type || 'RESPONSE'}</td>
                <td style={{ padding: 6 }}>{l.method}</td>
                <td style={{ padding: 6, wordBreak: 'break-all', maxWidth: 400 }}>{l.url}</td>
                <td style={{ padding: 6, color: l.status >= 400 || l.status === 'ERROR' ? 'red' : 'green' }}>{l.status}</td>
              </tr>
              {expanded === i && (
                <tr><td colSpan={5} style={{ padding: 10, background: '#f9f9f9' }}>
                  {l.ssl_verify && <><b>SSL Verify:</b> {l.ssl_verify} | <b>SOCKS5:</b> {l.socks5_proxy}<br/></>}
                  {l.headers && <><b>Request Headers:</b><pre style={{ fontSize: 11, margin: '4px 0' }}>{JSON.stringify(l.headers, null, 2)}</pre></>}
                  {l.request_body && <><b>Request Body:</b><pre style={{ fontSize: 11, margin: '4px 0' }}>{JSON.stringify(l.request_body, null, 2)}</pre></>}
                  {l.response_headers && <><b>Response Headers:</b><pre style={{ fontSize: 11, margin: '4px 0' }}>{JSON.stringify(l.response_headers, null, 2)}</pre></>}
                  {l.response_body && <><b>Response Body:</b><pre style={{ fontSize: 11, margin: '4px 0', maxHeight: 300, overflow: 'auto', whiteSpace: 'pre-wrap' }}>{l.response_body}</pre></>}
                </td></tr>
              )}
            </React.Fragment>
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
            <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}><input type="checkbox" checked={config.network?.socks5_enabled || false} onChange={e => updateNet('socks5_enabled', e.target.checked)} />Enable SOCKS5 Proxy</label>
            <label>SOCKS5 Proxy<input style={{ width: '100%' }} placeholder="socks5://127.0.0.1:1080" value={config.network?.socks5_proxy || ''} onChange={e => updateNet('socks5_proxy', e.target.value)} disabled={!config.network?.socks5_enabled} /></label>
            <label>Timeout (s)<input style={{ width: '100%' }} type="number" value={config.network?.timeout_seconds || 30} onChange={e => updateNet('timeout_seconds', Number(e.target.value))} /></label>
          </div>
        </fieldset>

        <fieldset>
          <legend><b>Defaults (Spec External IDs)</b></legend>
          <DefaultsEditor config={config} setConfig={setConfig} />
        </fieldset>

        <button onClick={save} disabled={loading}>{loading ? 'Saving...' : 'Save Configuration'}</button>
        {msg && <p style={{ color: msg.startsWith('Error') ? 'red' : 'green' }}>{msg}</p>}
      </div>
    </div>
  )
}

function CharInput({ char: c, value, onChange }: { char: any; value: string; onChange: (v: string) => void }) {
  const isMust = c.valueRegulator === 'mustBePersonalized'
  const isSelection = c.valueRegulator === 'selection'
  const possibleValues = c.possibleValues || []
  const charKey = c.externalId || c.id

  return (
    <label style={{ display: 'block', marginBottom: 6 }}>
      {c.name || charKey} {c.required && <span style={{ color: 'red' }}>*</span>}
      {!c.required && <span style={{ fontSize: 10, color: '#999' }}> (optional)</span>}
      {isMust && <span style={{ fontSize: 10, color: '#c60' }}> [must personalize]</span>}
      {isSelection && possibleValues.length > 0 ? (
        <select style={{ width: '100%' }} value={value} onChange={e => onChange(e.target.value)}>
          <option value="">-- Select --</option>
          {possibleValues.map((pv: any, i: number) => (
            <option key={i} value={pv.value || ''}>{pv.name || pv.value}{pv.default ? ' (default)' : ''}</option>
          ))}
        </select>
      ) : (
        <input style={{ width: '100%' }} placeholder={c.defaultValue || ''} value={value} onChange={e => onChange(e.target.value)} />
      )}
    </label>
  )
}

function DefaultsEditor({ config, setConfig }: { config: any; setConfig: (c: any) => void }) {
  const [specs, setSpecs] = useState<any>(null)

  React.useEffect(() => {
    fetch(`${API}/specs`).then(r => r.ok ? r.json() : null).then(setSpecs).catch(() => {})
  }, [])

  const update = (k: string, v: string) => setConfig({ ...config, defaults: { ...config.defaults, [k]: v } })

  const partySpecs = specs?.partySpecifications || []
  const custSpecs = specs?.customerSpecifications || []
  const contractSpecs = specs?.contractSpecifications || []
  const baSpecs = specs?.billingAccountSpecifications || []
  const poList = specs?.productOfferings || []
  const cmSpecs = specs?.contactMediumSpecifications || []

  const SpecSelect = ({ label, field, options }: { label: string; field: string; options: any[] }) => (
    <label>{label}
      {options.length > 0 ? (
        <select style={{ width: '100%' }} value={config.defaults?.[field] || ''} onChange={e => update(field, e.target.value)}>
          <option value="">-- None --</option>
          {options.map((s: any) => <option key={s.externalId || s.id} value={s.externalId}>{s.name || s.externalId} ({s.externalId})</option>)}
        </select>
      ) : (
        <input style={{ width: '100%' }} value={config.defaults?.[field] || ''} onChange={e => update(field, e.target.value)} />
      )}
    </label>
  )

  return (
    <div style={{ display: 'grid', gap: 8 }}>
      {!specs && <p style={{ fontSize: 12, color: '#888' }}>No catalog loaded — showing free-text inputs. Upload BusinessConfig in Catalog tab for dropdowns.</p>}
      <label>Partition ID<input style={{ width: '100%' }} value={config.defaults?.partitionId || ''} onChange={e => update('partitionId', e.target.value)} /></label>
      <SpecSelect label="Party Spec" field="partySpecExternalId" options={partySpecs} />
      <SpecSelect label="Customer Spec" field="customerSpecExternalId" options={custSpecs} />
      <SpecSelect label="Billing Account Spec" field="billingAccountSpecExternalId" options={baSpecs} />
      <SpecSelect label="Contract Spec" field="contractSpecExternalId" options={contractSpecs} />
      <SpecSelect label="Base Plan Product Offering" field="basePlanProductOfferingExternalId" options={poList} />
      <SpecSelect label="SMS Contact Medium Spec" field="SMS_contactMediumSpecExternalId" options={cmSpecs} />
      <SpecSelect label="REST Contact Medium Spec" field="REST_contactMediumSpecExternalId" options={cmSpecs} />
      <SpecSelect label="EMAIL Contact Medium Spec" field="EMAIL_contactMediumSpecExternalId" options={cmSpecs} />
    </div>
  )
}

export default App
