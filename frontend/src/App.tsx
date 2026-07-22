import React, { useState } from 'react'

const API = '/api/v1'

function App() {
  const [tab, setTab] = useState<'wizard' | 'crm' | 'catalog' | 'operations' | 'po_publish' | 'settings' | 'logs'>('wizard')
  return (
    <div style={{ fontFamily: 'system-ui', maxWidth: 1100, margin: '0 auto', padding: 20 }}>
      <h1>Ericsson BAE Provisioning Tool</h1>
      <nav style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
        <button onClick={() => setTab('wizard')} style={{ fontWeight: tab === 'wizard' ? 'bold' : 'normal' }}>Provision Subscriber</button>
        <button onClick={() => setTab('crm')} style={{ fontWeight: tab === 'crm' ? 'bold' : 'normal' }}>👤 360° View</button>
        <button onClick={() => setTab('catalog')} style={{ fontWeight: tab === 'catalog' ? 'bold' : 'normal' }}>📦 Catalog</button>
        <button onClick={() => setTab('operations')} style={{ fontWeight: tab === 'operations' ? 'bold' : 'normal' }}>🔧 Operations</button>
        <button onClick={() => setTab('po_publish')} style={{ fontWeight: tab === 'po_publish' ? 'bold' : 'normal' }}>📤 PO Publish</button>
        <button onClick={() => setTab('settings')} style={{ fontWeight: tab === 'settings' ? 'bold' : 'normal' }}>⚙ Settings</button>
        <button onClick={() => setTab('logs')} style={{ fontWeight: tab === 'logs' ? 'bold' : 'normal' }}>📋 API Logs</button>
      </nav>
      {tab === 'wizard' && <ProvisionWizard />}
      {tab === 'crm' && <CRMView />}
      {tab === 'catalog' && <CatalogPanel />}
      {tab === 'operations' && <OperationsPanel />}
      {tab === 'po_publish' && <POPublishPanel />}
      {tab === 'settings' && <SettingsPanel />}
      {tab === 'logs' && <ApiLogsPanel />}
    </div>
  )
}

