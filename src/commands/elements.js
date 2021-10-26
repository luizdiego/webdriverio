
export async function waitForElementAndClick(timeout = browser.config.waitforTimeout) {
  try {
    await this.waitForDisplayed({
      timeout,
    });
    await this.waitForClickable({
      timeout,
    });
    await this.click();

    return true;
  } catch {
    return false;
  }
}
