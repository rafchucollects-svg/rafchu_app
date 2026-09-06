export function hasVendorAccess(profile) {
  return profile?.isAdmin === true || (
    profile?.vendorAccess?.enabled === true && profile?.vendorAccess?.status === "active"
  );
}
