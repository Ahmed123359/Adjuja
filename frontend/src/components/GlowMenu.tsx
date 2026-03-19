import * as React from 'react';
import { motion } from 'framer-motion';
import type { LucideIcon } from 'lucide-react';

function cn(...classes: (string | undefined | false)[]): string {
  return classes.filter(Boolean).join(' ');
}

export interface MenuItem {
  icon: LucideIcon;
  label: string;
  gradient: string;
  iconColor: string;
}

interface MenuBarProps extends React.HTMLAttributes<HTMLDivElement> {
  items: MenuItem[];
  activeItem?: string;
  onItemClick?: (label: string) => void;
}

const itemVariants = {
  initial: { rotateX: 0,   opacity: 1 },
  hover:   { rotateX: -90, opacity: 0 },
};
const backVariants = {
  initial: { rotateX: 90, opacity: 0 },
  hover:   { rotateX: 0,  opacity: 1 },
};
const glowVariants = {
  initial: { opacity: 0, scale: 0.8 },
  hover:   { opacity: 1, scale: 2,
    transition: { opacity: { duration: 0.5 }, scale: { duration: 0.5, type: 'spring', stiffness: 300, damping: 25 } },
  },
};
const navGlowVariants = {
  initial: { opacity: 0 },
  hover:   { opacity: 1, transition: { duration: 0.5 } },
};
const sharedTransition = { type: 'spring', stiffness: 100, damping: 20, duration: 0.5 };

export const MenuBar = React.forwardRef<HTMLDivElement, MenuBarProps>(
  ({ className, items, activeItem, onItemClick, ...props }, ref) => {
    return (
      <motion.nav
        ref={ref}
        className={cn('flex items-center relative', className)}
        initial="initial"
        whileHover="hover"
        {...(props as React.HTMLAttributes<HTMLElement>)}
      >
        <ul className="flex items-center gap-1">
          {items.map((item) => {
            const Icon = item.icon;
            const isActive = item.label === activeItem;
            return (
              <motion.li key={item.label} className="relative">
                <button onClick={() => onItemClick?.(item.label)} className="block w-full">
                  <motion.div
                    className="block rounded-xl overflow-visible group relative"
                    style={{ perspective: '600px' }}
                    whileHover="hover"
                    initial="initial"
                  >
                    {/* Glow */}
                    <motion.div
                      className="absolute inset-0 z-0 pointer-events-none rounded-2xl"
                      variants={glowVariants}
                      animate={isActive ? 'hover' : 'initial'}
                      style={{ background: item.gradient }}
                    />
                    {/* Front */}
                    <motion.div
                      className={cn(
                        'flex items-center gap-2 px-4 py-2 relative z-10 bg-transparent rounded-xl text-sm font-medium',
                        isActive ? 'text-gray-900' : 'text-gray-500',
                      )}
                      variants={itemVariants}
                      transition={sharedTransition}
                      style={{ transformStyle: 'preserve-3d', transformOrigin: 'center bottom' }}
                    >
                      <span className={isActive ? item.iconColor : 'text-gray-400'}>
                        <Icon className="h-4 w-4" />
                      </span>
                      <span>{item.label}</span>
                    </motion.div>
                    {/* Back (flip) */}
                    <motion.div
                      className={cn(
                        'flex items-center gap-2 px-4 py-2 absolute inset-0 z-10 bg-transparent rounded-xl text-sm font-medium',
                        'text-gray-900',
                      )}
                      variants={backVariants}
                      transition={sharedTransition}
                      style={{ transformStyle: 'preserve-3d', transformOrigin: 'center top', rotateX: 90 }}
                    >
                      <span className={item.iconColor}>
                        <Icon className="h-4 w-4" />
                      </span>
                      <span>{item.label}</span>
                    </motion.div>
                  </motion.div>
                </button>
              </motion.li>
            );
          })}
        </ul>
      </motion.nav>
    );
  },
);

MenuBar.displayName = 'MenuBar';
