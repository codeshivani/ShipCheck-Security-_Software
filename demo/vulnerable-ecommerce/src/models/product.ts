import mongoose from "mongoose";

const productSchema = new mongoose.Schema({
  sku: String,
  name: String,
  price: Number,
  inventory: Number,
  published: Boolean,
});

export const Product = mongoose.model("Product", productSchema);
