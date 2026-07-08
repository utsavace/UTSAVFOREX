import type { Express } from "express";

export function registerFundingTest(app: Express) {
  app.get("/api/funding-test", async (req, res) => {
    res.json({
      ok: true,
      message: "Funding test placeholder. Please paste the actual code or let me know to write a custom implementation!",
    });
  });
}
