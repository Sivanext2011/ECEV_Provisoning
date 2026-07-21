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
  const [selectedSMSCmSpec, setSelectedSMSCmSpec] = useState<any>(null)
  const [selectedRESTCmSpec, setSelectedRESTCmSpec] = useState<any>(null)
  const [selectedEMAILCmSpec, setSelectedEMAILCmSpec] = useState<any>(null)
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

  // Pre-fill default values for a spec's chars into a form section
  const prefillDefaults = (chars: any[], section: string) => {
    const updates: any = {}
    for (const c of chars) {
      const key = c.externalId || c.id
      if (c.defaultValue && !formValues[section]?.[key]) updates[key] = c.defaultValue
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
          <label>SMS Contact Medium Specification
            <select style={{ width: '100%' }} value={selectedSMSCmSpec?.externalId || ''} onChange={e => setSelectedSMSCmSpec(deriveCmSpec(e.target.value))}>
              <option value="">-- Select --</option>
              {cmSpecs.map((s: any) => <option key={s.id} value={s.externalId}>{s.name} ({s.externalId})</option>)}
            </select>
          </label>
          <label>REST Contact Medium Specification
            <select style={{ width: '100%' }} value={selectedRESTCmSpec?.externalId || ''} onChange={e => setSelectedRESTCmSpec(deriveCmSpec(e.target.value))}>
              <option value="">-- Select --</option>
              {cmSpecs.map((s: any) => <option key={s.id} value={s.externalId}>{s.name} ({s.externalId})</option>)}
            </select>
          </label>
          <label>EMAIL Contact Medium Specification
            <select style={{ width: '100%' }} value={selectedEMAILCmSpec?.externalId || ''} onChange={e => setSelectedEMAILCmSpec(deriveCmSpec(e.target.value))}>
              <option value="">-- Select --</option>
              {cmSpecs.map((s: any) => <option key={s.id} value={s.externalId}>{s.name} ({s.externalId})</option>)}
            </select>
          </label>
          <label>Communication Identifier Specification (optional)
            <select style={{ width: '100%' }} value={selectedCommIdSpec} onChange={e => setSelectedCommIdSpec(e.target.value)}>
              <option value="">-- None --</option>
              {commIdSpecs.map((s: any) => <option key={s.id} value={s.externalId}>{s.name} ({s.externalId})</option>)}
            </select>
          </label>
          <button disabled={!selectedPartySpec || !selectedCustSpec || !selectedBASpec || !selectedContractSpec || !selectedSMSCmSpec || !selectedRESTCmSpec || !selectedEMAILCmSpec} onClick={() => setStep(1)}>Next →</button>
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
                  const logicalRS = poResourceSpecs.filter((rs: any) => rs.type === 'LRS')
                  return logicalRS.length > 0 ? <>
                    <p style={{ fontSize: 12, color: '#555', margin: '0 0 6px' }}>Logical Resources (required by Product Offering):</p>
                    {logicalRS.map((rs: any) => (
                      <label key={rs.id} style={{ display: 'block', marginBottom: 6 }}>
                        {rs.name}{rs.externalId ? ` (${rs.externalId})` : ''} <span style={{ color: 'red' }}>*</span>
                        <input style={{ width: '100%' }} placeholder={`Enter ${rs.name} number`}
                          value={formValues.contract[`_res_${rs.externalId || rs.id}`] || ''}
                          onChange={e => setFormValues({ ...formValues, contract: { ...formValues.contract, [`_res_${rs.externalId || rs.id}`]: e.target.value } })} />
                      </label>
                    ))}
                  </> : selectedPO ? <p style={{ fontSize: 11, color: '#888' }}>No resource specs linked to this PO.</p> : null
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
              pb.contactMedium = [
                buildCm(selectedSMSCmSpec, 'SMS', msisdn, 'SMS'),
                buildCm(selectedRESTCmSpec, 'socialMedia', msisdn, 'REST'),
                buildCm(selectedEMAILCmSpec, 'EMail', email || `${msisdn}@placeholder.com`, 'EMAIL'),
              ]
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
                ctb.contactMediumAssociation = [
                  { contactRole: 'Notification', language: 'en', contactMediumExternalId: cmDefaults['SMS_contactMediumExternalId'] || `cm_SMS_${msisdn}`, enabled: true },
                  { contactRole: 'Notification', language: 'en', contactMediumExternalId: cmDefaults['REST_contactMediumExternalId'] || `cm_REST_${msisdn}`, enabled: true },
                  { contactRole: 'Notification', language: 'en', contactMediumExternalId: cmDefaults['EMAIL_contactMediumExternalId'] || `cm_EMAIL_${msisdn}`, enabled: true },
                ]
              }
              // Contract chars — all non-resource, non-PO keys
              const contractChars = Object.entries(formValues.contract)
                .filter(([k, v]) => !k.startsWith('_') && (v as string)?.trim())
              if (contractChars.length) ctb.characteristic = contractChars.map(([k, v]) => ({ charSpecExternalId: k, value: [{ value: v }] }))

              // Also include fixed chars from contract spec that have a defaultValue
              const cs2 = contractSpecs.find((s: any) => s.externalId === selectedContractSpec)
              if (cs2) {
                const fixedChars = getPersonalizableChars(cs2.characteristics)
                  .filter((c: any) => c.valueRegulator === 'fixed' && c.defaultValue)
                  .filter((c: any) => !contractChars.find(([k]) => k === (c.externalId || c.id)))
                if (fixedChars.length) {
                  ctb.characteristic = [...(ctb.characteristic || []),
                    ...fixedChars.map((c: any) => ({ charSpecExternalId: c.externalId || c.id, value: [{ value: c.defaultValue }] }))
                  ]
                }
              }

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
  const [selectedTemplate, setSelectedTemplate] = useState('')
  const [json, setJson] = useState('')
  const [externalId, setExternalId] = useState('')
  const [version, setVersion] = useState('')
  const [result, setResult] = useState<any>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [fetchLoading, setFetchLoading] = useState(false)

  const fetchTemplates = async () => {
    setTemplatesLoading(true); setTemplatesError('')
    try {
      // Use BSSF entitySpecificationList to list all product offerings
      const r = await fetch(`${API}/spec/entityList?specificationType=PRODUCT_OFFERING`)
      if (!r.ok) throw new Error((await r.json()).detail || `HTTP ${r.status}`)
      const data = await r.json()
      const list = data?.entitySpecificationListEntry || (Array.isArray(data) ? data : [])
      setTemplates(list)
    } catch (e: any) { setTemplatesError(e.message) }
    setTemplatesLoading(false)
  }

  const loadTemplate = async () => {
    if (!selectedTemplate) return
    setFetchLoading(true); setError(''); setResult(null)
    try {
      // Use BSSF Product Catalog Integration to read full PO
      const r = await fetch(`${API}/catalog/productOffering?externalId=${encodeURIComponent(selectedTemplate)}`)
      if (!r.ok) throw new Error((await r.json()).detail || `HTTP ${r.status}`)
      const data = await r.json()
      const pot = Array.isArray(data) ? data[0] : data
      setJson(JSON.stringify(pot, null, 2))
      setExternalId(pot?.externalId || selectedTemplate)
      setVersion(pot?.version || '')
    } catch (e: any) { setError(e.message) }
    setFetchLoading(false)
  }

  const publish = async () => {
    setLoading(true); setError(''); setResult(null)
    try {
      let body: any
      try { body = JSON.parse(json) } catch { throw new Error('Invalid JSON') }
      const r = await fetch(`${API}/catalog/productOffering`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
      })
      if (!r.ok) throw new Error((await r.json()).detail || `HTTP ${r.status}`)
      setResult(await r.json())
    } catch (e: any) { setError(e.message) }
    setLoading(false)
  }

  const update = async () => {
    if (!externalId || !version) { setError('External ID and Version are required for update'); return }
    setLoading(true); setError(''); setResult(null)
    try {
      let body: any
      try { body = JSON.parse(json) } catch { throw new Error('Invalid JSON') }
      const r = await fetch(`${API}/catalog/productOffering/externalId/${encodeURIComponent(externalId)}/version/${encodeURIComponent(version)}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
      })
      if (!r.ok) throw new Error((await r.json()).detail || `HTTP ${r.status}`)
      setResult(await r.json())
    } catch (e: any) { setError(e.message) }
    setLoading(false)
  }

  return (
    <div>
      <h2>📤 PO Publish (POT)</h2>
      <p style={{ fontSize: 13, color: '#666', margin: '0 0 16px' }}>Fetch a Product Offering Template from RMCA and publish it to BAE via the Product Catalog Integration API.</p>

      <fieldset style={{ marginBottom: 16 }}>
        <legend><b>1. Load Templates from RMCA</b></legend>
        <button onClick={fetchTemplates} disabled={templatesLoading}>{templatesLoading ? '⏳ Fetching...' : '🔄 Fetch POT List from RMCA'}</button>
        {templatesError && <p style={{ color: 'red', fontSize: 12, margin: '6px 0 0' }}>{templatesError}</p>}
        {templates.length > 0 && <p style={{ fontSize: 12, color: '#0a7', margin: '6px 0 0' }}>✓ {templates.length} templates loaded</p>}
      </fieldset>

      <fieldset style={{ marginBottom: 16 }}>
        <legend><b>2. Select &amp; Load Template</b></legend>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          {templates.length > 0 ? (
            <select style={{ flex: 1, minWidth: 200 }} value={selectedTemplate} onChange={e => setSelectedTemplate(e.target.value)}>
              <option value="">-- Select template --</option>
              {templates.map((t: any, i: number) => (
                <option key={t.id || t.externalId || i} value={t.externalId || t.id}>
                  {t.name || t.externalId} ({t.externalId})
                </option>
              ))}
            </select>
          ) : (
            <input style={{ flex: 1 }} placeholder="Template externalId (fetch list first)" value={selectedTemplate} onChange={e => setSelectedTemplate(e.target.value)} />
          )}
          <button onClick={loadTemplate} disabled={fetchLoading || !selectedTemplate}>{fetchLoading ? 'Loading...' : 'Load Template'}</button>
        </div>
      </fieldset>

      {json && (
        <fieldset>
          <legend><b>3. Review &amp; Publish</b></legend>
          <div style={{ display: 'flex', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
            <label style={{ fontSize: 13 }}>External ID
              <input style={{ display: 'block', width: 220 }} value={externalId} onChange={e => setExternalId(e.target.value)} placeholder="externalId" />
            </label>
            <label style={{ fontSize: 13 }}>Version (for PATCH update only)
              <input style={{ display: 'block', width: 160 }} value={version} onChange={e => setVersion(e.target.value)} placeholder="e.g. 1" />
            </label>
          </div>

          <textarea
            style={{ width: '100%', fontFamily: 'monospace', fontSize: 11, boxSizing: 'border-box' }}
            rows={24}
            value={json}
            onChange={e => setJson(e.target.value)}
          />

          {error && <p style={{ color: 'red', wordBreak: 'break-all' }}>❌ {error}</p>}

          <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
            <button disabled={loading} onClick={publish}>{loading ? 'Publishing...' : '🚀 Publish (POST)'}</button>
            <button disabled={loading} onClick={update}>{loading ? 'Updating...' : '✏️ Update (PATCH)'}</button>
          </div>

          {result && (
            <pre style={{ background: '#f0fff0', padding: 10, border: '1px solid #cfc', borderRadius: 4, maxHeight: 300, overflow: 'auto', marginTop: 10 }}>
              {JSON.stringify(result, null, 2)}
            </pre>
          )}
        </fieldset>
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

function CRMView() {
  const [searchType, setSearchType] = useState<'msisdn' | 'externalId' | 'id'>('msisdn')
  const [searchValue, setSearchValue] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [party, setParty] = useState<any>(null)
  const [customer, setCustomer] = useState<any>(null)
  const [contract, setContract] = useState<any>(null)
  const [balance, setBalance] = useState<any>(null)
  const [expandedSection, setExpandedSection] = useState<string | null>('tree')
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

  const Section = ({ title, icon, id, data }: { title: string; icon: string; id: string; data: any }) => (
    <div style={{ border: '1px solid #ddd', borderRadius: 6, marginBottom: 10 }}>
      <div style={{ padding: '8px 12px', background: '#f8f8f8', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
        onClick={() => setExpandedSection(expandedSection === id ? null : id)}>
        <span><b>{icon} {title}</b></span>
        <span style={{ fontSize: 12, color: '#888' }}>{expandedSection === id ? '▼' : '▶'}</span>
      </div>
      {expandedSection === id && data && (
        <div style={{ padding: 12 }}>
          <pre style={{ fontSize: 11, margin: 0, maxHeight: 400, overflow: 'auto', whiteSpace: 'pre-wrap' }}>{JSON.stringify(data, null, 2)}</pre>
        </div>
      )}
      {expandedSection === id && !data && <p style={{ padding: 12, color: '#888', margin: 0 }}>No data loaded</p>}
    </div>
  )

  // Build relationship tree from contract data
  const buildTree = () => {
    if (!contract && !customer && !party) return null
    const c = Array.isArray(contract) ? contract[0] : contract
    const cu = Array.isArray(customer) ? customer[0] : customer

    return (
      <div style={{ fontFamily: 'monospace', fontSize: 12, background: '#1a1a2e', color: '#e0e0e0', padding: 16, borderRadius: 8, overflow: 'auto' }}>
        <div style={{ color: '#64ffda' }}>TMF SID Entity Relationship</div>
        <div style={{ marginTop: 8 }}>
          {party && <div>
            <span style={{ color: '#ff9800' }}>📋 Party</span> [{party?.id || party?.[0]?.id || ''}]
            <span style={{ color: '#aaa' }}> externalId={party?.externalId || party?.[0]?.externalId || ''}</span>
          </div>}
          {cu && <div style={{ marginLeft: 20 }}>
            <span style={{ color: '#4fc3f7' }}>├── 👤 Customer</span> [{cu?.id || ''}]
            <span style={{ color: '#aaa' }}> externalId={cu?.externalId || ''} spec={cu?.customerSpecification?.externalId || ''}</span>
            {cu?.account && cu.account.map((a: any, i: number) => (
              <div key={i} style={{ marginLeft: 20 }}>
                <span style={{ color: '#81c784' }}>├── 💳 BillingAccount</span> [{a?.id || ''}]
                <span style={{ color: '#aaa' }}> externalId={a?.externalId || ''}</span>
              </div>
            ))}
          </div>}
          {c && <div style={{ marginLeft: 20 }}>
            <span style={{ color: '#ce93d8' }}>├── 📄 Contract</span> [{c?.id || ''}]
            <span style={{ color: '#aaa' }}> externalId={c?.externalId || ''} status={c?.status?.slice(-1)[0]?.status || ''}</span>
            {c?.product && c.product.map((p: any, i: number) => (
              <div key={i} style={{ marginLeft: 20 }}>
                <span style={{ color: '#fff176' }}>├── 📦 Product</span> [{p?.id || ''}]
                <span style={{ color: '#aaa' }}> PO={p?.productOfferingExternalId || ''} status={p?.status?.slice(-1)[0]?.status || ''}</span>
                {p?.resource && p.resource.map((r: any, j: number) => (
                  <div key={j} style={{ marginLeft: 20 }}>
                    <span style={{ color: '#80cbc4' }}>├── 🔗 Resource</span> [{r?.resourceNumber || r?.id || ''}]
                    <span style={{ color: '#aaa' }}> spec={r?.resourceSpecificationExternalId || ''}</span>
                  </div>
                ))}
              </div>
            ))}
            {c?.resource && c.resource.map((r: any, i: number) => (
              <div key={i} style={{ marginLeft: 20 }}>
                <span style={{ color: '#80cbc4' }}>├── 🔗 Resource</span> [{r?.resourceNumber || r?.id || ''}]
                <span style={{ color: '#aaa' }}> spec={r?.resourceSpecificationExternalId || ''} externalId={r?.externalId || ''}</span>
              </div>
            ))}
          </div>}
        </div>
        {balance && <div style={{ marginTop: 12, borderTop: '1px solid #333', paddingTop: 8 }}>
          <span style={{ color: '#ffab40' }}>💰 Balance</span>
          {Array.isArray(balance) ? balance.map((b: any, i: number) => (
            <div key={i} style={{ marginLeft: 20, color: '#aaa' }}>
              {b?.bucketName || b?.name || `Bucket ${i+1}`}: {b?.remainingValue ?? b?.amount ?? JSON.stringify(b)}
            </div>
          )) : <pre style={{ marginLeft: 20, color: '#aaa', fontSize: 11 }}>{JSON.stringify(balance, null, 2)}</pre>}
        </div>}
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

      {(contract || customer || party) && (
        <div>
          <Section title="Entity Relationship Tree" icon="🌳" id="tree" data={null} />
          {expandedSection === 'tree' && buildTree()}

          <div style={{ marginTop: 16 }}>
            {party && <Section title={`Party ${party?.externalId || party?.[0]?.externalId || ''}`} icon="📋" id="party" data={party} />}
            {customer && <Section title={`Customer ${(Array.isArray(customer) ? customer[0] : customer)?.externalId || ''}`} icon="👤" id="customer" data={customer} />}
            {contract && <Section title={`Contract ${(Array.isArray(contract) ? contract[0] : contract)?.externalId || ''}`} icon="📄" id="contract" data={contract} />}
            {balance && <Section title="Balance" icon="💰" id="balance" data={balance} />}
          </div>

          {/* Actions Panel */}
          {contract && (() => {
            const c = Array.isArray(contract) ? contract[0] : contract
            const cu = Array.isArray(customer) ? customer[0] : customer
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

            const changeProductStatus = (productExtId: string, status: string) => patchContract({
              product: [{ externalId: productExtId, status: [{ status }] }]
            })

            const purchaseProduct = (poExtId: string) => {
              if (!poExtId) return
              const ts = Date.now().toString(36)
              patchContract({
                product: [{
                  productOfferingExternalId: poExtId,
                  externalId: `${poExtId}-${ts}`,
                  name: poExtId,
                  status: [{ status: 'ProductCreated' }],
                  billingAccountReference: { externalId: baExtId },
                  baRefForBillCycleAlignedRecurrence: { externalId: baExtId },
                }]
              })
            }

            return (
              <div style={{ marginTop: 16 }}>
                <h3 style={{ margin: '0 0 10px' }}>⚡ Actions</h3>
                {actionMsg && <p style={{ color: 'green', fontSize: 12 }}>{actionMsg}</p>}
                {actionErr && <p style={{ color: 'red', fontSize: 12, wordBreak: 'break-all' }}>{actionErr}</p>}

                <fieldset style={{ marginBottom: 12 }}>
                  <legend><b>Contract Status</b> <span style={{ fontSize: 11, color: '#888' }}>current: {contractStatus}</span></legend>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    <button disabled={actionLoading || contractStatus === 'Active'} onClick={() => changeContractStatus('Active')}>Activate</button>
                    <button disabled={actionLoading || contractStatus === 'Halt'} onClick={() => changeContractStatus('Halt')}>Halt</button>
                    <button disabled={actionLoading || contractStatus === 'Active'} onClick={() => changeContractStatus('Active')}>Resume</button>
                    <button disabled={actionLoading || contractStatus === 'Terminated'} onClick={() => changeContractStatus('Terminated')} style={{ color: 'red' }}>Terminate</button>
                  </div>
                </fieldset>

                {products.length > 0 && (
                  <fieldset style={{ marginBottom: 12 }}>
                    <legend><b>Product Status</b></legend>
                    {products.map((p: any) => (
                      <div key={p.id || p.externalId} style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 6, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 12, minWidth: 180 }}>{p.productOfferingExternalId || p.name} <span style={{ color: '#888' }}>({p.status?.slice(-1)[0]?.status})</span></span>
                        <button disabled={actionLoading} onClick={() => changeProductStatus(p.externalId, 'ProductActive')} style={{ fontSize: 11 }}>Activate</button>
                        <button disabled={actionLoading} onClick={() => changeProductStatus(p.externalId, 'ProductHalt')} style={{ fontSize: 11 }}>Halt</button>
                        <button disabled={actionLoading} onClick={() => changeProductStatus(p.externalId, 'ProductActive')} style={{ fontSize: 11 }}>Resume</button>
                        <button disabled={actionLoading} onClick={() => changeProductStatus(p.externalId, 'ProductTerminated')} style={{ fontSize: 11, color: 'red' }}>Terminate</button>
                      </div>
                    ))}
                  </fieldset>
                )}

                <fieldset>
                  <legend><b>Purchase New Product</b></legend>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <select style={{ flex: 1 }} value={newPO} onChange={e => setNewPO(e.target.value)}>
                      <option value="">-- Select Product Offering --</option>
                      {poList2.map((p: any) => <option key={p.id} value={p.externalId}>{p.name} ({p.externalId})</option>)}
                    </select>
                    <button disabled={actionLoading || !newPO} onClick={() => purchaseProduct(newPO)}>Purchase</button>
                  </div>
                </fieldset>
              </div>
            )
          })()}
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
  const commIdSpecs2 = specs?.communicationIdentifierSpecifications || []

  const CmSpecSelect = ({ label, prefix }: { label: string; prefix: string }) => {
    const specField = `${prefix}_contactMediumSpecExternalId`
    const selected = config.defaults?.[specField] || ''
    const spec = cmSpecs.find((s: any) => s.externalId === selected)
    // When spec is selected, derive charSpec keys from its characteristics
    const onSelect = (extId: string) => {
      const s = cmSpecs.find((s: any) => s.externalId === extId)
      const updates: any = { [specField]: extId }
      if (s?.characteristics?.length) {
        // Heuristic: find communicationId and channelType chars by name/externalId
        for (const c of s.characteristics) {
          const key = (c.externalId || c.name || '').toLowerCase()
          if (key.includes('communication') || key.includes('phone') || key.includes('number') || key.includes('address') || key.includes('email'))
            updates[`${prefix}_contactMediumSpecCommunicationId`] = c.externalId || c.id
          if (key.includes('channel') || key.includes('type'))
            updates[`${prefix}_contactMediumSpecChannelType`] = c.externalId || c.id
        }
      }
      setConfig({ ...config, defaults: { ...config.defaults, ...updates } })
    }
    return (
      <label>{label}
        {cmSpecs.length > 0 ? (
          <select style={{ width: '100%' }} value={selected} onChange={e => onSelect(e.target.value)}>
            <option value="">-- None --</option>
            {cmSpecs.map((s: any) => <option key={s.externalId} value={s.externalId}>{s.name || s.externalId} ({s.externalId})</option>)}
          </select>
        ) : (
          <input style={{ width: '100%' }} value={selected} onChange={e => update(specField, e.target.value)} />
        )}
        {spec?.characteristics?.length > 0 && (
          <span style={{ fontSize: 10, color: '#0a7' }}> ✓ {spec.characteristics.length} chars found</span>
        )}
      </label>
    )
  }

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
      <SpecSelect label="Communication Identifier Spec" field="communicationIdentifierSpecExternalId" options={commIdSpecs2} />
      <CmSpecSelect label="SMS Contact Medium Spec" prefix="SMS" />
      <label>SMS CommunicationId CharSpec Key
        <input style={{ width: '100%' }} value={config.defaults?.SMS_contactMediumSpecCommunicationId || ''} onChange={e => update('SMS_contactMediumSpecCommunicationId', e.target.value)} placeholder="e.g. communicationId" />
      </label>
      <label>SMS ChannelType CharSpec Key
        <input style={{ width: '100%' }} value={config.defaults?.SMS_contactMediumSpecChannelType || ''} onChange={e => update('SMS_contactMediumSpecChannelType', e.target.value)} placeholder="e.g. channelType" />
      </label>
      <CmSpecSelect label="REST Contact Medium Spec" prefix="REST" />
      <label>REST CommunicationId CharSpec Key
        <input style={{ width: '100%' }} value={config.defaults?.REST_contactMediumSpecCommunicationId || ''} onChange={e => update('REST_contactMediumSpecCommunicationId', e.target.value)} placeholder="e.g. communicationId" />
      </label>
      <label>REST ChannelType CharSpec Key
        <input style={{ width: '100%' }} value={config.defaults?.REST_contactMediumSpecChannelType || ''} onChange={e => update('REST_contactMediumSpecChannelType', e.target.value)} placeholder="e.g. channelType" />
      </label>
      <CmSpecSelect label="EMAIL Contact Medium Spec" prefix="EMAIL" />
      <label>EMAIL CommunicationId CharSpec Key
        <input style={{ width: '100%' }} value={config.defaults?.EMAIL_contactMediumSpecCommunicationId || ''} onChange={e => update('EMAIL_contactMediumSpecCommunicationId', e.target.value)} placeholder="e.g. communicationId" />
      </label>
      <label>EMAIL ChannelType CharSpec Key
        <input style={{ width: '100%' }} value={config.defaults?.EMAIL_contactMediumSpecChannelType || ''} onChange={e => update('EMAIL_contactMediumSpecChannelType', e.target.value)} placeholder="e.g. channelType" />
      </label>
    </div>
  )
}

export default App
