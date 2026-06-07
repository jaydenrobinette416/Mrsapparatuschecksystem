const fs = require("fs");
const cheerio = require("cheerio");

const html = fs.readFileSync("everyone-month-schedule.html", "utf8");
const $ = cheerio.load(html);

const monthTitle = $(".titleBox").first().text().trim(); // June 2026
const [monthName, yearText] = monthTitle.split(/\s+/);

const monthNumber = new Date(`${monthName} 1, ${yearText}`).getMonth() + 1;
const year = Number(yearText);

const shifts = [];

let currentDates = [];

$("table").each((i, table) => {
  const cells = $(table).find("td");

  const dateCells = cells.filter(".dnum");

  if (dateCells.length > 0) {
    currentDates = [];

    dateCells.each((index, cell) => {
      const day = Number($(cell).text().trim());

      if (day) {
        currentDates.push({
          day,
          date: `${year}-${String(monthNumber).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
        });
      } else {
        currentDates.push(null);
      }
    });

    return;
  }

  const shiftCells = cells.filter(".weekpubback");

  if (shiftCells.length > 0 && currentDates.length > 0) {
    shiftCells.each((index, cell) => {
      const dateInfo = currentDates[index];

      if (!dateInfo) return;

      const cellEl = $(cell);

      cellEl.find(".shiftgroup").each((shiftIndex, groupEl) => {
        const group = $(groupEl);
        const shiftName = group.prev(".skh").text().trim();
        const raw = group.text().replace(/\s+/g, " ").trim();

        const match = raw.match(/^(.+?\s*-\s*.+?)\s+(.+)$/);

        if (!match) return;

        shifts.push({
          date: dateInfo.date,
          day: dateInfo.day,
          shift: shiftName,
          time: match[1].trim(),
          employee: match[2].trim(),
          unassigned: match[2].includes("Unassigned"),
        });
      });
    });
  }
});

console.log(JSON.stringify(shifts, null, 2));

fs.writeFileSync("schedule-data.json", JSON.stringify(shifts, null, 2));

console.log(`Found ${shifts.length} shifts`);
console.log("Saved schedule-data.json");
