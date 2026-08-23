import mongoose from "mongoose";

const orderSchema = new mongoose.Schema({
  userId: String,
  items: [{ sku: String, qty: Number, price: Number }],
  total: Number,
  status: String,
});

export const Order = mongoose.model("Order", orderSchema);
