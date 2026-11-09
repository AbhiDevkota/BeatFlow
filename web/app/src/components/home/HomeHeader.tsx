import { LogoMark } from '@/components/icons/LogoMark';

interface HomeHeaderProps {
  title?: string;
}

/**
 * BeatFlow Home Header matching Android's HomeTitle mark and heading layout.
 */
export function HomeHeader({ title = 'Listen Now' }: HomeHeaderProps) {
  return (
    <div className="pt-2 pb-3 flex items-center gap-3.5 select-none">
      <div className="grid place-items-center size-10 rounded-2xl bg-primary/10 text-primary transition-transform duration-200 hover:scale-105">
        <LogoMark size={24} />
      </div>
      <div className="flex flex-col justify-center">
        <h1 className="text-2xl font-extrabold tracking-tight text-primary leading-tight">
          BeatFlow
        </h1>
        <p className="text-xs font-medium text-secondary tracking-wide">
          {title}
        </p>
      </div>
    </div>
  );
}
