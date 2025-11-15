# Build Issues - Client Components Importing Server-Only Services

## Current Status

Added `"server-only"` to all database services, but build fails because client components still import these services directly.

## Components That Need Refactoring

### High Priority (Blocking Build)

1. **src/components/QuickAddVendorModal.tsx**

   - Imports: `createVendor` from vendors-service
   - Used by: purchases/page.tsx
   - Solution: Pass createVendor callback as prop from parent

2. **src/components/QuickAddCustomerModal.tsx**

   - Imports: `createCustomer` from customers-service
   - Used by: pos/page.tsx
   - Solution: Pass createCustomer callback as prop from parent

3. **src/components/QuickAddMaterialModal.tsx**

   - Imports: `createMaterial` from materials-service
   - Used by: purchases/page.tsx
   - Solution: Pass createMaterial callback as prop from parent

4. **src/components/MainShell.tsx**

   - Imports: sync operations from sync-operations-service
   - Used by: layout.tsx
   - Solution: Create wrapper actions or convert to server component where possible

5. **src/components/ImportCsvModal.tsx**

   - Imports: `importCashbookFromCSV` from finance-service
   - Used by: finance/page.tsx
   - Solution: Pass import callback as prop from parent

6. **src/components/AddMaterialModal.tsx**

   - Imports: materials-service and master-service
   - Used by: materials/page.tsx
   - Solution: Pass all needed callbacks as props

7. **src/app/settings/page.tsx**

   - Direct imports: master-service, finishing-options-service, sync-operations-service, backup-service
   - Solution: Use actions file (already created)

8. **src/app/auth/login/page.tsx**
   - Imports: auth-service
   - Solution: Create login actions file

## Recommended Approach

### Option 1: Prop Callbacks (Cleanest Architecture)

Pass server action functions as props to components:

```tsx
// In parent page
import { createVendorAction } from "./actions";

<QuickAddVendorModal
  onCreate={createVendorAction}
  ...
/>
```

### Option 2: Remove "server-only" Temporarily

Comment out "server-only" imports to get build working, then refactor incrementally.

### Option 3: Hybrid Approach (RECOMMENDED)

1. Create action files for all pages that don't have them yet
2. Update page imports to use actions
3. Convert modal components to accept callback props
4. Keep "server-only" protection on core services

## Next Steps

1. Create auth/login/actions.ts
2. Update settings/page.tsx to use settings/actions.ts
3. Convert Quick Add modals to accept onCreate callbacks
4. Update AddMaterialModal to accept callbacks
5. Handle MainShell sync operations
6. Retry build

## Alternative: Dynamic Imports

For components that MUST call services, use dynamic imports with proper error handling:

```tsx
const handleCreate = async (data) => {
  if (typeof window !== "undefined") {
    const { createVendor } = await import("@/actions/vendors");
    return createVendor(data);
  }
};
```
