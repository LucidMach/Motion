import { useEffect, useState } from 'react';
import type { ThemeChangeEventDetail } from '../../types/events';

interface BrandGroupProps {
  regionLabel: string;
  regionUpdated: boolean;
}

export default function BrandGroup({ regionLabel, regionUpdated }: BrandGroupProps) {
  const [, setRenderTrigger] = useState(0);

  useEffect(() => {
    const onThemeChange = () => setRenderTrigger((prev) => prev + 1);
    window.addEventListener('motion:theme-change', onThemeChange);
    return () => window.removeEventListener('motion:theme-change', onThemeChange);
  }, []);

  return (
    <div className="flex select-none items-center gap-3.5">
      <div
        className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-accent-cyan/40 bg-linear-to-br from-accent-cyan/20 to-accent-indigo/20 text-accent-cyan transition-all duration-300 shadow-[0_0_12px_var(--color-glow)]"
        title="Motion Transit 3D Engine"
      >
        <svg
          className="h-5.5 w-5.5 animate-float-slight"
          style={{ filter: 'drop-shadow(0 0 6px var(--color-accent-cyan))' }}
          viewBox="67 74 1800 1800"
          fill="currentColor"
          fillRule="evenodd"
        >
          <path d="M245 187 L1250 113 C1320 108 1365 125 1410 157 L1745 392 C1780 418 1790 435 1790 470 L1790 1640 C1790 1720 1760 1765 1690 1775 L575 1836 C510 1840 465 1820 430 1777 L205 1485 C165 1435 145 1390 145 1340 L145 310 C145 235 185 195 245 187 Z M330 275 L1245 210 C1300 207 1340 218 1378 245 L1545 365 C1555 375 1555 388 1548 389 L530 450 C495 452 470 445 448 430 L300 315 C283 300 293 278 330 275 Z M540 565 L1630 501 C1660 500 1675 520 1675 552 L1675 1552 C1675 1595 1660 1612 1625 1615 L578 1678 C515 1682 486 1658 486 1610 L486 620 C486 585 505 567 540 565 Z M666 808 C664 760 690 733 722 731 L952 716 C962 715 968 718 975 727 C982 736 988 744 992 755 L1125 1173 L1250 755 C1262 715 1280 700 1300 697 L1545 683 C1550 715 1542 738 1525 746 C1505 755 1490 759 1472 764 L1472 1497 C1500 1504 1525 1510 1550 1514 C1550 1555 1530 1578 1485 1581 L1237 1595 C1236 1545 1255 1530 1275 1526 L1308 1515 C1312 1505 1313 1495 1313 1480 L1313 888 L1150 1440 C1135 1500 1105 1530 1078 1533 C1070 1534 1064 1532 1063 1530 L1035 1450 L877 917 L877 1497 L980 1520 C980 1560 952 1588 910 1592 L667 1608 C660 1580 670 1560 693 1553 L750 1538 L750 815 Z" />
        </svg>
      </div>
      <div className="flex flex-col gap-px overflow-hidden">
        <h1
          className="bg-clip-text font-display text-xl font-extrabold leading-tight tracking-[0.12em] text-transparent transition-all duration-300"
          style={{
            backgroundImage: 'var(--color-brand-gradient, linear-gradient(90deg, #ffffff 0%, var(--color-accent-cyan) 55%, var(--color-accent-indigo) 100%))'
          }}
        >
          MOTION
        </h1>
        <span
          title={regionLabel}
          className={`max-w-115 overflow-hidden text-ellipsis whitespace-nowrap text-[0.74rem] font-semibold uppercase tracking-[0.04em] transition-colors duration-300 max-[1024px]:max-w-75 max-[768px]:max-w-45 max-[768px]:text-[0.68rem] max-[480px]:hidden ${regionUpdated ? 'text-accent-cyan font-bold' : 'text-secondary'
            }`}
        >
          {regionLabel}
        </span>

      </div>
    </div>
  );
}
