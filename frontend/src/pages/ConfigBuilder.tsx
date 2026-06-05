import { useState } from 'react'
import * as yaml from 'js-yaml'
import { businessTypes } from '../data/businessTypes'
import { stateCities } from '../data/stateCities'

interface SelectedCity {
  city: string
  state: string
}

interface CustomBusinessType {
  name: string
  checked: boolean
}

interface LoadedConfig {
  queries?: unknown[]
  max_results_per_run?: number
}

export default function ConfigBuilder() {
  // Business type selection — keyed by type name
  const [selectedTypes, setSelectedTypes] = useState<Set<string>>(new Set())
  const [customTypes, setCustomTypes] = useState<CustomBusinessType[]>([])
  const [customInput, setCustomInput] = useState('')

  // City selection
  const [selectedState, setSelectedState] = useState('')
  const [citySelectValue, setCitySelectValue] = useState('')
  const [selectedCities, setSelectedCities] = useState<SelectedCity[]>([])

  // YAML output
  const [generatedYaml, setGeneratedYaml] = useState('')

  // Load config
  const [loadConfigText, setLoadConfigText] = useState('')
  const [loadError, setLoadError] = useState('')

  // Derive city options for selected state
  const stateEntry = stateCities.find(s => s.abbreviation === selectedState)
  const cityOptions = stateEntry ? stateEntry.cities : []

  function toggleType(name: string) {
    setSelectedTypes(prev => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })
  }

  function toggleCustomType(name: string) {
    setCustomTypes(prev =>
      prev.map(ct => ct.name === name ? { ...ct, checked: !ct.checked } : ct)
    )
    setSelectedTypes(prev => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })
  }

  function handleCustomInput(e: React.ChangeEvent<HTMLInputElement>) {
    setCustomInput(e.target.value)
  }

  function handleCustomKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' && customInput.trim()) {
      const name = customInput.trim()
      setCustomTypes(prev => [...prev, { name, checked: true }])
      setSelectedTypes(prev => new Set([...prev, name]))
      setCustomInput('')
    }
  }

  function handleStateChange(e: React.ChangeEvent<HTMLSelectElement>) {
    setSelectedState(e.target.value)
    setCitySelectValue('')
  }

  function handleCityChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const city = e.target.value
    if (!city || !selectedState) return
    setSelectedCities(prev => {
      if (prev.some(c => c.city === city && c.state === selectedState)) return prev
      return [...prev, { city, state: selectedState }]
    })
    // Reset city select back to placeholder
    setCitySelectValue('')
  }

  function generateYaml() {
    // Collect all selected types in display order: built-ins first, then custom
    const builtInSelected = businessTypes
      .flatMap(g => g.types)
      .filter(t => selectedTypes.has(t))
    const customSelected = customTypes
      .map(ct => ct.name)
      .filter(name => selectedTypes.has(name))
    const allTypes = [...builtInSelected, ...customSelected]

    const queries: string[] = []
    for (const city of selectedCities) {
      for (const type of allTypes) {
        queries.push(`${type} in ${city.city} ${city.state}`)
      }
    }

    const config = {
      queries,
      max_results_per_run: 500,
    }

    setGeneratedYaml(yaml.dump(config))
  }

  function loadConfig() {
    setLoadError('')
    try {
      const parsed = yaml.load(loadConfigText) as LoadedConfig
      if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.queries)) {
        setLoadError('Invalid config: missing queries array')
        return
      }

      const newSelectedTypes = new Set<string>()
      const newSelectedCities: SelectedCity[] = []

      for (const query of parsed.queries) {
        if (typeof query !== 'string') continue
        const inIdx = query.lastIndexOf(' in ')
        if (inIdx === -1) continue

        const typePart = query.substring(0, inIdx)
        const locationPart = query.substring(inIdx + 4)

        // Parse "City ST" or "City Name ST" — last word is state abbreviation
        const locationParts = locationPart.trim().split(' ')
        const stateAbbr = locationParts[locationParts.length - 1]
        const cityName = locationParts.slice(0, -1).join(' ')

        // Add business type
        newSelectedTypes.add(typePart)

        // Add city if not already added
        if (!newSelectedCities.some(c => c.city === cityName && c.state === stateAbbr)) {
          newSelectedCities.push({ city: cityName, state: stateAbbr })
        }
      }

      // Determine which types are built-in vs custom
      const allBuiltInTypes = new Set(businessTypes.flatMap(g => g.types))
      const newCustomTypes: CustomBusinessType[] = []
      for (const t of newSelectedTypes) {
        if (!allBuiltInTypes.has(t)) {
          newCustomTypes.push({ name: t, checked: true })
        }
      }

      setSelectedTypes(newSelectedTypes)
      setCustomTypes(newCustomTypes)
      setSelectedCities(newSelectedCities)
    } catch {
      setLoadError('Invalid YAML: could not parse config')
    }
  }

  return (
    <div>
      <h1>Config Builder</h1>

      {/* Business Types */}
      <section>
        <h2>Business Types</h2>
        {businessTypes.map(group => (
          <div key={group.vertical}>
            <h3>{group.vertical}</h3>
            {group.types.map(type => (
              <label key={type}>
                <input
                  type="checkbox"
                  checked={selectedTypes.has(type)}
                  onChange={() => toggleType(type)}
                  aria-label={type}
                />
                {' '}{type}
              </label>
            ))}
          </div>
        ))}

        {/* Custom types */}
        {customTypes.map(ct => (
          <label key={ct.name}>
            <input
              type="checkbox"
              checked={ct.checked}
              onChange={() => toggleCustomType(ct.name)}
              aria-label={ct.name}
            />
            {' '}{ct.name}
          </label>
        ))}

        <input
          type="text"
          placeholder="add custom business type"
          value={customInput}
          onChange={handleCustomInput}
          onKeyDown={handleCustomKeyDown}
        />
      </section>

      {/* City Picker */}
      <section>
        <h2>Cities</h2>
        <label htmlFor="state-select">Select state</label>
        <select
          id="state-select"
          value={selectedState}
          onChange={handleStateChange}
        >
          <option value="">-- select state --</option>
          {stateCities.map(s => (
            <option key={s.abbreviation} value={s.abbreviation}>
              {s.name} ({s.abbreviation})
            </option>
          ))}
        </select>

        <label htmlFor="city-select">Select city</label>
        <select
          id="city-select"
          value={citySelectValue}
          onChange={handleCityChange}
        >
          <option value="">-- select city --</option>
          {cityOptions.map(city => (
            <option key={city} value={city}>
              {city}
            </option>
          ))}
        </select>

        {selectedCities.length > 0 && (
          <ul aria-label="Selected cities">
            {selectedCities.map((c, i) => (
              <li key={`${i}:${c.city}:${c.state}`}>{c.city}, {c.state}</li>
            ))}
          </ul>
        )}
      </section>

      {/* Generate YAML */}
      <section>
        <button onClick={generateYaml}>Generate YAML</button>
        <label htmlFor="generated-yaml">Generated YAML</label>
        <textarea
          id="generated-yaml"
          aria-label="Generated YAML"
          value={generatedYaml}
          readOnly
          rows={10}
          cols={60}
        />
      </section>

      {/* Load Config */}
      <section>
        <h2>Load Config</h2>
        <label htmlFor="load-config">Load Config</label>
        <textarea
          id="load-config"
          aria-label="Load Config"
          value={loadConfigText}
          onChange={e => setLoadConfigText(e.target.value)}
          rows={10}
          cols={60}
          placeholder="Paste YAML config here..."
        />
        <button onClick={loadConfig}>Load Config</button>
        {loadError && <div role="alert">{loadError}</div>}
      </section>
    </div>
  )
}
