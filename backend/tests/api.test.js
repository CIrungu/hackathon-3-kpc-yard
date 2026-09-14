import request from "supertest";
import app from "../src/app.js";
import { seedYard } from "../src/services/seed.js";

let gateToken;
let managerToken;
let truckToken;

describe("REST API Surface", () => {
  beforeAll(async () => {
    await seedYard();
  });

  test("GET /api/health returns sUP state", async () => {
    const res = await request(app).get("/api/health");
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe("UP");
  });

  test("issues role tokens via /auth/demo", async () => {
    const gate = await request(app).post("/api/auth/demo").send({ role: "gate-officer", name: "Gate Ops" });
    expect(gate.status).toBe(200);
    gateToken = gate.body.data.token;

    const mgr = await request(app).post("/api/auth/demo").send({ role: "depot-manager", name: "Manager" });
    managerToken = mgr.body.data.token;
  });

  test("rejects gate entry without auth", async () => {
    const res = await request(app).post("/api/gate/entry").send({ regNo: "KCA 123X" });
    expect(res.status).toBe(401);
  });

  test("full ANPR → token → bay allocation journey", async () => {
    await request(app).post("/api/gate/entry")
      .set("Authorization", `Bearer ${gateToken}`)
      .send({ regNo: "KKH 135E", depot: "MBA" })
      .expect(201)
      .then((res) => {
        expect(res.body.data.token).toMatch(/^KPC-MBA-\d{8}-\d+Z$/);
        truckToken = res.body.data.token;
      });

    const scan = await request(app)
      .post("/api/checkpoints/scan")
      .set("Authorization", `Bearer ${gateToken}`)
      .send({ token: truckToken, checkpoint: "WEIGHBRIDGE" });
    expect(scan.status).toBe(200);
    expect(scan.body.data.allocation.assignment.bayId).toBe("G1");
  });

  test("control-plane metrics are manager-only", async () => {
    const denied = await request(app).get("/api/control-plane/metrics");
    expect(denied.status).toBe(401);

    const ok = await request(app)
      .get("/api/control-plane/metrics")
      .set("Authorization", `Bearer ${managerToken}`);
    expect(ok.status).toBe(200);
    expect(ok.body.data.kpis).toBeDefined();
    expect(ok.body.data.kpis.demurrageRatePerHourKes).toBeGreaterThan(0);
  });

  test("driver can look up their own token", async () => {
    const res = await request(app)
      .get(`/api/driver/${truckToken}`)
      .set("Authorization", `Bearer ${managerToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.token).toBe(truckToken);
  });
});