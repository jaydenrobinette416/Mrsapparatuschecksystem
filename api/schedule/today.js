import { MongoClient } from "mongodb";

const client = new MongoClient(process.env.MONGODB_URI);

export default async function handler(req, res) {
  try {
    await client.connect();

    const db = client.db("ApparatusCheck");
    const schedules = db.collection("schedules");

    const today = new Date().toISOString().slice(0, 10);

    const shifts = await schedules
      .find({ date: today })
      .toArray();

    res.status(200).json({
      success: true,
      date: today,
      shifts
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
}
