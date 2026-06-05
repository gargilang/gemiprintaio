import { AuthGuardError } from "../auth-guard-error";
import { toGuardResponse } from "../with-role-guard";

describe("toGuardResponse", () => {
  test("AuthGuardError 403 → response 403", async () => {
    const res = toGuardResponse(new AuthGuardError("Forbidden", 403));
    expect(res?.status).toBe(403);
  });

  test("AuthGuardError 401 → response 401", async () => {
    const res = toGuardResponse(new AuthGuardError("Unauthorized", 401));
    expect(res?.status).toBe(401);
  });

  test("error biasa → null (bukan guard error)", () => {
    expect(toGuardResponse(new Error("lain"))).toBeNull();
  });
});