function ProvisionWizard() {
  const [specs, setSpecs] = useState<any>(null)
  const [step, setStep] = useState(0)
  const [editMode, setEditMode] = useState(false)
  const [partyJson, setPartyJson] = useState('')
  const [customerJson, setCustomerJson] = useState('')
  const [contractJson, setContractJson] = useState('')
  const [selectedPartySpec, setSelectedPartySpec] = useState('')
  const [selectedCustSpec, setSelectedCustSpec] = useState('')
  const [selectedBASpec, setSelectedBASpec] = useState('')
  const [selectedContractSpec, setSelectedContractSpec] = useState('')
  const [selectedPO, setSelectedPO] = useState('')
  const [additionalPOs, setAdditionalPOs] = useState<Array<{ poExtId: string; formVals: any }>>([{ poExtId: '', formVals: {} }])
  const [selectedCommIdSpec, setSelectedCommIdSpec] = useState('')
  const [selectedCmSpecs, setSelectedCmSpecs] = useState<Array<{ specExtId: string; charVals: Record<string, string>; externalId: string }>>([{ specExtId: '', charVals: {}, externalId: '' }])
  const [homeTimeZone, setHomeTimeZone] = useState('Europe/Stockholm')
  const [includeContactMediumAssoc, setIncludeContactMediumAssoc] = useState(true)
  const [cmDefaults, setCmDefaults] = useState<any>({})
  const [formValues, setFormValues] = useState<any>({ party: {}, customer: {}, contract: {}, billingAccount: {} })
  const [productOptions, setProductOptions] = useState({ baRef: true, baRefRecurrence: true, sharingProvider: false })
  const [billCycleSpecExtId, setBillCycleSpecExtId] = useState('')
  const [billCycleChangeType, setBillCycleChangeType] = useState('NO_PRORATE')
  const [msisdn, setMsisdn] = useState('')
  const [email, setEmail] = useState('')
  const [givenName, setGivenName] = useState('')
  const [familyName, setFamilyName] = useState('')
  const [result, setResult] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  React.useEffect(() => {
    fetch(`${API}/specs`).then(r => r.ok ? r.json() : null).then(setSpecs).catch(() => {})
    fetch(`${API}/settings`).then(r => r.ok ? r.json() : null).then(cfg => {
      if (cfg?.defaults?.homeTimeZone) setHomeTimeZone(cfg.defaults.homeTimeZone)
      if (cfg?.defaults) setCmDefaults(cfg.defaults)
    }).catch(() => {})
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
  const commIdSpecs = specs.communicationIdentifierSpecifications || []
  const cmSpecs = specs.contactMediumSpecifications || []

  const deriveCmSpec = (extId: string) => {
    const s = cmSpecs.find((s: any) => s.externalId === extId)
    if (!s) return null
    let commIdKey = 'communicationId', channelKey = 'channelType'
    for (const c of (s.characteristics || [])) {
      const k = (c.externalId || c.name || '').toLowerCase()
      if (k.includes('communication') || k.includes('phone') || k.includes('number') || k.includes('address') || k.includes('email'))
        commIdKey = c.externalId || c.id
      if (k.includes('channel') || k.includes('type'))
        channelKey = c.externalId || c.id
    }
    return { externalId: extId, commIdKey, channelKey }
  }

  const getMustChars = (chars: any[]) =>
    chars.filter((c: any) => (c.externalId || '').trim() !== '' && c.valueRegulator === 'mustBePersonalized')
  const getOptionalChars = (chars: any[]) =>
    chars.filter((c: any) => (c.externalId || '').trim() !== '' && (c.valueRegulator === 'canBePersonalized' || c.valueRegulator === 'selection'))
  const getPersonalizableChars = (chars: any[]) =>
    chars.filter((c: any) => (c.externalId || '').trim() !== '' && c.valueRegulator !== 'fixed')

  // Pre-fill default values only for mustBePersonalized chars (truly required)
  const prefillDefaults = (chars: any[], section: string) => {
    const updates: any = {}
    for (const c of chars) {
      const key = c.externalId || c.id
      if (c.valueRegulator === 'mustBePersonalized' && c.defaultValue && !formValues[section]?.[key])
        updates[key] = c.defaultValue
    }
    if (Object.keys(updates).length)
      setFormValues((prev: any) => ({ ...prev, [section]: { ...prev[section], ...updates } }))
  }

  const submit = async () => {
    setLoading(true); setError(''); setResult(null)
    try {
      const payload = {
        partyBody: JSON.parse(partyJson),
        customerBody: JSON.parse(customerJson),
        contractBody: JSON.parse(contractJson),
        customerExternalId: JSON.parse(customerJson).externalId,
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
      {error && <p style={{ color: 'red', background: '#fff0f0', padding: 10, border: '1px solid #fcc', borderRadius: 4, wordBreak: 'break-all' }}>❌ {error}</p>}
      {result && <pre style={{ background: '#f0fff0', padding: 10, border: '1px solid #cfc', borderRadius: 4, maxHeight: 300, overflow: 'auto' }}>{JSON.stringify(result, null, 2)}</pre>}

      {step === 0 && (
        <div style={{ display: 'grid', gap: 12, maxWidth: 500 }}>
          <h3 style={{ margin: 0 }}>Step 1: Select Specifications</h3>
          <label>Party Specification
            <select style={{ width: '100%' }} value={selectedPartySpec} onChange={e => {
              setSelectedPartySpec(e.target.value)
              const ps = partySpecs.find((s: any) => s.externalId === e.target.value)
              if (ps) prefillDefaults(getPersonalizableChars(ps.characteristics), 'party')
            }}>
              <option value="">-- Select --</option>
              {partySpecs.map((s: any) => <option key={s.id} value={s.externalId}>{s.name} ({s.externalId})</option>)}
            </select>
          </label>
          <label>Customer Specification
            <select style={{ width: '100%' }} value={selectedCustSpec} onChange={e => {
              setSelectedCustSpec(e.target.value)
              const cs = custSpecs.find((s: any) => s.externalId === e.target.value)
              if (cs) prefillDefaults(getPersonalizableChars(cs.characteristics), 'customer')
            }}>
              <option value="">-- Select --</option>
              {custSpecs.map((s: any) => <option key={s.id} value={s.externalId}>{s.name} ({s.externalId})</option>)}
            </select>
          </label>
          <label>Billing Account Specification
            <select style={{ width: '100%' }} value={selectedBASpec} onChange={e => {
              setSelectedBASpec(e.target.value)
              const bs = baSpecs.find((s: any) => s.externalId === e.target.value)
              if (bs) prefillDefaults(getPersonalizableChars(bs.characteristics), 'billingAccount')
            }}>
              <option value="">-- Select --</option>
              {baSpecs.map((s: any) => <option key={s.id} value={s.externalId}>{s.name} ({s.externalId})</option>)}
            </select>
          </label>
          <label>Contract Specification
            <select style={{ width: '100%' }} value={selectedContractSpec} onChange={e => {
              setSelectedContractSpec(e.target.value)
              const cs = contractSpecs.find((s: any) => s.externalId === e.target.value)
              if (cs) prefillDefaults(getPersonalizableChars(cs.characteristics), 'contract')
            }}>
              <option value="">-- Select --</option>
              {contractSpecs.map((s: any) => <option key={s.id} value={s.externalId}>{s.name} - {s.paymentContext} ({s.externalId})</option>)}
            </select>
          </label>
          <label>Base Plan Product Offering
            <select style={{ width: '100%' }} value={selectedPO} onChange={e => {
              setSelectedPO(e.target.value)
              const po = poList.find((p: any) => p.externalId === e.target.value)
              if (po) prefillDefaults(getPersonalizableChars(po.characteristics || []), 'contract')
            }}>
              <option value="">-- Select --</option>
              {poList.map((p: any) => <option key={p.id} value={p.externalId}>{p.name} ({p.externalId})</option>)}
            </select>
          </label>
          <label style={{ fontSize: 12, fontWeight: 'bold', marginTop: 4 }}>Add-On Product Offerings
          </label>
          {additionalPOs.map((entry, idx) => (
            <div key={idx} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <select style={{ flex: 1 }} value={entry.poExtId} onChange={e => {
                const updated = [...additionalPOs]
                updated[idx] = { ...updated[idx], poExtId: e.target.value, formVals: {} }
                setAdditionalPOs(updated)
              }}>
                <option value="">-- None --</option>
                {poList.map((p: any) => <option key={p.id} value={p.externalId}>{p.name} ({p.externalId})</option>)}
              </select>
              {additionalPOs.length > 1 && <button type="button" onClick={() => setAdditionalPOs(additionalPOs.filter((_, i) => i !== idx))} style={{ fontSize: 11 }}>✕</button>}
            </div>
          ))}
          <button type="button" style={{ fontSize: 11, width: 'fit-content' }} onClick={() => setAdditionalPOs([...additionalPOs, { poExtId: '', formVals: {} }])}>+ Add Product Offering</button>
          <label style={{ fontSize: 12, fontWeight: 'bold', marginTop: 4 }}>Contact Mediums</label>
          {selectedCmSpecs.map((entry, idx) => {
            const spec = cmSpecs.find((s: any) => s.externalId === entry.specExtId)
            // Derive channelType from spec name/externalId — not shown to user
            const deriveChannelType = (s: any) => {
              const n = (s?.externalId || s?.name || '').toUpperCase()
              if (n.includes('EMAIL') || n.includes('MAIL')) return 'EMail'
              if (n.includes('REST') || n.includes('SOCIAL')) return 'socialMedia'
              if (n.includes('SMS') || n.includes('TEL')) return 'SMS'
              return ''
            }
            const channelTypeChar = spec?.characteristics?.find((c: any) => (c.externalId || '').toLowerCase().includes('channel'))
            const userChars = spec?.characteristics?.filter((c: any) => !((c.externalId || '').toLowerCase().includes('channel'))) || []
            const commIdLabel = (() => {
              const ct = deriveChannelType(spec)
              if (ct === 'EMail') return 'Email Address'
              if (ct === 'SMS') return 'Phone Number (MSISDN)'
              if (ct === 'socialMedia') return 'Social Media ID'
              return 'Communication ID'
            })()
            return (
              <div key={idx} style={{ border: '1px solid #ddd', borderRadius: 4, padding: 8, display: 'grid', gap: 6 }}>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <select style={{ flex: 1 }} value={entry.specExtId} onChange={e => {
                    const s = cmSpecs.find((s: any) => s.externalId === e.target.value)
                    const ct = deriveChannelType(s)
                    const ctKey = s?.characteristics?.find((c: any) => (c.externalId || '').toLowerCase().includes('channel'))?.externalId
                    const u = [...selectedCmSpecs]
                    u[idx] = { specExtId: e.target.value, charVals: ctKey && ct ? { [ctKey]: ct } : {}, externalId: u[idx].externalId }
                    setSelectedCmSpecs(u)
                  }}>
                    <option value="">-- Select Spec --</option>
                    {cmSpecs.map((s: any) => <option key={s.id} value={s.externalId}>{s.name} ({s.externalId})</option>)}
                  </select>
                  {selectedCmSpecs.length > 1 && <button type="button" onClick={() => setSelectedCmSpecs(selectedCmSpecs.filter((_, i) => i !== idx))} style={{ fontSize: 11 }}>✕</button>}
                </div>
                {channelTypeChar && (
                  <label style={{ fontSize: 12 }}>Channel Type
                    <input style={{ width: '100%' }} placeholder="e.g. SMS, EMail, socialMedia"
                      value={entry.charVals[channelTypeChar.externalId] || ''}
                      onChange={e => { const u = [...selectedCmSpecs]; u[idx] = { ...u[idx], charVals: { ...u[idx].charVals, [channelTypeChar.externalId]: e.target.value } }; setSelectedCmSpecs(u) }} />
                  </label>
                )}
                {userChars.map((c: any) => {
                  const isCommId = (c.externalId || '').toLowerCase().includes('communication')
                  const label = isCommId ? commIdLabel : (c.name || c.externalId)
                  const placeholder = isCommId ? commIdLabel : c.externalId
                  return (
                    <label key={c.id} style={{ fontSize: 12 }}>{label}
                      <input style={{ width: '100%' }} placeholder={placeholder}
                        value={entry.charVals[c.externalId || c.id] || ''}
                        onChange={e => { const u = [...selectedCmSpecs]; u[idx] = { ...u[idx], charVals: { ...u[idx].charVals, [c.externalId || c.id]: e.target.value } }; setSelectedCmSpecs(u) }} />
                    </label>
                  )
                })}
              </div>
            )
          })}
          <button type="button" style={{ fontSize: 11, width: 'fit-content' }} onClick={() => setSelectedCmSpecs([...selectedCmSpecs, { specExtId: '', charVals: {}, externalId: '' }])}>+ Add Contact Medium</button>
          <button disabled={!selectedPartySpec || !selectedCustSpec || !selectedBASpec || !selectedContractSpec} onClick={() => setStep(1)}>Next →</button>
        </div>
      )}

      {step === 1 && (
        <div style={{ display: 'grid', gap: 12, maxWidth: 500 }}>
          <h3 style={{ margin: 0 }}>Step 2: Subscriber Details</h3>
          <input placeholder="Given Name *" value={givenName} onChange={e => setGivenName(e.target.value)} />
          <input placeholder="Family Name *" value={familyName} onChange={e => setFamilyName(e.target.value)} />
          <input placeholder="MSISDN *" value={msisdn} onChange={e => setMsisdn(e.target.value)} />
          <input placeholder="Email (optional)" value={email} onChange={e => setEmail(e.target.value)} />

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
            return (
              <fieldset><legend>Billing Account</legend>
                <label style={{ display: 'block', marginBottom: 6 }}>Bill Cycle Spec
                  {(specs.billingCycleSpecifications || []).length > 0 ? (
                    <select style={{ width: '100%' }} value={billCycleSpecExtId} onChange={e => setBillCycleSpecExtId(e.target.value)}>
                      <option value="">-- None --</option>
                      {(specs.billingCycleSpecifications || []).map((bcs: any) => <option key={bcs.id || bcs.externalId} value={bcs.externalId}>{bcs.name} ({bcs.externalId})</option>)}
                    </select>
                  ) : (
                    <input style={{ width: '100%' }} placeholder="e.g. CHT_billcycle_01 (upload BusinessConfig for dropdown)" value={billCycleSpecExtId} onChange={e => setBillCycleSpecExtId(e.target.value)} />
                  )}
                </label>
                <label style={{ display: 'block', marginBottom: 6 }}>Bill Cycle Change Type
                  <select style={{ width: '100%' }} value={billCycleChangeType} onChange={e => setBillCycleChangeType(e.target.value)}>
                    <option value="NO_PRORATE">NO_PRORATE</option>
                    <option value="PRORATE_END_CURRENT">PRORATE_END_CURRENT</option>
                    <option value="PRORATE_POS_START_NEW">PRORATE_POS_START_NEW</option>
                    <option value="PRORATE_NEG_START_NEW">PRORATE_NEG_START_NEW</option>
                  </select>
                </label>
                {chars.map((c: any) => <CharInput key={c.id} char={c} value={formValues.billingAccount[c.externalId || c.id] || ''} onChange={v => setFormValues({ ...formValues, billingAccount: { ...formValues.billingAccount, [c.externalId || c.id]: v } })} />)}
              </fieldset>
            )
          })()}

          {(() => {
            const cs = contractSpecs.find((s: any) => s.externalId === selectedContractSpec)
            const po = poList.find((p: any) => p.externalId === selectedPO)
            const mustChars = cs ? getMustChars(cs.characteristics) : []
            const optChars = cs ? getOptionalChars(cs.characteristics) : []
            const poMustChars = po ? getMustChars(po.characteristics || []) : []
            const poOptChars = po ? getOptionalChars(po.characteristics || []) : []
            let poResourceSpecs = [...(po?.resourceSpecifications || [])]
            if (po?.childOfferings?.length) {
              const seen = new Set(poResourceSpecs.map((r: any) => r.id))
              for (const childExtId of po.childOfferings) {
                const childPO = poList.find((p: any) => p.externalId === childExtId)
                for (const rs of (childPO?.resourceSpecifications || [])) {
                  if (!seen.has(rs.id)) { seen.add(rs.id); poResourceSpecs.push(rs) }
                }
              }
            }
            return (
              <fieldset><legend>Contract & Product</legend>
                {(() => {
                  return poResourceSpecs.length > 0 ? <>
                    <p style={{ fontSize: 12, color: '#555', margin: '0 0 6px' }}>Identification Resources (required by Product Offering):</p>
                    {poResourceSpecs.map((rs: any) => (
                      <label key={rs.id} style={{ display: 'block', marginBottom: 6 }}>
                        {rs.name}{rs.externalId ? ` (${rs.externalId})` : ''}{rs.type ? ` [${rs.type}]` : ''} <span style={{ color: 'red' }}>*</span>
                        <input style={{ width: '100%' }} placeholder={`Enter ${rs.name} number`}
                          value={formValues.contract[`_res_${rs.externalId || rs.id}`] || ''}
                          onChange={e => setFormValues({ ...formValues, contract: { ...formValues.contract, [`_res_${rs.externalId || rs.id}`]: e.target.value } })} />
                      </label>
                    ))}
                  </> : selectedPO ? <p style={{ fontSize: 11, color: '#888' }}>No identification resources linked to this PO.</p> : null
                })()}
                <label style={{ display: 'block', marginBottom: 6, fontSize: 12 }}>Home Time Zone
                  <input style={{ width: '100%' }} value={homeTimeZone} onChange={e => setHomeTimeZone(e.target.value)} placeholder="e.g. Europe/Stockholm" />
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, marginBottom: 6 }}>
                  <input type="checkbox" checked={includeContactMediumAssoc} onChange={e => setIncludeContactMediumAssoc(e.target.checked)} />
                  Include contactMediumAssociation (SMS/REST/EMAIL)
                </label>
                {selectedPO && <>
                  <p style={{ fontSize: 12, color: '#555', margin: '8px 0 4px' }}>Product Options:</p>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                    <input type="checkbox" checked={productOptions.baRef} onChange={e => setProductOptions({...productOptions, baRef: e.target.checked})} />
                    billingAccountReference
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                    <input type="checkbox" checked={productOptions.baRefRecurrence} onChange={e => setProductOptions({...productOptions, baRefRecurrence: e.target.checked})} />
                    baRefForBillCycleAlignedRecurrence
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                    <input type="checkbox" checked={productOptions.sharingProvider} onChange={e => setProductOptions({...productOptions, sharingProvider: e.target.checked})} />
                    Include Technical Product (sharingProvider/sharingConsumer)
                  </label>
                </>}
                {poMustChars.length > 0 && <>
                  <p style={{ fontSize: 12, color: '#c60', margin: '8px 0 4px' }}>Base Plan — Required Characteristics:</p>
                  {poMustChars.map((c: any) => <CharInput key={c.id} char={c} value={formValues.contract[`_po_${c.externalId || c.id}`] || ''} onChange={v => setFormValues({ ...formValues, contract: { ...formValues.contract, [`_po_${c.externalId || c.id}`]: v } })} />)}
                </>}
                {poOptChars.length > 0 && <>
                  <p style={{ fontSize: 12, color: '#0a7', margin: '8px 0 4px' }}>Base Plan — Optional Characteristics:</p>
                  {poOptChars.map((c: any) => <CharInput key={c.id} char={c} value={formValues.contract[`_po_${c.externalId || c.id}`] || ''} onChange={v => setFormValues({ ...formValues, contract: { ...formValues.contract, [`_po_${c.externalId || c.id}`]: v } })} />)}
                </>}
                {mustChars.length > 0 && <>
                  <p style={{ fontSize: 12, color: '#c60', margin: '8px 0 4px' }}>Contract — Required Characteristics:</p>
                  {mustChars.map((c: any) => <CharInput key={c.id} char={c} value={formValues.contract[c.externalId || c.id] || ''} onChange={v => setFormValues({ ...formValues, contract: { ...formValues.contract, [c.externalId || c.id]: v } })} />)}
                </>}
                {optChars.length > 0 && <>
                  <p style={{ fontSize: 12, color: '#0a7', margin: '8px 0 4px' }}>Contract — Optional Characteristics:</p>
                  {optChars.map((c: any) => <CharInput key={c.id} char={c} value={formValues.contract[c.externalId || c.id] || ''} onChange={v => setFormValues({ ...formValues, contract: { ...formValues.contract, [c.externalId || c.id]: v } })} />)}
                </>}
                {additionalPOs.filter(e => e.poExtId).map((entry, idx) => {
                  const addPo = poList.find((p: any) => p.externalId === entry.poExtId)
                  const addMust = addPo ? getMustChars(addPo.characteristics || []) : []
                  const addOpt = addPo ? getOptionalChars(addPo.characteristics || []) : []
                  return (addMust.length > 0 || addOpt.length > 0) ? (
                    <fieldset key={idx} style={{ marginTop: 8 }}>
                      <legend style={{ fontSize: 12 }}>Add-On: {entry.poExtId}</legend>
                      {addMust.length > 0 && <>
                        <p style={{ fontSize: 11, color: '#c60', margin: '4px 0' }}>Required:</p>
                        {addMust.map((c: any) => <CharInput key={c.id} char={c}
                          value={entry.formVals[c.externalId || c.id] || ''}
                          onChange={v => { const u = [...additionalPOs]; u[idx] = { ...u[idx], formVals: { ...u[idx].formVals, [c.externalId || c.id]: v } }; setAdditionalPOs(u) }} />)}
                      </>}
                      {addOpt.length > 0 && <>
                        <p style={{ fontSize: 11, color: '#0a7', margin: '4px 0' }}>Optional:</p>
                        {addOpt.map((c: any) => <CharInput key={c.id} char={c}
                          value={entry.formVals[c.externalId || c.id] || ''}
                          onChange={v => { const u = [...additionalPOs]; u[idx] = { ...u[idx], formVals: { ...u[idx].formVals, [c.externalId || c.id]: v } }; setAdditionalPOs(u) }} />)}
                      </>}
                    </fieldset>
                  ) : null
                })}
              </fieldset>
            )
          })()}

          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={() => setStep(0)}>← Back</button>
            <button disabled={!givenName || !familyName || !msisdn} onClick={() => {
              // Build JSON bodies and go to review step
              const partyExtId = `extID-party-${msisdn}`
              const customerExtId = `extID-customer-${msisdn}`
              const baExtId = `extID_BA-${msisdn}`
              const contractExtId = `extID-contract-${msisdn}`

              const pb: any = {
                externalId: partyExtId,
                givenName, familyName,
                individualSpecification: { externalId: selectedPartySpec },
                status: [{ status: 'PartyActive' }],
              }
              // Build contactMedium array from selected specs
              const buildCm = (spec: any, channelType: string, value: string, prefix: string) => {
                const cm: any = {
                  contactMediumSpecExternalId: spec.externalId,
                  externalId: cmDefaults[`${prefix}_contactMediumExternalId`] || `cm_${prefix}_${msisdn}`,
                  characteristic: [
                    { charSpecExternalId: spec.commIdKey, value: [{ value }] },
                    { charSpecExternalId: spec.channelKey, value: [{ value: channelType }] },
                  ],
                }
                return cm
              }
              pb.contactMedium = selectedCmSpecs
                .filter(e => e.specExtId)
                .map(e => ({
                  contactMediumSpecExternalId: e.specExtId,
                  externalId: e.externalId || `cm_${e.specExtId}_${msisdn}`,
                  characteristic: Object.entries(e.charVals)
                    .filter(([, v]) => v)
                    .map(([k, v]) => ({ charSpecExternalId: k, value: [{ value: v }] })),
                }))
              const partyChars = Object.entries(formValues.party).filter(([, v]) => v)
              if (partyChars.length) pb.characteristic = partyChars.map(([k, v]) => ({ charSpecExternalId: k, value: [{ value: v }] }))

              const cb: any = {
                externalId: customerExtId,
                customerSpecification: { externalId: selectedCustSpec },
                status: [{ status: 'CustomerActive' }],
                account: [{ externalId: baExtId, billingAccountSpecExternalId: selectedBASpec, status: [{ status: 'BillingAccountActive' }] }],
                engagedParty: { externalId: partyExtId, '@referredType': 'Individual' },
              }
              if (billCycleSpecExtId.trim()) {
                cb.account[0].customerBillCycleSpecification = [{
                  externalId: `cbcs-${msisdn}`,
                  billCycleSpecExternalId: billCycleSpecExtId.trim(),
                  billCycleChangeType: billCycleChangeType,
                }]
              }
              const custChars = Object.entries(formValues.customer).filter(([, v]) => v)
              if (custChars.length) cb.characteristic = custChars.map(([k, v]) => ({ charSpecExternalId: k, value: [{ value: v }] }))
              const baChars = Object.entries(formValues.billingAccount).filter(([, v]) => v)
              if (baChars.length) cb.account[0].characteristic = baChars.map(([k, v]) => ({ charSpecExternalId: k, value: [{ value: v }] }))

              const ctb: any = {
                externalId: contractExtId,
                contractSpecification: { externalId: selectedContractSpec },
                status: [{ status: 'Created' }],
              }
              const products: any[] = []
              if (productOptions.sharingProvider) {
                products.push({
                  productOfferingExternalId: 'PO-Technical',
                  externalId: `extID_tech-${msisdn}`,
                  name: 'Technical Product',
                  sharingProvider: {
                    billingAccount: [{ externalId: baExtId }],
                    consumerList: [{ externalId: `Consumer_List_${msisdn}`, consumerCustomerExternalId: customerExtId, consumerContractExternalId: contractExtId }],
                  },
                  sharingConsumer: {
                    providerCustomerExternalId: customerExtId, providerContractExternalId: contractExtId,
                    providerProductExternalId: `extID_tech-${msisdn}`, consumerListEntryExternalId: `Consumer_List_${msisdn}`,
                  },
                })
              }
              if (selectedPO) {
                const basePlanProduct: any = {
                  productOfferingExternalId: selectedPO,
                  externalId: `${selectedPO}-${msisdn}`,
                  name: selectedPO,
                  status: [{ status: 'ProductCreated' }],
                }
                if (productOptions.baRef) basePlanProduct.billingAccountReference = { externalId: baExtId }
                if (productOptions.baRefRecurrence) basePlanProduct.baRefForBillCycleAlignedRecurrence = { externalId: baExtId }
                const poCharEntries = Object.entries(formValues.contract)
                  .filter(([k, v]) => k.startsWith('_po_') && v && (v as string).trim())
                if (poCharEntries.length)
                  basePlanProduct.characteristic = poCharEntries.map(([k, v]) => ({ charSpecExternalId: k.replace('_po_', ''), value: [{ value: v }] }))
                products.push(basePlanProduct)
              }
              // Add-on products
              for (const entry of additionalPOs.filter(e => e.poExtId)) {
                const addOn: any = {
                  productOfferingExternalId: entry.poExtId,
                  externalId: `${entry.poExtId}-${msisdn}`,
                  name: entry.poExtId,
                  status: [{ status: 'ProductCreated' }],
                  billingAccountReference: { externalId: baExtId },
                  baRefForBillCycleAlignedRecurrence: { externalId: baExtId },
                }
                const addOnChars = Object.entries(entry.formVals).filter(([, v]) => (v as string)?.trim())
                if (addOnChars.length)
                  addOn.characteristic = addOnChars.map(([k, v]) => ({ charSpecExternalId: k, value: [{ value: v }] }))
                products.push(addOn)
              }
              if (products.length) ctb.product = products
              // Resources from PO
              const po = specs?.productOfferings?.find((p: any) => p.externalId === selectedPO)
              let poResourceSpecs2 = [...(po?.resourceSpecifications || [])]
              if (po?.childOfferings?.length) {
                const seen = new Set(poResourceSpecs2.map((r: any) => r.id))
                for (const childExtId of po.childOfferings) {
                  const childPO = specs?.productOfferings?.find((p: any) => p.externalId === childExtId)
                  for (const rs of (childPO?.resourceSpecifications || [])) {
                    if (!seen.has(rs.id)) { seen.add(rs.id); poResourceSpecs2.push(rs) }
                  }
                }
              }
              const resources: any[] = []
              for (const rs of poResourceSpecs2) {
                const resNumber = formValues.contract[`_res_${rs.externalId || rs.id}`]
                if (resNumber && resNumber.trim()) {
                  const rsLabel = (rs.externalId || rs.name || rs.id).replace(/^RS\s*-\s*/, '').replace(/[^a-zA-Z0-9_-]/g, '')
                  const resEntry: any = { externalId: `${rsLabel}-${resNumber}`, resourceNumber: resNumber }
                  if (rs.externalId) resEntry.resourceSpecificationExternalId = rs.externalId
                  else if (rs.id) resEntry.resourceSpecificationId = rs.id
                  resources.push(resEntry)
                }
              }
              if (resources.length) ctb.resource = resources
              if (selectedCommIdSpec) {
                ctb.communicationIdentifier = [{ communicationIdentifierSpecExternalId: selectedCommIdSpec }]
              }
              if (homeTimeZone.trim()) {
                ctb.homeTimeZone = [{ timeZone: homeTimeZone.trim() }]
              }
              if (includeContactMediumAssoc) {
                ctb.contactMediumAssociation = selectedCmSpecs
                  .filter(e => e.specExtId)
                  .map(e => ({
                    contactRole: 'Notification',
                    language: 'en',
                    contactMediumExternalId: e.externalId || `cm_${e.specExtId}_${msisdn}`,
                    enabled: true,
                  }))
              }
              // Contract chars — only user-entered values (non-resource, non-PO keys)
              const contractChars = Object.entries(formValues.contract)
                .filter(([k, v]) => !k.startsWith('_') && (v as string)?.trim())
              if (contractChars.length) ctb.characteristic = contractChars.map(([k, v]) => ({ charSpecExternalId: k, value: [{ value: v }] }))

              setPartyJson(JSON.stringify(pb, null, 2))
              setCustomerJson(JSON.stringify(cb, null, 2))
              setContractJson(JSON.stringify(ctb, null, 2))
              setStep(2)
            }}>Next → Review JSON</button>
          </div>
        </div>
      )}

      {step === 2 && (
        <div style={{ display: 'grid', gap: 12, maxWidth: 700 }}>
          <h3 style={{ margin: 0 }}>Step 3: Review & Edit JSON</h3>
          <p style={{ fontSize: 12, color: '#555', margin: 0 }}>Edit the request bodies before sending. Add Technical Product, sharingProvider, etc. as needed.</p>



          <fieldset>
            <legend><b>1. Create Party</b></legend>
            <textarea style={{ width: '100%', fontFamily: 'monospace', fontSize: 11 }} rows={8} value={partyJson} onChange={e => setPartyJson(e.target.value)} />
          </fieldset>

          <fieldset>
            <legend><b>2. Create Customer</b></legend>
            <textarea style={{ width: '100%', fontFamily: 'monospace', fontSize: 11 }} rows={10} value={customerJson} onChange={e => setCustomerJson(e.target.value)} />
          </fieldset>

          <fieldset>
            <legend><b>3. Create Contract</b></legend>
            <textarea style={{ width: '100%', fontFamily: 'monospace', fontSize: 11 }} rows={20} value={contractJson} onChange={e => setContractJson(e.target.value)} />
          </fieldset>

          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={() => setStep(1)}>← Back</button>
            <button disabled={loading} onClick={submit}>
              {loading ? 'Provisioning...' : 'Provision'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function POPublishPanel() {
  const [templates, setTemplates] = useState<any[]>([])
  const [templatesLoading, setTemplatesLoading] = useState(false)
  const [templatesError, setTemplatesError] = useState('')
  const [selectedTemplateExtId, setSelectedTemplateExtId] = useState('')
  const [template, setTemplate] = useState<any>(null)
  const [fetchLoading, setFetchLoading] = useState(false)

  // Form fields
  const [newExtId, setNewExtId] = useState('')
  const [newName, setNewName] = useState('')
  const [newDesc, setNewDesc] = useState('')
  const [validStart, setValidStart] = useState('')
  const [validEnd, setValidEnd] = useState('')
  // Per-price overrides: { [priceExternalId]: { name, operation, partyRoleInvolvementGroupRef, pricingRows } }
  const [priceOverrides, setPriceOverrides] = useState<Record<string, any>>({})
  // prodSpecCharValueUse overrides: [{ refExternalId, value, unitOfMeasure, isDefault }]
  const [charOverrides, setCharOverrides] = useState<Array<{ refExternalId: string; value: string; unitOfMeasure: string; isDefault: boolean }>>([])
  // productOfferingRelationship additions
  const [relationships, setRelationships] = useState<Array<{ externalId: string; type: string; targetType: string }>>([])

  const [showJson, setShowJson] = useState(false)
  const [result, setResult] = useState<any>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  // Update mode
  const [updateExtId, setUpdateExtId] = useState('')
  const [updateVersion, setUpdateVersion] = useState('')

  const fetchTemplates = async () => {
    setTemplatesLoading(true); setTemplatesError('')
    try {
      const r = await fetch(`${API}/catalog/productOffering/list?type=TEMPLATE`)
      if (!r.ok) throw new Error((await r.json()).detail || `HTTP ${r.status}`)
      const data = await r.json()
      setTemplates(Array.isArray(data) ? data : [])
    } catch (e: any) { setTemplatesError(e.message) }
    setTemplatesLoading(false)
  }

  const loadTemplate = async () => {
    if (!selectedTemplateExtId) return
    setFetchLoading(true); setError(''); setResult(null); setTemplate(null)
    try {
      const r = await fetch(`${API}/catalog/productOffering?externalId=${encodeURIComponent(selectedTemplateExtId)}`)
      if (!r.ok) throw new Error((await r.json()).detail || `HTTP ${r.status}`)
      const data = await r.json()
      const pot = Array.isArray(data) ? data[0] : data
      setTemplate(pot)
      // Init price overrides — deep-clone pricing rows so user can edit values inline
      const po: Record<string, any> = {}
      for (const p of (pot.productOfferingPrice || [])) {
        const rows = JSON.parse(JSON.stringify(p.pricingLogicAlgorithm?.productOfferingPriceRow || []))
        po[p.externalId] = { name: p.name || '', operation: 'UPDATE', partyRoleInvolvementGroupRef: p.partyRoleInvolvementGroupRef || '', pricingRows: rows }
      }
      setPriceOverrides(po)
      setCharOverrides([])
      setRelationships([])
      setNewExtId(''); setNewName(''); setNewDesc('')
      setValidStart(''); setValidEnd('')
      setUpdateExtId(''); setUpdateVersion('')
    } catch (e: any) { setError(e.message) }
    setFetchLoading(false)
  }

  // Strip read-only fields from pricing rows — schema uses additionalProperties:false
  const sanitizePricingRows = (rows: any[]): any[] => rows.map((row) => ({
    action: (row.action || []).map((act: any) => ({
      ...(act.externalId ? { actionRef: { externalId: act.externalId } } : {}),
      actionCharacteristicSpecificationUse: (act.actionCharacteristicSpecificationUse || []).map((acsu: any) => ({
        ...(acsu.externalId ? { actionCharacteristicSpecificationUseRef: { externalId: acsu.externalId } } : {}),
        actionCharacteristicSpecificationValueUse: (acsu.actionCharacteristicSpecificationValueUse || []).map((vu: any) => ({
          ...(vu.value !== undefined && { value: vu.value }),
          ...(vu.unitOfMeasure && { unitOfMeasure: vu.unitOfMeasure }),
          ...(vu.valueReference && { valueReference: vu.valueReference }),
        })),
      })),
    })),
  }))

  // Deep-strip 'id' from any object except productOfferingTemplateRef
  const stripIds = (obj: any, keepRoot = false): any => {
    if (Array.isArray(obj)) return obj.map(i => stripIds(i))
    if (obj && typeof obj === 'object') {
      const out: any = {}
      for (const [k, v] of Object.entries(obj)) {
        if (k === 'id' && !keepRoot) continue
        if (k === 'productOfferingTemplateRef') { out[k] = v; continue }
        out[k] = stripIds(v)
      }
      return out
    }
    return obj
  }

  // Build the create request body from form
  const buildBody = (): any => {
    if (!template) return {}
    const body: any = {
      externalId: newExtId,
      name: newName || newExtId,
      description: newDesc || undefined,
      productOfferingTemplateRef: { id: template.id, externalId: template.externalId },
      productOfferingPrice: (template.productOfferingPrice || []).map((p: any) => {
        const ov = priceOverrides[p.externalId] || {}
        const entry: any = {
          externalId: p.externalId,
          name: ov.name || p.name || null,
          operation: ov.operation || 'UPDATE',
          productOfferingPriceRelationship: (p.productOfferingPriceRelationship || []).map((rel: any) => ({
            ...(rel.externalId && { externalId: rel.externalId }),
            ...(rel.type && { type: rel.type }),
            ...(rel.productOfferingPriceRef && { productOfferingPriceRef: {
              ...(rel.productOfferingPriceRef.externalId && { externalId: rel.productOfferingPriceRef.externalId }),
            }}),
          })),
        }
        if (ov.partyRoleInvolvementGroupRef) entry.partyRoleInvolvementGroupRef = ov.partyRoleInvolvementGroupRef
        if (ov.operation === 'UPDATE') {
          const refExtId = p.externalId
          if (refExtId) entry.productOfferingPriceRef = { externalId: refExtId }
        }
        if (ov.pricingRows?.length)
          entry.pricingLogicAlgorithm = { productOfferingPriceRow: sanitizePricingRows(ov.pricingRows) }
        return entry
      }),
      productOfferingPolicyRef: (() => {
        const seen = new Set<string>()
        return (template.productOfferingPolicyRef || []).reduce((acc: any[], pol: any) => {
          const refs = (pol.productOfferingPriceRef || []).filter((ref: any) => ref.externalId)
          if (!refs.length) return acc
          const key = refs.map((r: any) => r.externalId).join(',')
          if (seen.has(key)) return acc
          seen.add(key)
          acc.push({ productOfferingPriceRef: refs.map((ref: any) => ({ externalId: ref.externalId })) })
          return acc
        }, [])
      })(),
      productOfferingRelationship: relationships.filter(r => r.externalId).map(r => ({
        externalId: r.externalId,
        type: r.type || null,
        targetType: r.targetType || null,
      })),
      prodSpecCharValueUse: charOverrides.filter(c => c.refExternalId && c.value).map(c => ({
        productSpecificationCharacteristicValueUseRef: { externalId: c.refExternalId },
        productSpecCharacteristicValue: [{ value: c.value, isDefault: c.isDefault, unitOfMeasure: c.unitOfMeasure || null }],
      })),
    }
    if (validStart || validEnd) {
      body.validFor = {}
      if (validStart) body.validFor.startDateTime = validStart
      if (validEnd) body.validFor.endDateTime = validEnd
    }
    return body
  }

  const publish = async () => {
    if (!newExtId.trim()) { setError('New External ID is required'); return }
    setLoading(true); setError(''); setResult(null)
    try {
      const r = await fetch(`${API}/catalog/productOffering`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(stripIds(buildBody()))
      })
      if (!r.ok) throw new Error((await r.json()).detail || `HTTP ${r.status}`)
      setResult(await r.json())
    } catch (e: any) { setError(e.message) }
    setLoading(false)
  }

  const update = async () => {
    if (!updateExtId || !updateVersion) { setError('External ID and Version required for update'); return }
    setLoading(true); setError(''); setResult(null)
    try {
      const body = stripIds(buildBody())
      const r = await fetch(`${API}/catalog/productOffering/externalId/${encodeURIComponent(updateExtId)}/version/${encodeURIComponent(updateVersion)}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
      })
      if (!r.ok) throw new Error((await r.json()).detail || `HTTP ${r.status}`)
      setResult(await r.json())
    } catch (e: any) { setError(e.message) }
    setLoading(false)
  }

  const setPriceOv = (extId: string, k: string, v: any) =>
    setPriceOverrides(prev => ({ ...prev, [extId]: { ...prev[extId], [k]: v } }))

  return (
    <div>
      <h2>📤 PO Publish</h2>

      <fieldset style={{ marginBottom: 12 }}>
        <legend><b>1. Load Template from RMCA Catalog</b></legend>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div style={{ flex: 1 }}>
            <button onClick={fetchTemplates} disabled={templatesLoading} style={{ marginBottom: 6 }}>
              {templatesLoading ? '⏳ Fetching...' : '🔄 Fetch Template List'}
            </button>
            {templatesError && <p style={{ color: 'red', fontSize: 12, margin: '4px 0 0' }}>{templatesError}</p>}
            {templates.length > 0 ? (
              <select style={{ width: '100%' }} value={selectedTemplateExtId} onChange={e => setSelectedTemplateExtId(e.target.value)}>
                <option value="">-- Select template --</option>
                {templates.map((t: any, i: number) => (
                  <option key={t.id || i} value={t.externalId}>{t.name || t.externalId} ({t.externalId})</option>
                ))}
              </select>
            ) : (
              <input style={{ width: '100%' }} placeholder="Or type template externalId" value={selectedTemplateExtId} onChange={e => setSelectedTemplateExtId(e.target.value)} />
            )}
          </div>
          <button onClick={loadTemplate} disabled={fetchLoading || !selectedTemplateExtId}>
            {fetchLoading ? 'Loading...' : 'Load Template'}
          </button>
        </div>
        {template && (
          <p style={{ fontSize: 12, color: '#0a7', margin: '6px 0 0' }}>
            ✓ Loaded: <b>{template.name}</b> (v{template.version}) — {(template.productOfferingPrice || []).length} prices, {(template.bucketSpecification || []).length} buckets
          </p>
        )}
      </fieldset>

      {template && (
        <>
          <fieldset style={{ marginBottom: 12 }}>
            <legend><b>2. New Product Offering Identity</b></legend>
            <div style={{ display: 'grid', gap: 8 }}>
              <label style={{ fontSize: 13 }}>External ID <span style={{ color: 'red' }}>*</span>
                <input style={{ width: '100%' }} value={newExtId} onChange={e => setNewExtId(e.target.value)} placeholder="e.g. PO_CHT_DATA_001" />
              </label>
              <label style={{ fontSize: 13 }}>Name
                <input style={{ width: '100%' }} value={newName} onChange={e => setNewName(e.target.value)} placeholder={newExtId || 'Display name'} />
              </label>
              <label style={{ fontSize: 13 }}>Description
                <input style={{ width: '100%' }} value={newDesc} onChange={e => setNewDesc(e.target.value)} placeholder="Optional description" />
              </label>
              <div style={{ display: 'flex', gap: 8 }}>
                <label style={{ fontSize: 13, flex: 1 }}>Valid From
                  <input style={{ width: '100%' }} type="datetime-local" value={validStart} onChange={e => setValidStart(e.target.value ? e.target.value + '.000+00:00' : '')} />
                </label>
                <label style={{ fontSize: 13, flex: 1 }}>Valid To
                  <input style={{ width: '100%' }} type="datetime-local" value={validEnd} onChange={e => setValidEnd(e.target.value ? e.target.value + '.000+00:00' : '')} />
                </label>
              </div>
            </div>
          </fieldset>

          <fieldset style={{ marginBottom: 12 }}>
            <legend><b>3. Prices</b> <span style={{ fontSize: 11, color: '#888', fontWeight: 'normal' }}>— inherited from template, override as needed</span></legend>
            {(template.productOfferingPrice || []).map((p: any) => (
              <div key={p.externalId} style={{ border: '1px solid #e5e7eb', borderRadius: 6, padding: '8px 10px', marginBottom: 8 }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, flex: 1 }}>{p.name || p.externalId}</span>
                  <span style={{ fontSize: 11, color: '#888' }}>{p.priceType}{p.priceSubType ? ' / ' + p.priceSubType : ''} · {p.paymentContext}</span>
                  <select style={{ fontSize: 12 }} value={priceOverrides[p.externalId]?.operation || 'UPDATE'}
                    onChange={e => setPriceOv(p.externalId, 'operation', e.target.value)}>
                    <option value="UPDATE">UPDATE (inherit)</option>
                    <option value="CREATE">CREATE (new price)</option>
                  </select>
                </div>
                <div style={{ display: 'grid', gap: 6, marginTop: 4 }}>
                  <label style={{ fontSize: 12 }}>Name override
                    <input style={{ width: '100%' }} value={priceOverrides[p.externalId]?.name || ''}
                      onChange={e => setPriceOv(p.externalId, 'name', e.target.value)}
                      placeholder={p.name || p.externalId} />
                  </label>
                  <label style={{ fontSize: 12 }}>Party Role Involvement Group Ref
                    <input style={{ width: '100%' }} value={priceOverrides[p.externalId]?.partyRoleInvolvementGroupRef || ''}
                      onChange={e => setPriceOv(p.externalId, 'partyRoleInvolvementGroupRef', e.target.value)}
                      placeholder={p.partyRoleInvolvementGroupRef || 'e.g. PRIG_001'} />
                  </label>
                  {(priceOverrides[p.externalId]?.operation === 'UPDATE') && (
                    <p style={{ fontSize: 11, color: '#888', margin: '2px 0 0' }}>
                      Price Ref: <b>{p.externalId}</b>{p.id ? ` · ${p.id}` : ''}
                    </p>
                  )}
                </div>
                {p.scheduleDefinitionRef && (
                  <p style={{ fontSize: 11, color: '#888', margin: '4px 0 0' }}>
                    Schedule: {p.scheduleDefinitionRef.scheduleName || p.scheduleDefinitionRef.externalId}
                  </p>
                )}
                {/* Pricing Logic Algorithm rows */}
                {(() => {
                  const rows: any[] = priceOverrides[p.externalId]?.pricingRows || []
                  if (!rows.length) return null
                  return (
                    <div style={{ marginTop: 8 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 4 }}>Pricing Logic Rows</div>
                      {rows.map((row: any, ri: number) => (
                        <div key={ri} style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 4, padding: '6px 8px', marginBottom: 6 }}>
                          <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 4 }}>
                            Row: <b>{row.name || row.externalId || `#${ri+1}`}</b>
                            {row.order !== undefined && <span style={{ marginLeft: 6 }}>order={row.order}</span>}
                          </div>
                          {(row.action || []).map((act: any, ai: number) => (
                            <div key={ai} style={{ marginBottom: 4, paddingLeft: 8, borderLeft: '2px solid #d1d5db' }}>
                              <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 2 }}>
                                Action: <b>{act.name || act.externalId || act.id || `#${ai+1}`}</b>
                                {act.type && <span style={{ marginLeft: 6, color: '#9ca3af' }}>[{act.type}]</span>}
                              </div>
                              {(act.actionCharacteristicSpecificationUse || []).map((acsu: any, ci: number) => (
                                <div key={ci} style={{ marginBottom: 4 }}>
                                  <div style={{ fontSize: 11, color: '#374151', marginBottom: 2 }}>
                                    <b>{acsu.name || acsu.externalId || acsu.id}</b>
                                    {acsu.measure && <span style={{ color: '#9ca3af', marginLeft: 4 }}>({acsu.measure})</span>}
                                    {acsu.actionCharacteristicSpecificationType && <span style={{ color: '#6b7280', marginLeft: 4 }}>[{acsu.actionCharacteristicSpecificationType}]</span>}
                                  </div>
                                  {(acsu.actionCharacteristicSpecificationValueUse || []).map((vu: any, vi: number) => {
                                    const specType = acsu.actionCharacteristicSpecificationType || ''
                                    const measure = acsu.measure || ''
                                    const unitOptions: string[] = (() => {
                                      if (specType === 'ChargingInterval' || measure === 'Data' || specType === 'ValueWithUoM') return ['kilobyte','kibibyte','megabyte','mebibyte','gigabyte','gibibyte','terabyte','tebibyte']
                                      if (specType === 'Consumption') return ['kilobyte','kibibyte','megabyte','mebibyte','gigabyte','gibibyte','terabyte','tebibyte','second','minute','hour']
                                      if (specType === 'PriceWithUoM' || measure === 'TWD' || measure === 'USD' || measure === 'EUR') return ['TWD','USD','EUR','GBP','JPY','SGD','AUD','CAD']
                                      if (vu.unitOfMeasure) return [vu.unitOfMeasure]
                                      return []
                                    })()
                                    const hasUnit = vu.unitOfMeasure !== undefined
                                    return (
                                    <div key={vi} style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                                      <input style={{ flex: 2, fontSize: 12 }} placeholder="value" value={vu.value ?? ''}
                                        onChange={e => {
                                          const updated = JSON.parse(JSON.stringify(rows))
                                          updated[ri].action[ai].actionCharacteristicSpecificationUse[ci].actionCharacteristicSpecificationValueUse[vi].value = e.target.value
                                          setPriceOv(p.externalId, 'pricingRows', updated)
                                        }} />
                                      {hasUnit && unitOptions.length > 0 ? (
                                        <select style={{ flex: 1, fontSize: 12 }} value={vu.unitOfMeasure ?? ''}
                                          onChange={e => {
                                            const updated = JSON.parse(JSON.stringify(rows))
                                            updated[ri].action[ai].actionCharacteristicSpecificationUse[ci].actionCharacteristicSpecificationValueUse[vi].unitOfMeasure = e.target.value
                                            setPriceOv(p.externalId, 'pricingRows', updated)
                                          }}>
                                          {unitOptions.map(u => <option key={u} value={u}>{u}</option>)}
                                        </select>
                                      ) : hasUnit ? (
                                        <input style={{ flex: 1, fontSize: 12 }} placeholder="unit" value={vu.unitOfMeasure ?? ''}
                                          onChange={e => {
                                            const updated = JSON.parse(JSON.stringify(rows))
                                            updated[ri].action[ai].actionCharacteristicSpecificationUse[ci].actionCharacteristicSpecificationValueUse[vi].unitOfMeasure = e.target.value
                                            setPriceOv(p.externalId, 'pricingRows', updated)
                                          }} />
                                      ) : null}
                                    </div>
                                    )
                                  })}
                                </div>
                              ))}
                            </div>
                          ))}
                        </div>
                      ))}
                    </div>
                  )
                })()}
              </div>
            ))}
          </fieldset>

          {(template.bucketSpecification || []).length > 0 && (
            <fieldset style={{ marginBottom: 12 }}>
              <legend><b>Buckets</b> <span style={{ fontSize: 11, color: '#888', fontWeight: 'normal' }}>— inherited from template (read-only)</span></legend>
              {(template.bucketSpecification || []).map((b: any) => (
                <div key={b.id} style={{ fontSize: 12, padding: '4px 0', borderBottom: '1px solid #f0f0f0' }}>
                  <span style={{ fontWeight: 500 }}>{b.externalId || b.id}</span>
                  <span style={{ color: '#888', marginLeft: 8 }}>{b.measure} · {b.type}</span>
                </div>
              ))}
            </fieldset>
          )}

          <fieldset style={{ marginBottom: 12 }}>
            <legend><b>4. Characteristic Value Overrides</b> <span style={{ fontSize: 11, color: '#888', fontWeight: 'normal' }}>— optional</span></legend>
            <p style={{ fontSize: 12, color: '#666', margin: '0 0 8px' }}>Override specific characteristic values from the template (e.g. data quota, validity period).</p>
            {charOverrides.map((c, i) => (
              <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 6, alignItems: 'center' }}>
                <input style={{ flex: 2 }} placeholder="Characteristic Spec ExternalId" value={c.refExternalId}
                  onChange={e => { const u = [...charOverrides]; u[i] = { ...u[i], refExternalId: e.target.value }; setCharOverrides(u) }} />
                <input style={{ flex: 2 }} placeholder="Value" value={c.value}
                  onChange={e => { const u = [...charOverrides]; u[i] = { ...u[i], value: e.target.value }; setCharOverrides(u) }} />
                <input style={{ flex: 1 }} placeholder="Unit (e.g. MB)" value={c.unitOfMeasure}
                  onChange={e => { const u = [...charOverrides]; u[i] = { ...u[i], unitOfMeasure: e.target.value }; setCharOverrides(u) }} />
                <label style={{ fontSize: 11, whiteSpace: 'nowrap' }}>
                  <input type="checkbox" checked={c.isDefault} onChange={e => { const u = [...charOverrides]; u[i] = { ...u[i], isDefault: e.target.checked }; setCharOverrides(u) }} /> default
                </label>
                <button style={{ fontSize: 11 }} onClick={() => setCharOverrides(charOverrides.filter((_, j) => j !== i))}>✕</button>
              </div>
            ))}
            <button style={{ fontSize: 11 }} onClick={() => setCharOverrides([...charOverrides, { refExternalId: '', value: '', unitOfMeasure: '', isDefault: true }])}>+ Add Override</button>
          </fieldset>

          <fieldset style={{ marginBottom: 12 }}>
            <legend><b>5. Product Offering Relationships</b> <span style={{ fontSize: 11, color: '#888', fontWeight: 'normal' }}>— optional</span></legend>
            <p style={{ fontSize: 12, color: '#666', margin: '0 0 8px' }}>Link to other product offerings (e.g. bundles, add-ons).</p>
            {relationships.map((r, i) => (
              <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 6, alignItems: 'center' }}>
                <input style={{ flex: 2 }} placeholder="Target PO ExternalId" value={r.externalId}
                  onChange={e => { const u = [...relationships]; u[i] = { ...u[i], externalId: e.target.value }; setRelationships(u) }} />
                <input style={{ flex: 1 }} placeholder="Type (e.g. bundled)" value={r.type}
                  onChange={e => { const u = [...relationships]; u[i] = { ...u[i], type: e.target.value }; setRelationships(u) }} />
                <input style={{ flex: 1 }} placeholder="Target Type" value={r.targetType}
                  onChange={e => { const u = [...relationships]; u[i] = { ...u[i], targetType: e.target.value }; setRelationships(u) }} />
                <button style={{ fontSize: 11 }} onClick={() => setRelationships(relationships.filter((_, j) => j !== i))}>✕</button>
              </div>
            ))}
            <button style={{ fontSize: 11 }} onClick={() => setRelationships([...relationships, { externalId: '', type: '', targetType: '' }])}>+ Add Relationship</button>
          </fieldset>

          <fieldset style={{ marginBottom: 12 }}>
            <legend><b>6. Update Existing PO</b> <span style={{ fontSize: 11, color: '#888', fontWeight: 'normal' }}>— fill only for PATCH</span></legend>
            <div style={{ display: 'flex', gap: 8 }}>
              <label style={{ fontSize: 13, flex: 2 }}>ExternalId to update
                <input style={{ width: '100%' }} value={updateExtId} onChange={e => setUpdateExtId(e.target.value)} placeholder="existing PO externalId" />
              </label>
              <label style={{ fontSize: 13, flex: 1 }}>Version
                <input style={{ width: '100%' }} value={updateVersion} onChange={e => setUpdateVersion(e.target.value)} placeholder="e.g. 1784615970701" />
              </label>
            </div>
          </fieldset>

          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
            <button disabled={loading} onClick={publish} style={{ background: '#1d4ed8', color: '#fff', padding: '6px 16px', border: 'none', borderRadius: 4, cursor: 'pointer' }}>
              {loading ? 'Publishing...' : '🚀 Publish (POST)'}
            </button>
            <button disabled={loading} onClick={update} style={{ padding: '6px 16px' }}>
              {loading ? 'Updating...' : '✏️ Update (PATCH)'}
            </button>
            <button style={{ fontSize: 11, padding: '4px 10px' }} onClick={() => setShowJson(s => !s)}>
              {showJson ? 'Hide' : 'Preview'} JSON
            </button>
          </div>

          {showJson && (
            <pre style={{ background: '#f5f5f5', padding: 10, borderRadius: 4, fontSize: 11, maxHeight: 400, overflow: 'auto', marginBottom: 12 }}>
              {JSON.stringify(buildBody(), null, 2)}
            </pre>
          )}

          {error && <p style={{ color: 'red', wordBreak: 'break-all' }}>❌ {error}</p>}
          {result && (
            <pre style={{ background: '#f0fff0', padding: 10, border: '1px solid #cfc', borderRadius: 4, maxHeight: 300, overflow: 'auto' }}>
              {JSON.stringify(result, null, 2)}
            </pre>
          )}
        </>
      )}
    </div>
  )
}

