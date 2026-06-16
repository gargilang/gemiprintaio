import 'package:flutter/material.dart';
import 'package:gemiprint/core/theme/app_theme.dart';
import 'package:gemiprint/features/pos/pos_calc.dart';
import 'package:gemiprint/models/material_item.dart';

class ProductGrid extends StatelessWidget {
  final List<MaterialItem> materials;
  final List<String> categories;
  final String categoryFilter;
  final bool isMember;
  final int cartCount;
  final double cartTotal;
  final ValueChanged<String> onSearch;
  final ValueChanged<String> onCategory;
  final void Function(MaterialItem) onTapMaterial;
  final VoidCallback onTapMaklon;
  final VoidCallback onOpenCart;

  const ProductGrid({
    super.key,
    required this.materials,
    required this.categories,
    required this.categoryFilter,
    required this.isMember,
    required this.cartCount,
    required this.cartTotal,
    required this.onSearch,
    required this.onCategory,
    required this.onTapMaterial,
    required this.onTapMaklon,
    required this.onOpenCart,
  });

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(12, 8, 12, 4),
          child: TextField(
            decoration: const InputDecoration(
              hintText: 'Cari barang...',
              prefixIcon: Icon(Icons.search),
              isDense: true,
            ),
            onChanged: onSearch,
          ),
        ),
        SizedBox(
          height: 40,
          child: ListView(
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.symmetric(horizontal: 12),
            children: [
              _chip(context, 'Semua', 'ALL'),
              ...categories.map((c) => _chip(context, c, c)),
            ],
          ),
        ),
        Expanded(
          child: GridView.builder(
            padding: const EdgeInsets.all(12),
            gridDelegate:
                const SliverGridDelegateWithFixedCrossAxisCount(
              crossAxisCount: 2,
              crossAxisSpacing: 8,
              mainAxisSpacing: 8,
              childAspectRatio: 1.5,
            ),
            itemCount: materials.length + 1,
            itemBuilder: (_, i) {
              if (i == materials.length) return _maklonTile();
              return _card(materials[i]);
            },
          ),
        ),
        if (cartCount > 0) _bottomBar(),
      ],
    );
  }

  Widget _chip(BuildContext context, String label, String value) {
    final sel = categoryFilter == value;
    return Padding(
      padding: const EdgeInsets.only(right: 8),
      child: FilterChip(
        label: Text(label,
            style: TextStyle(
                fontSize: 12,
                color: sel ? Colors.white : AppColors.primaryDark)),
        selected: sel,
        showCheckmark: false,
        selectedColor: AppColors.primary,
        backgroundColor: Colors.white,
        onSelected: (_) => onCategory(value),
      ),
    );
  }

  Widget _card(MaterialItem m) {
    final price = m.harga.isNotEmpty
        ? m.harga.firstWhere((p) => p.isDefault, orElse: () => m.harga.first)
        : null;
    final dim = m.dimensiRequired;
    return GestureDetector(
      onTap: () => onTapMaterial(m),
      child: Container(
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(10),
          border: Border.all(color: Colors.grey.shade200),
        ),
        padding: const EdgeInsets.all(8),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(m.nama,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                          fontWeight: FontWeight.w600, fontSize: 12)),
                ),
                if (dim)
                  Container(
                    padding:
                        const EdgeInsets.symmetric(horizontal: 4, vertical: 1),
                    decoration: BoxDecoration(
                      color: Colors.blue.shade50,
                      borderRadius: BorderRadius.circular(4),
                    ),
                    child: Text('m²',
                        style: TextStyle(
                            fontSize: 8, color: Colors.blue.shade700)),
                  ),
              ],
            ),
            const Spacer(),
            if (price != null)
              Text(
                'Rp ${formatPosUnitPrice(price.hargaUntuk(isMember: isMember))}'
                '${dim ? '/m²' : ''}',
                style: const TextStyle(
                    color: AppColors.primary,
                    fontWeight: FontWeight.bold,
                    fontSize: 13),
              ),
          ],
        ),
      ),
    );
  }

  Widget _maklonTile() {
    return GestureDetector(
      onTap: onTapMaklon,
      child: Container(
        decoration: BoxDecoration(
          color: Colors.purple.shade50,
          borderRadius: BorderRadius.circular(10),
          border: Border.all(color: Colors.purple.shade200),
        ),
        padding: const EdgeInsets.all(8),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Row(
              children: [
                Icon(Icons.handyman_outlined,
                    size: 16, color: Colors.purple.shade400),
                const SizedBox(width: 4),
                Text('Maklon',
                    style: TextStyle(
                        fontWeight: FontWeight.w700,
                        color: Colors.purple.shade700)),
              ],
            ),
            Text('Subkontrak',
                style: TextStyle(fontSize: 11, color: Colors.purple.shade400)),
          ],
        ),
      ),
    );
  }

  Widget _bottomBar() {
    return SafeArea(
      top: false,
      child: GestureDetector(
        onTap: onOpenCart,
        child: Container(
          margin: const EdgeInsets.all(12),
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
          decoration: BoxDecoration(
            color: AppColors.primaryDark,
            borderRadius: BorderRadius.circular(16),
          ),
          child: Row(
            children: [
              Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('$cartCount item',
                      style: const TextStyle(
                          color: Colors.white70, fontSize: 11)),
                  Text('Rp ${formatPosUnitPrice(cartTotal)}',
                      style: const TextStyle(
                          color: Colors.white,
                          fontWeight: FontWeight.bold,
                          fontSize: 15)),
                ],
              ),
              const Spacer(),
              Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                decoration: BoxDecoration(
                  color: AppColors.primary,
                  borderRadius: BorderRadius.circular(9),
                ),
                child: const Text('Lihat',
                    style: TextStyle(
                        color: Colors.white, fontWeight: FontWeight.bold)),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
