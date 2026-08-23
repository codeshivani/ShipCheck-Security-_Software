import express from "express";
import { orderRouter } from "./routes/orders";
import { productRouter } from "./routes/products";

const app = express();
app.use(express.json());

app.use("/orders", orderRouter);
app.use("/products", productRouter);

app.listen(3001, () => {
  console.log("vulnerable-ecommerce demo listening on :3001");
});
