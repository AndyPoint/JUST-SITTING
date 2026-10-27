function render(sch, dtf) {
    if (enso.dirty) { renderer.uploadWet(enso.cv); enso.dirty = false; }
    
    // --- LIVESCALE FRACTAL MODULATION ---
    // Breath gently pulses the zoom (inhale expands, exhale contracts)
    const breathZoomFactor = 1.0 - 0.003 * (sch.br - 0.5);
    // Unrest (S.U) and token surprise warp the rotation and echo dynamically
    const unrestWarp = S ? S.U : 0;
    const dynamicRot = reduceMotion ? 0 : (0.0018 + 0.004 * unrestWarp) * dtf;
    const dynamicZoom = reduceMotion ? 1 : Math.pow(0.9965 * breathZoomFactor, dtf);
    
    // During the empty minute, stillness takes over completely (no rotation, pure echo decay)
    const finalRot = sch.empty ? 0 : dynamicRot;
    const finalZoom = sch.empty ? 1.0 : dynamicZoom;
    const finalEcho = sch.empty ? 0.99 : Math.pow(settings.echo - 0.03 * unrestWarp, dtf);
    // ------------------------------------

    renderer.frame({
      zoom: finalZoom,
      rot: finalRot,
      echo: finalEcho,
      level: visLevel(sch.age), 
      wetOn: sch.empty || sch.age > K.DRAW_SEC + VIS_HOLD + VIS_FADE ? 0 : 1,
      n: S.P.n, px: S.P.x, py: S.P.y,
      psize: Math.max(1, 1.4 * dpr),
      pa: 0.06 + 0.5 * (1 - settings.echo),
    });
  }