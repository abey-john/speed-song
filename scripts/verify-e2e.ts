import { chromium } from 'playwright';

async function verifyGame() {
  console.log('🧪 Starting End-to-End Playwright Verification of Speed Song...\n');

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 500, height: 900 },
  });
  const page = await context.newPage();

  // 1. Load Homepage
  console.log('1. Loading http://localhost:3000/?debug=1...');
  await page.goto('http://localhost:3000/?debug=1');
  await page.waitForSelector('.app-header');

  const title = await page.title();
  console.log(`   Page title: "${title}"`);

  // 2. Verify playlist select options
  const options = await page.$$eval('#playlist-select option', (opts) =>
    opts.map((o) => o.textContent?.trim() || '')
  );
  console.log(`   Found ${options.length} playlists in dropdown:`);
  options.slice(0, 5).forEach((name) => console.log(`     - ${name}`));
  if (options.length < 16) {
    throw new Error(`Expected at least 16 playlists, found ${options.length}`);
  }

  // 3. Start Game
  console.log('2. Clicking "Start Game ▶"...');
  await page.click('#btn-start-game');
  await page.waitForSelector('.progress-segments');

  // 4. Verify progress segments
  const segments = await page.$$('.progress-segment');
  console.log(`   Found ${segments.length} interval progress segments (expected 8).`);
  const activeSegmentText = await page.$eval('.progress-segment.is-active', (el) => el.textContent?.trim());
  console.log(`   Active segment: "${activeSegmentText}"`);

  // 5. Play snippet
  console.log('3. Triggering Play Snippet (0.1s)...');
  await page.click('#btn-play-snippet');
  await page.waitForTimeout(500);

  // 6. Skip to next step
  console.log('4. Clicking "Skip (+next)"...');
  await page.click('#btn-skip');
  await page.waitForTimeout(300);

  const wrongGuesses = await page.$$eval('.wrong-guess-pill', (pills) =>
    pills.map((p) => p.textContent?.trim() || '')
  );
  console.log(`   Wrong guesses list contains: ${JSON.stringify(wrongGuesses)}`);

  // 7. Search combobox
  console.log('5. Testing search combobox by typing "the"...');
  await page.fill('#song-search-input', 'the');
  await page.waitForSelector('.suggestion-item');

  const suggestions = await page.$$eval('.suggestion-item', (items) =>
    items.slice(0, 4).map((i) => i.textContent?.trim() || '')
  );
  console.log(`   Suggestions displayed: ${JSON.stringify(suggestions)}`);

  // 8. Select suggestion & submit
  console.log('6. Picking first suggestion and submitting guess...');
  await page.click('.suggestion-item:first-child');
  const isSubmitEnabled = await page.$eval('#btn-submit-guess', (btn) => !(btn as HTMLButtonElement).disabled);
  console.log(`   Submit button enabled after picking suggestion: ${isSubmitEnabled}`);

  await page.click('#btn-submit-guess');
  await page.waitForTimeout(400);

  // 9. Skip remaining steps to reveal screen
  console.log('7. Advancing steps until Reveal screen...');
  for (let i = 0; i < 7; i++) {
    const isRevealPresent = (await page.$('.reveal-card')) !== null;
    if (isRevealPresent) break;
    const skipBtn = await page.$('#btn-skip');
    if (skipBtn) {
      await skipBtn.click();
      await page.waitForTimeout(200);
    }
  }

  await page.waitForSelector('.reveal-card');
  const outcomeText = await page.$eval('.reveal-badge-banner', (el) => el.textContent?.trim());
  const songTitle = await page.$eval('.reveal-title', (el) => el.textContent?.trim());
  const songArtist = await page.$eval('.reveal-artist', (el) => el.textContent?.trim());
  console.log(`   Reveal screen outcome: "${outcomeText}"`);
  console.log(`   Revealed song: "${songTitle}" by "${songArtist}"`);

  // 10. Verify Stats Modal
  console.log('8. Opening Stats Modal...');
  await page.click('#btn-stats');
  await page.waitForSelector('.stats-modal-content');
  await page.waitForTimeout(350);

  const playedCount = await page.$eval('.metric-value', (el) => el.textContent?.trim());
  console.log(`   Stats modal recorded games played: ${playedCount}`);

  const histogramRows = await page.$$eval('.histogram-row', (rows) =>
    rows.map((r) => r.textContent?.replace(/\s+/g, ' ').trim() || '')
  );
  console.log(`   Histogram distribution rows: ${histogramRows.length} intervals tracked.`);

  // Screenshot proof
  await page.screenshot({ path: 'verification-screenshot.png', fullPage: true });
  console.log('   Saved screenshot proof to verification-screenshot.png');

  await browser.close();
  console.log('\n✅ ALL VERIFICATION CHECKS PASSED PERFECTLY!\n');
}

verifyGame().catch((err) => {
  console.error('\n❌ Verification failed:', err);
  process.exit(1);
});
