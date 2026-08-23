import { Router } from "express";
import { execFile } from "child_process";

export const toolsRouter = Router();

const DIAGNOSTIC_COMMANDS: Record<string, { command: string; args: string[] }> = {
  uptime: { command: process.platform === "win32" ? "cmd.exe" : "uptime", args: process.platform === "win32" ? ["/c", "echo %DATE% %TIME%"] : [] },
  hostname: { command: process.platform === "win32" ? "hostname.exe" : "hostname", args: [] },
};

toolsRouter.post("/run-diagnostic", (req, res) => {
  const requested = String(req.body?.command ?? "").trim().toLowerCase();
  const selected = DIAGNOSTIC_COMMANDS[requested];
  if (!selected) return res.status(400).json({ error: "Unsupported diagnostic command" });

  execFile(selected.command, selected.args, { shell: false, timeout: 5000 }, (err, stdout, stderr) => {
    if (err) return res.status(500).json({ error: stderr || "Diagnostic failed" });
    res.json({ output: stdout });
  });
});

toolsRouter.post("/calc", (req, res) => {
  const expression = String(req.body?.expression ?? "").trim();
  if (!/^-?\d+(?:\.\d+)?\s*[+\-*/]\s*-?\d+(?:\.\d+)?$/.test(expression)) {
    return res.status(400).json({ error: "Only simple numeric arithmetic is supported" });
  }
  const match = expression.match(/^(-?\d+(?:\.\d+)?)\s*([+\-*/])\s*(-?\d+(?:\.\d+)?)$/);
  if (!match) return res.status(400).json({ error: "Invalid expression" });
  const left = Number(match[1]);
  const right = Number(match[3]);
  const op = match[2];
  if (op === "/" && right === 0) return res.status(400).json({ error: "Division by zero" });
  const result = op === "+" ? left + right : op === "-" ? left - right : op === "*" ? left * right : left / right;
  res.json({ result });
});

toolsRouter.get("/uptime", (req, res) => {
  execFile(process.platform === "win32" ? "cmd.exe" : "uptime", process.platform === "win32" ? ["/c", "echo %DATE% %TIME%"] : [], { shell: false }, (err, stdout) => {
    if (err) return res.status(500).json({ error: "Unable to read uptime" });
    res.json({ output: stdout });
  });
});
