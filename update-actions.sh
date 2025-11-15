#!/bin/bash
# Script to update all service function calls to action calls in pages

cd /d/gemi/repos/gemiprintaio

# Vendors page
sed -i 's/await getVendors(/await getVendorsAction(/g' src/app/vendors/page.tsx
sed -i 's/await createVendor(/await createVendorAction(/g' src/app/vendors/page.tsx
sed -i 's/await updateVendor(/await updateVendorAction(/g' src/app/vendors/page.tsx
sed -i 's/await deleteVendor(/await deleteVendorAction(/g' src/app/vendors/page.tsx

# Customers page  
sed -i 's/await getCustomers(/await getCustomersAction(/g' src/app/customers/page.tsx
sed -i 's/await createCustomer(/await createCustomerAction(/g' src/app/customers/page.tsx
sed -i 's/await updateCustomer(/await updateCustomerAction(/g' src/app/customers/page.tsx
sed -i 's/await deleteCustomer(/await deleteCustomerAction(/g' src/app/customers/page.tsx

# Users page
sed -i 's/await getUsers(/await getUsersAction(/g' src/app/users/page.tsx
sed -i 's/await createUser(/await createUserAction(/g' src/app/users/page.tsx
sed -i 's/await updateUser(/await updateUserAction(/g' src/app/users/page.tsx
sed -i 's/await deleteUser(/await deleteUserAction(/g' src/app/users/page.tsx
sed -i 's/await changePassword(/await changePasswordAction(/g' src/app/users/page.tsx

# Materials page
sed -i 's/await getMaterials(/await getMaterialsAction(/g' src/app/materials/page.tsx
sed -i 's/await createMaterial(/await createMaterialAction(/g' src/app/materials/page.tsx
sed -i 's/await updateMaterial(/await updateMaterialAction(/g' src/app/materials/page.tsx
sed -i 's/await deleteMaterial(/await deleteMaterialAction(/g' src/app/materials/page.tsx

# Production page
sed -i 's/await getProductionOrders(/await getProductionOrdersAction(/g' src/app/production/page.tsx
sed -i 's/await getProductionOrderById(/await getProductionOrderByIdAction(/g' src/app/production/page.tsx
sed -i 's/await updateProductionStatus(/await updateProductionStatusAction(/g' src/app/production/page.tsx
sed -i 's/await updateProductionItemStatus(/await updateProductionItemStatusAction(/g' src/app/production/page.tsx
sed -i 's/await deleteProductionOrder(/await deleteProductionOrderAction(/g' src/app/production/page.tsx

# Reports page
sed -i 's/await getArchivedPeriods(/await getArchivedPeriodsAction(/g' src/app/reports/page.tsx

echo "Function call replacements complete!"
