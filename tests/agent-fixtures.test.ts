import { describe, expect, it } from 'vitest'

import { customerSupportTools } from './customer-support/fixtures.js'
import { ecommerceTools } from './ecommerce/fixtures.js'
import { itServiceTools } from './it-service/fixtures.js'

describe('agent fixtures', () => {
  it('keeps customer support tools within the supported limit', () => {
    expect(customerSupportTools.length).toBeLessThanOrEqual(10)
  })

  it('keeps ecommerce tools within the supported limit', () => {
    expect(ecommerceTools.length).toBeLessThanOrEqual(10)
  })

  it('keeps IT service tools within the supported limit', () => {
    expect(itServiceTools.length).toBeLessThanOrEqual(10)
  })
})
