const express = require("express");
const cors = require("cors");
const { MongoClient } = require("mongodb");
require("dotenv").config();

const app = express();

app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;
const MONGODB_URI = process.env.MONGODB_URI;

let db;

async function connectDB() {
  if (!MONGODB_URI) {
    throw new Error("Missing MONGODB_URI environment variable");
  }

  const client = new MongoClient(MONGODB_URI);
  await client.connect();

  db = client.db("ApparatusCheck");
  console.log("Connected to MongoDB");
}

app.get("/", (req, res) => {
  res.json({
    ok: true,
    message: "Apparatus Check API is running"
  });
});

app.get("/api/test-db", async (req, res) => {
  try {
    const collections = await db.listCollections().toArray();
    res.json({
      ok: true,
      database: "ApparatusCheck",
      collections: collections.map(c => c.name)
    });
  } catch (err) {
    res.status(500).json({
      ok: false,
      error: err.message
    });
  }
});

connectDB()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  })
  .catch(err => {
    console.error("Failed to connect:", err.message);
    process.exit(1);
  });
