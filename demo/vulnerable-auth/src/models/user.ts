import mongoose from "mongoose";

const userSchema = new mongoose.Schema({
  email: String,
  phone: String,
  role: { type: String, default: "user" },
  passwordHash: String,
});

export const User = mongoose.model("User", userSchema);
