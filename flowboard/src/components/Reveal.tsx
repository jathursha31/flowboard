import { useInView } from '../hooks/useInView.ts';
import type { CSSProperties, ElementType, ReactNode } from 'react';

/** Fades and slides its children in when they scroll into view. */
interface RevealProps {
  children?: ReactNode;
  delay?: number;
  as?: ElementType; // 'div', 'li', 'section'...
  className?: string;
  [attr: string]: unknown;
}

export default function Reveal({ children, delay = 0, as: Tag = 'div', className = '', ...rest }: RevealProps) {
  const [ref, inView] = useInView();
  return (
    <Tag
      ref={ref}
      className={`reveal ${inView ? 'is-visible' : ''} ${className}`}
      style={{ '--reveal-delay': `${delay}ms` } as CSSProperties}
      {...rest}
    >
      {children}
    </Tag>
  );
}
