const fs = require("fs");
const path = require("path");
const { MongoClient } = require("mongodb");

const MONGODB_URI = "PASTE_YOUR_MONGO_URL_HERE";

function parseCSV(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let insideQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const next = text[i + 1];

    if (char === '"' && insideQuotes && next === '"') {
      cell += '"';
      i++;
    } else if (char === '"') {
      insideQuotes = !insideQuotes;
    } else if (char === "," && !insideQuotes) {
      row.push(cell);
      cell = "";
    } else if ((char === "\n" || char === "\r") && !insideQuotes) {
      if (cell || row.length) {
        row.push(cell);
        rows.push(row);
        row = [];
        cell = "";
      }
    } else {
      cell += char;
    }
  }

  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }

  return rows;
}

async function run() {
  const csvPath = path.join(__dirname, "checklist.csv");
  const csv = fs.readFileSync(csvPath, "utf8");

  const rows = parseCSV(csv);
  const headers = rows.shift().map(h => h.trim());

  const docs = rows
    .filter(row => row.length > 1)
    .map((row, index) => {
      const item = {};
      headers.forEach((header, i) => {
        item[header] = row[i] || "";
      });

      return {
        base: String(item["Base"] || "").replace(".0", "").trim(),
        unit: String(item["Unit"] || "").trim(),
        section: String(item["Section"] || "").trim(),
        subsection: String(item["Subsection"] || "").trim(),
        shelf: String(item["Shelf"] || "").trim(),
        item: String(item["Item"] || "").trim(),
        type: String(item["Type"] || "TEXT").trim(),
        qty: String(item["Required Qty"] || "").trim(),
        subitems: String(item["Subitems"] || "").trim(),
        order: index + 1,
        active: true,
        createdAt: new Date()
      };
    })
    .filter(doc => doc.base && doc.unit && doc.item);

  const client = new MongoClient(MONGODB_URI);
  await client.connect();

  const db = client.db("ApparatusCheck");

  await db.collection("checkItems").deleteMany({});
  await db.collection("checkItems").insertMany(docs);

  console.log(`Imported ${docs.length} checklist items.`);

  await client.close();
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
