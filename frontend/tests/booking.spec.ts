import { expect, test } from "@playwright/test";

const backend = process.env.TEST_API_URL ?? "http://localhost:8000";
const date = "2099-12-30";

test("create, reject conflict, find slot, and cancel using the real API", async ({ page, request }) => {
  const roomsResponse = await request.get(`${backend}/api/rooms`);
  expect(roomsResponse.ok()).toBeTruthy();
  const rooms = await roomsResponse.json();
  const roomId = rooms[0].id as number;
  const title = `Browser test ${Date.now()}`;
  const ownedIds: number[] = [];
  const created = await request.post(`${backend}/api/bookings`, { data: {
    room_id: roomId, title, date, start_time: "10:00", end_time: "11:00",
  } });
  expect(created.status()).toBe(201);
  ownedIds.push((await created.json()).booking.id);

  try {
    await page.goto("/");
    await page.getByLabel("Selected date").fill(date);
    await page.getByRole("button", { name: "New booking", exact: true }).click();
    let dialog = page.getByRole("dialog");
    await dialog.getByLabel("Room", { exact: true }).selectOption(String(roomId));
    await dialog.getByLabel("Meeting title").fill(`Conflict ${title}`);
    await dialog.getByLabel("Start time").fill("10:30");
    await dialog.getByLabel("End time").fill("11:30");
    await dialog.getByRole("button", { name: "Create booking" }).click();
    await expect(page.locator(".toast-error")).toContainText(`Conflicts with "${title}"`);
    await dialog.getByRole("button", { name: "Close dialog" }).click();

    const finder = page.getByRole("region", { name: "Next available slot" });
    await finder.getByLabel("Room", { exact: true }).selectOption(String(roomId));
    await finder.getByRole("button", { name: "Find slot" }).click();
    await expect(finder).toContainText("09:00 to 09:45");
    await finder.getByRole("button", { name: "Book this slot" }).click();
    dialog = page.getByRole("dialog");
    await dialog.getByLabel("Meeting title").fill(`New ${title}`);
    const responsePromise = page.waitForResponse((response) =>
      response.url().endsWith("/api/bookings") && response.request().method() === "POST",
    );
    await dialog.getByRole("button", { name: "Create booking" }).click();
    const response = await responsePromise;
    expect(response.status()).toBe(201);
    ownedIds.push((await response.json()).booking.id);
    await expect(page.locator(".toast-success").filter({ hasText: `Booking "New ${title}" created.` })).toBeVisible();
    await page.getByRole("button", { name: `Cancel New ${title}`, exact: true }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Cancel booking", exact: true }).click();
    await expect(page.locator(".toast-success").filter({ hasText: `Booking "New ${title}" cancelled.` })).toBeVisible();
    await expect(page.getByRole("button", { name: `Cancel New ${title}`, exact: true })).toHaveCount(0);
  } finally {
    for (const id of ownedIds) await request.delete(`${backend}/api/bookings/${id}`);
  }
});

test("invalid form is rejected before a POST request", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "New booking", exact: true }).click();
  let posts = 0;
  page.on("request", (request) => {
    if (request.method() === "POST" && request.url().endsWith("/api/bookings")) posts++;
  });
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Meeting title").fill("Invalid range");
  await dialog.getByLabel("Start time").fill("11:00");
  await dialog.getByLabel("End time").fill("10:00");
  await dialog.getByRole("button", { name: "Create booking" }).click();
  await expect(dialog.getByRole("alert")).toContainText("End time must be later");
  expect(posts).toBe(0);
});

test("server errors show the actual backend message", async ({ page }) => {
  await page.route("**/api/rooms", (route) => route.fulfill({
    status: 500, contentType: "application/json",
    body: JSON.stringify({ message: "The database is temporarily unavailable. Please try again." }),
  }));
  await page.goto("/");
  await expect(page.locator(".toast-error")).toContainText("The database is temporarily unavailable.");
  await expect(page.getByRole("heading", { name: "Schedule unavailable" })).toBeVisible();
});

for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }, { width: 320, height: 740 }]) {
  test(`layout and dialog at ${viewport.width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize(viewport);
    await page.goto("/");
    await expect(page.getByRole("button", { name: "New booking", exact: true })).toBeEnabled();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
    await page.screenshot({ path: testInfo.outputPath(`schedule-${viewport.width}.png`), fullPage: true });
    await page.getByRole("button", { name: "New booking", exact: true }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
    await page.screenshot({ path: testInfo.outputPath(`dialog-${viewport.width}.png`), fullPage: true });
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });
}