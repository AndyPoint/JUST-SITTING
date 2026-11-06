/* Nature listening — voices.
   A source is a way of reading, not the file itself.
   To add a voice, append an object. The plate uses `band` (hertz).
   `exemplar` is an audio file. `series` is a slow recording the page
   turns into sound. Either may be null.
   Part of JUST SITTING, AGPL-3.0-or-later.
   Licenses: nature/SOURCES.md */
var NATURE_SOURCES = [
  {
    id: "whale",
    name: "Whale",
    voice: "Humpback, Megaptera novaeangliae",
    band: [40, 8000],
    exemplar: {
      url: "audio/noaa-nefsc-humpback-2023.mp3",
      title: "Humpback whale",
      credit: "NOAA Fisheries, Northeast Fisheries Science Center, Passive Acoustics Branch, 2023",
      license: "Public domain. A work of the United States Government, 17 U.S.C. § 105.",
      page: "https://www.fisheries.noaa.gov/national/science-data/sounds-ocean-mammals",
      file: "Meno-song-NOAA-PAGroup-13-humpback-clip.mp3",
      note: "55 seconds. It loops."
    },
    series: null,
    obtain: "More NOAA Fisheries clips are on the page above. Some files there are credited to other institutions and are not public domain."
  },
  {
    id: "dolphin",
    name: "Dolphin",
    voice: "Bottlenose, Tursiops truncatus",
    band: [1500, 20000],
    exemplar: {
      url: "audio/noaa-nefsc-bottlenose-2023.mp3",
      title: "Bottlenose dolphin",
      credit: "NOAA Fisheries, Northeast Fisheries Science Center, Passive Acoustics Branch, 2023",
      license: "Public domain. A work of the United States Government, 17 U.S.C. § 105.",
      page: "https://www.fisheries.noaa.gov/national/science-data/sounds-ocean-mammals",
      file: "Tutr-multisound-NOAA-PAGroup-03-bottlenose-dolphin-clip.mp3",
      note: "6 seconds, whistles and clicks. It loops. A longer recording you have the right to play is the better sitting."
    },
    series: null,
    obtain: "The same NOAA page has other odontocete clips, including a short-beaked common dolphin. Drop any recording you have the right to play."
  },
  {
    id: "mycelium",
    name: "Mycelium",
    voice: "Split gill, Schizophyllum commune — electrical potential",
    /* The sonification sits low: a tone near 100 Hz, bent by the voltage. */
    band: [60, 900],
    exemplar: null,
    series: {
      url: "audio/schizophyllum-commune-d5-6.i16",
      encoding: "int16le",
      /* stored integer × scale = millivolts */
      scale: 0.001,
      sampleHz: 1,
      /* 8 hours, differential pair 5–6, starting 1.5 h into the Zenodo file */
      startSec: 5400,
      count: 28800,
      pair: "Differential 5–6",
      /* one second of sound is this many seconds of the fungus */
      compress: 120,
      rate: 8000,
      credit: "Andrew Adamatzky, 2021. Recordings of electrical activity of four species of fungi. Zenodo.",
      doi: "https://doi.org/10.5281/zenodo.5790768",
      paper: "Adamatzky, A. 2022. Language of fungi derived from their electrical spiking activity. Royal Society Open Science 9: 211926.",
      paperDoi: "https://doi.org/10.1098/rsos.211926",
      license: "CC BY 4.0",
      note: "Not a microphone. Eight hours of electrode voltage, heard 120 times faster as a tone that the voltage bends."
    },
    obtain: "The whole Zenodo record is CC BY 4.0. This page uses one differential pair, eight hours of it."
  },
  {
    id: "file",
    name: "Your file",
    voice: "A recording you bring",
    /* Wide on purpose: a plant sonification, a slowed ultrasonic click, a longer whale take. */
    band: [40, 16000],
    exemplar: null,
    series: null,
    obtain: "Drop a recording you have the right to play. A longer whale or dolphin take, a PlantWave session, a tree, a pitch-shifted plant click. It is not kept."
  }
];

function natureSource(id) {
  for (var i = 0; i < NATURE_SOURCES.length; i++) {
    if (NATURE_SOURCES[i].id === id) return NATURE_SOURCES[i];
  }
  return NATURE_SOURCES[0];
}
