export interface BusinessTypeGroup {
  vertical: string
  types: string[]
}

export const businessTypes: BusinessTypeGroup[] = [
  {
    vertical: 'Home Services',
    types: [
      'plumbers',
      'HVAC companies',
      'electricians',
      'roofers',
      'general contractors',
      'pest control companies',
      'landscaping companies',
      'house cleaning services',
    ],
  },
  {
    vertical: 'Health & Wellness',
    types: [
      'chiropractors',
      'physical therapists',
      'dentists',
      'optometrists',
      'massage therapists',
      'personal trainers',
    ],
  },
  {
    vertical: 'Food & Hospitality',
    types: [
      'restaurants',
      'catering companies',
      'food trucks',
      'bakeries',
      'coffee shops',
      'bars and nightclubs',
    ],
  },
  {
    vertical: 'Professional Services',
    types: [
      'accountants',
      'lawyers',
      'insurance agents',
      'financial advisors',
      'marketing agencies',
      'IT consulting firms',
    ],
  },
  {
    vertical: 'Auto',
    types: [
      'auto repair shops',
      'car dealerships',
      'auto body shops',
      'tire shops',
      'car detailing services',
    ],
  },
]
