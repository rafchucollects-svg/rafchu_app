import { it, expect } from 'vitest';
import { hasVendorAccess } from './vendorAccess';
it('uses the same active entitlement for navigation, search and protected routes', () => {
  expect(hasVendorAccess({isVendor:true})).toBe(false);
  expect(hasVendorAccess({vendorAccess:{enabled:true,status:'expired'}})).toBe(false);
  expect(hasVendorAccess({vendorAccess:{enabled:true,status:'active'}})).toBe(true);
  expect(hasVendorAccess({isAdmin:true})).toBe(true);
  expect(hasVendorAccess(null)).toBe(false);
});
