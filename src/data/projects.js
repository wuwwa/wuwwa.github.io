export const projects = [
  {
    id: "chromescope",
    name: "ChromeScope",
    line: "Static analysis for Chrome extensions.",
    site: "https://www.chromescope.net/",
  },
  {
    id: "fuppo",
    name: "Fuppo",
    line: "Fidget toys for iPhone Duo.",
    site: "https://www.fuppo.app/phone/",
  },
  {
    id: "mel",
    name: "Mel",
    line: "On-device conversational TTS with CSM-1B.",
    site: "https://melspeech.com/",
    fallback: "https://mel-voice.fly.dev/",
  },
  {
    id: "flightterm",
    name: "Flightterm",
    line: "Live ADS-B tracking and FAA airspace data.",
    site: "https://flightterm.fly.dev/",
  },
];
export function coverMarkup(id) {
  if (id === "fuppo")
    return `<span class="fuppo-wordmark">Fuppo</span><div class="fuppo-mascot fuppo-jelly" role="img" aria-label="Fuppo mascot squeezing mint jelly"></div><div class="fuppo-mascot fuppo-astronaut" role="img" aria-label="Fuppo astronaut holding a star"></div><div class="fuppo-mascot fuppo-wizard" role="img" aria-label="Fuppo wizard playing with magnetic filings"></div>`;
  if (id === "flightterm")
    return `<img class="flight-cover" src="/projects/flightterm-og.png" alt="Flightterm aviation artwork" width="1732" height="910">`;
  if (id === "mel")
    return `<img class="mel-landscape" src="/projects/mel.webp" alt="" width="1600" height="900"><span class="mel-wordmark">Mel</span><canvas class="mel-orb" aria-hidden="true"></canvas>`;
  const report = `{
  "name": "Example extension",
  "version": "1.0.0",
  "score": { "total": 26, "band": "moderate" },
  "findings": [{
    "rule": "perms.critical.cookies",
    "severity": "critical",
    "evidence": { "permission": "cookies" }
  }]
}`;
  const json = report.replace(
    /("[^"\n]*"\s*:)|("[^"\n]*")|(\b\d+\b)/g,
    (token, key, value) => {
      const type = key ? "key" : value ? "string" : "number";
      return `<span class="json-${type}">${token}</span>`;
    },
  );
  return `<pre class="scope-json" aria-hidden="true"><code>${json}</code></pre>`;
}
