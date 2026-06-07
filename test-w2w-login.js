require("dotenv").config();
const { chromium } = require("playwright");
const fs = require("fs");

async function run() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  await page.goto("https://www.whentowork.com/logins.htm");

  await page
    .locator('input[placeholder="username"]')
    .fill(process.env.W2W_USERNAME);
  await page
    .locator('input[placeholder="password"]')
    .fill(process.env.W2W_PASSWORD);

  await page.getByRole("button", { name: "SIGN IN", exact: true }).click();
  await page.waitForTimeout(5000);

  console.log("Logged in");

  // Click top Schedule tab
  await page.getByText("Schedule", { exact: true }).click();
  await page.waitForTimeout(3000);

  // Click Everyone's Schedule Month tab
  await page
    .locator("td")
    .filter({ hasText: /^Month$/ })
    .nth(1)
    .click();
  await page.waitForTimeout(5000);

  console.log("Current URL:", page.url());

  await page.screenshot({
    path: "everyone-month-schedule.png",
    fullPage: true,
  });

  fs.writeFileSync("everyone-month-schedule.html", await page.content());

  console.log("Saved everyone-month-schedule.png");
  console.log("Saved everyone-month-schedule.html");
}

run().catch(console.error);
