import type { Express } from "express";

export function registerScoreBacktest(app: Express) {
  app.get("/api/score-backtest", async (req, res) => {
    res.json({
      ok: false,
      error: "Score backtest disabled due to legacy strategy refactor."
    });
  });
}
