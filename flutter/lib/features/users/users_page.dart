import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:gemiprint/core/theme/app_theme.dart';
import 'package:gemiprint/core/constants/roles.dart';
import 'package:gemiprint/models/user.dart';
import 'package:gemiprint/providers/providers.dart';
import 'package:gemiprint/services/api_client.dart';
import 'package:gemiprint/widgets/confirm_dialog.dart';
import 'package:gemiprint/widgets/empty_state.dart';
import 'package:gemiprint/widgets/snackbar_helper.dart';

class UsersPage extends ConsumerStatefulWidget {
  const UsersPage({super.key});

  @override
  ConsumerState<UsersPage> createState() => _UsersPageState();
}

class _UsersPageState extends ConsumerState<UsersPage> {
  List<User> _users = [];
  bool _isLoading = true;

  @override
  void initState() {
    super.initState();
    _loadData();
  }

  Future<void> _loadData() async {
    setState(() => _isLoading = true);
    try {
      final data = await ref.read(usersServiceProvider).getAll();
      if (mounted) {
        setState(() {
          _users = data
              .map((j) => User.fromJson(j as Map<String, dynamic>))
              .toList();
          _isLoading = false;
        });
      }
    } catch (_) {
      if (mounted) {
        setState(() => _isLoading = false);
        showErrorSnackbar(context, 'Gagal memuat data user');
      }
    }
  }

