# DealRadar demo video — script and shot list

Length: about 2 min 30 s. 1920×1080, English voiceover, smooth slide/cross-fade transitions, slow zoom on every scene.
Live app: https://dealradar.embarko.app

| # | Scene | Approx. time | Voiceover |
|---|-------|--------------|-----------|
| 0 | Title card | 0:00–0:05 | (music only) |
| 1 | Home page | 0:05–0:28 | Hi, this is DealRadar, a price tracker for Indian shoppers. Paste any product link or just type a product name, and DealRadar compares prices across Amazon, Flipkart, Myntra, Croma and twenty-plus stores, shows the full price history, finds working coupons, and alerts you on email, WhatsApp or Telegram the moment the price drops. |
| 2 | Product page: price history, Deal Score, Compare prices | 0:28–0:48 | Let's see it live. I'll paste an Amazon link, and in seconds we get the price history, a Deal Score, and the same product on other stores. Here it's cheaper on Flipkart. |
| 3 | Price drop alert → Telegram confirmation | 0:48–1:02 | I'll set a price drop alert and choose Telegram. The confirmation is already on Telegram, sent through viaSocket. |
| 4 | Browser extension on a store page (NEW) | 1:02–1:32 | And you don't even have to come to DealRadar. With the DealRadar browser extension, the moment you open a product on Amazon, Flipkart or any supported store, it opens by itself and fetches the price you are looking at, the same product on other stores, and the lowest it has ever been. If the price is right, go ahead and buy. If you'd rather wait, set a price alert right there with one click, and DealRadar will message you when it drops. |
| 5 | Automation page: viaSocket Connect | 1:32–1:50 | All the messaging runs on viaSocket. Gmail, WhatsApp Business and our Telegram bot are each connected with one click through the viaSocket Connect popup. No API keys, no OAuth code, no webhook servers to build. |
| 6 | Code editor: viasocket.ts and flows.ts | 1:50–2:10 | In the code, it's the viaSocket SDK. These few lines describe the apps we use. This one function creates the automation that checks prices every fifteen minutes and sends the alerts through the connected Gmail, WhatsApp and Telegram. |
| 7 | Embarko deploy | 2:10–2:25 | Hosting is on Embarko. We upload the project, Embarko builds it and puts it live in a couple of minutes. Every change you see here is one deploy. No servers to set up. |
| 8 | Closing card | 2:25–2:32 | DealRadar: built with viaSocket for the integrations, hosted on Embarko. Never overpay online again. |

## Shot list

1. **Home** (signed out): slow scroll over "Never overpay online again", the flipping WhatsApp / Telegram / Email logo, and the "24 Indian stores" counter.
2. **Product**: paste the Amazon link into the search box, click "Check price", then scroll to the price history chart and the Compare prices table (one store marked lowest).
3. **Alert**: in Price Drop Alert keep "Any drop", tick Telegram, click "Track price", show the "You are tracking this price ✓" confirmation and the Open Telegram button; cut to the Telegram chat showing "🎯 Price tracking started!".
4. **Extension**: open a product on Amazon. The DealRadar panel slides in by itself with the price you're seeing, store tiles (Lowest tag), price history low, and "Near you" quick-commerce prices for the pincode. Hover "Buy now", then click "Set alert" and show the confirmation.
5. **Automation**: account menu → Automation. Show the Gmail, WhatsApp and Telegram cards with their Connect buttons; click Connect so the viaSocket Connect popup opens, then close it.
6. **Code**: editor view of `src/lib/viasocket.ts` (GMAIL / WHATSAPP / TELEGRAM blocks) then `src/lib/flows.ts` (the 15-minute price-check automation), slow scroll.
7. **Deploy**: terminal with the Embarko deploy request and the "Live" result, access key masked; then the deployments list.
8. **Closing card**: logo, "Built with viaSocket · Hosted on Embarko", URL.
