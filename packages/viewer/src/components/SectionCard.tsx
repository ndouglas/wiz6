import { Link } from 'react-router-dom';
import styles from './SectionCard.module.css';

export interface SectionCardProps {
  title: string;
  to: string;
  description: string;
  meta?: string;
}

export function SectionCard({ title, to, description, meta }: SectionCardProps) {
  return (
    <Link to={to} className={styles.card}>
      <h3 className={styles.title}>{title}</h3>
      <p className={styles.description}>{description}</p>
      {meta ? <p className={styles.meta}>{meta}</p> : null}
    </Link>
  );
}
