import Image from "next/image";
import styles from "./static-showcase.module.css";

type StaticShowcaseProps = {
  caption: string;
  detail: string;
  imageAlt: string;
  note: string;
  status: string;
};

export function StaticShowcase({ caption, detail, imageAlt, note, status }: StaticShowcaseProps) {
  return (
    <div className={styles.stage}>
      <div className={styles.edition} aria-hidden="true">
        <span>01</span>
        <p>{caption}<small>{detail}</small></p>
      </div>
      <div className={styles.status} aria-hidden="true"><i />{status}</div>

      <div className={styles.artFrame}>
        <Image
          src="/storefront-devices.svg"
          alt={imageAlt}
          width={660}
          height={550}
          preload
          sizes="(max-width: 1023px) 92vw, 52vw"
          className={styles.artwork}
        />
      </div>

      <div className={styles.base} aria-hidden="true" />
      <p className={styles.note}>{note}</p>
    </div>
  );
}
