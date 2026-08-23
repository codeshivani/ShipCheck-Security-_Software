import express from "express";
import { toolsRouter } from "./routes/tools";
import { reportsRouter } from "./routes/reports";

const app = express();
app.use(express.json());

app.use("/tools", toolsRouter);
app.use("/reports", reportsRouter);

app.listen(3002, () => {
  console.log("vulnerable-exec demo listening on :3002");
});
