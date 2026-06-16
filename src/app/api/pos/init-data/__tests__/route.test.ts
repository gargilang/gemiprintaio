jest.mock("@/lib/services/pos-service", () => ({
  getPOSInitData: jest.fn(),
}));

import { GET } from "../route";
import { getPOSInitData } from "@/lib/services/pos-service";

describe("GET /api/pos/init-data", () => {
  beforeEach(() => jest.clearAllMocks());

  test("menyertakan subkontraktor di respons", async () => {
    (getPOSInitData as jest.Mock).mockResolvedValue({
      customers: [{ id: "c1" }],
      materials: [{ id: "m1" }],
      sales: [],
      subkontraktor: [{ id: "v1", nama_perusahaan: "CV Rekanan" }],
    });
    const res = await GET();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.subkontraktor).toEqual([
      { id: "v1", nama_perusahaan: "CV Rekanan" },
    ]);
  });
});
