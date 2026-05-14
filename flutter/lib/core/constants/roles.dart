enum UserRole {
  admin,
  manager,
  staff,
  kasir,
  operator,
  user;

  static UserRole fromString(String value) {
    return UserRole.values.firstWhere(
      (r) => r.name == value,
      orElse: () => UserRole.user,
    );
  }
}

class RoleGroups {
  static const List<UserRole> adminOnly = [UserRole.admin, UserRole.manager];
  static const List<UserRole> fullStaff = [UserRole.admin, UserRole.manager, UserRole.staff];
  static const List<UserRole> frontOfHouse = [UserRole.admin, UserRole.manager, UserRole.staff, UserRole.kasir];
  static const List<UserRole> operational = [UserRole.admin, UserRole.manager, UserRole.staff, UserRole.kasir, UserRole.operator];
  static const List<UserRole> all = UserRole.values;
}
