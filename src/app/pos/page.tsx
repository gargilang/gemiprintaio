'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { Material, Customer } from '@/types/database';

interface CartItem {
  material: Material;
  quantity: number;
  subtotal: number;
}

export default function POSPage() {
  const router = useRouter();
  const [materials, setMaterials] = useState<Material[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [paidAmount, setPaidAmount] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    checkAuth();
    loadMaterials();
    loadCustomers();
  }, []);

  const checkAuth = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      router.push('/auth/login');
    }
  };

  const loadMaterials = async () => {
    const { data } = await supabase
      .from('materials')
      .select('*')
      .order('name');
    if (data) setMaterials(data);
  };

  const loadCustomers = async () => {
    const { data } = await supabase
      .from('customers')
      .select('*')
      .order('name');
    if (data) setCustomers(data);
  };

  const addToCart = (material: Material) => {
    const existingItem = cart.find(item => item.material.id === material.id);
    
    if (existingItem) {
      setCart(cart.map(item =>
        item.material.id === material.id
          ? {
              ...item,
              quantity: item.quantity + 1,
              subtotal: (item.quantity + 1) * getPrice(material)
            }
          : item
      ));
    } else {
      setCart([...cart, {
        material,
        quantity: 1,
        subtotal: getPrice(material)
      }]);
    }
  };

  const getPrice = (material: Material): number => {
    if (selectedCustomer?.is_member) {
      return material.member_price;
    }
    return material.selling_price;
  };

  const updateQuantity = (materialId: string, quantity: number) => {
    if (quantity <= 0) {
      removeFromCart(materialId);
      return;
    }

    setCart(cart.map(item =>
      item.material.id === materialId
        ? {
            ...item,
            quantity,
            subtotal: quantity * getPrice(item.material)
          }
        : item
    ));
  };

  const removeFromCart = (materialId: string) => {
    setCart(cart.filter(item => item.material.id !== materialId));
  };

  const getTotal = () => {
    return cart.reduce((sum, item) => sum + item.subtotal, 0);
  };

  const getChange = () => {
    const paid = parseFloat(paidAmount) || 0;
    const total = getTotal();
    return Math.max(0, paid - total);
  };

  const handleCheckout = async () => {
    if (cart.length === 0) {
      alert('Keranjang kosong!');
      return;
    }

    const paid = parseFloat(paidAmount) || 0;
    const total = getTotal();

    if (paid < total) {
      alert('Jumlah bayar kurang!');
      return;
    }

    setLoading(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      // Generate invoice number
      const invoiceNumber = `INV-${Date.now()}`;

      // Create sale
      const { data: sale, error: saleError } = await supabase
        .from('sales')
        .insert({
          invoice_number: invoiceNumber,
          customer_id: selectedCustomer?.id,
          total_amount: total,
          paid_amount: paid,
          change_amount: getChange(),
          payment_method: 'cash',
          cashier_id: user?.id,
        })
        .select()
        .single();

      if (saleError) throw saleError;

      // Create sale items
      const saleItems = cart.map(item => ({
        sale_id: sale.id,
        material_id: item.material.id,
        quantity: item.quantity,
        unit_price: getPrice(item.material),
        subtotal: item.subtotal,
      }));

      const { error: itemsError } = await supabase
        .from('sales_items')
        .insert(saleItems);

      if (itemsError) throw itemsError;

      // Update inventory
      for (const item of cart) {
        // Update stock
        await supabase
          .from('materials')
          .update({
            stock_quantity: item.material.stock_quantity - item.quantity
          })
          .eq('id', item.material.id);

        // Create inventory movement
        await supabase
          .from('inventory_movements')
          .insert({
            material_id: item.material.id,
            movement_type: 'out',
            quantity: item.quantity,
            reference_type: 'sale',
            reference_id: sale.id,
            created_by: user?.id,
          });
      }

      alert(`Transaksi berhasil!\nNomor Invoice: ${invoiceNumber}\nKembalian: Rp ${getChange().toLocaleString('id-ID')}`);
      
      // Reset
      setCart([]);
      setSelectedCustomer(null);
      setPaidAmount('');
      loadMaterials(); // Refresh materials to update stock
    } catch (error) {
      console.error('Error:', error);
      alert('Terjadi kesalahan saat memproses transaksi');
    } finally {
      setLoading(false);
    }
  };

  const filteredMaterials = materials.filter(material =>
    material.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Header */}
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center">
          <h1 className="text-2xl font-bold text-gray-900">POS / Kasir</h1>
          <Link
            href="/dashboard"
            className="bg-gray-600 text-white px-4 py-2 rounded-md hover:bg-gray-700"
          >
            Kembali
          </Link>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Products Section */}
          <div className="lg:col-span-2 space-y-4">
            {/* Customer Selection */}
            <div className="bg-white p-4 rounded-lg shadow">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Pelanggan (Opsional)
              </label>
              <select
                value={selectedCustomer?.id || ''}
                onChange={(e) => {
                  const customer = customers.find(c => c.id === e.target.value);
                  setSelectedCustomer(customer || null);
                }}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Tanpa pelanggan</option>
                {customers.map(customer => (
                  <option key={customer.id} value={customer.id}>
                    {customer.name} {customer.is_member ? '(Member)' : ''}
                  </option>
                ))}
              </select>
            </div>

            {/* Search */}
            <div className="bg-white p-4 rounded-lg shadow">
              <input
                type="text"
                placeholder="Cari bahan..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Materials Grid */}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {filteredMaterials.map(material => (
                <button
                  key={material.id}
                  onClick={() => addToCart(material)}
                  className="bg-white p-4 rounded-lg shadow hover:shadow-lg transition-shadow text-left"
                  disabled={material.stock_quantity <= 0}
                >
                  <h3 className="font-semibold text-gray-900 mb-1">
                    {material.name}
                  </h3>
                  <p className="text-sm text-gray-600 mb-2">
                    Stok: {material.stock_quantity} {material.unit}
                  </p>
                  <p className="text-lg font-bold text-blue-600">
                    Rp {getPrice(material).toLocaleString('id-ID')}
                  </p>
                  {material.stock_quantity <= 0 && (
                    <p className="text-sm text-red-600 mt-1">Stok habis</p>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Cart Section */}
          <div className="space-y-4">
            <div className="bg-white p-4 rounded-lg shadow">
              <h2 className="text-xl font-bold text-gray-900 mb-4">
                Keranjang
              </h2>

              {cart.length === 0 ? (
                <p className="text-gray-500 text-center py-8">
                  Keranjang kosong
                </p>
              ) : (
                <div className="space-y-3">
                  {cart.map(item => (
                    <div
                      key={item.material.id}
                      className="flex items-center justify-between border-b pb-3"
                    >
                      <div className="flex-1">
                        <h4 className="font-medium text-gray-900">
                          {item.material.name}
                        </h4>
                        <p className="text-sm text-gray-600">
                          Rp {getPrice(item.material).toLocaleString('id-ID')} x {item.quantity}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          min="0"
                          value={item.quantity}
                          onChange={(e) => updateQuantity(item.material.id, parseInt(e.target.value) || 0)}
                          className="w-16 px-2 py-1 border border-gray-300 rounded text-center"
                        />
                        <button
                          onClick={() => removeFromCart(item.material.id)}
                          className="text-red-600 hover:text-red-800"
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {cart.length > 0 && (
                <div className="mt-4 space-y-3">
                  <div className="flex justify-between text-lg font-bold border-t pt-3">
                    <span>Total:</span>
                    <span>Rp {getTotal().toLocaleString('id-ID')}</span>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Jumlah Bayar
                    </label>
                    <input
                      type="number"
                      value={paidAmount}
                      onChange={(e) => setPaidAmount(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="0"
                    />
                  </div>

                  {paidAmount && parseFloat(paidAmount) >= getTotal() && (
                    <div className="bg-green-50 p-3 rounded">
                      <p className="text-sm text-gray-700">Kembalian:</p>
                      <p className="text-xl font-bold text-green-600">
                        Rp {getChange().toLocaleString('id-ID')}
                      </p>
                    </div>
                  )}

                  <button
                    onClick={handleCheckout}
                    disabled={loading || !paidAmount || parseFloat(paidAmount) < getTotal()}
                    className="w-full bg-blue-600 text-white py-3 px-4 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:bg-gray-400 font-semibold"
                  >
                    {loading ? 'Memproses...' : 'Bayar'}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
