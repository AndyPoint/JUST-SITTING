function render(sch, dtf) {
    if (enso.dirty) { renderer.uploadWet(enso.cv); enso.dirty = false; }
    renderer.frame({
      zoom: reduceMotion ? 1 : Math.pow(0.9965, dtf),
      rot: reduceMotion ? 0 : 0.0022 * dtf,
      echo: Math.pow(settings.echo, dtf),
      // ...
    });
  }