import { describe, it, expect } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ConfigBuilder from './ConfigBuilder'

// ── 1. Renders business type category headings ────────────────────────────────
describe('ConfigBuilder — business type categories', () => {
  it('renders all five vertical headings', () => {
    render(<ConfigBuilder />)
    expect(screen.getByText('Home Services')).toBeInTheDocument()
    expect(screen.getByText('Health & Wellness')).toBeInTheDocument()
    expect(screen.getByText('Food & Hospitality')).toBeInTheDocument()
    expect(screen.getByText('Professional Services')).toBeInTheDocument()
    expect(screen.getByText('Auto')).toBeInTheDocument()
  })
})

// ── 2. Checking a business type checkbox selects it ──────────────────────────
describe('ConfigBuilder — checkbox selection', () => {
  it('checking a business type marks it as selected', async () => {
    const user = userEvent.setup()
    render(<ConfigBuilder />)
    const checkbox = screen.getByRole('checkbox', { name: /plumbers/i })
    expect(checkbox).not.toBeChecked()
    await user.click(checkbox)
    expect(checkbox).toBeChecked()
  })
})

// ── 3. Multiple business types can be selected simultaneously ────────────────
describe('ConfigBuilder — multiple checkbox selection', () => {
  it('allows selecting multiple business types at once', async () => {
    const user = userEvent.setup()
    render(<ConfigBuilder />)
    const plumbersCheckbox = screen.getByRole('checkbox', { name: /plumbers/i })
    const hvacCheckbox = screen.getByRole('checkbox', { name: /hvac companies/i })
    await user.click(plumbersCheckbox)
    await user.click(hvacCheckbox)
    expect(plumbersCheckbox).toBeChecked()
    expect(hvacCheckbox).toBeChecked()
  })
})

// ── 4. Free-text input adds a custom business type ───────────────────────────
describe('ConfigBuilder — custom business type', () => {
  it('adds a custom business type via free-text input', async () => {
    const user = userEvent.setup()
    render(<ConfigBuilder />)
    const input = screen.getByPlaceholderText(/add custom business type/i)
    await user.type(input, 'wedding photographers')
    await user.keyboard('{Enter}')
    expect(screen.getByRole('checkbox', { name: /wedding photographers/i })).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: /wedding photographers/i })).toBeChecked()
  })
})

// ── 5. Selecting a state populates the city list ──────────────────────────────
describe('ConfigBuilder — state → city picker', () => {
  it('selecting a state populates the city dropdown with cities for that state', async () => {
    const user = userEvent.setup()
    render(<ConfigBuilder />)
    const stateSelect = screen.getByRole('combobox', { name: /select state/i })
    await user.selectOptions(stateSelect, 'TX')
    expect(screen.getByRole('option', { name: /Austin/i })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: /Dallas/i })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: /Houston/i })).toBeInTheDocument()
  })
})

// ── 6. Selecting a city adds it to the selection ──────────────────────────────
describe('ConfigBuilder — city selection', () => {
  it('selecting a city from the dropdown adds it to selected cities', async () => {
    const user = userEvent.setup()
    render(<ConfigBuilder />)
    const stateSelect = screen.getByRole('combobox', { name: /select state/i })
    await user.selectOptions(stateSelect, 'TX')
    const citySelect = screen.getByRole('combobox', { name: /select city/i })
    await user.selectOptions(citySelect, 'Austin')

    // the selected city should appear as a tag/chip in a "selected cities" region
    const selectedCities = screen.getByRole('list', { name: /selected cities/i })
    expect(within(selectedCities).getByText(/Austin, TX/i)).toBeInTheDocument()
  })
})

// ── 7. "Generate YAML" produces correct query cross-product ───────────────────
describe('ConfigBuilder — YAML generation', () => {
  it('generates YAML with the cross-product of selected business types and cities', async () => {
    const user = userEvent.setup()
    render(<ConfigBuilder />)

    // select business types
    await user.click(screen.getByRole('checkbox', { name: /plumbers/i }))
    await user.click(screen.getByRole('checkbox', { name: /hvac companies/i }))

    // select TX → Austin
    await user.selectOptions(screen.getByRole('combobox', { name: /select state/i }), 'TX')
    await user.selectOptions(screen.getByRole('combobox', { name: /select city/i }), 'Austin')

    await user.click(screen.getByRole('button', { name: /generate yaml/i }))

    const textarea = screen.getByRole('textbox', { name: /generated yaml/i })
    const yaml = textarea.textContent ?? (textarea as HTMLTextAreaElement).value
    expect(yaml).toContain('plumbers in Austin TX')
    expect(yaml).toContain('HVAC companies in Austin TX')
    expect(yaml).toContain('max_results_per_run: 500')
  })
})

// ── 8. Generated YAML is shown in a textarea ──────────────────────────────────
describe('ConfigBuilder — YAML textarea', () => {
  it('shows generated YAML in a labeled textarea', async () => {
    const user = userEvent.setup()
    render(<ConfigBuilder />)
    await user.click(screen.getByRole('checkbox', { name: /plumbers/i }))
    await user.selectOptions(screen.getByRole('combobox', { name: /select state/i }), 'CA')
    await user.selectOptions(screen.getByRole('combobox', { name: /select city/i }), 'Los Angeles')
    await user.click(screen.getByRole('button', { name: /generate yaml/i }))
    const textarea = screen.getByRole('textbox', { name: /generated yaml/i })
    expect(textarea).toBeInTheDocument()
    expect((textarea as HTMLTextAreaElement).value).not.toBe('')
  })
})

// ── 9. "Load Config" with valid YAML repopulates the form ─────────────────────
describe('ConfigBuilder — Load Config (valid YAML)', () => {
  it('pasting valid YAML into Load Config repopulates business type checkboxes and city selections', async () => {
    const user = userEvent.setup()
    render(<ConfigBuilder />)

    const validYaml = `queries:\n  - "plumbers in Austin TX"\n  - "HVAC companies in Austin TX"\nmax_results_per_run: 500\n`
    const loadTextarea = screen.getByRole('textbox', { name: /load config/i })
    await user.click(loadTextarea)
    await user.paste(validYaml)
    await user.click(screen.getByRole('button', { name: /load config/i }))

    expect(screen.getByRole('checkbox', { name: /plumbers/i })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: /hvac companies/i })).toBeChecked()
    const selectedCities = screen.getByRole('list', { name: /selected cities/i })
    expect(within(selectedCities).getByText(/Austin, TX/i)).toBeInTheDocument()
  })
})

// ── 10. "Load Config" with invalid YAML shows an error ────────────────────────
describe('ConfigBuilder — Load Config (invalid YAML)', () => {
  it('shows an error message when pasted YAML is invalid', async () => {
    const user = userEvent.setup()
    render(<ConfigBuilder />)
    const loadTextarea = screen.getByRole('textbox', { name: /load config/i })
    await user.click(loadTextarea)
    await user.paste('this: is: not: valid: yaml: :::')
    await user.click(screen.getByRole('button', { name: /load config/i }))
    expect(screen.getByRole('alert')).toBeInTheDocument()
  })
})
