# Publisher CDN refresh - 2026-09-14

The requested CDN community directory denies listing. Public publisher GMS indexes at https://api.gms.moontontech.com/api/gms/source/2713644/2766683 (heroes) and https://api.gms.moontontech.com/api/gms/source/2713644/2775075 (equipment) enumerate the artwork used here. The local mlbb-cdn/manifest.json contains source URLs, sizes and SHA-256 hashes for 988 files, including 78 community-directory files, all indexed pictures for 133 heroes and the equipment icons published for 181 of 184 item records. Goldshine Hammer, Ares Crown and Greedy Crusher are marked removed by the index and have no image URL.

tools/import-mlbb-assets.cjs refreshes these files and connects the catalog, portrait matcher and result display. The original downloaded image bytes are retained. Existing full-panel portraits and real video artwork retain their previous sources.

draft-reference-samples.json contains small labeled portrait samples from the user-provided September 13 draft video, plus empty and covered slots. Pick labels were verified on the video loading screen; ban labels were checked against the publisher head images. These are capture references, not a model trained on every skin.

# Hero artwork refresh — 2026-09-08

The library contains 133 freshly downloaded hero icon/splash images from the publisher's `akmweb.youngjoygame.com` CDN. The current roster and CDN image URLs were resolved from https://mlbbhub.com/heroes. The full downloaded roster includes Hirara, Marcel, Sora, Obsidia, Zetian, and Kalea.

Official lore portrait refreshes came from https://play.mobilelegends.com/lore/heroList and its public `https://api.mobilelegends.com/lore/hero/getHeroList` service. This service exposes a partial roster plus newer/revamped highlights; existing portraits are retained for coverage. The icon and portrait can therefore depict different published artwork. Every refreshed entry records its original `iconSource` and/or `source` in `catalog.json`. Original files copied from the user's reference installation remain under `hero-source`.

Sixteen full-panel moving hero artworks are stored in `hero-motion` as looping MP4s, sourced from https://motionbgs.com/tag:mobile-legends/. Each catalog entry records its source page and media URL. These are third-party animated artworks, sometimes depicting alternate skins, rather than an official in-game animation collection. Covered heroes: Fanny, Benedetta, Selena, Carmilla, Chou, Wanwan, Layla, Dyrroth, Kimmy, Kadita, Kagura, Ling, Beatrix, Floryn, Hanzo, Hanabi.

The draft displays these actual moving clips inside the full hero panel. Other heroes retain still portraits until a GIF, MP4 or WebM is imported using Teams > Moving draft artwork. The former sticker overlays and simulated portrait drift are no longer used in this draft. Crop position is editable per hero. Starting Soon uses a local animated fabric background.

All artwork remains owned by its original rights holders. No remote asset requests are required during normal broadcast use.
