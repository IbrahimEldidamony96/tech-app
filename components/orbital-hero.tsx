"use client";

import { useCallback, useEffect, useRef, useState, type PointerEvent } from "react";
import styles from "./orbital-hero.module.css";

type OrbitalHeroProps = {
  caption: string;
  imageAlt: string;
  motionHint: string;
  motionOff: string;
  motionOn: string;
  note: string;
};

export function OrbitalHero({ caption, imageAlt, motionHint, motionOff, motionOn, note }: OrbitalHeroProps) {
  const sceneRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<number | null>(null);
  const [motionEnabled, setMotionEnabled] = useState(true);

  const resetScene = useCallback(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    scene.style.setProperty("--rotate-x", "0deg");
    scene.style.setProperty("--rotate-y", "0deg");
    scene.querySelectorAll<HTMLElement>("[data-depth]").forEach((element) => {
      element.style.marginLeft = "0px";
      element.style.marginTop = "0px";
    });
  }, []);

  useEffect(() => {
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const syncPreference = () => {
      setMotionEnabled(!preference.matches);
      if (preference.matches) resetScene();
    };
    syncPreference();
    preference.addEventListener("change", syncPreference);
    return () => {
      preference.removeEventListener("change", syncPreference);
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
    };
  }, [resetScene]);

  function handlePointerMove(event: PointerEvent<HTMLDivElement>) {
    if (!motionEnabled || event.pointerType === "touch") return;
    const scene = sceneRef.current;
    if (!scene) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const x = (event.clientX - bounds.left) / bounds.width - 0.5;
    const y = (event.clientY - bounds.top) / bounds.height - 0.5;

    if (frameRef.current) cancelAnimationFrame(frameRef.current);
    frameRef.current = requestAnimationFrame(() => {
      scene.style.setProperty("--rotate-x", `${(-y * 5).toFixed(2)}deg`);
      scene.style.setProperty("--rotate-y", `${(x * 8).toFixed(2)}deg`);
      scene.querySelectorAll<HTMLElement>("[data-depth]").forEach((element) => {
        const depth = Number(element.dataset.depth ?? 1);
        element.style.marginLeft = `${x * depth * 6}px`;
        element.style.marginTop = `${y * depth * 4}px`;
      });
    });
  }

  function toggleMotion() {
    setMotionEnabled((current) => {
      if (current) resetScene();
      return !current;
    });
  }

  return (
    <div className={styles.stage} onPointerMove={handlePointerMove} onPointerLeave={resetScene}>
      <div className={styles.edition} aria-hidden="true">
        <span>01</span>
        <p>{caption}<small>Light · depth · precision</small></p>
      </div>
      <div className={styles.motionHint} aria-hidden="true"><i />{motionHint}</div>
      <button className={styles.motionToggle} type="button" aria-pressed={motionEnabled} onClick={toggleMotion}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3a9 9 0 1 0 9 9M12 3v5m0-5 3 3m-3-3L9 6" /></svg>
        <span>{motionEnabled ? motionOn : motionOff}</span>
      </button>

      <div className="sr-only" role="img" aria-label={imageAlt} />
      <div ref={sceneRef} className={styles.scene} aria-hidden="true">
        <div className={styles.sceneGlow} />
        <div className={`${styles.orbit} ${styles.orbitOne}`} />
        <div className={`${styles.orbit} ${styles.orbitTwo}`} />
        <div className={styles.glassPane} />

        <div className={`${styles.pedestal} ${styles.pedestalMain}`}><span /></div>
        <div className={`${styles.pedestal} ${styles.pedestalPhone}`}><span /></div>
        <div className={`${styles.pedestal} ${styles.pedestalAudio}`}><span /></div>
        <div className={`${styles.pedestal} ${styles.pedestalWatch}`}><span /></div>

        <div className={`${styles.device} ${styles.phone} ${styles.floatMedium}`} data-depth="2.5">
          <div className={styles.phoneBack}>
            <div className={styles.cameraIsland}><i /><i /><i /><b /></div>
            <span className={styles.phoneMark} />
            <span className={styles.phoneShine} />
          </div>
        </div>

        <div className={`${styles.device} ${styles.laptop} ${styles.floatSlow}`} data-depth="1.8">
          <div className={styles.laptopLid}>
            <div className={styles.screenArt}><i /><i /><i /></div>
            <span className={styles.cameraDot} />
          </div>
          <div className={styles.laptopBase}><span /></div>
        </div>

        <div className={`${styles.device} ${styles.headphones} ${styles.floatFast}`} data-depth="2.1">
          <div className={styles.headband} />
          <div className={`${styles.headphoneCup} ${styles.cupLeft}`}><span /></div>
          <div className={`${styles.headphoneCup} ${styles.cupRight}`}><span /></div>
          <div className={`${styles.headphoneArm} ${styles.armLeft}`} />
          <div className={`${styles.headphoneArm} ${styles.armRight}`} />
        </div>

        <div className={`${styles.device} ${styles.watch} ${styles.floatMedium}`} data-depth="2.8">
          <div className={`${styles.watchStrap} ${styles.strapTop}`} />
          <div className={styles.watchFace}><span>10<small>09</small></span><i /></div>
          <div className={`${styles.watchStrap} ${styles.strapBottom}`} />
        </div>

        <p className={styles.sceneNote}>{note}</p>
      </div>
    </div>
  );
}