function CatalogPanel() {
  const [uploading, setUploading] = useState(false)
  const [uploadResult, setUploadResult] = useState<any>(null)
  const [specs, setSpecs] = useState<any>(null)
  const [error, setError] = useState('')
  const [fetching, setFetching] = useState(false)
  const [fetchResult, setFetchResult] = useState<any>(null)

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

  const fetchFromBSSF = async () => {
    setFetching(true); setError(''); setFetchResult(null)
    try {
      const r = await fetch(`${API}/specs/fetch`, { method: 'POST' })
      if (!r.ok) throw new Error((await r.json()).detail)
      const data = await r.json()
      setFetchResult(data)
      loadSpecs()
    } catch (err: any) { setError(err.message) }
    setFetching(false)
  }

  return (
    <div>
      <h2>📦 Catalog - RMCA Specs</h2>

      <fieldset style={{ marginBottom: 16 }}>
        <legend><b>Fetch from Live BSSF</b></legend>
        <p style={{ fontSize: 13, color: '#666', margin: '0 0 8px' }}>Fetch all specifications directly from the connected BSSF system via Specification Enquiry API</p>
        <button onClick={fetchFromBSSF} disabled={fetching}>{fetching ? '⏳ Fetching...' : '🔄 Fetch from BSSF'}</button>
        {fetchResult && (
          <div style={{ marginTop: 8, fontSize: 13 }}>
            <p style={{ color: 'green', margin: '0 0 4px' }}>✓ Fetched from live BSSF:</p>
            <ul style={{ margin: 0, paddingLeft: 20 }}>
              {fetchResult.counts
                ? Object.entries(fetchResult.counts).map(([k, v]) => <li key={k}>{k}: {v as number}</li>)
                : <>
                    <li>Party specs: {fetchResult.partySpecs}</li>
                    <li>Customer specs: {fetchResult.customerSpecs}</li>
                    <li>Contract specs: {fetchResult.contractSpecs}</li>
                    <li>Billing Account specs: {fetchResult.billingAccountSpecs}</li>
                    <li>Product specs: {fetchResult.productSpecs}</li>
                    <li>Product Offerings: {fetchResult.productOfferings}</li>
                    <li>Contact Medium specs: {fetchResult.contactMediumSpecs}</li>
                  </>}
            </ul>
            {fetchResult.errors && Object.keys(fetchResult.errors).length > 0 && (
              <details style={{ marginTop: 6 }}>
                <summary style={{ fontSize: 12, color: '#c60', cursor: 'pointer' }}>⚠ {Object.keys(fetchResult.errors).length} endpoints failed (click to expand)</summary>
                <pre style={{ fontSize: 11, background: '#fff8e1', padding: 8, marginTop: 4 }}>{JSON.stringify(fetchResult.errors, null, 2)}</pre>
              </details>
            )}
          </div>
        )}
      </fieldset>

      <fieldset style={{ marginBottom: 16 }}>
        <legend><b>Upload BusinessConfig (Offline)</b></legend>
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
              {(specs.communicationIdentifierSpecifications || []).map((s: any) => (
                <tr key={s.id} style={{ borderBottom: '1px solid #ddd' }}>
                  <td style={{ padding: 6 }}>Comm ID</td><td style={{ padding: 6 }}>{s.name}</td><td style={{ padding: 6 }}>{s.externalId}</td>
                </tr>
              ))}
              {(specs.contactMediumSpecifications || []).map((s: any) => (
                <tr key={s.id} style={{ borderBottom: '1px solid #ddd' }}>
                  <td style={{ padding: 6 }}>Contact Medium</td><td style={{ padding: 6 }}>{s.name}</td><td style={{ padding: 6 }}>{s.externalId}</td>
                </tr>
              ))}
              {(specs.agreementSpecifications || []).map((s: any) => (
                <tr key={s.id} style={{ borderBottom: '1px solid #ddd' }}>
                  <td style={{ padding: 6 }}>Agreement</td><td style={{ padding: 6 }}>{s.name}</td><td style={{ padding: 6 }}>{s.externalId}</td>
                </tr>
              ))}
              {(specs.partyRoleSpecifications || []).map((s: any) => (
                <tr key={s.id} style={{ borderBottom: '1px solid #ddd' }}>
                  <td style={{ padding: 6 }}>Party Role</td><td style={{ padding: 6 }}>{s.name}</td><td style={{ padding: 6 }}>{s.externalId}</td>
                </tr>
              ))}
              {(specs.bucketTags || []).map((s: any) => (
                <tr key={s.id} style={{ borderBottom: '1px solid #ddd' }}>
                  <td style={{ padding: 6 }}>Bucket</td><td style={{ padding: 6 }}>{s.name}</td><td style={{ padding: 6 }}>{s.externalId}</td>
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

type FieldDef = { key: string; label: string; type?: 'text'|'select'|'number'; options?: string[]; placeholder?: string; required?: boolean }

function StructuredForm({ formDef, values, onChange }: { formDef: FieldDef[]; values: any; onChange: (v: any) => void }) {
  const set = (k: string, v: any) => onChange({ ...values, [k]: v })
  return (
    <div style={{ display: 'grid', gap: 6 }}>
      {formDef.map(f => (
        <label key={f.key} style={{ fontSize: 13 }}>
          {f.label}{f.required && <span style={{ color: 'red' }}> *</span>}
          {f.type === 'select'
            ? <select style={{ width: '100%' }} value={values[f.key] || ''} onChange={e => set(f.key, e.target.value)}>
                <option value="">-- Select --</option>
                {(f.options||[]).map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            : <input type={f.type === 'number' ? 'number' : 'text'} style={{ width: '100%' }}
                placeholder={f.placeholder || f.label} value={values[f.key] ?? ''}
                onChange={e => set(f.key, f.type === 'number' ? Number(e.target.value) : e.target.value)} />}
        </label>
      ))}
    </div>
  )
}

function buildBody(op: string, v: any): any {
  const amt = { number: Number(v.amount||0), decimalPlaces: Number(v.decimalPlaces||0) }
  const commId = v.communicationId ? { communicationId: v.communicationId, communicationIdType: v.communicationIdType||'E.164' } : {}
  switch (op) {
    case 'balance_topup': return {
      ...(v.customerExternalId && { customerExternalId: v.customerExternalId }),
      ...(v.contractExternalId && { contractExternalId: v.contractExternalId }),
      ...commId, amount: amt,
      ...(v.unitOfMeasure && { unitOfMeasure: v.unitOfMeasure }),
    }
    case 'balance_adj': return {
      ...(v.customerExternalId && { relatedParty: { externalId: v.customerExternalId, '@referredType': 'Customer' } }),
      ...(v.contractExternalId && { contractExternalId: v.contractExternalId }),
      ...commId,
      billingAccountAdjustments: [{ billingAccountRef: { externalId: v.billingAccountExternalId },
        billingAccountBuckets: [{ billingAccountBucketSpecExternalId: v.bucketSpecExternalId,
          action: v.action||'Relative', amount: amt, ...(v.unitOfMeasure&&{unitOfMeasure:v.unitOfMeasure}), ...(v.reason&&{reason:v.reason}) }] }],
    }
    case 'balance_billing_adj': return {
      ...(v.customerExternalId && { relatedParty: { externalId: v.customerExternalId, '@referredType': 'Customer' } }),
      ...(v.contractExternalId && { contractExternalId: v.contractExternalId }),
      billingAccountAdjustments: [{ billingAccountRef: { externalId: v.billingAccountExternalId },
        billingAccountBuckets: [{ billingAccountBucketSpecExternalId: v.bucketSpecExternalId,
          action: v.action||'Relative', amount: amt, ...(v.unitOfMeasure&&{unitOfMeasure:v.unitOfMeasure}), ...(v.reason&&{reason:v.reason}) }] }],
    }
    case 'balance_product_adj': return {
      ...(v.customerExternalId && { relatedParty: { externalId: v.customerExternalId, '@referredType': 'Customer' } }),
      ...(v.contractExternalId && { contractExternalId: v.contractExternalId }),
      ...commId,
      productAdjustments: [{ productRef: { externalId: v.productExternalId },
        productBuckets: [{ bucketSpecExternalId: v.bucketSpecExternalId,
          action: v.action||'Relative', amount: amt, ...(v.unitOfMeasure&&{unitOfMeasure:v.unitOfMeasure}), ...(v.reason&&{reason:v.reason}) }] }],
    }
    case 'balance_settlement_adj': return {
      ...(v.customerExternalId && { relatedParty: { externalId: v.customerExternalId, '@referredType': 'Customer' } }),
      ...(v.contractExternalId && { contractExternalId: v.contractExternalId }),
      settlementAccountAdjustments: [{ settlementAccountRef: { externalId: v.settlementAccountExternalId },
        settlementAccountBuckets: [{ bucketSpecExternalId: v.bucketSpecExternalId,
          action: v.action||'Relative', amount: amt, ...(v.unitOfMeasure&&{unitOfMeasure:v.unitOfMeasure}), ...(v.reason&&{reason:v.reason}) }] }],
    }
    case 'balance_reset_fraud': return {
      ...(v.customerExternalId && { customerExternalId: v.customerExternalId }), ...commId,
    }
    case 'swap_resource': return {
      ...(v.customerExternalId && { customerExternalId: v.customerExternalId }),
      ...(v.contractExternalId && { contractExternalId: v.contractExternalId }),
      resourceType: v.resourceType||'E.164',
      fromResourceNumber: v.fromResourceNumber, toResourceNumber: v.toResourceNumber,
    }
    case 'replace_product': return {
      customerExternalId: v.customerExternalId, contractExternalId: v.contractExternalId,
      currentProductExternalId: v.currentProductExternalId, newProductOfferingExternalId: v.newProductOfferingExternalId,
    }
    case 'change_sub_status': return {
      ...(v.customerExternalId && { customerExternalId: v.customerExternalId }),
      ...(v.contractExternalId && { contractExternalId: v.contractExternalId }),
      ...commId, contract: { status: [{ status: v.status }] },
    }
    case 'terminate_party': return { _params: { partyExternalId: v.partyExternalId }, status: [{ status: 'Terminated' }] }
    case 'terminate_customer': return { _params: { customerExternalId: v.customerExternalId }, status: [{ status: 'CustomerTerminated' }] }
    case 'terminate_contract': return { _params: { customerExternalId: v.customerExternalId, contractExternalId: v.contractExternalId }, status: [{ status: 'Terminated' }], product: [{ status: [{ status: 'ProductTerminated' }] }] }
    case 'activate_contract': return { _params: { customerExternalId: v.customerExternalId, contractExternalId: v.contractExternalId }, status: [{ status: 'Active' }], product: [{ status: [{ status: 'ProductActive' }] }] }
    case 'modify_consumer_product': return {
      providerCustomerExternalId: v.providerCustomerExternalId, providerContractExternalId: v.providerContractExternalId,
      providerProductExternalId: v.providerProductExternalId, consumerCustomerExternalId: v.consumerCustomerExternalId,
      consumerContractExternalId: v.consumerContractExternalId, action: v.action||'ADD',
    }
    default: return null
  }
}

const FORM_DEFS: Record<string, FieldDef[]> = {
  balance_topup: [
    { key: 'customerExternalId', label: 'Customer External ID' },
    { key: 'contractExternalId', label: 'Contract External ID' },
    { key: 'communicationId', label: 'MSISDN' },
    { key: 'communicationIdType', label: 'Communication ID Type', type: 'select', options: ['E.164','E.212'] },
    { key: 'amount', label: 'Amount', type: 'number', required: true },
    { key: 'decimalPlaces', label: 'Decimal Places', type: 'number' },
    { key: 'unitOfMeasure', label: 'Unit of Measure', placeholder: 'e.g. MB, MIN, EUR' },
  ],
  balance_adj: [
    { key: 'customerExternalId', label: 'Customer External ID' },
    { key: 'contractExternalId', label: 'Contract External ID' },
    { key: 'communicationId', label: 'MSISDN' },
    { key: 'communicationIdType', label: 'Communication ID Type', type: 'select', options: ['E.164','E.212'] },
    { key: 'billingAccountExternalId', label: 'Billing Account External ID', required: true },
    { key: 'bucketSpecExternalId', label: 'Bucket Spec External ID', required: true },
    { key: 'action', label: 'Action', type: 'select', options: ['Relative','Set'], required: true },
    { key: 'amount', label: 'Amount', type: 'number', required: true },
    { key: 'decimalPlaces', label: 'Decimal Places', type: 'number' },
    { key: 'unitOfMeasure', label: 'Unit of Measure' },
    { key: 'reason', label: 'Reason' },
  ],
  balance_billing_adj: [
    { key: 'customerExternalId', label: 'Customer External ID' },
    { key: 'contractExternalId', label: 'Contract External ID' },
    { key: 'billingAccountExternalId', label: 'Billing Account External ID', required: true },
    { key: 'bucketSpecExternalId', label: 'Billing Account Bucket Spec External ID', required: true },
    { key: 'action', label: 'Action', type: 'select', options: ['Relative','Set'], required: true },
    { key: 'amount', label: 'Amount', type: 'number', required: true },
    { key: 'decimalPlaces', label: 'Decimal Places', type: 'number' },
    { key: 'unitOfMeasure', label: 'Unit of Measure' },
    { key: 'reason', label: 'Reason' },
  ],
  balance_product_adj: [
    { key: 'customerExternalId', label: 'Customer External ID' },
    { key: 'contractExternalId', label: 'Contract External ID' },
    { key: 'communicationId', label: 'MSISDN' },
    { key: 'communicationIdType', label: 'Communication ID Type', type: 'select', options: ['E.164','E.212'] },
    { key: 'productExternalId', label: 'Product External ID', required: true },
    { key: 'bucketSpecExternalId', label: 'Bucket Spec External ID', required: true },
    { key: 'action', label: 'Action', type: 'select', options: ['Relative','Set'], required: true },
    { key: 'amount', label: 'Amount', type: 'number', required: true },
    { key: 'decimalPlaces', label: 'Decimal Places', type: 'number' },
    { key: 'unitOfMeasure', label: 'Unit of Measure' },
    { key: 'reason', label: 'Reason' },
  ],
  balance_settlement_adj: [
    { key: 'customerExternalId', label: 'Customer External ID' },
    { key: 'contractExternalId', label: 'Contract External ID' },
    { key: 'settlementAccountExternalId', label: 'Settlement Account External ID', required: true },
    { key: 'bucketSpecExternalId', label: 'Bucket Spec External ID', required: true },
    { key: 'action', label: 'Action', type: 'select', options: ['Relative','Set'], required: true },
    { key: 'amount', label: 'Amount', type: 'number', required: true },
    { key: 'decimalPlaces', label: 'Decimal Places', type: 'number' },
    { key: 'unitOfMeasure', label: 'Unit of Measure' },
    { key: 'reason', label: 'Reason' },
  ],
  balance_reset_fraud: [
    { key: 'customerExternalId', label: 'Customer External ID' },
    { key: 'communicationId', label: 'MSISDN' },
    { key: 'communicationIdType', label: 'Communication ID Type', type: 'select', options: ['E.164','E.212'] },
  ],
  swap_resource: [
    { key: 'customerExternalId', label: 'Customer External ID' },
    { key: 'contractExternalId', label: 'Contract External ID' },
    { key: 'resourceType', label: 'Resource Type', type: 'select', options: ['E.164','E.212'] },
    { key: 'fromResourceNumber', label: 'From Resource Number (current)', required: true },
    { key: 'toResourceNumber', label: 'To Resource Number (new)', required: true },
  ],
  replace_product: [
    { key: 'customerExternalId', label: 'Customer External ID', required: true },
    { key: 'contractExternalId', label: 'Contract External ID', required: true },
    { key: 'currentProductExternalId', label: 'Current Product External ID', required: true },
    { key: 'newProductOfferingExternalId', label: 'New Product Offering External ID', required: true },
  ],
  change_sub_status: [
    { key: 'customerExternalId', label: 'Customer External ID' },
    { key: 'contractExternalId', label: 'Contract External ID' },
    { key: 'communicationId', label: 'MSISDN' },
    { key: 'communicationIdType', label: 'Communication ID Type', type: 'select', options: ['E.164','E.212'] },
    { key: 'status', label: 'New Contract Status', type: 'select', options: ['Active','Halt','Terminated','Created'], required: true },
  ],
  terminate_party: [{ key: 'partyExternalId', label: 'Party External ID', required: true }],
  terminate_customer: [{ key: 'customerExternalId', label: 'Customer External ID', required: true }],
  terminate_contract: [
    { key: 'customerExternalId', label: 'Customer External ID', required: true },
    { key: 'contractExternalId', label: 'Contract External ID', required: true },
  ],
  activate_contract: [
    { key: 'customerExternalId', label: 'Customer External ID', required: true },
    { key: 'contractExternalId', label: 'Contract External ID', required: true },
  ],
  modify_consumer_product: [
    { key: 'providerCustomerExternalId', label: 'Provider Customer External ID', required: true },
    { key: 'providerContractExternalId', label: 'Provider Contract External ID', required: true },
    { key: 'providerProductExternalId', label: 'Provider Product External ID', required: true },
    { key: 'consumerCustomerExternalId', label: 'Consumer Customer External ID', required: true },
    { key: 'consumerContractExternalId', label: 'Consumer Contract External ID', required: true },
    { key: 'action', label: 'Action', type: 'select', options: ['ADD','REMOVE'], required: true },
  ],
}

function OperationsPanel() {
  const [op, setOp] = useState('read_party_ext')
  const [params, setParams] = useState<any>({})
  const [formVals, setFormVals] = useState<any>({})
  const [body, setBody] = useState('')
  const [result, setResult] = useState<any>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [showJson, setShowJson] = useState(false)

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
    // Terminate Cascade
    terminate_party: { label: 'Terminate Party Cascade', method: 'POST', path: '/execute/terminate_party_cascade', fields: [] },
    terminate_customer: { label: 'Terminate Customer Cascade', method: 'POST', path: '/execute/terminate_customer_cascade', fields: [] },
    terminate_contract: { label: 'Terminate Contract Cascade', method: 'POST', path: '/execute/terminate_contract_cascade', fields: [] },
    // Activate
    activate_contract: { label: 'Activate Contract', method: 'POST', path: '/execute/activate_contract', fields: ['customerExternalId', 'contractExternalId'] },
    // IMSI lookups
    read_customer_imsi: { label: 'Get Customer - IMSI', method: 'GET', path: '/execute/get_customer_by_imsi', fields: ['imsi'] },
    read_contract_imsi: { label: 'Get Contract - IMSI', method: 'GET', path: '/execute/get_contract_by_imsi', fields: ['imsi'] },
    read_contract_msisdn_product: { label: 'Get Contract - MSISDN + Product', method: 'GET', path: '/execute/get_contract_by_msisdn_product', fields: ['msisdn', 'productExternalId'] },
    // Balance extended
    balance_imsi: { label: 'Balance Enquiry - IMSI', method: 'GET', path: '/execute/balance_enquiry_imsi', fields: ['imsi'] },
    balance_contract: { label: 'Balance Enquiry - Contract', method: 'GET', path: '/execute/balance_enquiry_contract', fields: ['customerExternalId', 'contractExternalId'] },
    balance_bucket: { label: 'Balance Enquiry - MSISDN + Bucket', method: 'GET', path: '/execute/balance_enquiry_msisdn_bucket', fields: ['msisdn', 'bucketSpecExternalId'] },
    // User
    delete_user_ext: { label: 'Delete User - ExternalId', method: 'GET', path: '/execute/delete_user_by_external_id', fields: ['userExternalId'] },
    get_user_id: { label: 'Get User - Id', method: 'GET', path: '/execute/get_user_by_id', fields: ['userId'] },
    // CPM
    cpm_translate_msisdn: { label: 'CPM ID Translation - MSISDN', method: 'GET', path: '/execute/cpm_id_translation_msisdn', fields: ['msisdn'] },
    cpm_translate_imsi: { label: 'CPM ID Translation - IMSI', method: 'GET', path: '/execute/cpm_id_translation_imsi', fields: ['imsi'] },
    cpm_comm_identity: { label: 'CPM Communication Identity', method: 'GET', path: '/execute/cpm_communication_identity', fields: ['msisdn'] },
    // Mass Devices
    mass_create_job: { label: 'Mass Device - Create Job', method: 'POST', path: '/execute/mass_device_create_job', fields: [] },
    mass_start_job: { label: 'Mass Device - Start Job', method: 'POST', path: '/execute/mass_device_start_job', fields: ['jobId'] },
    mass_stop_job: { label: 'Mass Device - Stop Job', method: 'POST', path: '/execute/mass_device_stop_job', fields: ['jobId'] },
    mass_restart_job: { label: 'Mass Device - Restart Job', method: 'POST', path: '/execute/mass_device_restart_job', fields: ['jobId'] },
    mass_delete_job: { label: 'Mass Device - Delete Job', method: 'DELETE', path: '/execute/mass_device_delete_job', fields: ['jobId'] },
    mass_job_status: { label: 'Mass Device - Job Status', method: 'GET', path: '/execute/mass_device_job_status', fields: ['jobId'] },
    mass_job_result: { label: 'Mass Device - Job Result', method: 'GET', path: '/execute/mass_device_job_result', fields: ['jobId'] },
    mass_list_jobs: { label: 'Mass Device - List Jobs', method: 'GET', path: '/execute/mass_device_list_jobs', fields: [] },
    // RMCA
    rmca_list_po: { label: 'RMCA - List Product Offerings', method: 'GET', path: '/execute/rmca_list_product_offerings', fields: [] },
    rmca_read_po: { label: 'RMCA - Read Product Offering', method: 'GET', path: '/execute/rmca_read_product_offering', fields: ['specExternalId'] },
    rmca_create_po: { label: 'RMCA - Create Product Offering', method: 'POST', path: '/execute/rmca_create_product_offering', fields: [] },
    rmca_read_party_spec: { label: 'RMCA - Read Party Spec', method: 'GET', path: '/execute/rmca_entity_read_party_spec', fields: ['specExternalId'] },
    rmca_read_contract_spec: { label: 'RMCA - Read Contract Spec', method: 'GET', path: '/execute/rmca_entity_read_contract_spec', fields: ['specExternalId'] },
    rmca_read_cms: { label: 'RMCA - Read Contact Medium Spec', method: 'GET', path: '/execute/rmca_entity_read_contact_medium_spec', fields: ['specExternalId'] },
    // Spec Enquiry
    spec_contract: { label: 'Read Contract Specification', method: 'GET', path: '/spec/contract', fields: ['externalId'], queryParams: ['externalId'] },
    spec_product: { label: 'Read Product Specification', method: 'GET', path: '/spec/product', fields: ['externalId'], queryParams: ['externalId'] },
    spec_offering: { label: 'Read Product Offering', method: 'GET', path: '/spec/product_offering', fields: ['externalId'], queryParams: ['externalId'] },
    spec_bucket: { label: 'Read Bucket Specification', method: 'GET', path: '/spec/bucket', fields: ['externalId'], queryParams: ['externalId'] },
    spec_billing: { label: 'Read Billing Account Spec', method: 'GET', path: '/spec/billing_account', fields: ['externalId'], queryParams: ['externalId'] },
    // Account
    get_settlement_account: { label: 'Get Settlement Account', method: 'GET', path: '/account/settlement', fields: ['customerExternalId'], queryParams: ['customerExternalId'] },
    create_settlement_account: { label: 'Create Settlement Account', method: 'POST', path: '/account/settlement', fields: [] },
    // Agreement
    get_agreement: { label: 'Get Agreement', method: 'GET', path: '/agreement', fields: ['partyExternalId', 'agreementExternalId'], queryParams: ['partyExternalId', 'agreementExternalId'] },
    create_agreement: { label: 'Create Agreement', method: 'POST', path: '/agreement/partyExternalId/{partyExternalId}', fields: ['partyExternalId'] },
    update_agreement: { label: 'Update Agreement', method: 'PATCH', path: '/agreement/partyExternalId/{partyExternalId}/{agreementExternalId}', fields: ['partyExternalId', 'agreementExternalId'] },
    delete_agreement: { label: 'Delete Agreement', method: 'DELETE', path: '/agreement/partyExternalId/{partyExternalId}/{agreementExternalId}', fields: ['partyExternalId', 'agreementExternalId'] },
    // Balance (new)
    balance_topup_details: { label: 'Balance TopUp Details', method: 'GET', path: '/balance/topupDetails', fields: ['communicationId'], queryParams: ['communicationId'] },
    balance_topup: { label: 'Balance TopUp', method: 'POST', path: '/balance/topup', fields: [] },
    balance_reset_fraud: { label: 'Reset Balance Fraud Counter', method: 'POST', path: '/balance/resetFraudCounter', fields: [] },
    balance_billing_adj: { label: 'Billing Account Bucket Adjustment', method: 'POST', path: '/balance/billingAccountAdjustment', fields: [] },
    balance_product_adj: { label: 'Product Bucket Adjustment', method: 'POST', path: '/balance/productAdjustment', fields: [] },
    balance_settlement_adj: { label: 'Settlement Account Bucket Adjustment', method: 'POST', path: '/balance/settlementAccountAdjustment', fields: [] },
    // Communication Identity
    get_comm_identity: { label: 'Get Communication Identity', method: 'GET', path: '/communicationIdentity', fields: ['communicationId'], queryParams: ['communicationId'] },
    // Customer Bill
    get_customer_bill: { label: 'Get Customer Bill', method: 'GET', path: '/bill/customerBill', fields: ['customerExternalId'], queryParams: ['customerExternalId'] },
    get_bill_applied_rate: { label: 'Get Applied Billing Rate', method: 'GET', path: '/bill/appliedBillingRate', fields: ['customerExternalId'], queryParams: ['customerExternalId'] },
    get_bill_contract_view: { label: 'Get Bill Contract View', method: 'GET', path: '/bill/contractView', fields: ['customerExternalId'], queryParams: ['customerExternalId'] },
    get_bill_on_demand: { label: 'Get Bill On Demand', method: 'GET', path: '/bill/onDemand', fields: ['customerExternalId'], queryParams: ['customerExternalId'] },
    get_bill_summary: { label: 'Get Bill Summary', method: 'GET', path: '/bill/summary', fields: ['customerExternalId'], queryParams: ['customerExternalId'] },
    get_unbilled_charge: { label: 'Get Unbilled Charge', method: 'GET', path: '/bill/unbilledCharge', fields: ['customerExternalId'], queryParams: ['customerExternalId'] },
    // Financial
    get_financial_account: { label: 'Get Financial Customer Account', method: 'GET', path: '/financial/customerAccount', fields: ['customerExternalId'], queryParams: ['customerExternalId'] },
    get_financial_header: { label: 'Get Financial Header', method: 'GET', path: '/financial/header', fields: ['customerExternalId'], queryParams: ['customerExternalId'] },
    get_financial_tx: { label: 'Get Financial Transaction', method: 'GET', path: '/financial/transaction', fields: ['customerExternalId'], queryParams: ['customerExternalId'] },
    get_payment_instruction: { label: 'Get Payment Instruction', method: 'GET', path: '/financial/paymentInstruction', fields: ['customerExternalId'], queryParams: ['customerExternalId'] },
    create_financial_task: { label: 'Create Financial Task', method: 'POST', path: '/financial/task', fields: [] },
    // Organization Party
    get_org_party: { label: 'Get Organization Party', method: 'GET', path: '/organizationParty', fields: ['externalId'], queryParams: ['externalId'] },
    create_org_party: { label: 'Create Organization Party', method: 'POST', path: '/organizationParty', fields: [] },
    update_org_party: { label: 'Update Organization Party', method: 'PATCH', path: '/organizationParty/externalId/{organizationPartyExternalId}', fields: ['organizationPartyExternalId'] },
    // Partner Settlement
    get_partner_contract: { label: 'Get Partner Contract', method: 'GET', path: '/partnerSettlement/contract', fields: ['partyRoleExternalId'], queryParams: ['partyRoleExternalId'] },
    create_partner_contract: { label: 'Create Partner Contract', method: 'POST', path: '/partnerSettlement/partyRoleExternalId/{partyRoleExternalId}/contract', fields: ['partyRoleExternalId'] },
    get_involvement_group: { label: 'Get Party Role Involvement Group', method: 'GET', path: '/partnerSettlement/involvementGroup', fields: ['partyRoleInvolvementGroupRef'], queryParams: ['partyRoleInvolvementGroupRef'] },
    create_involvement_group: { label: 'Create Party Role Involvement Group', method: 'POST', path: '/partnerSettlement/involvementGroup', fields: [] },
    // Partner Settling
    get_settlement_note: { label: 'Get Partner Settlement Note', method: 'GET', path: '/partnerSettling/note', fields: ['partyRoleExternalId'], queryParams: ['partyRoleExternalId'] },
    get_unsettled_charge: { label: 'Get Unsettled Charge', method: 'GET', path: '/partnerSettling/unsettledCharge', fields: ['partyRoleExternalId'], queryParams: ['partyRoleExternalId'] },
    create_settlement_note_demand: { label: 'Create Settlement Note On Demand', method: 'POST', path: '/partnerSettling/noteOnDemand', fields: [] },
    // Party Communication
    send_message: { label: 'Send Communication Message', method: 'POST', path: '/communication/send', fields: [] },
    // Party Role
    get_party_role: { label: 'Get Party Role', method: 'GET', path: '/partyRole', fields: ['externalId'], queryParams: ['externalId'] },
    create_party_role: { label: 'Create Party Role', method: 'POST', path: '/partyRole', fields: [] },
    update_party_role: { label: 'Update Party Role', method: 'PATCH', path: '/partyRole/externalId/{partyRoleExternalId}', fields: ['partyRoleExternalId'] },
    // Product Catalog
    catalog_get_po: { label: 'Catalog - Get Product Offering', method: 'GET', path: '/catalog/productOffering', fields: ['externalId'], queryParams: ['externalId'] },
    catalog_create_po: { label: 'Catalog - Create Product Offering', method: 'POST', path: '/catalog/productOffering', fields: [] },
    catalog_update_po: { label: 'Catalog - Update Product Offering', method: 'PATCH', path: '/catalog/productOffering/externalId/{externalId}/version/{version}', fields: ['externalId', 'version'] },
    // Purchase Charge
    purchase_rate_deduct: { label: 'Purchase - Rate and Deduct', method: 'POST', path: '/purchase/rateAndDeduct', fields: [] },
    purchase_rate_reserve: { label: 'Purchase - Rate and Reserve', method: 'POST', path: '/purchase/rateAndReserve', fields: [] },
    purchase_cancel_res: { label: 'Purchase - Cancel Reservation', method: 'POST', path: '/purchase/cancelReservation', fields: [] },
    purchase_basket_deduct: { label: 'Purchase - Basket Rate and Deduct', method: 'POST', path: '/purchase/basketRateAndDeduct', fields: [] },
    purchase_basket_reserve: { label: 'Purchase - Basket Rate and Reserve', method: 'POST', path: '/purchase/basketRateAndReserve', fields: [] },
    purchase_basket_execute: { label: 'Purchase - Basket Rate and Execute', method: 'POST', path: '/purchase/basketRateAndExecute', fields: [] },
    purchase_basket_advice: { label: 'Purchase - Basket Rate and Advice', method: 'POST', path: '/purchase/basketRateAndAdvice', fields: [] },
    purchase_cancel_basket: { label: 'Purchase - Cancel Basket Reservation', method: 'POST', path: '/purchase/cancelBasketReservation', fields: [] },
    // Session
    create_policy_session: { label: 'Create Policy Session', method: 'POST', path: '/session/createPolicySession', fields: [] },
    move_charging_session: { label: 'Move Charging Session', method: 'POST', path: '/session/moveChargingSession', fields: [] },
    // Spec Enquiry (new)
    spec_individual: { label: 'Spec - Individual', method: 'GET', path: '/spec/individual', fields: ['externalId'], queryParams: ['externalId'] },
    spec_customer: { label: 'Spec - Customer', method: 'GET', path: '/spec/customer', fields: ['externalId'], queryParams: ['externalId'] },
    spec_contact_medium: { label: 'Spec - Contact Medium', method: 'GET', path: '/spec/contactMedium', fields: ['externalId'], queryParams: ['externalId'] },
    spec_billing_cycle: { label: 'Spec - Billing Cycle', method: 'GET', path: '/spec/billingCycle', fields: ['externalId'], queryParams: ['externalId'] },
    spec_party_role: { label: 'Spec - Party Role', method: 'GET', path: '/spec/partyRole', fields: ['externalId'], queryParams: ['externalId'] },
    spec_schedule: { label: 'Spec - Schedule Definition', method: 'GET', path: '/spec/scheduleDefinition', fields: ['externalId'], queryParams: ['externalId'] },
    spec_sharing_provider: { label: 'Spec - Sharing Provider', method: 'GET', path: '/spec/sharingProvider', fields: ['externalId'], queryParams: ['externalId'] },
    spec_tag: { label: 'Spec - Tag', method: 'GET', path: '/spec/tag', fields: ['externalId'], queryParams: ['externalId'] },
    spec_agreement_spec: { label: 'Spec - Agreement', method: 'GET', path: '/spec/agreement', fields: ['externalId'], queryParams: ['externalId'] },
    spec_generic_setting: { label: 'Spec - Generic Business Setting', method: 'GET', path: '/spec/genericBusinessSetting', fields: ['externalId'], queryParams: ['externalId'] },
    // Subscription (new)
    get_consumer_product: { label: 'Get Consumer Product', method: 'GET', path: '/subscription/consumerProduct', fields: ['communicationId'], queryParams: ['communicationId'] },
    get_inherited_contracts: { label: 'Get Inherited Contract List', method: 'GET', path: '/subscription/inheritedContractList', fields: ['customerExternalId'], queryParams: ['customerExternalId'] },
    change_sub_status: { label: 'Change Subscription Status', method: 'POST', path: '/subscription/changeStatus', fields: [] },
    modify_consumer_product: { label: 'Modify Consumer Product', method: 'POST', path: '/subscription/consumerProduct/modify', fields: [] },
    modify_provider_product: { label: 'Modify Provider Product', method: 'PATCH', path: '/subscription/providerProduct/modify', fields: [] },
    // Test Management
    create_entity_adj: { label: 'Test - Create Entity Adjustment', method: 'POST', path: '/test/entityAdjustment/externalId/{customerExternalId}', fields: ['customerExternalId'] },
    get_entity_adj: { label: 'Test - Get Entity Adjustment', method: 'GET', path: '/test/entityAdjustment', fields: ['customerExternalId'], queryParams: ['customerExternalId'] },
    // User (new)
    update_user: { label: 'Update User', method: 'PATCH', path: '/user/externalId/{userExternalId}', fields: ['userExternalId'] },
  }

  const exec = async () => {
    setLoading(true); setError(''); setResult(null)
    const cfg = operations[op]
    let url = `${API}${cfg.path}`
    for (const f of cfg.fields) url = url.replace(`{${f}}`, params[f] || '')
    if (cfg.queryParams?.length) {
      const qp = cfg.queryParams.filter(f => params[f]).map(f => `${f}=${encodeURIComponent(params[f])}`).join('&')
      if (qp) url += `?${qp}`
    }
    try {
      const opts: any = { method: cfg.method, headers: { 'Content-Type': 'application/json' } }
      const structured = buildBody(op, formVals)
      if (url.includes('/execute/')) {
        opts.method = 'POST'
        const execBody = structured || (body ? JSON.parse(body) : {})
        execBody._params = { ...params }
        opts.body = JSON.stringify(execBody)
      } else if (cfg.method === 'POST' || cfg.method === 'PUT' || cfg.method === 'PATCH') {
        if (structured) {
          const { _params, ...rest } = structured as any
          if (_params) { url = `${API}/execute/${op}`; opts.method = 'POST' }
          opts.body = JSON.stringify(_params ? { ...rest, _params } : rest)
        } else {
          opts.body = body || '{}'
        }
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
  const formDef = FORM_DEFS[op]
  const builtBody = formDef ? buildBody(op, formVals) : null

  return (
    <div>
      <h2>Individual Operations</h2>
      <div style={{ display: 'flex', gap: 10, marginBottom: 15, flexWrap: 'wrap' }}>
        <select value={op} onChange={e => { setOp(e.target.value); setParams({}); setFormVals({}); setBody(''); setResult(null); setError(''); setShowJson(false) }}>
          {Object.entries(operations).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <span style={{ fontSize: 12, color: '#888', alignSelf: 'center' }}>{cfg.method} {cfg.path}</span>
      </div>
      <div style={{ display: 'grid', gap: 8, maxWidth: 420, marginBottom: 10 }}>
        {cfg.fields.map(f => (
          <input key={f} placeholder={f} value={params[f] || ''} onChange={e => setParams({ ...params, [f]: e.target.value })} />
        ))}
        {formDef ? (
          <>
            <StructuredForm formDef={formDef} values={formVals} onChange={setFormVals} />
            <button type="button" style={{ fontSize: 11, padding: '2px 8px', background: '#eee', width: 'fit-content' }}
              onClick={() => setShowJson(s => !s)}>{showJson ? 'Hide' : 'Preview'} JSON</button>
            {showJson && builtBody && (
              <pre style={{ fontSize: 11, background: '#f5f5f5', padding: 8, borderRadius: 4, maxHeight: 200, overflow: 'auto' }}>
                {JSON.stringify(builtBody, null, 2)}
              </pre>
            )}
          </>
        ) : (cfg.method === 'POST' || cfg.method === 'PUT' || cfg.method === 'PATCH') && (
          <textarea placeholder="JSON body" rows={6} style={{ fontFamily: 'monospace', fontSize: 12 }}
            value={body} onChange={e => setBody(e.target.value)} />
        )}
      </div>
      <button onClick={exec} disabled={loading}>{loading ? 'Executing...' : 'Execute'}</button>
      {error && <p style={{ color: 'red', wordBreak: 'break-all' }}>{error}</p>}
      {result && <pre style={{ background: '#f5f5f5', padding: 10, maxHeight: 400, overflow: 'auto' }}>{JSON.stringify(result, null, 2)}</pre>}
    </div>
  )
}

// --- Status badge helper ---
function StatusBadge({ status }: { status: string }) {
  const s = (status || '').toLowerCase()
  const color = s.includes('active') ? '#1a7f37' : s.includes('halt') || s.includes('suspend') ? '#b45309' : s.includes('terminat') ? '#b91c1c' : s.includes('creat') ? '#1d4ed8' : '#555'
  const bg = s.includes('active') ? '#dcfce7' : s.includes('halt') || s.includes('suspend') ? '#fef3c7' : s.includes('terminat') ? '#fee2e2' : s.includes('creat') ? '#dbeafe' : '#f3f4f6'
  return <span style={{ fontSize: 11, fontWeight: 600, color, background: bg, border: `1px solid ${color}40`, borderRadius: 10, padding: '1px 8px', whiteSpace: 'nowrap' }}>{status || '—'}</span>
}

// --- Info row helper ---
function InfoRow({ label, value }: { label: string; value: any }) {
  if (!value && value !== 0) return null
  return (
    <div style={{ display: 'flex', gap: 8, fontSize: 12, padding: '3px 0', borderBottom: '1px solid #f0f0f0' }}>
      <span style={{ color: '#888', minWidth: 160, flexShrink: 0 }}>{label}</span>
      <span style={{ color: '#222', wordBreak: 'break-all' }}>{String(value)}</span>
    </div>
  )
}

// --- Collapsible card ---
function Card({ title, icon, color, defaultOpen, rawData, children }: { title: string; icon: string; color: string; defaultOpen?: boolean; rawData?: any; children: React.ReactNode }) {
  const [open, setOpen] = React.useState(defaultOpen ?? true)
  const [showRaw, setShowRaw] = React.useState(false)
  return (
    <div style={{ border: `1px solid ${color}40`, borderRadius: 8, marginBottom: 10, overflow: 'hidden' }}>
      <div style={{ background: `${color}15`, padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}
        onClick={() => setOpen(o => !o)}>
        <span style={{ fontSize: 16 }}>{icon}</span>
        <span style={{ fontWeight: 600, fontSize: 13, flex: 1, color: '#222' }}>{title}</span>
        {rawData !== undefined && open && (
          <button style={{ fontSize: 10, padding: '1px 6px', background: showRaw ? '#555' : '#eee', color: showRaw ? '#fff' : '#555', border: '1px solid #ccc', borderRadius: 3, cursor: 'pointer' }}
            onClick={e => { e.stopPropagation(); setShowRaw(r => !r) }}>{showRaw ? 'Visual' : 'Raw JSON'}</button>
        )}
        <span style={{ fontSize: 11, color: '#999' }}>{open ? '▲' : '▼'}</span>
      </div>
      {open && (
        <div style={{ padding: '10px 14px' }}>
          {showRaw
            ? <pre style={{ fontSize: 11, margin: 0, maxHeight: 400, overflow: 'auto', whiteSpace: 'pre-wrap', background: '#f8f8f8', padding: 8, borderRadius: 4 }}>{JSON.stringify(rawData, null, 2)}</pre>
            : children}
        </div>
      )}
    </div>
  )
}

function CRMView() {
  const [searchType, setSearchType] = useState<'msisdn' | 'externalId' | 'id'>('msisdn')
  const [searchValue, setSearchValue] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [party, setParty] = useState<any>(null)
  const [customer, setCustomer] = useState<any>(null)
  const [contract, setContract] = useState<any>(null)
  const [balance, setBalance] = useState<any>(null)
  const [actionMsg, setActionMsg] = useState('')
  const [actionErr, setActionErr] = useState('')
  const [actionLoading, setActionLoading] = useState(false)
  const [newPO, setNewPO] = useState('')
  const [specs, setSpecs] = useState<any>(null)

  React.useEffect(() => {
    fetch(`${API}/specs`).then(r => r.ok ? r.json() : null).then(setSpecs).catch(() => {})
  }, [])

  const search = async () => {
    setLoading(true); setError(''); setParty(null); setCustomer(null); setContract(null); setBalance(null)
    try {
      // Search by MSISDN -> gets contract which has all relationships
      if (searchType === 'msisdn') {
        // Party by derived externalId
        const pr = await fetch(`${API}/party?externalId=${encodeURIComponent(`extID-party-${searchValue}`)}`)
        if (pr.ok) setParty(await pr.json())

        const custr = await fetch(`${API}/customer?msisdn=${encodeURIComponent(searchValue)}`)
        if (custr.ok) setCustomer(await custr.json())

        const cr = await fetch(`${API}/contract?msisdn=${encodeURIComponent(searchValue)}`)
        if (cr.ok) setContract(await cr.json())

        const balr = await fetch(`${API}/balance?msisdn=${encodeURIComponent(searchValue)}`)
        if (balr.ok) setBalance(await balr.json())
      } else if (searchType === 'externalId') {
        // Try party first
        const pr = await fetch(`${API}/party?externalId=${encodeURIComponent(searchValue)}`)
        if (pr.ok) setParty(await pr.json())

        // Derive customer externalId pattern
        const msisdnFromExt = searchValue.replace('extID-party-', '').replace('extID-customer-', '').replace('extID-contract-', '')
        const custExtId = searchValue.startsWith('extID-customer-') ? searchValue : `extID-customer-${msisdnFromExt}`
        const custr = await fetch(`${API}/customer?externalId=${encodeURIComponent(custExtId)}`)
        if (custr.ok) setCustomer(await custr.json())

        // Try contract by MSISDN (communication id) if we can derive it
        if (msisdnFromExt) {
          const cr = await fetch(`${API}/contract?msisdn=${encodeURIComponent(msisdnFromExt)}`)
          if (cr.ok) setContract(await cr.json())

          const balr = await fetch(`${API}/balance?msisdn=${encodeURIComponent(msisdnFromExt)}`)
          if (balr.ok) setBalance(await balr.json())
        }
      } else {
        // By internal ID - try customer
        const custr = await fetch(`${API}/customer?id=${encodeURIComponent(searchValue)}`)
        if (custr.ok) setCustomer(await custr.json())
      }
    } catch (e: any) { setError(e.message) }
    setLoading(false)
  }

  const p0 = Array.isArray(party) ? party[0] : party
  const cu = Array.isArray(customer) ? customer[0] : customer
  const c = Array.isArray(contract) ? contract[0] : contract
  const custExtId = cu?.externalId || ''
  const contractExtId = c?.externalId || ''
  const baExtId = cu?.account?.[0]?.externalId || ''
  const contractStatus = c?.status?.slice(-1)[0]?.status || ''
  const products = c?.product || []
  const poList2 = specs?.productOfferings || []

  const patchContract = async (body: any) => {
    setActionLoading(true); setActionMsg(''); setActionErr('')
    try {
      const r = await fetch(`${API}/execute/update_contract`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...body, _params: { customerExternalId: custExtId, contractExternalId: contractExtId } })
      })
      if (!r.ok) throw new Error((await r.json()).detail || `HTTP ${r.status}`)
      setActionMsg('✓ Success'); search()
    } catch (e: any) { setActionErr(e.message) }
    setActionLoading(false)
  }
  const changeContractStatus = (status: string) => patchContract({ status: [{ status }] })
  const changeProductStatus = (productExtId: string, status: string) => patchContract({ product: [{ externalId: productExtId, status: [{ status }] }] })
  const purchaseProduct = (poExtId: string) => {
    if (!poExtId) return
    const ts = Date.now().toString(36)
    patchContract({ product: [{ productOfferingExternalId: poExtId, externalId: `${poExtId}-${ts}`, name: poExtId, status: [{ status: 'ProductCreated' }], billingAccountReference: { externalId: baExtId }, baRefForBillCycleAlignedRecurrence: { externalId: baExtId } }] })
  }

  // Flatten balance response into bucket list regardless of nesting shape
  const flattenBuckets = (data: any): { billing: any[], products: Record<string, any[]> } => {
    const billing: any[] = []
    const products: Record<string, any[]> = {}
    if (!data) return { billing, products }
    const arr = Array.isArray(data) ? data : [data]
    for (const item of arr) {
      for (const ba of (item.billingAccount || [])) {
        for (const b of (ba.bucket || [])) billing.push({ ...b, _baExternalId: ba.externalId })
      }
      for (const prod of (item.product || [])) {
        const key = prod.externalId || prod.id
        if (key) products[key] = (prod.bucket || []).map((b: any) => ({ ...b, _productExternalId: key }))
      }
    }
    return { billing, products }
  }

  const fmtDate = (dt: string) => {
    if (!dt || dt.startsWith('0001') || dt.startsWith('9999')) return null
    return dt.replace('T', ' ').slice(0, 16) + ' UTC'
  }

  const BucketCard = ({ bucket }: { bucket: any }) => {
    const rawAmount = Number(bucket?.amount?.number ?? 0)
    const decPlaces = Number(bucket?.amount?.decimalPlaces ?? 0)
    const rawReserved = Number(bucket?.reservedAmount?.number ?? 0)
    const unit = (bucket?.unitOfMeasure || '').toLowerCase()
    // For bytes, show human-readable
    const fmtBytes = (n: number) => {
      if (n >= 1073741824) return `${(n / 1073741824).toFixed(2)} GB`
      if (n >= 1048576) return `${(n / 1048576).toFixed(2)} MB`
      if (n >= 1024) return `${(n / 1024).toFixed(2)} KB`
      return `${n} B`
    }
    const fmtAmount = (n: number) => {
      if (unit === 'byte' || unit === 'bytes') return fmtBytes(n)
      const scaled = decPlaces > 0 ? n / Math.pow(10, decPlaces) : n
      return `${scaled.toFixed(decPlaces > 0 ? 2 : 0)}${unit ? ' ' + bucket.unitOfMeasure : ''}`
    }
    // Pick active valueContainer (current time within validFor)
    const activeContainer = (bucket?.valueContainer || []).find((vc: any) => {
      const s = vc.validFor?.startDateTime
      const e = vc.validFor?.endDateTime
      const now = Date.now()
      const after = s && !s.startsWith('0001') ? new Date(s).getTime() <= now : true
      const before = e && !e.startsWith('9999') ? new Date(e).getTime() >= now : true
      return after && before && Number(vc.amount?.number) > 0
    })
    const displayAmount = activeContainer ? fmtAmount(Number(activeContainer.amount.number)) : fmtAmount(rawAmount)
    const name = bucket?.bucketSpecExternalId || bucket?.bucketName || bucket?.name || 'Bucket'
    const start = fmtDate(bucket?.validFor?.startDateTime)
    const end = fmtDate(bucket?.validFor?.endDateTime)
    return (
      <div style={{ border: '1px solid #fde68a', borderRadius: 6, padding: '8px 10px', marginBottom: 8, background: '#fffbeb' }}>
        <div style={{ fontWeight: 600, fontSize: 12, marginBottom: 4 }}>{name}</div>
        <InfoRow label="Amount" value={displayAmount} />
        {rawReserved > 0 && <InfoRow label="Reserved" value={fmtAmount(rawReserved)} />}
        {bucket?._baExternalId && <InfoRow label="Billing Account" value={bucket._baExternalId} />}
        {start && <InfoRow label="Valid From" value={start} />}
        {end && <InfoRow label="Valid To" value={end} />}
      </div>
    )
  }

  return (
    <div>
      <h2>👤 360° Subscriber View</h2>
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <select value={searchType} onChange={e => setSearchType(e.target.value as any)}>
          <option value="msisdn">MSISDN</option>
          <option value="externalId">External ID</option>
          <option value="id">Internal ID</option>
        </select>
        <input style={{ flex: 1, minWidth: 200 }} placeholder={`Enter ${searchType}...`} value={searchValue}
          onChange={e => setSearchValue(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && search()} />
        <button onClick={search} disabled={loading || !searchValue}>{loading ? 'Searching...' : 'Search'}</button>
      </div>
      {error && <p style={{ color: 'red' }}>{error}</p>}

      {(c || cu || p0) && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>

          {/* LEFT COLUMN */}
          <div>
            {/* Party */}
            {p0 && (
              <Card title={`Party — ${p0.givenName || ''} ${p0.familyName || ''}`} icon="👤" color="#f97316" rawData={p0}>
                <InfoRow label="External ID" value={p0.externalId} />
                <InfoRow label="Internal ID" value={p0.id} />
                <InfoRow label="Given Name" value={p0.givenName} />
                <InfoRow label="Family Name" value={p0.familyName} />
                <InfoRow label="Spec" value={p0.individualSpecification?.externalId} />
                <InfoRow label="Status" value={p0.status?.slice(-1)[0]?.status} />
                <InfoRow label="Valid From" value={fmtDate(p0.validFor?.startDateTime)} />
                <InfoRow label="Valid To" value={fmtDate(p0.validFor?.endDateTime)} />
                {(p0.contactMedium || []).map((cm: any, i: number) => {
                  const commId = cm.characteristic?.find((ch: any) => (ch.charSpecExternalId || '').toLowerCase().includes('communication'))?.value?.[0]?.value
                  const chType = cm.characteristic?.find((ch: any) => (ch.charSpecExternalId || '').toLowerCase().includes('channel'))?.value?.[0]?.value
                  return <InfoRow key={i} label={`Contact Medium ${chType || cm.contactMediumSpecExternalId || i+1}`} value={commId || cm.externalId} />
                })}
              </Card>
            )}

            {/* Customer */}
            {cu && (
              <Card title={`Customer — ${cu.externalId || ''}`} icon="🏢" color="#3b82f6" rawData={cu}>
                <InfoRow label="External ID" value={cu.externalId} />
                <InfoRow label="Internal ID" value={cu.id} />
                <InfoRow label="Spec" value={cu.customerSpecification?.externalId} />
                <InfoRow label="Status" value={cu.status?.slice(-1)[0]?.status} />
                {(cu.characteristic || []).map((ch: any, i: number) => (
                  <InfoRow key={i} label={ch.charSpecExternalId || ch.name || `Char ${i+1}`} value={ch.value?.[0]?.value ?? ch.value} />
                ))}
                {(cu.account || []).map((a: any, i: number) => (
                  <div key={i} style={{ marginTop: 8, padding: '6px 8px', background: '#eff6ff', borderRadius: 6, fontSize: 12 }}>
                    <div style={{ fontWeight: 600, marginBottom: 4 }}>💳 Billing Account {a.externalId}</div>
                    <InfoRow label="Internal ID" value={a.id} />
                    <InfoRow label="Spec" value={a.billingAccountSpecExternalId} />
                    <InfoRow label="Status" value={a.status?.slice(-1)[0]?.status} />
                    <InfoRow label="Valid From" value={fmtDate(a.validFor?.startDateTime)} />
                    <InfoRow label="Valid To" value={fmtDate(a.validFor?.endDateTime)} />
                    {a.customerBillCycleSpecification?.map((bcs: any, j: number) => (
                      <InfoRow key={j} label="Bill Cycle Spec" value={bcs.billCycleSpecExternalId} />
                    ))}
                  </div>
                ))}
              </Card>
            )}
          </div>

          {/* RIGHT COLUMN */}
          <div>
            {/* Contract */}
            {c && (
              <Card title={`Contract — ${c.externalId || ''}`} icon="📄" color="#8b5cf6" rawData={c}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <StatusBadge status={contractStatus} />
                  <span style={{ fontSize: 11, color: '#888' }}>{c.externalId}</span>
                </div>
                <InfoRow label="Internal ID" value={c.id} />
                <InfoRow label="Spec" value={c.contractSpecification?.externalId} />
                <InfoRow label="Valid From" value={fmtDate(c.validFor?.startDateTime)} />
                <InfoRow label="Valid To" value={fmtDate(c.validFor?.endDateTime)} />
                <InfoRow label="Home Time Zone" value={c.homeTimeZone?.[0]?.timeZone} />
                {(c.characteristic || []).map((ch: any, i: number) => (
                  <InfoRow key={i} label={ch.charSpecExternalId || `Char ${i+1}`} value={ch.value?.[0]?.value ?? ch.value} />
                ))}
                {(c.resource || []).map((r: any, i: number) => (
                  <InfoRow key={i} label={`Resource (${r.resourceSpecificationExternalId || 'spec'})`} value={r.resourceNumber || r.externalId} />
                ))}

                {/* Products */}
                {products.length > 0 && (
                  <div style={{ marginTop: 10 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: '#555', marginBottom: 6 }}>📦 Products ({products.length})</div>
                    {products.map((p: any, i: number) => {
                      const pStatus = p.status?.slice(-1)[0]?.status || ''
                      return (
                        <div key={i} style={{ border: '1px solid #e9d5ff', borderRadius: 6, padding: '8px 10px', marginBottom: 8, background: '#faf5ff' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                            <span style={{ fontSize: 12, fontWeight: 600, flex: 1 }}>{p.productOfferingExternalId || p.name || p.externalId}</span>
                            <StatusBadge status={pStatus} />
                          </div>
                          <InfoRow label="External ID" value={p.externalId} />
                          <InfoRow label="Internal ID" value={p.id} />
                          <InfoRow label="Valid From" value={fmtDate(p.validFor?.startDateTime)} />
                          <InfoRow label="Valid To" value={fmtDate(p.validFor?.endDateTime)} />
                          <InfoRow label="Billing Account" value={p.billingAccountReference?.externalId} />
                          {(p.resource || []).map((r: any, j: number) => (
                            <InfoRow key={j} label={`Resource (${r.resourceSpecificationExternalId || 'spec'})`} value={r.resourceNumber || r.externalId} />
                          ))}
                          {(p.characteristic || []).map((ch: any, j: number) => (
                            <InfoRow key={j} label={ch.charSpecExternalId || `Char ${j+1}`} value={ch.value?.[0]?.value ?? ch.value} />
                          ))}
                          {/* Product buckets from balance */}
                          {(() => {
                            const { products: prodBucketMap } = flattenBuckets(balance)
                            const buckets = prodBucketMap[p.externalId] || prodBucketMap[p.id] || []
                            return buckets.length > 0 ? (
                              <div style={{ marginTop: 6 }}>
                                <div style={{ fontSize: 11, color: '#7c3aed', fontWeight: 600, marginBottom: 4 }}>Buckets</div>
                                {buckets.map((b: any, k: number) => <BucketCard key={k} bucket={b} />)}
                              </div>
                            ) : null
                          })()}
                          <div style={{ display: 'flex', gap: 4, marginTop: 6, flexWrap: 'wrap' }}>
                            <button disabled={actionLoading} onClick={() => changeProductStatus(p.externalId, 'ProductActive')} style={{ fontSize: 10, padding: '2px 6px' }}>Activate</button>
                            <button disabled={actionLoading} onClick={() => changeProductStatus(p.externalId, 'ProductHalt')} style={{ fontSize: 10, padding: '2px 6px' }}>Halt</button>
                            <button disabled={actionLoading} onClick={() => changeProductStatus(p.externalId, 'ProductTerminated')} style={{ fontSize: 10, padding: '2px 6px', color: 'red' }}>Terminate</button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </Card>
            )}

            {/* Balance — billing account buckets */}
            {balance && (() => {
              const { billing } = flattenBuckets(balance)
              if (!billing.length) return null
              return (
                <Card title={`Balance — Billing (${billing.length} bucket${billing.length !== 1 ? 's' : ''})`} icon="💰" color="#f59e0b" rawData={balance}>
                  {billing.map((b: any, i: number) => <BucketCard key={i} bucket={b} />)}
                </Card>
              )
            })()}
          </div>
        </div>
      )}

      {/* Actions */}
      {c && (
        <div style={{ marginTop: 16, borderTop: '2px solid #eee', paddingTop: 14 }}>
          <h3 style={{ margin: '0 0 10px', fontSize: 14 }}>⚡ Actions</h3>
          {actionMsg && <p style={{ color: 'green', fontSize: 12 }}>{actionMsg}</p>}
          {actionErr && <p style={{ color: 'red', fontSize: 12, wordBreak: 'break-all' }}>{actionErr}</p>}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
            <span style={{ fontSize: 12, color: '#555' }}>Contract:</span>
            <button disabled={actionLoading || contractStatus === 'Active'} onClick={() => changeContractStatus('Active')}>Activate</button>
            <button disabled={actionLoading || contractStatus === 'Halt'} onClick={() => changeContractStatus('Halt')}>Halt</button>
            <button disabled={actionLoading || contractStatus === 'Terminated'} onClick={() => changeContractStatus('Terminated')} style={{ color: 'red' }}>Terminate</button>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ fontSize: 12, color: '#555' }}>Purchase:</span>
            <select style={{ flex: 1, maxWidth: 320 }} value={newPO} onChange={e => setNewPO(e.target.value)}>
              <option value="">-- Select Product Offering --</option>
              {poList2.map((p: any) => <option key={p.id} value={p.externalId}>{p.name} ({p.externalId})</option>)}
            </select>
            <button disabled={actionLoading || !newPO} onClick={() => purchaseProduct(newPO)}>Purchase</button>
          </div>
        </div>
      )}
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

// TLS config for a given FQDN row
function FqdnRow({ label, fqdn, onFqdn, tls, onTls, certNames }: {
  label: string; fqdn: string; onFqdn: (v: string) => void
  tls?: { ssl_verify: boolean; ca_cert_path: string; client_cert_path: string; client_key_path: string }
  onTls?: (k: string, v: any) => void
  certNames?: { ca: string; cert: string; key: string }
}) {
  const [open, setOpen] = React.useState(false)
  return (
    <div style={{ borderBottom: '1px solid #eee', paddingBottom: 8 }}>
      <label style={{ fontSize: 13 }}>{label}
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <input style={{ flex: 1 }} value={fqdn} onChange={e => onFqdn(e.target.value)} placeholder={`https://...`} />
          {tls && onTls && (
            <button type="button" style={{ fontSize: 11, padding: '3px 8px', background: open ? '#dbeafe' : '#eee', borderRadius: 4, whiteSpace: 'nowrap' }}
              onClick={() => setOpen(o => !o)}>🔒 TLS</button>
          )}
        </div>
      </label>
      {tls && onTls && open && (
        <div style={{ marginTop: 6, paddingLeft: 8, display: 'grid', gap: 6, borderLeft: '3px solid #93c5fd' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
            <input type="checkbox" checked={tls.ssl_verify} onChange={e => onTls('ssl_verify', e.target.checked)} />Verify SSL
          </label>
          <label style={{ fontSize: 12 }}>CA Cert<CertUpload value={tls.ca_cert_path} onChange={v => onTls('ca_cert_path', v)} name={certNames?.ca || 'ca'} /></label>
          <label style={{ fontSize: 12 }}>Client Cert<CertUpload value={tls.client_cert_path} onChange={v => onTls('client_cert_path', v)} name={certNames?.cert || 'client_cert'} /></label>
          <label style={{ fontSize: 12 }}>Client Key<CertUpload value={tls.client_key_path} onChange={v => onTls('client_key_path', v)} name={certNames?.key || 'client_key'} /></label>
        </div>
      )}
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
  const updateCatalogTls = (k: string, v: any) => setConfig({ ...config, rmca_catalog_tls: { ...config.rmca_catalog_tls, [k]: v } })
  const updateNet = (k: string, v: any) => setConfig({ ...config, network: { ...config.network, [k]: v } })

  // FQDNs that share the main TLS config
  const mainTlsFqdns = ['ROOT_BAE', 'ROOT_RMCA', 'ROOT_CPM', 'ROOT_CPM_INTERNAL', 'ROOT_CPM_BATCH']
  const otherEnvKeys = Object.keys(config.environment || {}).filter(k => !mainTlsFqdns.includes(k) && k !== 'ROOT_RMCA_CATALOG' && k !== 'ROOT_SEC')

  return (
    <div>
      <h2>Settings</h2>
      <div style={{ display: 'grid', gap: 16, maxWidth: 600 }}>

        <fieldset>
          <legend><b>Token FQDN (Keycloak)</b></legend>
          <div style={{ display: 'grid', gap: 8 }}>
            <FqdnRow label="Token FQDN (ROOT_SEC)" fqdn={config.environment?.ROOT_SEC || ''} onFqdn={v => updateEnv('ROOT_SEC', v)} />
            <label style={{ fontSize: 13 }}>Token Endpoint Path
              <input style={{ width: '100%' }} value={config.auth?.token_endpoint || ''} onChange={e => updateAuth('token_endpoint', e.target.value)}
                placeholder="https://<ROOT_SEC>/auth/realms/master/protocol/openid-connect/token" />
            </label>
            <label style={{ fontSize: 13 }}>Username<input style={{ width: '100%' }} value={config.auth?.username || ''} onChange={e => updateAuth('username', e.target.value)} /></label>
            <label style={{ fontSize: 13 }}>Password<input style={{ width: '100%' }} type="password" value={config.auth?.password || ''} onChange={e => updateAuth('password', e.target.value)} /></label>
            <label style={{ fontSize: 13 }}>Client ID<input style={{ width: '100%' }} value={config.auth?.client_id || ''} onChange={e => updateAuth('client_id', e.target.value)} /></label>
          </div>
        </fieldset>

        <fieldset>
          <legend><b>BAE / RMCA FQDNs</b></legend>
          <p style={{ fontSize: 12, color: '#666', margin: '0 0 8px' }}>Click 🔒 TLS to configure certificates per endpoint.</p>
          <div style={{ display: 'grid', gap: 10 }}>
            {mainTlsFqdns.map(k => (
              <FqdnRow key={k} label={k}
                fqdn={config.environment?.[k] || ''} onFqdn={v => updateEnv(k, v)}
                tls={config.tls} onTls={updateTls}
                certNames={{ ca: 'ca', cert: 'client_cert', key: 'client_key' }} />
            ))}
            <FqdnRow label="ROOT_RMCA_CATALOG"
              fqdn={config.environment?.ROOT_RMCA_CATALOG || ''} onFqdn={v => updateEnv('ROOT_RMCA_CATALOG', v)}
              tls={config.rmca_catalog_tls} onTls={updateCatalogTls}
              certNames={{ ca: 'rmca_ca', cert: 'rmca_cert', key: 'rmca_key' }} />
            {otherEnvKeys.map(k => (
              <FqdnRow key={k} label={k} fqdn={config.environment?.[k] || ''} onFqdn={v => updateEnv(k, v)} />
            ))}
          </div>
        </fieldset>

        <fieldset>
          <legend><b>Network</b></legend>
          <div style={{ display: 'grid', gap: 8 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}><input type="checkbox" checked={config.network?.socks5_enabled || false} onChange={e => updateNet('socks5_enabled', e.target.checked)} />Enable SOCKS5 Proxy</label>
            <label style={{ fontSize: 13 }}>SOCKS5 Proxy<input style={{ width: '100%' }} placeholder="socks5://127.0.0.1:1080" value={config.network?.socks5_proxy || ''} onChange={e => updateNet('socks5_proxy', e.target.value)} disabled={!config.network?.socks5_enabled} /></label>
            <label style={{ fontSize: 13 }}>Timeout (s)<input style={{ width: '100%' }} type="number" value={config.network?.timeout_seconds || 30} onChange={e => updateNet('timeout_seconds', Number(e.target.value))} /></label>
          </div>
        </fieldset>

        <button onClick={save} disabled={loading}>{loading ? 'Saving...' : 'Save Configuration'}</button>
        {msg && <p style={{ color: msg.startsWith('Error') ? 'red' : 'green' }}>{msg}</p>}
      </div>
    </div>
  )
}

function CharInput({ char: c, value, onChange }: { char: any; value: string; onChange: (v: string) => void }) {
  const reg = c.valueRegulator
  const isMust = reg === 'mustBePersonalized'
  const isCan = reg === 'canBePersonalized'
  const isFixed = reg === 'fixed'
  const isSelection = reg === 'selection'
  const possibleValues = c.possibleValues || []
  const charKey = c.externalId || c.id
  const hasRange = c.valueFrom !== undefined && c.valueFrom !== ''
  const isNumeric = c.valueType === 'LONG' || c.valueType === 'INTEGER' || c.valueType === 'DOUBLE' || c.valueType === 'FLOAT'
  const isDateTime = c.valueType === 'DATE_TIME' || c.valueType === 'DATE'
  // Only treat possibleValues as enum options if they have actual value/name (not just range sentinels)
  const enumPVs = possibleValues.filter((pv: any) => pv.value !== undefined || pv.name)
  // For canBePersonalized: show default pre-filled, allow override via checkbox
  const [personalize, setPersonalize] = React.useState(isMust || isFixed || isSelection)

  // Pre-fill default when not personalizing
  React.useEffect(() => {
    if (!personalize && c.defaultValue) onChange(c.defaultValue)
  }, [personalize, c.externalId])

  const badge = isMust
    ? <span style={{ fontSize: 10, background: '#c60', color: '#fff', borderRadius: 3, padding: '1px 4px', marginLeft: 4 }}>required</span>
    : isCan
    ? <span style={{ fontSize: 10, background: '#0a7', color: '#fff', borderRadius: 3, padding: '1px 4px', marginLeft: 4 }}>optional</span>
    : isFixed
    ? <span style={{ fontSize: 10, background: '#888', color: '#fff', borderRadius: 3, padding: '1px 4px', marginLeft: 4 }}>fixed</span>
    : isSelection
    ? <span style={{ fontSize: 10, background: '#46a', color: '#fff', borderRadius: 3, padding: '1px 4px', marginLeft: 4 }}>selection</span>
    : null

  const rangeHint = hasRange
    ? `${c.valueFrom}–${c.valueTo}${c.unitOfMeasure ? ' ' + c.unitOfMeasure : (!isNumeric ? ' chars' : '')}`
    : c.unitOfMeasure ? c.unitOfMeasure : ''

  const inputEl = enumPVs.length > 0 ? (
    <select style={{ width: '100%' }} value={value} onChange={e => onChange(e.target.value)} disabled={isFixed || (!personalize && isCan)}>
      <option value="">-- Select --</option>
      {enumPVs.map((pv: any, i: number) => (
        <option key={i} value={pv.value || ''}>{pv.name || pv.value}{pv.default ? ' ✓' : ''}</option>
      ))}
    </select>
  ) : (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
      <input
        type={isDateTime ? 'datetime-local' : isNumeric ? 'number' : 'text'}
        style={{ flex: 1, background: (isFixed || (!personalize && isCan)) ? '#f5f5f5' : undefined }}
        placeholder={c.defaultValue || (hasRange && isNumeric ? `${c.valueFrom}–${c.valueTo}` : `Enter ${c.name || charKey}`)}
        value={value}
        onChange={e => onChange(e.target.value)}
        readOnly={isFixed || (!personalize && isCan)}
        min={hasRange && isNumeric ? c.valueFrom : undefined}
        max={hasRange && isNumeric ? c.valueTo : undefined}
      />
      {rangeHint && <span style={{ fontSize: 10, color: '#888', whiteSpace: 'nowrap' }}>{rangeHint}</span>}
    </div>
  )

  return (
    <label style={{ display: 'block', marginBottom: 6 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 2 }}>
        <span style={{ fontSize: 12 }}>
          {c.name || charKey}
          {c.required && <span style={{ color: 'red', marginLeft: 2 }}>*</span>}
          {badge}
          {c.valueType && <span style={{ fontSize: 10, color: '#aaa', marginLeft: 4 }}>[{c.valueType}]</span>}
        </span>
        {isCan && (
          <label style={{ fontSize: 10, color: '#0a7', display: 'flex', alignItems: 'center', gap: 3, marginLeft: 'auto', cursor: 'pointer' }}>
            <input type="checkbox" checked={personalize} onChange={e => {
              setPersonalize(e.target.checked)
              if (!e.target.checked) onChange(c.defaultValue || '')
            }} />
            personalize
          </label>
        )}
      </div>
      {(!isCan || personalize) && inputEl}
    </label>
  )
}



export default App
