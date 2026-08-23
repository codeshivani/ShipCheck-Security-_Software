import express from "express";
import { userRouter } from "./routes/users";
import { authRouter } from "./routes/auth";

const app = express();
app.use(express.json());

app.use("/auth", authRouter);
app.use("/users", userRouter);

app.listen(3000, () => {
  console.log("vulnerable-auth demo listening on :3000");
});
