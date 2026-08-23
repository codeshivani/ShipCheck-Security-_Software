import { Router } from "express";
import { exec } from "child_process";

export const toolsRouter = Router();

// VULNERABLE: the shell command comes straight from the request body and is
// passed to child_process.exec — arbitrary command execution.
toolsRouter.post("/run-diagnostic", (req, res) => {
  const cmd = req.body.command;
  exec(cmd, (err, stdout, stderr) => {
    if (err) return res.status(500).json({ error: stderr });
    res.json({ output: stdout });
  });
});

// VULNERABLE: a "formula" field from the request is eval'd directly to
// compute a derived metric.
toolsRouter.post("/calc", (req, res) => {
  const formula = req.query.formula;
  const result = eval(formula as string);
  res.json({ result });
});

// Safe comparison route: the command run here is a fixed constant, not
// derived from the request, so ShipCheck should NOT flag this one.
toolsRouter.get("/uptime", (req, res) => {
  exec("uptime", (err, stdout) => {
    res.json({ output: stdout });
  });
});
