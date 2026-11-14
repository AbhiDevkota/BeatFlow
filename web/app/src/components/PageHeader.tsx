import { ChevronLeft } from 'lucide-react';
import { useNavigate } from 'react-router';

export interface PageHeaderProps {
  title: string;
  /** Whether to show a back button, or a destination URL/handler. */
  back?: boolean | string | (() => void);
  action?: React.ReactNode;
}

/** The page title row (report §1, `.header-nav`) with optional theme-matching back button. */
export function PageHeader({ title, back, action }: PageHeaderProps) {
  const navigate = useNavigate();

  const handleBack = () => {
    if (typeof back === 'function') {
      back();
    } else if (typeof back === 'string') {
      navigate(back);
    } else if (window.history.length > 1) {
      navigate(-1);
    } else {
      navigate('/home');
    }
  };

  return (
    <div className="mx-(--body-gutter) pt-8 flex items-center justify-between gap-4">
      <div className="flex items-center gap-3">
        {back && (
          <button
            type="button"
            onClick={handleBack}
            className="grid size-8 place-items-center rounded-full bg-quaternary/60 hover:bg-quaternary text-secondary hover:text-primary active:scale-95 transition-all select-none"
            aria-label="Back"
            title="Back"
          >
            <ChevronLeft size={19} strokeWidth={2.4} />
          </button>
        )}
        <h1 className="type-header-emphasized">{title}</h1>
      </div>
      {action && <div>{action}</div>}
    </div>
  );
}