  Future<void> _showCreateForm() async {
    final namaLengkapCtrl = TextEditingController();
    final namaPenggunaCtrl = TextEditingController();
    final emailCtrl = TextEditingController();
    final passwordCtrl = TextEditingController();
    UserRole selectedRole = UserRole.kasir;
    bool obscurePassword = true;

    final result = await showDialog<bool>(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setLocal) => AlertDialog(
          title: const Text('Tambah User Baru'),
          content: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                TextField(
                  controller: namaLengkapCtrl,
                  decoration: const InputDecoration(
                      labelText: 'Nama Lengkap', isDense: true),
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: namaPenggunaCtrl,
                  decoration: const InputDecoration(
                      labelText: 'Username *', isDense: true),
                  autocorrect: false,
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: emailCtrl,
                  decoration: const InputDecoration(
                      labelText: 'Email', isDense: true),
                  keyboardType: TextInputType.emailAddress,
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: passwordCtrl,
                  decoration: InputDecoration(
                    labelText: 'Password *',
                    isDense: true,
                    suffixIcon: IconButton(
                      icon: Icon(obscurePassword
                          ? Icons.visibility_off
                          : Icons.visibility),
                      onPressed: () =>
                          setLocal(() => obscurePassword = !obscurePassword),
                    ),
                  ),
                  obscureText: obscurePassword,
                ),
                const SizedBox(height: 12),
                DropdownButtonFormField<UserRole>(
                  value: selectedRole,
                  decoration:
                      const InputDecoration(labelText: 'Role', isDense: true),
                  items: UserRole.values
                      .map((r) => DropdownMenuItem(
                            value: r,
                            child: Text(r.name),
                          ))
                      .toList(),
                  onChanged: (v) => setLocal(() => selectedRole = v!),
                ),
              ],
            ),
          ),
          actions: [
            TextButton(
                onPressed: () => Navigator.pop(ctx),
                child: const Text('Batal')),
            ElevatedButton(
              onPressed: () async {
                final username = namaPenggunaCtrl.text.trim();
                final password = passwordCtrl.text;
                if (username.isEmpty || password.isEmpty) {
                  showErrorSnackbar(
                      ctx, 'Username dan password tidak boleh kosong');
                  return;
                }
                try {
                  await ref.read(usersServiceProvider).create({
                    'nama_pengguna': username,
                    'nama_lengkap': namaLengkapCtrl.text.trim().isEmpty
                        ? null
                        : namaLengkapCtrl.text.trim(),
                    'email': emailCtrl.text.trim().isEmpty
                        ? null
                        : emailCtrl.text.trim(),
                    'password': password,
                    'role': selectedRole.name,
                  });
                  if (ctx.mounted) Navigator.pop(ctx, true);
                } on ApiException catch (e) {
                  if (ctx.mounted) showErrorSnackbar(ctx, e.message);
                }
              },
              child: const Text('Buat User'),
            ),
          ],
        ),
      ),
    );

    namaLengkapCtrl.dispose();
    namaPenggunaCtrl.dispose();
    emailCtrl.dispose();
    passwordCtrl.dispose();

    if (result == true && mounted) {
      showSuccessSnackbar(context, 'User berhasil dibuat');
      _loadData();
    }
  }

  Future<void> _showChangePassword(User u) async {
    final newPasswordCtrl = TextEditingController();
    bool obscure = true;

    final result = await showDialog<bool>(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setLocal) => AlertDialog(
          title: Text('Ganti Password: ${u.displayName}'),
          content: TextField(
            controller: newPasswordCtrl,
            decoration: InputDecoration(
              labelText: 'Password Baru',
              isDense: true,
              suffixIcon: IconButton(
                icon: Icon(obscure ? Icons.visibility_off : Icons.visibility),
                onPressed: () => setLocal(() => obscure = !obscure),
              ),
            ),
            obscureText: obscure,
          ),
          actions: [
            TextButton(
                onPressed: () => Navigator.pop(ctx),
                child: const Text('Batal')),
            ElevatedButton(
              onPressed: () async {
                if (newPasswordCtrl.text.length < 6) {
                  showErrorSnackbar(ctx, 'Password minimal 6 karakter');
                  return;
                }
                try {
                  await ref.read(apiClientProvider).put(
                      '/api/passwords/${u.id}',
                      body: {'password': newPasswordCtrl.text});
                  if (ctx.mounted) Navigator.pop(ctx, true);
                } on ApiException catch (e) {
                  if (ctx.mounted) showErrorSnackbar(ctx, e.message);
                }
              },
              child: const Text('Ganti'),
            ),
          ],
        ),
      ),
    );
    newPasswordCtrl.dispose();
    if (result == true && mounted) {
      showSuccessSnackbar(context, 'Password berhasil diperbarui');
    }
  }

  Future<void> _toggleActive(User u) async {
    try {
      await ref
          .read(usersServiceProvider)
          .update(u.id, {'aktif': !u.isActive});
      if (mounted) {
        showSuccessSnackbar(
            context, u.isActive ? 'User dinonaktifkan' : 'User diaktifkan');
        _loadData();
      }
    } on ApiException catch (e) {
      if (mounted) showErrorSnackbar(context, e.message);
    }
  }

  Future<void> _changeRole(User u, UserRole newRole) async {
    try {
      await ref
          .read(usersServiceProvider)
          .update(u.id, {'role': newRole.name});
      if (mounted) {
        showSuccessSnackbar(context, 'Role diperbarui ke ${newRole.name}');
        _loadData();
      }
    } on ApiException catch (e) {
      if (mounted) showErrorSnackbar(context, e.message);
    }
  }

  Future<void> _deleteUser(User u) async {
    final ok = await showConfirmDialog(context,
        title: 'Hapus User',
        message: 'Hapus "${u.displayName}"?',
        isDangerous: true);
    if (!ok) return;
    try {
      await ref.read(usersServiceProvider).delete(u.id);
      if (mounted) {
        showSuccessSnackbar(context, 'User berhasil dihapus');
        _loadData();
      }
    } on ApiException catch (e) {
      if (mounted) showErrorSnackbar(context, e.message);
    }
  }

  Color _roleColor(UserRole role) {
    return switch (role) {
      UserRole.admin => AppColors.error,
      UserRole.manager => AppColors.pink,
      UserRole.staff => AppColors.primary,
      UserRole.kasir => AppColors.success,
      UserRole.operator => AppColors.warning,
      UserRole.user => Colors.grey,
    };
  }

  @override
  Widget build(BuildContext context) {
    return Stack(
      children: [
        _isLoading
            ? const Center(child: CircularProgressIndicator())
            : _users.isEmpty
                ? EmptyState(
                    icon: Icons.manage_accounts_rounded,
                    title: 'Belum ada user',
                    action: ElevatedButton.icon(
                      onPressed: _showCreateForm,
                      icon: const Icon(Icons.add, size: 18),
                      label: const Text('Tambah User'),
                    ),
                  )
                : RefreshIndicator(
                    onRefresh: _loadData,
                    child: ListView.separated(
                      padding: const EdgeInsets.fromLTRB(16, 16, 16, 80),
                      itemCount: _users.length,
                      separatorBuilder: (_, _) => const SizedBox(height: 8),
                      itemBuilder: (_, i) => _buildCard(_users[i]),
                    ),
                  ),
        Positioned(
          right: 16,
          bottom: 16,
          child: FloatingActionButton(
            onPressed: _showCreateForm,
            child: const Icon(Icons.person_add_rounded),
          ),
        ),
      ],
    );
  }

  Widget _buildCard(User u) {
    final color = _roleColor(u.role);
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Row(
          children: [
            CircleAvatar(
              backgroundColor: color.withValues(alpha: 0.15),
              child: Text(u.displayName[0].toUpperCase(),
                  style: TextStyle(color: color, fontWeight: FontWeight.bold)),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Flexible(
                        child: Text(u.displayName,
                            style: const TextStyle(
                                fontWeight: FontWeight.w600, fontSize: 15),
                            overflow: TextOverflow.ellipsis),
                      ),
                      const SizedBox(width: 6),
                      Container(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 6, vertical: 1),
                        decoration: BoxDecoration(
                          color: color.withValues(alpha: 0.15),
                          borderRadius: BorderRadius.circular(4),
                        ),
                        child: Text(u.role.name,
                            style: TextStyle(
                                color: color,
                                fontSize: 10,
                                fontWeight: FontWeight.w600)),
                      ),
                      if (!u.isActive) ...[
                        const SizedBox(width: 4),
                        Container(
                          padding: const EdgeInsets.symmetric(
                              horizontal: 6, vertical: 1),
                          decoration: BoxDecoration(
                            color: Colors.grey.shade200,
                            borderRadius: BorderRadius.circular(4),
                          ),
                          child: Text('Nonaktif',
                              style: TextStyle(
                                  color: Colors.grey.shade600,
                                  fontSize: 10)),
                        ),
                      ],
                    ],
                  ),
                  Text('@${u.namaPengguna}',
                      style: TextStyle(
                          fontSize: 12, color: Colors.grey.shade600)),
                ],
              ),
            ),
            PopupMenuButton<String>(
              onSelected: (action) {
                switch (action) {
                  case 'toggle':
                    _toggleActive(u);
                  case 'password':
                    _showChangePassword(u);
                  case 'delete':
                    _deleteUser(u);
                  default:
                    if (action.startsWith('role:')) {
                      _changeRole(u, UserRole.fromString(action.substring(5)));
                    }
                }
              },
              itemBuilder: (_) => [
                PopupMenuItem(
                    value: 'toggle',
                    child: Text(u.isActive ? 'Nonaktifkan' : 'Aktifkan')),
                const PopupMenuItem(
                    value: 'password', child: Text('Ganti Password')),
                const PopupMenuDivider(),
                ...UserRole.values.map((r) => PopupMenuItem(
                      value: 'role:${r.name}',
                      enabled: r != u.role,
                      child: Text('Role: ${r.name}'),
                    )),
                const PopupMenuDivider(),
                const PopupMenuItem(
                    value: 'delete',
                    child: Text('Hapus',
                        style: TextStyle(color: AppColors.error))),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
