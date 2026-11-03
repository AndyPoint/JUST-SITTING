/* Works. A work is a title, a stroke, and a cycle.
   A voice is separate: it only supplies sound.
   Just Sitting is not drawn here. It is the original file, mounted whole,
   because its closed loop is the piece itself.
   Part of JUST SITTING, AGPL-3.0-or-later. */
var NATURE_WORKS = [
  {
    id: "sitting",
    title: "Just sitting",
    subtitle: "",
    closed: true,
    stroke: null,
    voice: null,
    breaths: 66
  },
  {
    id: "mycelium",
    title: "Mycelium mind",
    subtitle: "",
    closed: false,
    stroke: "mycelium",
    voice: "mycelium",
    breaths: 11
  },
  {
    id: "whale",
    title: "Whale song",
    subtitle: "Singing Earth's Memory",
    closed: false,
    stroke: "whale",
    voice: "whale",
    breaths: 11
  },
  {
    id: "tree",
    title: "Tree song",
    subtitle: "I Breathe You",
    closed: false,
    stroke: "tree",
    voice: null,
    breaths: 11
  },
  {
    id: "dolphin",
    title: "Dolphin",
    subtitle: "Kaikuluotain",
    closed: false,
    stroke: "dolphin",
    voice: "dolphin",
    breaths: 11
  },
  {
    id: "plant",
    title: "Small plant",
    subtitle: "",
    closed: false,
    stroke: "plant",
    /* Room for further plant voices. None are bundled. */
    voice: null,
    voices: [],
    breaths: 11
  }
];

function natureWork(id) {
  for (var i = 0; i < NATURE_WORKS.length; i++) {
    if (NATURE_WORKS[i].id === id) return NATURE_WORKS[i];
  }
  return NATURE_WORKS[2];
}
