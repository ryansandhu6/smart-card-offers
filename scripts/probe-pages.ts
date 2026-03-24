const URLS = [
  // Bank listing pages (to discover correct product URLs)
  "https://www.scotiabank.com/ca/en/personal/credit-cards.html",
  "https://www.bmo.com/en-ca/main/personal/credit-cards/",
  "https://www.rbcroyalbank.com/credit-cards/index.html",
  "https://www.cibc.com/en/personal-banking/credit-cards.html",
  // Aggregators
  "https://www.flytrippers.com/best-credit-cards-canada",
  "https://www.ratehub.ca/credit-cards",
];

const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
  "Accept-Language": "en-CA,en;q=0.9",
  Accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function probeUrl(url: string): Promise<void> {
  console.log("=".repeat(80));
  console.log(`URL: ${url}`);

  try {
    const response = await fetch(url, { headers: HEADERS });
    const text = await response.text();
    const byteCount = new TextEncoder().encode(text).length;

    console.log(`HTTP Status: ${response.status} ${response.statusText}`);
    console.log(`Total Bytes: ${byteCount}`);
    console.log(`\n--- First 3000 characters of HTML ---\n`);
    console.log(text.slice(0, 5000));
  } catch (err: any) {
    console.log(`ERROR: ${err.message}`);
  }
}

(async () => {
  for (let i = 0; i < URLS.length; i++) {
    await probeUrl(URLS[i]);
    if (i < URLS.length - 1) {
      console.log("\n[Waiting 2 seconds...]\n");
      await sleep(2000);
    }
  }
  console.log("\n" + "=".repeat(80));
  console.log("Done.");
})();
