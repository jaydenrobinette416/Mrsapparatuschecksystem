require("dotenv").config();
const { chromium } = require("playwright");
const fs = require("fs");

async function run() {
  const browser = await chromium.launch({
    headless: true
  });

  const page = await browser.newPage();

  page.setDefaultTimeout(30000);

  try {
    console.log("Opening WhenToWork...");

    await page.goto(
      "https://www.whentowork.com/logins.htm",
      {
        waitUntil: "domcontentloaded",
        timeout: 30000
      }
    );

    console.log("Entering username...");
    await page
      .locator('input[placeholder="username"]')
      .fill(process.env.W2W_USERNAME);

    console.log("Entering password...");
    await page
      .locator('input[placeholder="password"]')
      .fill(process.env.W2W_PASSWORD);

    console.log("Signing in...");
    await page
      .getByRole("button", {
        name: "SIGN IN",
        exact: true
      })
      .click();

    await page.waitForTimeout(5000);

    console.log("Opening Schedule...");
    await page
      .getByText("Schedule", {
        exact: true
      })
      .click();

    await page.waitForTimeout(3000);

    console.log("Opening Month view...");
    await page
      .locator("td")
      .filter({ hasText: /^Month$/ })
      .nth(1)
      .click();

    await page.waitForTimeout(5000);

    console.log("Current URL:", page.url());

    fs.writeFileSync(
      "everyone-month-schedule.html",
      await page.content()
    );

    console.log("Saved everyone-month-schedule.html");

    await page.screenshot({
      path: "everyone-month-schedule.png",
      fullPage: true
    });

    console.log("Saved screenshot");
  }
  catch (err) {
    console.error("LOGIN ERROR:", err);
    throw err;
  }
  finally {
    await browser.close();
    console.log("Browser closed");
  }
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
