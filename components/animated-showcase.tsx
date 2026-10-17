import Image from "next/image";
import styles from "./animated-showcase.module.css";

type AnimatedShowcaseProps = {
  caption: string;
  detail: string;
  imageAlt: string;
  note: string;
  status: string;
};

export function AnimatedShowcase({ caption, detail, imageAlt, note, status }: AnimatedShowcaseProps) {
  return (
    <div className={styles.stage}>
      <div className={styles.ambient} aria-hidden="true" />
      <div className={styles.grid} aria-hidden="true" />

      <div className={styles.edition} aria-hidden="true">
        <span>01</span>
        <p>{caption}<small>{detail}</small></p>
      </div>
      <div className={styles.status} aria-hidden="true"><i />{status}</div>

      <div className={styles.motionField} aria-hidden="true">
        <span className={`${styles.halo} ${styles.haloLarge}`} />
        <span className={`${styles.halo} ${styles.haloSmall}`} />
        <span className={`${styles.orbitTrack} ${styles.orbitTrackOne}`}><i /></span>
        <span className={`${styles.orbitTrack} ${styles.orbitTrackTwo}`}><i /></span>
        <span className={`${styles.spark} ${styles.sparkOne}`} />
        <span className={`${styles.spark} ${styles.sparkTwo}`} />
        <span className={`${styles.spark} ${styles.sparkThree}`} />
        <span className={`${styles.spark} ${styles.sparkFour}`} />
      </div>

      <div className={styles.artFrame}>
        <div className={styles.artGlow} aria-hidden="true" />
        <Image
          src="/storefront-devices.svg"
          alt={imageAlt}
          width={660}
          height={550}
          priority
          sizes="(max-width: 1023px) 92vw, 52vw"
          className={styles.artwork}
        />
        <span className={styles.lightSweep} aria-hidden="true" />
      </div>

      <div className={styles.base} aria-hidden="true"><span /></div>
      <div className={styles.signal} aria-hidden="true"><i /><i /><i /></div>
      <p className={styles.note}>{note}</p>
    </div>
  );
}
